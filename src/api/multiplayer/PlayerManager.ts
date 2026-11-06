import uWS, { type TemplatedApp } from "uWebSockets.js";
import { clearInterval } from "node:timers";
import { getLogger, type Logger } from "@logtape/logtape";
import type { PlayerState } from "../../common/types.ts";
import type { JsonOutput, JsonPlayer, JsonPlayerAsk, Player } from "../core/Constants.ts";
import type Controller from "../core/Controller.ts";
import { ENV_AGGRESSIVE_DISCONNECT, ENV_EXTRA_VERBOSE } from "../index.ts";
import { type RemoteAddressData, upgradeWithRemoteAddress } from "../infra/RemoteAddress.ts";

// Override the log function
const logger: Logger = getLogger(["multi", "PlayerManager"]);

// Largest message a headset may send (uWS default: 16 KiB, then the socket is closed)
export const HEADSET_MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;
// Data allowed to wait for a slow headset before uWS drops messages (uWS default: 64 KiB)
export const HEADSET_MAX_BACKPRESSURE_BYTES = 8 * 1024 * 1024;
// A recurring problem is logged at most once in this window
const REPEATED_LOG_INTERVAL_MS = 10_000;

/**
 * Creates a websocket server to handle player connections
 */
class PlayerManager {
	controller: Controller;

	webSocketServer: TemplatedApp;

	//playerList: Map<WS ID/IP ADDRESS, Player>;
	playerList: Map<string, Player>;

	// Headsets (by IP) whose messages uWS is currently dropping, until their socket drains
	private readonly droppingTo = new Set<string>();
	// Last time each recurring problem was logged, keyed by problem
	private readonly lastLogged = new Map<string, number>();

	/**
	 * Creates a Websocket Server
	 * @param {any} controller - The controller of the project
	 */
	constructor(controller: Controller) {
		this.controller = controller;
		this.playerList = new Map<string, Player>();

		this.webSocketServer = uWS
			.App()
			.listen(Number(process.env.HEADSET_WS_PORT), (token) => {
				if (token) {
					logger.info(`Headset server listening on: ws://0.0.0.0:${Number(process.env.HEADSET_WS_PORT)}`);
					logger.debug("{token}", { token });
				} else {
					logger.error(`Failed to listen on the specified port ${process.env.HEADSET_WS_PORT}`);
				}
			})
			.ws<RemoteAddressData>("/*", {
				// Server doesn't compress yet
				// WebSocketSharp (Unity side) doesn't support deflating messages
				// https://github.com/sta/websocket-sharp/issues/580
				//: (uWS.SHARED_COMPRESSOR | uWS.SHARED_DECOMPRESSOR),

				// The uWS defaults are far too small for a game: a headset sending more than
				// 16 KiB at once (e.g. ~500 followed geometries) was disconnected with code 1009,
				// and once 64 KiB were waiting for a headset busy on the WiFi, every further GAMA
				// message to it was silently dropped.
				maxPayloadLength: HEADSET_MAX_PAYLOAD_BYTES,
				maxBackpressure: HEADSET_MAX_BACKPRESSURE_BYTES,

				drain: (ws) => {
					const player = this.playerList.get(ws.getUserData().ip);
					if (player && this.droppingTo.delete(ws.getUserData().ip))
						logger.info(`[${player.id}] Caught up, messages from GAMA are delivered again`);
				},

				// Players are keyed by their IP address. It must be captured here:
				// ws.getRemoteAddressAsText() returns "" in open/message/close, which
				// merged every headset into a single player.
				upgrade: upgradeWithRemoteAddress,

				open: (ws) => {
					const playerWsId: string = ws.getUserData().ip;

					// Check if known player or not
					if (this.playerList.has(playerWsId)) {
						const player: Player = this.playerList.get(playerWsId)!;

						logger.info(`Reconnecting player of id ${player.id}`);
						player.ws = ws;
						player.connected = true;
						player.is_alive = true;
						player.date_connection = `${new Date().getHours().toString().padStart(2, "0")}:${new Date().getMinutes().toString().padStart(2, "0")}`;

						// Add in simulation if game already started and player is reconnecting
						if (!player.in_game) {
							this.addPlayerConnection(playerWsId, true);
						}

						// Restart ping interval
						player.timeout = setInterval(() => this.sendHeartbeat(playerWsId), player.ping_interval);

						// Update new version of player
						this.playerList.set(playerWsId, player);

						this.notifyPlayerChange(playerWsId);
						this.controller.notifyMonitor();
					} else {
						logger.debug(`New ws connection from ${playerWsId}, waiting for connection message...`);
						logger.trace(ws.toString());
					}
				},
				// ======================================

				message: (ws, message) => {
					const playerIP = ws.getUserData().ip;
					const jsonPlayer: JsonPlayer = JSON.parse(Buffer.from(message).toString());

					// Alive as received any message
					if (this.playerList.has(playerIP)) this.playerList.get(playerIP)!.is_alive = true;

					switch (jsonPlayer.type) {
						case "pong":
							this.playerList.get(playerIP)!.is_alive = true;
							break;

						case "ping":
							this.sendMessageByWs(playerIP, {
								type: "pong",
								id: jsonPlayer.id,
							});
							break;

						case "connection":
							if (!this.playerList.has(playerIP)) {
								logger.info(`New connection of the player of id ${jsonPlayer.id}`);
								// Create new player in the list

								this.playerList.set(playerIP, {
									id: jsonPlayer.id,
									ws: ws,
									ping_interval: jsonPlayer.heartbeat || 5000,
									is_alive: true,
									connected: false,
									in_game: false,
									date_connection: "",
								});

								this.addPlayerConnection(playerIP, true);

								// Trigger heartbeat
								this.playerList.get(playerIP)!.timeout = setInterval(
									() => this.sendHeartbeat(playerIP),
									jsonPlayer.heartbeat || 5000,
								);

								this.notifyPlayerChange(playerIP);
								this.controller.notifyMonitor();
							} // Reconnection managed on WS opening
							break;

						// case "restart":
						//     // Restart the headset logic
						//     break;

						case "expression":
							logger.trace(`[PLAYER ${this.playerList.get(playerIP)?.id}] Sent expression: {json}`, {
								json: jsonPlayer.expr,
							});
							this.controller.sendExpression(this.playerList.get(playerIP)?.id, jsonPlayer.expr!);
							break;

						case "ask":
							{
								// Already parsed above: an ask carries its own fields in the same message
								const askJsonPlayer = jsonPlayer as unknown as JsonPlayerAsk;
								logger.trace(`[PLAYER ${this.playerList.get(playerIP)?.id}] Sent expression: {json}`, {
									json: askJsonPlayer,
								});
								// The sender lets GAMA's relay keep only its latest position update
								this.controller.sendAsk(askJsonPlayer, playerIP);
							}
							break;

						case "disconnect_properly":
							ws.end(1000, playerIP);
							this.controller.purgePlayer(this.playerList.get(playerIP)?.id);
							break;

						default:
							logger.warn(
								`The last message received from ${this.playerList.get(playerIP)?.id} had an unknown type\n{json}`,
								{ json: jsonPlayer },
							);
					}

					// Client is alive as he just communicated
					if (this.playerList.has(playerIP)) this.playerList.get(playerIP)!.is_alive = true;
				},

				// ======================================

				close: (ws, code: number, message) => {
					this.droppingTo.delete(ws.getUserData().ip);

					// Try exact ws reference match first
					let playerIP: string | undefined = this.getIndexByPlayerWs(ws);

					// Fallback: identify by remote IP (getIndexByPlayerWs returns undefined when
					// the player has already reconnected and player.ws points to the new socket)
					if (!playerIP) playerIP = ws.getUserData().ip || undefined;

					if (!playerIP) logger.error("Can't find which WebSocket been closed...");
					else
						try {
							const player = this.playerList.get(playerIP);
							if (player) {
								logger.info(`Connection closed with ${player.id} - ${playerIP}.\n\tCode: ${code}`);
								code !== 1000 ? logger.info(`, Reason: ${Buffer.from(message).toString()}`) : "";

								// Only mark disconnected if this close event is for the current active socket.
								// If the player already reconnected, player.ws points to the new socket and
								// we must not clobber the reconnected state.
								if (player.ws === ws) {
									logger.debug("Flagging player as disconnected");
									player.connected = false;
									clearInterval(player.timeout);
								} else {
									logger.debug(`Close event for stale WebSocket of ${player.id} — ignoring`);
								}
							}
						} catch (err) {
							logger.error("Error during close handling: {err}", { err });
						}

					// Handle specific close codes
					switch (code) {
						case 1003:
							logger.error(`[Err ${code}] Unsupported data sent by the client.\nMessage: {message}`, { message });
							break;

						case 1006:
							logger.error(`[Err ${code}] Abnormal websocket closure with message: ${Buffer.from(message).toString()}`);
							break;

						case 1009:
							logger.error(`[Err ${code}] Message too big!`);
							if (message) {
								try {
									logger.error(`${playerIP} - Message: ${Buffer.from(message).toString()}`);
									if (typeof message.byteLength !== "undefined") {
										logger.error(`Message size: ${message.byteLength} bytes`);
									}
								} catch (e) {
									const error = e as Error;
									logger.error("couldn't display error message: {error}", { error: error.message });
								}
							}
							break;

						case 1005:
							logger.warn(`[Err ${code}] Closed without reason; the game probably been closed in Unity IDE`);
							break;

						default:
							if (code !== 1000)
								// 1000 = Normal Closure
								logger.error(`[Err ${code}] Unexpected closure`);
							else logger.debug("Closing normally");
					}

					this.controller.notifyMonitor();
				},
			});
	}

	// Getters
	// Not finding the player is not logged here: callers know whether it is expected. GAMA keeps
	// sending output to a player who left, every cycle, and an error per lookup made the file log
	// write out its whole trace buffer each time.
	getIndexByPlayerId(id: string): string | undefined {
		for (const [key, player] of this.playerList) {
			if (player.id === id) return key;
		}
		return undefined;
	}

	/** Logs a recurring problem at most once per REPEATED_LOG_INTERVAL_MS for the same key. */
	private warnRepeated(key: string, message: string): void {
		const now = Date.now();
		if (now - (this.lastLogged.get(key) ?? 0) < REPEATED_LOG_INTERVAL_MS) return;
		this.lastLogged.set(key, now);
		logger.warn(message);
	}

	getIndexByPlayerWs(ws: uWS.WebSocket<unknown>): string | undefined {
		let toReturn: string | undefined;
		for (const [key, player] of this.playerList) {
			if (player.ws === ws) {
				toReturn = key;
				break;
			}
		}
		if (toReturn === undefined) logger.error(`Cannot find player with WS ${ws}`);

		return toReturn;
	}

	/**
	 * Gets the state of a specific player
	 * @param {string} playerWsId - Player WS ID
	 * @returns {PlayerState} - The state of the player
	 */
	getPlayerState(playerWsId: string): PlayerState | undefined {
		if (this.playerList.has(playerWsId)) {
			const player: Player = this.playerList.get(playerWsId)!;
			return { connected: player.connected, in_game: player.in_game, date_connection: player.date_connection };
		} else logger.warn(`Can't find player with ID ${playerWsId}`);
	}

	/**
	 * Gets the in_game ID of a specific player
	 * NB: The `playerWsId` is different from the in_game ID as the first one represent the IP address connecting to the mw
	 * @param {string} playerWsId - Player ID
	 * @returns {string} - The ID player
	 */
	getPlayerId(playerWsId: string): string | undefined {
		if (this.playerList.has(playerWsId)) {
			return this.playerList.get(playerWsId)?.id;
		} else logger.warn(`Can't find player with ws ID ${playerWsId}`);
	}

	/**
	 * Gets array with all players under a format which can be JSON.stringify
	 * Removed attribute `ws` which is very verbose and not necessary
	 */
	getArrayPlayerList() {
		// Turn Map to a dictionary
		// Remove very verbose `ws` attribute
		return Object.fromEntries(
			Array.from(this.playerList.entries()).map(([, value]) => [
				value.id,
				{ ...value, timeout: undefined, ws: undefined },
			]),
		);
	}

	// Managing Player list

	/**
	 * Sets the connection state of a player
	 * @param {string} playerWsId - Player ID
	 * @param {boolean} connected - Connection status
	 */
	addPlayerConnection(playerWsId: string, connected: boolean) {
		this.playerList.get(playerWsId)!.connected = connected;
		this.playerList.get(playerWsId)!.date_connection =
			`${new Date().getHours().toString().padStart(2, "0")}:${new Date().getMinutes().toString().padStart(2, "0")}`;

		if (
			this.controller.gama_connector !== undefined &&
			!["NONE", "NOTREADY"].includes(this.controller.gama_connector.jsonGamaState.experiment_state)
		) {
			logger.debug(`Adding player ${this.playerList.get(playerWsId)?.id} to GAMA simulation...`);
			this.controller.addInGamePlayer(playerWsId);
			this.togglePlayerInGame(playerWsId, true);
		}
	}

	/**
	 * Withdraws a player
	 * @param {string} playerWsId - Player ID
	 */
	removePlayer(playerWsId: string) {
		logger.debug(`Deleting player ${playerWsId}`);

		// Manage both working with Player ID or Player IP
		const playerIP: string = this.playerList.has(playerWsId) ? playerWsId : this.getIndexByPlayerId(playerWsId)!;

		if (this.playerList.has(playerIP)) {
			try {
				// Properly close web socket
				this.playerList.get(playerIP)?.ws.end(1000, playerIP);
			} catch (_e) {
				logger.warn(`${playerIP} is already disconnected from middleware\nFull log of player: {player}`, {
					player: this.playerList.get(playerIP),
				});
			}

			if (ENV_AGGRESSIVE_DISCONNECT) {
				logger.debug("Aggressively deleting player");
				// Remove player
				this.playerList.delete(playerIP);
			}
		} else {
			logger.warn(`Can't remove un-existing player ${playerIP}`);
		}
	}

	/**
	 * Disconnect every players
	 */
	removeAllPlayer() {
		logger.debug("Disconnect every player at once");

		for (const [playerWsId] of this.playerList) {
			this.removePlayer(playerWsId);
		}
	}

	closePlayerWS(playerWsId: string) {
		if (this.playerList.has(playerWsId)) {
			const player = this.playerList.get(playerWsId)!;
			player.connected = false;
			clearInterval(player.timeout);
			try {
				player.ws.end(1000, playerWsId);
			} catch (_e) {
				// Socket already closed (e.g. Unity closed Play Mode before the heartbeat fired)
				logger.warn(`${playerWsId} WebSocket already closed`);
			}
		}
	}

	// Interact with Player
	/**
	 * Sets the in-game status of a player
	 * @param {string} playerWsId - Player ID
	 * @param {boolean} inGame - In-game status
	 */
	togglePlayerInGame(playerWsId: string, inGame: boolean) {
		const playerIP: string = this.playerList.has(playerWsId) ? playerWsId : this.getIndexByPlayerId(playerWsId)!;

		if (this.playerList.has(playerIP)) {
			this.playerList.get(playerIP)!.in_game = inGame;
			this.notifyPlayerChange(playerIP);
		} else {
			logger.error(`Something strange happened while try to change in_game status for ${playerWsId} ${inGame}`);
		}
	}

	/**
	 * Sets all players' in-game status to false
	 */
	disableAllPlayerInGame() {
		logger.debug("Change in-game status of every player at once");

		for (const [playerWsId] of this.playerList) {
			this.togglePlayerInGame(playerWsId, false);
		}
	}

	addEveryPlayer(): void {
		logger.debug("Add every player at once");

		for (const [playerWsId, player] of this.playerList) {
			if (this.controller.gama_connector !== undefined && !player.in_game) {
				this.controller.gama_connector.addInGamePlayer(playerWsId);
				this.togglePlayerInGame(playerWsId, true);
			}
		}
	}

	/**
	 * Automatically send Heartbeat ping message to every player's open websocket
	 */
	sendHeartbeat(playerWsId: string): void {
		// Stop pinging if player already disconnected
		if (!this.playerList.has(playerWsId) || !this.playerList.get(playerWsId)?.connected) {
			logger.debug(`${playerWsId} is already disconnected, stop pinging...`);
			if (this.playerList.has(playerWsId)) clearInterval(this.playerList.get(playerWsId)?.timeout);
			return;
		} else if (!this.playerList.get(playerWsId)?.is_alive) {
			// Terminate ws of disconnected player
			logger.warn(`Terminating dead socket from ${this.playerList.get(playerWsId)?.id}`);
			this.closePlayerWS(playerWsId);
			this.controller.notifyMonitor();
			return;
		}

		this.playerList.get(playerWsId)!.is_alive = false;
		try {
			this.sendMessageByWs(playerWsId, { type: "ping" });
		} catch (e) {
			logger.error(`Error while sending ping to ${this.playerList.get(playerWsId)?.id})\n{e}`, { e });
		}
		logger.debug(`Sending ping to ${this.playerList.get(playerWsId)?.id}`);
	}

	/**
	 * Send the json_simulation to the players. It separates the json to send only the necessary information to the players.
	 * @returns
	 */
	broadcastSimulationOutput(jsonOutput: JsonOutput) {
		if (!jsonOutput.contents) return;

		try {
			jsonOutput.contents.forEach((element) => {
				// Serialized once for every player it goes to, not once per player
				const serialized = JSON.stringify({ contents: element.contents, type: "json_output" });
				element.id.forEach((idPlayer) => {
					const playerIp: string | undefined = this.getIndexByPlayerId(idPlayer);
					if (playerIp !== undefined) {
						this.sendSerializedByWs(playerIp, serialized);
					} else {
						this.warnRepeated(
							`unknown:${idPlayer}`,
							`GAMA sends output to ${idPlayer}, who is not connected to the WebPlatform`,
						);
					}
				});
			});
		} catch (_exception) {
			logger.error("The following message hasn't the correct format: {jsonOutput}", { jsonOutput });
		}
	}

	/**
	 * Notifies players about a change in their state
	 * @param {number} playerWsId - The id of the player that needs to be informed about a change
	 */
	notifyPlayerChange(playerWsId: string) {
		if (this.playerList.has(playerWsId)) {
			const jsonPlayer: Player = this.playerList.get(playerWsId)!;

			const { ws, timeout, ...newJsonPlayer } = jsonPlayer;

			const jsonStatePlayer = {
				type: "json_state",
				id_player: jsonPlayer?.id,
			};

			this.sendMessageByWs(playerWsId, { ...jsonStatePlayer, ...newJsonPlayer });
			logger.debug(
				`[Player ${jsonPlayer?.id}] Sending state update ${JSON.stringify({ ...jsonStatePlayer, ...newJsonPlayer })}`,
			);
		}
	}

	/**
	 *
	 * @param playerWsId
	 * @param message
	 * @return Returns 1 for success, 2 for dropped due to backpressure limit, and 0 for built up backpressure that will drain over time.
	 * @return -1 if playerWsId missing or not connected
	 */
	//message sent is not necessarily a string, see PlayerManager, for example
	sendMessageByWs(playerWsId: string, message: unknown): number {
		return this.sendSerializedByWs(playerWsId, JSON.stringify(message));
	}

	/** Same as sendMessageByWs, for a message already serialized to JSON. */
	sendSerializedByWs(playerWsId: string, serialized: string): number {
		const jsonPlayer = this.playerList.get(playerWsId);
		if (!jsonPlayer?.connected) {
			if (ENV_EXTRA_VERBOSE)
				if (!jsonPlayer) logger.warn(`Missing player - Can't send a message to player ${playerWsId}`);
				else logger.warn(`Disconnected player - Can't send a message to player ${playerWsId}`);

			return -1;
		}

		let result: number;
		try {
			result = jsonPlayer.ws.send(serialized, false, true); // not binary, compress
		} catch (_e) {
			// Socket closed between the connected-check above and the send (race condition)
			logger.warn(`WebSocket for ${playerWsId} closed mid-send, marking disconnected`);
			jsonPlayer.connected = false;
			return 0;
		}

		// 2: uWS dropped the message, the headset has more than maxBackpressure waiting.
		// It used to go unnoticed. Logged once per stall (drain clears it), and as a warning:
		// an error makes the file log write out its whole trace buffer, every message.
		if (result === 2 && !this.droppingTo.has(playerWsId)) {
			this.droppingTo.add(playerWsId);
			logger.warn(
				`[${jsonPlayer.id}] Headset too slow to receive: dropping messages until it catches up (${jsonPlayer.ws.getBufferedAmount()} bytes waiting)`,
			);
		}
		return result;
	}

	close() {
		// Notify players that they are removed
		for (const [, value] of this.playerList) {
			this.removePlayer(value.id);
		}

		this.controller.notifyMonitor();

		this.webSocketServer.close();
	}
}

export default PlayerManager;
