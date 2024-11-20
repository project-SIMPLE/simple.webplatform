import { WebSocketServer, WebSocket } from 'ws';

import {useExtraVerbose, useVerbose, useAggressiveDisconnect} from './index.js';
import { PlayerSocket, PlayerJson, JsonOutput, PlayerState } from "./constants.ts";
import Controller from "./controller.ts";

export interface Player {
    //id: string,
    // Player Socket
    ws: WebSocket,
    is_alive: boolean
    // Player State
    connected: boolean,
    in_game: boolean,
    date_connection: string,
}

/**
 * Creates a websocket server to handle player connections
 */
class PlayerManager {
    controller: Controller;
    pingInterval: NodeJS.Timeout;

    playerSocket: WebSocketServer;

    // playerSocketClients: PlayerSocket[];
    // playerSocketClientsId: string[];
    // playersList: Record<string, PlayerState> = {};

    playerList: Map<string, Player>;

    /**
     * Creates a Websocket Server
     * @param {any} controller - The controller of the project
     */
    constructor(controller: Controller) {
        this.controller = controller;
        this.playerSocket = new WebSocketServer({ port: Number(process.env.HEADSET_WS_PORT) });

        this.playerList = new Map<string, Player>()

        this.playerSocket.on('connection', (ws: PlayerSocket) => {
            ws.on('message', (message: string) => {
                ws.isAlive = true;
                try {
                    const jsonPlayer: PlayerJson = JSON.parse(message);
                    const type = jsonPlayer.type;
                    
                    switch (type) {
                        case "pong":
                            ws.isAlive = true;
                            break;

                        case "ping":
                            ws.send(JSON.stringify({
                                type: "pong",
                                id: jsonPlayer.id
                            }));
                            break;

                        case "connection":
                            if (this.playerList.has(jsonPlayer.id)) {
                                console.log('[PLAYER MANAGER] Reconnection of the player of id ' + jsonPlayer.id);
                                this.playerList.get(jsonPlayer.id)!.ws = ws;
                                // Add in simulation if not already the case
                                if (!this.playerList.get(jsonPlayer.id)!.in_game) this.addPlayerConnection(jsonPlayer.id, true);

                                console.log(this.playerList.get(jsonPlayer.id));
                            } else {
                                console.log('[PLAYER MANAGER] New connection of the player of id ' + jsonPlayer.id);
                                // Create new player in the list
                                this.playerList.set(jsonPlayer.id, {
                                    ws: ws,
                                    is_alive: true,
                                    connected: false,
                                    in_game: false,
                                    date_connection: "",
                                })

                                this.addPlayerConnection(jsonPlayer.id, true);
                            }
                            break;

                        case "restart":
                            // Restart the headset logic
                            break;

                        case "expression":
                            if (useExtraVerbose) console.log("[PLAYER " + this.getIdClient(ws) + "] Sent expression:", jsonPlayer.expr);
                            this.controller.sendExpression(this.getIdClient(ws), jsonPlayer.expr!);
                            break;

                        case "ask":
                            if (useExtraVerbose) console.log("[PLAYER " + this.getIdClient(ws) + "] Sent ask:", jsonPlayer);
                            this.controller.sendAsk(jsonPlayer);
                            break;

                        case "disconnect_properly":
                            this.controller.purgePlayer(this.getIdClient(ws));
                            ws.close();
                            break;

                        default:
                            console.warn("\x1b[31m[PLAYER MANAGER] The last message received from " + this.getIdClient(ws) + " had an unknown type.\x1b[0m");
                            console.warn(jsonPlayer);
                    }
                } catch (exception) {
                    console.error("\x1b[31m[PLAYER MANAGER] The last message received from " + this.getIdClient(ws) + " created an internal error.\x1b[0m");
                    console.error(message);
                    console.error(JSON.parse(message));
                    console.error(exception);
                }
            });

            ws.on('close', () => {
                const idPlayer = this.getIdClient(ws);
                if (this.playerList.has(idPlayer)) {
                    if (useAggressiveDisconnect){
                        this.controller.purgePlayer(idPlayer);
                    } else {
                        this.playerList.get(idPlayer)!.connected = false;
                        this.playerList.get(idPlayer)!.date_connection = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`;

                        console.log("[PLAYER MANAGER] The player " + idPlayer + " disconnected");
                    }
                }
            });

            ws.on('error', (error) => {
                const idPlayer = this.getIdClient(ws);

                console.error("[PLAYER MANAGER] The player " + idPlayer + " had an error and disconnected");
                console.error(error);

                if (useAggressiveDisconnect){
                    this.controller.purgePlayer(idPlayer);
                } else {
                    this.playerList.get(idPlayer)!.connected = false;
                    this.playerList.get(idPlayer)!.date_connection = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`;
                }
            });
        });

        this.playerSocket.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`\x1b[31m[PLAYER MANAGER] The port ${process.env.HEADSET_WS_PORT} is already in use. Choose a different port in settings.json.\x1b[0m`);
            } else {
                console.error(`\x1b[31m[PLAYER MANAGER] An error occurred for the player server, code: ${err.code}\x1b[0m`);
                console.error(err);
            }
        });

        this.pingInterval = setInterval(this.sendHeartbeat.bind(this), 5000);
    }

    // Getters
    getIdClient(ws: PlayerSocket): string {
        let toReturn: string = "";
        for (const [key, player] of this.playerList) {
            if (player.ws === ws) {
                toReturn = key;
                break;
            }
        }
        return toReturn;
    }
    //
    // getWsClient(id: string): PlayerSocket {
    //     return this.playerSocketClients[this.playerSocketClientsId.indexOf(id)];
    // }

    /**
     * Gets the state of a specific player
     * @param {string} idPlayer - Player ID
     * @returns {PlayerState} - The state of the player
     */
    getPlayerState(idPlayer: string): PlayerState {
        const player: Player = this.playerList.get(idPlayer)!;
        return {connected: player.connected, in_game: player.in_game, date_connection: player.date_connection}
    }

    /**
     * Gets all players
     * @returns {Record<string, PlayerState>} - A record of all players
     */
    getPlayerList() {
        return this.playerList;
    }

    // Setters

    // Managing Player list


    /**
     * Withdraws a player
     * @param {string} idPlayer - Player ID
     */
    removePlayer(idPlayer: string) {
        if (useVerbose) console.log("[PLAYER MANAGER] Deleting player", idPlayer);
        // Properly close web socket
        this.playerList.get(idPlayer)!.ws.close();
        // Remove player
        this.playerList.delete(idPlayer);
        this.controller.notifyMonitor();
    }

    // Interact with Player
    /**
     * Sets the in-game status of a player
     * @param {string} idPlayer - Player ID
     * @param {boolean} inGame - In-game status
     */
    togglePlayerInGame(idPlayer: string, inGame: boolean) {
        if (this.playerList.has(idPlayer)) {
            this.playerList.get(idPlayer)!.in_game = inGame;
            this.notifyPlayerChange(idPlayer, this.playerList.get(idPlayer));
            this.controller.notifyMonitor();
        } else {
            console.error("[PLAYER MANAGER] Something strange happened while try to change in_game status for", idPlayer, inGame);
        }
    }

    /**
     * Sets all players' in-game status to false
     */
    removeAllPlayerInGame() {
        for (const [idPlayer] of this.playerList) {
            this.togglePlayerInGame(idPlayer, false)
        }
    }
    /**
     * Sets the connection state of a player
     * @param {string} idPlayer - Player ID
     * @param {boolean} connected - Connection status
     */
    addPlayerConnection(idPlayer: string, connected: boolean) {
        this.playerList.get(idPlayer)!.connected = connected;
        this.playerList.get(idPlayer)!.date_connection = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`;

        if ( !['NONE', "NOTREADY"].includes(this.controller.gama_connector.jsonGamaState.experiment_state) ) {
            if (useVerbose) console.log("[PLAYER MANAGER] Automatically adding new " + idPlayer + " to GAMA simulation...");
            this.controller.addInGamePlayer(idPlayer);
        } else {
            this.notifyPlayerChange(idPlayer, this.playerList.get(idPlayer));
            this.controller.notifyMonitor();
        }
    }

    addEveryPlayer(): void {
        for (const [idPlayer] of this.playerList) {
            this.controller.gama_connector.addInGamePlayer(idPlayer);
            this.togglePlayerInGame(idPlayer, false)
        }
    }

    /**
     * Automatically send Heartbeat ping message to every player's open websocket
     */
    sendHeartbeat() {
        this.playerSocket.clients.forEach((socket: WebSocket) => {
            const playerSocket = socket as PlayerSocket;
            if (!playerSocket.isAlive) {
                console.warn('[PLAYER MANAGER] Terminating dead socket from player ' + this.getIdClient(playerSocket));
                return playerSocket.terminate();
            }

            playerSocket.isAlive = false;
            playerSocket.send(JSON.stringify({ type: "ping" }));

            if (useVerbose) console.log("[PLAYER MANAGER] Sending ping to " + this.getIdClient(playerSocket));
        });
    }

    /**
     * Send the json_simulation to the players. It separates the json to send only the necessary information to the players.
     * @returns
     */
    broadcastSimulationOutput(jsonOutput: JsonOutput) {
        if (!jsonOutput.contents) return;

        try {
            jsonOutput.contents.forEach((element) => {
                element.id.forEach((idPlayer) => {
                    if (this.playerList.has(idPlayer)) {
                        const jsonOutputPlayer = {
                            contents: element.contents,
                            type: "json_output"
                        };
                        this.playerList.get(idPlayer)!.ws.send(JSON.stringify(jsonOutputPlayer));
                    }
                });
            });
        } catch (exception) {
            console.error("\x1b[31m[PLAYER MANAGER] The following message hasn't the correct format:\x1b[0m");
            console.error(jsonOutput);
        }
    }

    /**
     * Notifies players about a change in their state
     * @param {number} idPlayer - The id of the player that needs to be informed about a change
     * @param {object} jsonPlayer - The jsonPlayer to be sent
     */
    notifyPlayerChange(idPlayer: string, jsonPlayer: Player) {
        const { ws, ...newJsonPlayer } = jsonPlayer;
        if (this.playerList.has(idPlayer)) {
            const jsonStatePlayer = {
                type: "json_state",
                id_player: idPlayer
            };

            this.playerList.get(idPlayer)!.ws.send(JSON.stringify({...jsonStatePlayer, ...newJsonPlayer}));
            if (useVerbose) console.log(`[PLAYER MANAGER][DEBUG Player ${idPlayer}] Sending state update ${JSON.stringify({...jsonStatePlayer, ...newJsonPlayer})}`);
        }
    }

    close() {
        // Notify players that they are removed
        for (const [idPlayer] of this.playerList) {
            this.removePlayer(idPlayer)
        }

        this.playerSocket.close();
    }
}

export default PlayerManager;
