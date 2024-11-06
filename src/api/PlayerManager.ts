import { WebSocketServer, WebSocket } from 'ws';
import {useExtraVerbose, useVerbose, useAggressiveDisconnect} from './index.js';

interface PlayerSocket extends WebSocket {
    isAlive: boolean;
}

interface PlayerJson {
    id: string;
    type: string;
    expr?: string;
}

interface JsonOutput {
    contents?: Array<{
        id: string[];
        contents: any;
    }>;
}

interface PlayerState {
    connected: boolean;
    in_game: boolean;
    date_connection: string;
}

/**
 * Creates a websocket server to handle player connections
 */
class PlayerManager {
    controller: any;
    playerSocket: WebSocketServer;
    playerSocketClients: PlayerSocket[];
    playerSocketClientsId: string[];
    pingInterval: NodeJS.Timeout;
    playersList: Record<string, PlayerState> = {};

    /**
     * Creates a Websocket Server
     * @param {any} controller - The controller of the project
     */
    constructor(controller: any) {
        this.controller = controller;
        this.playerSocket = new WebSocketServer({ port: Number(process.env.HEADSET_WS_PORT) });

        // Logging connected clients to seamlessly allow client's reconnection
        this.playerSocketClients = [];
        this.playerSocketClientsId = [];

        this.playerSocket.on('connection', (ws: PlayerSocket) => {
            ws.isAlive = true;

            ws.on('message', (message: string) => {
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
                            if (this.playersList[jsonPlayer.id] !== undefined) {
                                const index = this.playerSocketClientsId.indexOf(jsonPlayer.id);
                                this.playerSocketClients[index] = ws;
                                this.addPlayerConnection(jsonPlayer.id, true);
                                console.log('-> Reconnection of the player of id ' + jsonPlayer.id);
                            } else {
                                this.playerSocketClients.push(ws);
                                this.playerSocketClientsId.push(jsonPlayer.id);
                                // Create new player in the list
                                this.playersList[jsonPlayer.id] = {
                                    connected: false,
                                    in_game: false,
                                    date_connection: ""
                                };

                                this.addPlayerConnection(jsonPlayer.id, true);
                                console.log('-> New connection of the player of id ' + jsonPlayer.id);
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
                            this.controller.removeInGamePlayer(this.getIdClient(ws));
                            ws.close();
                            break;

                        default:
                            console.warn("\x1b[31m-> The last message received from " + this.getIdClient(ws) + " had an unknown type.\x1b[0m");
                            console.warn(jsonPlayer);
                    }
                } catch (exception) {
                    console.error("\x1b[31m-> The last message received from " + this.getIdClient(ws) + " created an internal error.\x1b[0m");
                    console.error(exception);
                }
            });

            ws.on('close', () => {
                const idPlayer = this.getIdClient(ws);
                if (this.playersList[idPlayer] !== undefined) {
                    if (useAggressiveDisconnect){
                        this.controller.purgePlayer(idPlayer);
                    } else {
                        this.playersList[idPlayer].connected = false;
                        this.playersList[idPlayer].date_connection = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`;

                        console.log("-> The player " + idPlayer + " disconnected");
                    }
                }
            });

            ws.on('error', (error) => {
                const idPlayer = this.getIdClient(ws);

                console.error("-> The player " + idPlayer + " had an error and disconnected");
                console.error(error);

                if (useAggressiveDisconnect){
                    this.controller.purgePlayer(idPlayer);
                } else {
                    this.playersList[idPlayer].connected = false;
                    this.playersList[idPlayer].date_connection = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`;
                }
            });
        });

        this.playerSocket.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`\x1b[31m-> The port ${process.env.HEADSET_WS_PORT} is already in use. Choose a different port in settings.json.\x1b[0m`);
            } else {
                console.error(`\x1b[31m-> An error occurred for the player server, code: ${err.code}\x1b[0m`);
                console.error(err);
            }
        });

        this.pingInterval = setInterval(this.sendHeartbeat.bind(this), 5000);
    }

    // Getters
    getIdClient(ws: PlayerSocket): string {
        return this.playerSocketClientsId[this.playerSocketClients.indexOf(ws)];
    }

    getWsClient(id: string): PlayerSocket {
        return this.playerSocketClients[this.playerSocketClientsId.indexOf(id)];
    }

    /**
     * Gets the state of a specific player
     * @param {string} idPlayer - Player ID
     * @returns {PlayerState} - The state of the player
     */
    getPlayerState(idPlayer: string): PlayerState {
        return this.playersList[idPlayer];
    }

    /**
     * Gets all players
     * @returns {Record<string, PlayerState>} - A record of all players
     */
    getPlayerList(): Record<string, PlayerState> {
        return this.playersList;
    }

    // Setters

    // Managing Player list


    /**
     * Withdraws a player
     * @param {string} idPlayer - Player ID
     */
    removePlayer(idPlayer: string) {
        if (useVerbose) console.log("[PLAYER MANAGER] Deleting player", idPlayer);

        delete this.playersList[idPlayer];
        this.controller.notifyMonitor();

        this.getWsClient(idPlayer).close();
    }

    /**
     * Cleans from the display all the players that are disconnected and not in-game
     */
    cleanAll() {
        for (let idPlayer in this.getPlayerList()) {
            if (this.playersList[idPlayer] !== undefined
                && !this.playersList[idPlayer].connected
                && !this.playersList[idPlayer].in_game) {
                const index = this.playerSocketClientsId.indexOf(idPlayer);
                this.playerSocketClientsId.splice(index, 1);
                this.playerSocketClients.splice(index, 1);
                this.removePlayer(idPlayer);
            }
        }
    }

    // Interact with Player
    /**
     * Sets the in-game status of a player
     * @param {string} idPlayer - Player ID
     * @param {boolean} inGame - In-game status
     */
    setPlayerInGame(idPlayer: string, inGame: boolean) {
        if (this.playersList[idPlayer] !== undefined) {
            this.playersList[idPlayer].in_game = inGame;
            this.controller.notifyPlayerChange(idPlayer, this.playersList[idPlayer]);
            this.controller.notifyMonitor();
        } else {
            console.error("[PLAYER MANAGER] Something strange happened while try to change in_game status for", idPlayer, inGame);
        }
    }

    /**
     * Sets all players' in-game status to false
     */
    setRemoveInGameEveryPlayers() {
        for (let idPlayer in this.playersList) {
            if (this.playersList[idPlayer] !== undefined) {
                this.playersList[idPlayer].in_game = false;
                this.controller.notifyPlayerChange(idPlayer, this.playersList[idPlayer]);
            }
        }
        this.controller.notifyMonitor();
    }
    /**
     * Sets the connection state of a player
     * @param {string} idPlayer - Player ID
     * @param {boolean} connected - Connection status
     */
    addPlayerConnection(idPlayer: string, connected: boolean) {
        this.playersList[idPlayer].connected = connected;
        this.playersList[idPlayer].date_connection = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`;
        this.controller.notifyPlayerChange(idPlayer, this.playersList[idPlayer]);
        this.controller.notifyMonitor();
        if ( !['NONE', "NOTREADY"].includes(this.controller.gama_controller.jsonGamaState.experiment_state) ) {
            if (useVerbose) console.log("[PLAYER MANAGER] Automatically adding new " + idPlayer + " to GAMA simulation...");
            this.setPlayerInGame(idPlayer, true);
        }
    }

    /**
     * Automatically send Heartbeat ping message to every player's open websocket
     */
    sendHeartbeat() {
        this.playerSocket.clients.forEach((socket: WebSocket) => {
            const playerSocket = socket as PlayerSocket;
            if (!playerSocket.isAlive) {
                console.warn('Terminating dead socket from player ' + this.getWsClient(playerSocket as any));
                return playerSocket.terminate();
            }

            playerSocket.isAlive = false;
            playerSocket.send(JSON.stringify({ type: "ping" }));

            if (useVerbose) console.log("Sending ping to " + this.getIdClient(playerSocket));
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
                    const index = this.playerSocketClientsId.indexOf(idPlayer);
                    if (index !== -1) {
                        const jsonOutputPlayer = {
                            contents: element.contents,
                            type: "json_output"
                        };
                        this.playerSocketClients[index].send(JSON.stringify(jsonOutputPlayer));
                    }
                });
            });
        } catch (exception) {
            console.error("\x1b[31m-> The following message hasn't the correct format:\x1b[0m");
            console.error(jsonOutput);
        }
    }

    /**
     * Notifies players about a change in their state
     * @param {number} idPlayer - The id of the player that needs to be informed about a change
     * @param {object} jsonPlayer - The jsonPlayer to be sent
     */
    notifyPlayerChange(idPlayer: number, jsonPlayer: any) {
        const index = this.playerSocketClientsId.indexOf(idPlayer.toString());
        if (index !== -1) {
            const jsonStatePlayer = {
                type: "json_state",
                id_player: idPlayer
            };

            this.playerSocketClients[index].send(JSON.stringify({ ...jsonStatePlayer, ...jsonPlayer }));
            if (useVerbose) console.log(`[DEBUG Player ${idPlayer}] Receiving state update ${JSON.stringify({ ...jsonStatePlayer, ...jsonPlayer })}`);
        }
    }

    close() {
        const copyPlayerSocketClientsId = this.playerSocketClientsId;

        for (let i = 0; i < copyPlayerSocketClientsId.length; i++) {
            this.removePlayer(copyPlayerSocketClientsId[i]);
        }

        this.playerSocket.close();
    }
}

export default PlayerManager;
