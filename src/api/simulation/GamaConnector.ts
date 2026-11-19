import { getLogger, type Logger } from "@logtape/logtape";
import WebSocket from "ws";
import type { GamaState } from "../../common/types.ts";
import {
	extractCreatePlayerId,
	GAMA_ERROR_MESSAGES,
	type GAMA_JSON_LOAD_EXPERIMENT,
	GAMA_PROBE_EXPR,
	GAMA_PROBE_TIMEOUT_MS,
	type JsonPlayerAsk,
} from "../core/Constants.ts";
import type Controller from "../core/Controller.ts";
import { ENV_EXTRA_VERBOSE, ENV_VERBOSE } from "../index.ts";
import type Model from "./Model.ts";

// Override the log function
const logger: Logger = getLogger(["sim", "GamaConnector"]);

/**
 * Asks that only matter for their latest value: a newer one makes an older, unsent one useless.
 * Each headset sends them every frame (about 50 per second each). While GAMA has not yet
 * acknowledged the previous one from the same headset, a new one replaces the waiting one
 * instead of queueing behind it, so a slow GAMA gets the latest positions, not a growing backlog.
 * When GAMA keeps up, every ask is still sent.
 */
export const LATEST_WINS_ACTIONS: ReadonlySet<string> = new Set(["move_player_external", "move_geoms_followed"]);

// An unacknowledged latest-wins ask stops holding back newer ones after this long
export const LATEST_WINS_ACK_TIMEOUT_MS = 1000;

// stopExperiment waits at most this long for GAMA to report the experiment paused
const STOP_PAUSE_TIMEOUT_MS = 5000;

type LatestWinsSlot = {
	inFlight?: { action: string; args: string; since: number };
	pending?: JsonPlayerAsk;
};

/**
 * This class creates a websocket client for Gama Server.
 */
class GamaConnector {
	controller: Controller;
	model!: Model;
	jsonGamaState: GamaState;
	gama_socket: WebSocket | null = null;

	listMessages: unknown[] = [];

	// Latest-wins asks per "<headset>|<action>": the one GAMA is processing and the newest waiting
	private readonly latestWins = new Map<string, LatestWinsSlot>();

	// Experiment ownership tracking (issue #156) ------------------------
	// True only once the platform controls the experiment: after our own
	// `load` ack, or after a foreign experiment passed the probe.
	private experimentOwned = false;
	// Set when our `load` command is in flight, cleared on ack/error
	private pendingLoad = false;
	// Pending probe of a foreign experiment (one at a time)
	private probe: { expId: string; showBanner: boolean; timeout: NodeJS.Timeout } | null = null;
	// Foreign exp_ids that failed the probe: their statuses are ignored
	private readonly rejectedForeignExpIds = new Set<string>();
	// exp_id -> last SimulationStatus content, cached while probing / loading
	private readonly lastForeignStatus = new Map<string, string>();

	/**
	 * Constructor of the websocket client
	 * @param {Controller} controller - The controller of the project
	 */
	constructor(controller: Controller) {
		this.controller = controller;
		// Initialise class and settings before first attempt to connect to gama
		this.jsonGamaState = {
			connected: false,
			experiment_state: "NONE",
			loading: false,
			content_error: "",
			experiment_id: "",
			experiment_name: "",
			foreign_experiment_detected: false,
		};

		this.connectGama();
	}

	getJsonGama() {
		return this.jsonGamaState;
	}

	setGamaConnection(connected: boolean) {
		this.jsonGamaState.connected = connected;
		this.setGamaLoading(!connected);
		this.controller.notifyMonitor();
	}

	setGamaLoading(loading: boolean) {
		this.jsonGamaState.loading = loading;
		this.controller.notifyMonitor();
	}
	setGamaContentError(contentError: string) {
		// Every command ack clears the error. Only tell the monitors when it actually changes,
		// or each headset `ask` (hundreds per second) re-sends the whole state to every monitor.
		if (this.jsonGamaState.content_error === contentError) return;
		this.jsonGamaState.content_error = contentError;
		this.controller.notifyMonitor();
	}
	setGamaExperimentId(experimentId: string) {
		this.jsonGamaState.experiment_id = experimentId;
	}
	setGamaExperimentState(experimentState: string) {
		this.jsonGamaState.experiment_state = experimentState;
		this.controller.notifyMonitor();
	}
	setGamaExperimentName(experimentName: string) {
		this.jsonGamaState.experiment_name = experimentName;
		this.controller.notifyMonitor();
	}
	setGamaForeignExperimentDetected(detected: boolean) {
		if (this.jsonGamaState.foreign_experiment_detected === detected) return;
		this.jsonGamaState.foreign_experiment_detected = detected;
		this.controller.notifyMonitor();
	}

	// -------------------

	/* Foreign experiment handling (issue #156) */

	/**
	 * Whether the platform currently controls a live experiment in GAMA
	 * that commands (create_player, expressions, asks) can be sent to.
	 */
	canTalkToExperiment(): boolean {
		return (
			this.jsonGamaState.connected &&
			this.experimentOwned &&
			this.jsonGamaState.experiment_id !== "" &&
			!["NONE", "NOTREADY"].includes(this.jsonGamaState.experiment_state)
		);
	}

	private clearProbe() {
		if (this.probe !== null) {
			clearTimeout(this.probe.timeout);
			this.probe = null;
		}
	}

	/**
	 * Whether a message echoed back by Gama Server is the reply to the pending probe
	 */
	private isProbeReply(command?: { type?: string; exp_id?: string; expr?: string }): boolean {
		return (
			this.probe !== null &&
			command?.type === "expression" &&
			command?.expr === GAMA_PROBE_EXPR &&
			command?.exp_id === this.probe.expId
		);
	}

	/**
	 * Evaluates a probe expression against an experiment the platform didn't launch to check
	 * whether it is actually usable (live simulation + queryable state). Resolution happens in
	 * the onmessage handler (adopt on success, reject on error) or on timeout (reject).
	 * Triggered on connection (GAMA started first, issue #156) and by foreign SimulationStatus.
	 * @param {string} expId - The foreign experiment id
	 * @param {boolean} showBanner - Whether a failed probe should raise the monitor warning
	 *   (true only when a SimulationStatus proved an experiment actually exists in GAMA)
	 */
	private startForeignExperimentProbe(expId: string, showBanner: boolean) {
		logger.info(`Checking for a GAMA experiment (id ${expId}) not launched by the platform...`);

		this.probe = {
			expId,
			showBanner,
			timeout: setTimeout(() => {
				logger.warn(`Probe of foreign experiment ${expId} timed out after ${GAMA_PROBE_TIMEOUT_MS}ms`);
				this.rejectForeignExperiment(expId);
			}, GAMA_PROBE_TIMEOUT_MS),
		};

		this.listMessages = [{ type: "expression", exp_id: expId, expr: GAMA_PROBE_EXPR }];
		this.sendMessages();
	}

	/**
	 * The foreign experiment answered the probe: take control of it as if the platform launched it
	 * @param {string} expId - The foreign experiment id
	 * @param {string} probeReply - The probe reply content, "<paused>|<cycle>" (e.g. "false|3565")
	 */
	private adoptForeignExperiment(expId: string, probeReply?: string) {
		this.clearProbe();
		this.experimentOwned = true;
		this.setGamaExperimentId(expId);

		// Prefer the live paused state carried by the probe reply, then the last status heard
		let parsedState: string | undefined;
		if (typeof probeReply === "string" && probeReply.includes("|"))
			parsedState = probeReply.startsWith("true") ? "PAUSED" : "RUNNING";
		this.setGamaExperimentState(parsedState ?? this.lastForeignStatus.get(expId) ?? "RUNNING");

		this.lastForeignStatus.clear();
		this.setGamaForeignExperimentDetected(false);

		logger.info(`Adopted externally-launched GAMA experiment ${expId} (${this.jsonGamaState.experiment_state})`);
		this.controller.player_manager.addEveryPlayer();
	}

	/**
	 * The foreign experiment failed the probe: ignore its statuses so the platform state
	 * stays NONE (players are kept out and the admin can still launch an experiment)
	 * @param {string} expId - The foreign experiment id
	 */
	private rejectForeignExperiment(expId: string) {
		const showBanner = this.probe?.showBanner ?? false;
		this.clearProbe();
		this.rejectedForeignExpIds.add(expId);

		if (showBanner) {
			this.setGamaForeignExperimentDetected(true);
			logger.warn(
				`GAMA is running an experiment (id ${expId}) that the platform cannot control (e.g. opened from GAMA's interface without a live simulation). Players won't be added to it. Start/close it in GAMA, or launch an experiment from the platform.`,
			);
		} else {
			logger.debug(`No usable pre-existing experiment found in GAMA (probed id ${expId})`);
		}
	}

	/**
	 * The platform's experiment is gone (stopped, closed in GAMA): drop ownership so later
	 * experiments are treated as fresh candidates
	 */
	private releaseExperiment() {
		this.experimentOwned = false;
		this.setGamaExperimentId("");
		this.rejectedForeignExpIds.clear();
	}

	/**
	 * Forget everything known about GAMA-side experiments
	 * (called when the connection with Gama Server opens, closes or breaks)
	 */
	private resetExperimentTracking() {
		this.experimentOwned = false;
		this.pendingLoad = false;
		this.clearProbe();
		this.rejectedForeignExpIds.clear();
		this.lastForeignStatus.clear();
		// Answers to asks sent on a previous socket will never come
		this.latestWins.clear();
		this.setGamaExperimentId("");
		this.setGamaForeignExperimentDetected(false);
	}

	// -------------------

	getJsonState() {
		return {
			type: "json_state",
			gama: this.getJsonGama(),
			player: [],
		};
	}

	// -------------------

	/* Protocol messages about Gama Server */

	/**
	 * Generate a properly formated json to load experiment on GAMA
	 * @returns a JSON payload of type load to be sent to the Gama server
	 */
	jsonLoadExperiment(): GAMA_JSON_LOAD_EXPERIMENT {
		const model = this.controller.model_manager?.getActiveModel();

		const payload: GAMA_JSON_LOAD_EXPERIMENT = {
			type: "load",
			model: model.getModelFilePath(),
			experiment: model.getExperimentName(),
		};
		logger.trace("Generating json to load GAMA simulation {payload}", { payload });

		return payload;
	}

	/**
	 * Allow to control gama execution
	 * @param {string} type - Only accepted values: [stop, pause, play]
	 * @returns {{exp_id: string, type: string}}
	 */
	jsonControlGamaExperiment(type: "stop" | "pause" | "play") {
		return {
			type: type,
			exp_id: this.jsonGamaState.experiment_id,
		};
	}

	/**
	 * Create or remove player from simulation
	 * @param {string} toggle - Only accepted values: [create, remove]
	 * @param current_id_player
	 * @returns {object}
	 */
	jsonTogglePlayer(toggle: "create" | "remove", current_id_player: string) {
		return {
			type: "expression",
			exp_id: this.jsonGamaState.experiment_id,
			expr: `do ${toggle}_player("${current_id_player}");`,
		};
	}

	jsonSendExpression(expr: string) {
		return {
			type: "expression",
			content: "Send an expression",
			exp_id: this.jsonGamaState.experiment_id,
			expr: expr,
		};
	}

	// --------------------

	/**
	 * Connects the websocket client with gama server and manage the messages received
	 * @returns WebSocket
	 */
	connectGama(): void {
		if (
			this.gama_socket &&
			(this.gama_socket.readyState === WebSocket.CONNECTING || this.gama_socket.readyState === WebSocket.OPEN)
		) {
			if (ENV_VERBOSE) logger.warn("Already connected or connecting. Skipping.");
			return; // Prevent multiple connection attempts
		}

		this.setGamaLoading(true);

		try {
			// Do NOT pin an address family here. Which family GAMA's Java server binds
			// is platform-dependent: on Linux a wildcard bind is dual-stack, but on
			// Windows it is IPv6-ONLY (V6ONLY socket default) — ::1 answers, 127.0.0.1
			// refuses. Node's default family autoselection tries both and connects to
			// whichever one accepts.
			this.gama_socket = new WebSocket(`ws://${process.env.GAMA_IP_ADDRESS}:${process.env.GAMA_WS_PORT}`);

			this.gama_socket.onopen = () => {
				logger.debug(`Opening connection with GAMA Server`);

				this.resetExperimentTracking();
				this.setGamaConnection(true);
				this.setGamaExperimentState("NONE");
			};

			this.gama_socket.onmessage = (event: WebSocket.MessageEvent) => {
				try {
					const message = JSON.parse(event.data as string);
					const type = message.type;

					if (ENV_EXTRA_VERBOSE) {
						logger.trace("Message received from Gama Server:\n{message}", { message });
					}

					switch (type) {
						case "SimulationStatus":
							logger.trace(`Message received from Gama Server: SimulationStatus = ${message.content}`);

							// The platform controls (or is loading) its experiment: trust the status
							if (this.experimentOwned || this.pendingLoad) {
								this.setGamaExperimentId(message.exp_id);
								if (
									["NONE", "NOTREADY"].includes(message.content) &&
									["RUNNING", "PAUSED", "NOTREADY"].includes(this.jsonGamaState.experiment_state)
								) {
									this.controller.cancelLaunchInterval();
									this.controller.player_manager.disableAllPlayerInGame();
									this.latestWins.clear();
									this.controller.notifyMonitor();
								}
								// Experiment is gone; future exp_ids are fresh candidates
								if (message.content === "NONE" && this.experimentOwned) this.releaseExperiment();

								this.setGamaExperimentState(message.content);
								break;
							}

							// Status about an experiment the platform didn't launch (issue #156)
							if (message.content === "NONE") {
								// Foreign experiment closed: it may be probed again if it comes back
								this.rejectedForeignExpIds.delete(message.exp_id);
								this.lastForeignStatus.delete(message.exp_id);
								this.setGamaForeignExperimentDetected(false);
								break;
							}

							this.lastForeignStatus.set(message.exp_id, message.content);

							// A transition to RUNNING makes a previously rejected experiment worth re-probing
							// (e.g. the user pressed play in GAMA's GUI, its simulation is now live)
							if (message.content === "RUNNING") this.rejectedForeignExpIds.delete(message.exp_id);

							if (
								message.content !== "NOTREADY" && // wait for the experiment to be stable before probing
								!this.rejectedForeignExpIds.has(message.exp_id) &&
								this.probe === null
							) {
								this.startForeignExperimentProbe(message.exp_id, true);
							}
							break;

						case "SimulationOutput":
							// A GAML `write` statement reaches us as console output, { message, color },
							// not as a JSON string meant for the headsets. It is not an error: logging it
							// as one flushed the whole trace buffer to disk on every `write` of the model.
							if (typeof message.content !== "string") {
								logger.debug("GAMA console output: {output}", { output: message.content?.message ?? message.content });
								break;
							}
							try {
								this.controller.broadcastSimulationOutput(JSON.parse(message.content));
							} catch (_error) {
								logger.error(`-> Unable to parse received message: {message}`, { message });
							}
							break;

						case "CommandExecutedSuccessfully":
							logger.trace("Message received from Gama Server: CommandExecutedSuccessfully\n{message}", { message });

							this.setGamaContentError("");

							// Reply to a foreign-experiment probe: the experiment is usable, adopt it
							if (this.isProbeReply(message.command)) {
								this.adoptForeignExperiment(message.command.exp_id, String(message.content));
								break;
							}

							// The GUI-embedded GAMA server pushes SimulationStatus on every state
							// change, but the headless server (gama-headless.sh -socket) only
							// acknowledges commands. Derive state transitions from the acks so
							// both work; SimulationStatus stays authoritative when it is pushed.
							switch (message.command.type) {
								case "load":
									this.pendingLoad = false;
									this.experimentOwned = true;
									this.lastForeignStatus.clear();
									// GUI puts the experiment name in content, headless the experiment id.
									this.setGamaExperimentName(message.command.experiment ?? message.content);
									if (this.jsonGamaState.experiment_id === "") this.setGamaExperimentId(message.content);
									if (this.jsonGamaState.experiment_state === "NONE") this.setGamaExperimentState("PAUSED");
									break;
								case "play":
									this.setGamaExperimentState("RUNNING");
									break;
								case "pause":
									this.setGamaExperimentState("PAUSED");
									break;
								case "stop":
									this.controller.cancelLaunchInterval();
									this.controller.player_manager.disableAllPlayerInGame();
									this.latestWins.clear();
									this.releaseExperiment();
									this.setGamaExperimentState("NONE");
									break;
								case "ask":
									this.answerLatestWins(message.command);
									break;
							}

							try {
								this.controller.broadcastSimulationOutput(message);
							} catch (exception) {
								logger.error("Failed to broadcast Simulation Output from Gama Server\n{exception}", { exception });
							}
							break;

						case "ConnectionSuccessful":
							logger.info(
								`Connected to Gama Server on ws://${process.env.GAMA_IP_ADDRESS}:${process.env.GAMA_WS_PORT}`,
							);

							// GAMA may have been started before the platform with an experiment already open
							// (issue #156): it never re-broadcasts SimulationStatus to new clients, so probe
							// proactively. GAMA's GUI-server mode routes commands to the GUI experiment
							// whatever the exp_id, "0" is only a placeholder.
							if (!this.experimentOwned && !this.pendingLoad && this.probe === null) {
								this.startForeignExperimentProbe("0", false);
							}
							break;

						default:
							// If a known GAMA error
							if (GAMA_ERROR_MESSAGES.includes(type)) {
								// Failed probe: the foreign experiment is not controllable, ignore it
								if (this.isProbeReply(message.command)) {
									this.rejectForeignExperiment(message.command.exp_id);
									break;
								}

								logger.error("Error message received from Gama Server: {message}", { message });

								if (message.command?.type === "load") {
									// Our own load failed: drop any state a stray status may have set meanwhile
									this.pendingLoad = false;
									this.setGamaLoading(false);
									if (!this.experimentOwned) this.setGamaExperimentState("NONE");
								}

								// A failed `create_player`: roll back the player state so it can retry later (issue #156)
								const failedPlayerId = extractCreatePlayerId(message.command?.expr);
								if (failedPlayerId !== null) {
									logger.warn(`GAMA could not create the player ${failedPlayerId}, rolling back its in-game status`);
									this.controller.player_manager.togglePlayerInGame(failedPlayerId, false);
									this.controller.player_manager.notifyPlayerError(failedPlayerId, "experiment_not_available");
									this.controller.notifyMonitor();
								}

								// A refused ask is answered too: it must not hold back the next one
								this.answerLatestWins(message.command);
								this.setGamaContentError(message);
								//this.setGamaLoading(false);
							} else {
								logger.error("Unknown message received from Gama Server: {message}", { message });
							}
					}
				} catch (error) {
					logger.fatal("Error with the WebSocket with Gama Server:\n{error}", { error });

					if (error instanceof SyntaxError) logger.error(`Invalid JSON received:\n${event.data}`);
				}
			};

			this.gama_socket.onclose = (event) => {
				this.resetExperimentTracking();
				this.setGamaConnection(false);
				this.setGamaExperimentState("NONE");

				this.controller.cancelLaunchInterval();
				// Always calls remove in game players when the socket closes
				this.controller.player_manager.disableAllPlayerInGame();
				this.controller.notifyMonitor();

				if (event.wasClean) {
					logger.info("Connection with Gama Server closed cleanly, not reconnecting");
					this.gama_socket = null;
				}
			};

			this.gama_socket.onerror = (error) => {
				if (error.error.code === "ECONNREFUSED") {
					logger.trace(`Show full stack for Error CONNREFUSED {error}`, { error });
					logger.error(
						`The platform can't connect to GAMA, please verify that GAMA is open/running and that it's reachable at the address ${process.env.GAMA_IP_ADDRESS}:${process.env.GAMA_WS_PORT}`,
					);
				} else {
					logger.error(`An error happened within the Gama Server WebSocket\n{error}`, { error });
				}
				this.setGamaConnection(false);

				logger.warn("Reconnecting in 5s...");
				setTimeout(() => this.connectGama(), 5000);
			};
		} catch (error) {
			// in case the Websocket instantiation fails for some rare reason
			logger.fatal("An error broke the WebSocket:\n{error}", { error });
			this.gama_socket = null; // Set to null if there was an error, so a reconnection may be triggered

			this.resetExperimentTracking();
			this.setGamaConnection(false);
			this.setGamaExperimentState("NONE");
			this.controller.player_manager.disableAllPlayerInGame();
			this.controller.notifyMonitor();

			logger.warn("Reconnecting in 5s...");
			setTimeout(() => this.connectGama(), 5000);
		} finally {
			this.setGamaLoading(false);
		}
	}

	/**
	 * Sends the message contained in the list @var this.listMessages at the index @var this.currentMessageIndex.
	 */
	sendMessages(callback?: () => void) {
		const copy_listMessages = this.listMessages;
		for (const message of copy_listMessages) {
			try {
				logger.trace("Sending to GAMA: {message}", { message });
				if (this.gama_socket != null)
					if (typeof message === "function") {
						this.gama_socket.send(JSON.stringify(message()));

						if (ENV_VERBOSE)
							if (message().expr !== undefined)
								logger.debug(`Expression sent to Gama Server: '${message().expr}' Waiting for the answer (if any)...`);
							else
								logger.debug(`Message sent to Gama Server: type ${message().type}. Waiting for the answer (if any)...`);
					} else {
						this.gama_socket.send(JSON.stringify(message));
					}
			} catch (e) {
				logger.error("Error while sending this message to GAMA:\n{message}", { message });
				logger.error(`${e}`);
			} finally {
				// Remove message sent from the list
				this.listMessages.splice(this.listMessages.indexOf(message), 1);
			}
		}

		// Run final callback after sending every messages
		if (callback !== undefined) callback();
	}

	/**
	 * Asks Gama to launch the experiment
	 */
	launchExperiment() {
		logger.debug("[GAMA CONNECTOR]Called launch experiment");
		if (this.jsonGamaState.connected && this.jsonGamaState.experiment_state === "NONE") {
			// An admin-triggered launch takes priority over any pending foreign-experiment probe
			this.clearProbe();

			this.model = this.controller.model_manager?.getActiveModel();
			this.pendingLoad = true;

			this.listMessages = [this.jsonLoadExperiment()];
			this.setGamaLoading(true);
			logger.debug("[GAMA CONNECTOR] called LaunchExperiment");
			this.sendMessages(() => {
				this.setGamaLoading(false);
			});
		} else {
			logger.warn("GAMA is not connected or an experiment is already running...");
		}
	}

	/**
	 * Asks Gama to stop the experiment
	 */
	async stopExperiment() {
		this.setGamaLoading(true);
		// Try to pause before closing experiment. Only a running experiment is paused (see
		// pauseExperiment), so only then is there a pause to wait for: the former loop waited for
		// PAUSED unconditionally, polling every 1 ms forever from any other state (e.g. NOTREADY).
		const mustWaitForPause = this.jsonGamaState.experiment_state === "RUNNING";
		this.pauseExperiment();

		// Wait for simulation to be fully paused, but never forever: stop anyway after the timeout
		const deadline = Date.now() + STOP_PAUSE_TIMEOUT_MS;
		while (mustWaitForPause && this.jsonGamaState.experiment_state === "RUNNING" && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
		if (this.jsonGamaState.experiment_state === "RUNNING")
			logger.warn(`GAMA did not report the experiment paused within ${STOP_PAUSE_TIMEOUT_MS} ms, stopping it anyway`);

		// Stop experiment
		this.listMessages = [this.jsonControlGamaExperiment("stop")];

		this.sendMessages(() => {
			this.setGamaLoading(false);
		});

		this.jsonGamaState.experiment_state = "NONE";
	}

	/**
	 * Asks Gama to pause the experiment
	 */
	pauseExperiment(callback?: () => void) {
		if (this.jsonGamaState.experiment_state === "RUNNING") {
			logger.debug("Pausing simulation...");
			this.listMessages = [this.jsonControlGamaExperiment("pause")];
			this.setGamaLoading(true);

			this.sendMessages(() => {
				this.setGamaLoading(false);
				if (typeof callback === "function") {
					callback();
				}
			});
		}
	}

	/**
	 * Asks Gama to play the experiment
	 */
	resumeExperiment() {
		if (this.jsonGamaState.experiment_state === "PAUSED") {
			this.listMessages = [this.jsonControlGamaExperiment("play")];
			this.setGamaLoading(true);

			this.sendMessages(() => {
				this.setGamaLoading(false);
			});
		}
	}

	/**
	 * Asks Gama to add a player in the simulation
	 * @param {string} playerWsId - The id of the player to be added
	 */
	addInGamePlayer(playerWsId: string) {
		if (!this.canTalkToExperiment()) {
			logger.warn(`Blocked create_player for ${playerWsId}: no platform-controlled experiment running in GAMA`);
			return;
		}

		if (this.controller.player_manager.getPlayerState(playerWsId)?.in_game) return;

		this.listMessages = [this.jsonTogglePlayer("create", this.controller.player_manager.getPlayerId(playerWsId)!)];

		this.sendMessages(() => {
			logger.debug(`The Player ${playerWsId} has been added to Gama`);
		});
	}

	/**
	 * Asks Gama to remove a player in the simulation
	 * @param {string} idPlayer - The id of the player
	 */
	removeInGamePlayer(idPlayer: string) {
		logger.debug(`Removing player from game: ${idPlayer}`);

		if (!this.canTalkToExperiment()) {
			logger.debug("No platform-controlled Gama Simulation is running, cannot remove player");
			return;
		}

		const playerState = this.controller.player_manager.getPlayerState(idPlayer);
		if (playerState && !playerState.in_game) {
			logger.debug(`Player ${idPlayer} is already out of the game`);
			return;
		}

		this.listMessages = [this.jsonTogglePlayer("remove", idPlayer)];

		this.sendMessages(() => {
			this.controller.player_manager.togglePlayerInGame(idPlayer, false);
			this.controller.notifyMonitor();
		});
	}

	/**
	 * Sends an expression for a certain player
	 * @param {string} idPlayer - The id of the player to apply this expression
	 * @param {string} expr - The expression. If this expression contains $id, it will be replaced by the id of the player which asked the method
	 */
	sendExpression(idPlayer: string, expr: string) {
		if (!this.canTalkToExperiment()) {
			logger.warn(`Blocked expression from player ${idPlayer}: no platform-controlled experiment running in GAMA`);
			return;
		}

		expr = expr.replace("$id", `"${idPlayer}"`);
		this.listMessages = [this.jsonSendExpression(expr)];

		this.sendMessages(() => {
			logger.trace(`-> The Player of id ${idPlayer} called the function: ${expr} successfully.`);
		});
	}

	/**
	 * Sends an ask to GAMA
	 * @param {object} json - The JSON containing the information of the ask
	 * @param {string} sender - The headset it comes from. With it, asks in LATEST_WINS_ACTIONS are coalesced
	 */
	sendAsk(json: JsonPlayerAsk, sender?: string) {
		// Not a warning: headsets send asks every frame, a warning each would flood the logs
		if (!this.canTalkToExperiment()) return;

		if (sender === undefined || !LATEST_WINS_ACTIONS.has(json.action)) {
			this.sendNow(json);
			return;
		}

		const key = `${sender}|${json.action}`;
		const slot = this.latestWins.get(key) ?? {};
		this.latestWins.set(key, slot);

		if (slot.inFlight && Date.now() - slot.inFlight.since < LATEST_WINS_ACK_TIMEOUT_MS) {
			slot.pending = json; // replaces an older waiting one: only the latest matters
			return;
		}
		this.sendLatestWins(slot, json);
	}

	private sendNow(json: JsonPlayerAsk) {
		this.listMessages = [json];
		this.sendMessages();
	}

	private sendLatestWins(slot: LatestWinsSlot, json: JsonPlayerAsk) {
		slot.inFlight = { action: json.action, args: json.args, since: Date.now() };
		slot.pending = undefined;
		this.sendNow(json);
	}

	/**
	 * GAMA answered an ask (acknowledged or refused): free its slot, and send the ask that waited.
	 * Answers echo the command, so they are matched on action and args. GAMA answers in order, so
	 * when several slots match (two headsets sending the same args) the oldest one is answered.
	 */
	private answerLatestWins(command: { action?: string; args?: string } | undefined) {
		if (!command?.action || !LATEST_WINS_ACTIONS.has(command.action)) return;

		let answered: LatestWinsSlot | undefined;
		for (const slot of this.latestWins.values()) {
			const inFlight = slot.inFlight;
			if (inFlight?.action !== command.action || inFlight.args !== command.args) continue;
			if (!answered?.inFlight || inFlight.since < answered.inFlight.since) answered = slot;
		}
		if (!answered) return;

		answered.inFlight = undefined;
		if (answered.pending) this.sendLatestWins(answered, answered.pending);
	}

	close() {
		if (this.gama_socket !== null) this.gama_socket.close();
	}
}

export default GamaConnector;
