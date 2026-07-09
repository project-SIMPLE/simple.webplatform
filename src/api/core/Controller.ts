// import {mDnsService} from "../infra/mDnsService.ts";

import { spawnSync } from "node:child_process";
import { getLogger } from "@logtape/logtape";
import { AdbManager } from "../android/adb/AdbManager.ts";
import { ENV_GAMALESS, useAdb } from "../index.ts";
import { isMacMini } from "../infra/DeviceDetector.ts";
import { UpsManager } from "../infra/ups/UpsManager.ts";
import { MonitorServer } from "../monitoring/MonitorServer.ts";
import PlayerManager from "../multiplayer/PlayerManager.ts";
import GamaConnector from "../simulation/GamaConnector.ts";
import ModelManager from "../simulation/ModelManager.ts";
import type { JsonOutput, JsonPlayerAsk } from "./Constants.ts";

const logger = getLogger(["core", "Controller"]);

export class Controller {
	model_manager: ModelManager | undefined;
	monitor_server: MonitorServer;
	player_manager: PlayerManager;
	gama_connector: GamaConnector | undefined;
	private launchInterval: ReturnType<typeof setInterval> | null = null;

	adb_manager: AdbManager | undefined;
	ups_service: UpsManager;
	// mDnsService: mDnsService;

	constructor(useAdb: boolean) {
		// this.mDnsService = new mDnsService(process.env.WEB_HOSTNAME);
		this.monitor_server = new MonitorServer(this);
		this.player_manager = new PlayerManager(this);
		if (ENV_GAMALESS) {
			const border = "=".repeat(58);
			logger.warn(border);
			logger.warn("=                                                        =");
			logger.warn("=   !! GAMALESS MODE ACTIVE — NO GAMA, NO MODEL MANAGER  =");
			logger.warn("=   Simulation features are fully disabled.              =");
			logger.warn("=   Only headset/player management is operational.       =");
			logger.warn("=                                                        =");
			logger.warn(border);
		} else {
			this.model_manager = new ModelManager(this);
			this.gama_connector = new GamaConnector(this);
		}

		if (useAdb) {
			this.adb_manager = new AdbManager(this);
		} else {
			logger.warn("Couldn't find ADB working or started, cancelling ADB management");
		}

		this.ups_service = new UpsManager();
	}

	// Allow running init functions for some components needing it
	async initialize() {
		// Run adb init in the background so a slow (cold-boot) daemon start or device probe
		// never gates the uWS servers. Failures just disable adb management, not crash startup.
		if (this.adb_manager) {
			void this.adb_manager.init().catch((e) => logger.error("ADB init failed: {e}", { e }));
		}

		// The UPS exists only on M2L2 (Mac mini) deployments, and node-hid's HID.devices()
		// probe is a SYNCHRONOUS native call that blocks the event loop — starving the uWS
		// servers (monitor/player/video) and delaying the frontend WebSocket connection.
		// Skip it entirely off-M2L2, and run it in the background so it never gates startup.
		if (isMacMini()) {
			void this.ups_service.connect();
		} else {
			logger.info("Not running on M2L2 (Mac Mini) hardware — skipping UPS connection");
		}

		const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
		setTimeout(() => void this.handleSessionTimeout(), THREE_HOURS_MS);
		logger.info("Session timer started — shutdown sequence armed for 3h if on battery");
	}

	/** Called after 3 hours. Shuts down headsets, UPS, and host if UPS is on battery. */
	private async handleSessionTimeout(): Promise<void> {
		if (isMacMini()) {
			logger.warn("3-hour session timer fired");

			if (this.ups_service.isConnected() && this.ups_service.isOnAC()) {
				logger.info("UPS is on AC power — no shutdown needed");
				return;
			}

			logger.warn("UPS is on battery or not connected — initiating shutdown sequence");

			// (1) Power off all headsets
			if (this.adb_manager) await this.adb_manager.shutdownAllHeadsets();

			// (2) Arm UPS output cut in 2 minutes (only executes when on battery)
			this.ups_service.armShutdown(120);

			// (3) Shutdown host computer after 30s to allow headsets and UPS time to process
			logger.warn("Shutting down host computer now");
			setTimeout(() => {
				spawnSync("shutdown", ["-h", "now"]);
			}, 30_000);
		} else {
			logger.info("Not running on a M2L2 (Mac Mini), skipping shutdown mechanism");
		}
	}

	async restart() {
		// Close
		this.player_manager.close();
		if (ENV_GAMALESS) {
			logger.trace("skipped restarting the gama connector, application in gamaless mode...");
		} else {
			this.gama_connector?.close();
		}
		this.monitor_server.close();

		// Restart
		this.player_manager = new PlayerManager(this);
		this.monitor_server = new MonitorServer(this);

		if (ENV_GAMALESS) {
			logger.trace("Skipped restarting the gama connector and model manager, application in gamaless mode...");
		} else {
			this.model_manager = new ModelManager(this);
			this.gama_connector = new GamaConnector(this);
		}

		if (useAdb) this.adb_manager = new AdbManager(this);

		await this.initialize();
	}

	/*
    =============================
        MODEL MANAGER
    =============================
     */

	getSimulationInformations(): string {
		if (!ENV_GAMALESS) {
			return this.model_manager?.getCatalogListJSON();
		} else {
			logger.debug("[getSimulationInformations] model_manager is not available in GAMALESS mode");
			return JSON.stringify([]);
		}
	}

	/*
    =============================
        WS MONITOR
    =============================
     */

	notifyMonitor() {
		this.monitor_server.sendMonitorGamaState();
	}

	/*
    =============================
        PLAYER SERVER
    =============================
     */

	broadcastSimulationOutput(json_output: JsonOutput) {
		this.player_manager.broadcastSimulationOutput(json_output);
	}

	/*
    =============================
        GAMA CONNECTOR
    =============================
     */

	addInGamePlayer(id_player: string): void {
		if (!ENV_GAMALESS) this.gama_connector?.addInGamePlayer(id_player);
		else
			logger.debug(
				"[addInGamePlayer] Message received to add player in GAMA, but the webplatform is in GAMALESS mode...",
			);
	}

	purgePlayer(id_player: string): void {
		logger.debug(`Remove player ${id_player}`);

		// Remove from GAMA
		if (!ENV_GAMALESS) this.gama_connector?.removeInGamePlayer(id_player);

		// Remove from connected list
		this.player_manager.removePlayer(id_player);

		// Close application for headset
		if (useAdb) {
			// TODO
		}

		// Inform webview of update state
		this.notifyMonitor();
	}

	sendExpression(id_player: string, expr: string) {
		if (!ENV_GAMALESS) this.gama_connector?.sendExpression(id_player, expr);
		else logger.debug("[sendExpression] Message received to send to GAMA, but the webplatform is in GAMALESS mode...");
	}

	sendAsk(json: JsonPlayerAsk) {
		if (!ENV_GAMALESS) this.gama_connector?.sendAsk(json);
		else logger.debug("[sendAsk] Message received to send to GAMA, but the webplatform is in GAMALESS mode...");
	}

	cancelLaunchInterval() {
		if (this.launchInterval !== null) {
			clearInterval(this.launchInterval);
			this.launchInterval = null;
		}
	}

	launchExperiment() {
		if (!ENV_GAMALESS) {
			this.cancelLaunchInterval(); // clear any stale interval from a previous attempt
			this.gama_connector?.launchExperiment();
			// Poll until GAMA acknowledges the experiment is ready, then add players
			this.launchInterval = setInterval(() => {
				if (!["NONE", "NOTREADY"].includes(this.gama_connector?.jsonGamaState.experiment_state)) {
					this.cancelLaunchInterval();
					this.player_manager.addEveryPlayer();
				}
				this.notifyMonitor();
			}, 100);
		} else
			logger.debug(
				"[launchExperiment] Message received to load an experiment in GAMA, but the webplatform is in GAMALESS mode...",
			);
	}

	stopExperiment() {
		if (!ENV_GAMALESS) {
			this.cancelLaunchInterval();
			this.gama_connector?.stopExperiment();
			this.player_manager.removeAllPlayer();

			this.notifyMonitor();
		} else
			logger.debug(
				"[stopExperiment] Message received to close current GAMA simulation, but the webplatform is in GAMALESS mode...",
			);
	}

	pauseExperiment(callback?: () => void) {
		if (!ENV_GAMALESS) this.gama_connector?.pauseExperiment(callback);
		else
			logger.debug(
				"[pauseExperiment] Message received to pause current GAMA simulation, but the webplatform is in GAMALESS mode...",
			);
	}

	resumeExperiment() {
		if (!ENV_GAMALESS) this.gama_connector?.resumeExperiment();
		else
			logger.debug(
				"[resumeExperiment] Message received to resume current GAMA simulation, but the webplatform is in GAMALESS mode...",
			);
	}
}

export default Controller;
