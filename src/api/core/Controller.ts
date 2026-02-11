import GamaConnector from '../simulation/GamaConnector.ts';
import PlayerManager from '../multiplayer/PlayerManager.ts';
import ModelManager from '../simulation/ModelManager.ts';
import { MonitorServer } from '../monitoring/MonitorServer.ts';
import { AdbManager } from "../android/adb/AdbManager.ts";
import { useAdb, ENV_GAMALESS } from "../index.ts";
import { JsonPlayerAsk, JsonOutput } from "./Constants.ts";
// import {mDnsService} from "../infra/mDnsService.ts";
import { getLogger } from "@logtape/logtape";

const logger = getLogger(["core", "Controller"]);

export class Controller {
    model_manager: ModelManager;
    monitor_server: MonitorServer;
    player_manager: PlayerManager;
    gama_connector: GamaConnector | undefined;

    adb_manager: AdbManager | undefined;
    // mDnsService: mDnsService;


    constructor(useAdb: boolean) {
        // this.mDnsService = new mDnsService(process.env.WEB_HOSTNAME);
        this.model_manager = new ModelManager(this);
        this.monitor_server = new MonitorServer(this);
        this.player_manager = new PlayerManager(this);
        if (ENV_GAMALESS) {
            logger.info("Web platform launched in 'Gamaless' mode")
        } else {
            this.gama_connector = new GamaConnector(this);
        }

        if (useAdb) {
            this.adb_manager = new AdbManager(this);
        } else {
            logger.warn("Couldn't find ADB working or started, cancelling ADB management")
        }
    }

    // Allow running init functions for some components needing it
    async initialize() {
        if (this.adb_manager)
            await this.adb_manager.init();
    }

    async restart() {
        // Close
        this.player_manager.close();
        if (ENV_GAMALESS) {
            logger.trace("skipped restarting the gama connector, application in gamaless mode...")
        } else {
            this.gama_connector!.close();
        }
        this.monitor_server.close();

        // Restart
        this.player_manager = new PlayerManager(this);
        this.monitor_server = new MonitorServer(this);

        
        if (ENV_GAMALESS) {
            logger.trace("skipped restarting the gama connector, application in gamaless mode...")
        } else {
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
        return this.model_manager.getCatalogListJSON();
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
        if (!ENV_GAMALESS)
            this.gama_connector!.addInGamePlayer(id_player);
        else
            logger.warn("[addInGamePlayer] Message received to add player in GAMA, but the webplatform is in GAMALESS mode...");
    }

    purgePlayer(id_player: string): void {
        logger.debug(`Remove player ${id_player}`);

        // Remove from GAMA
        if (!ENV_GAMALESS)
            this.gama_connector!.removeInGamePlayer(id_player);
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
        if (!ENV_GAMALESS)
            this.gama_connector!.sendExpression(id_player, expr);
        else
            logger.warn("[sendExpression] Message received to send to GAMA, but the webplatform is in GAMALESS mode...");
    }

    sendAsk(json: JsonPlayerAsk) {
        if (!ENV_GAMALESS)
            this.gama_connector!.sendAsk(json);
        else
            logger.warn("[sendAsk] Message received to send to GAMA, but the webplatform is in GAMALESS mode...");
    }

    launchExperiment() {
        if (!ENV_GAMALESS) {
            this.gama_connector!.launchExperiment();
            // Try until simulation is ready
            const interval = setInterval(() => {
                if (!['NONE', "NOTREADY"].includes(this.gama_connector!.jsonGamaState.experiment_state)) {
                    // Stop calling
                    clearInterval(interval);
                    this.player_manager.addEveryPlayer();
                }
                this.notifyMonitor();
            }, 100);
        } else
            logger.warn("[launchExperiment] Message received to load an experiment in GAMA, but the webplatform is in GAMALESS mode...");
    }

    stopExperiment() {
        if (!ENV_GAMALESS) {
            this.gama_connector!.stopExperiment();
            this.player_manager.removeAllPlayer();

            this.notifyMonitor();
        } else
            logger.warn("[stopExperiment] Message received to close current GAMA simulation, but the webplatform is in GAMALESS mode...");
    }

    pauseExperiment(callback?: () => void) {
        if (!ENV_GAMALESS)
            this.gama_connector!.pauseExperiment(callback);
        else
            logger.warn("[pauseExperiment] Message received to pause current GAMA simulation, but the webplatform is in GAMALESS mode...");
    }

    resumeExperiment() {
        if (!ENV_GAMALESS)
            this.gama_connector!.resumeExperiment();
        else
            logger.warn("[resumeExperiment] Message received to resume current GAMA simulation, but the webplatform is in GAMALESS mode...");
    }
}

export default Controller;
