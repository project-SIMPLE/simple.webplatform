import { WebSocketServer } from 'ws';
import { useVerbose } from './index.js';

/**
 * Creates a websocket server to handle player connections
 */
class PlayerServer {
    /**
     * Creates a Websocket Server
     * @param {Controller} controller - The controller of the project
     */
    constructor(controller) {
        this.controller = controller;
        this.playerSocket = new WebSocketServer({ port: process.env.HEADSET_WS_PORT });

        // Logging connected clients to seamlessly allow client's reconnection
        this.playerSocketClients = [];
        this.playerSocketClientsId = [];

        this.playerSocket.on('connection', (ws) => {
            // Make heartbeat valid on each message received
            ws.isAlive = true;
            ws.lastPing = Date.now();

            let model = this.controller.modelManager.getModelList()[this.controller.choosedLearningPackageIndex];

            ws.on('message', (message) => {
                try {
                    const jsonPlayer = JSON.parse(message);
                    const type = jsonPlayer['type'];
                    if (useVerbose) {
                        console.log("Reception of this following message from the player " + this.getIdClient(ws));
                        console.log(jsonPlayer);
                    }
                    switch (type) {
                        case "pong":
                            ws.isAlive = true;
                            break;

                        case "ping":
                            ws.send(JSON.stringify({
                                "type": "pong",
                                "id": jsonPlayer.id
                            }));
                            break;

                        case "connection":
                            // Reconnection of the headset
                            if (model.getPlayerState(jsonPlayer.id) !== undefined) {
                                const index = this.playerSocketClientsId.indexOf(jsonPlayer.id)
                                this.playerSocketClients[index] = ws
                                model.setPlayerConnection(jsonPlayer.id, true)
                                console.log('-> Reconnection of the player of id '+jsonPlayer.id);
                            }
                            // First connection of the headset
                            else {
                                this.playerSocketClients.push(ws)
                                this.playerSocketClientsId.push(jsonPlayer.id)
                                model.insertPlayer(jsonPlayer.id)
                                model.setPlayerConnection(jsonPlayer.id, true)
                                console.log('-> New connection of the player of id '+jsonPlayer.id);
                            }
                            // Set client-specific timeout
                            ws.heartbeatTimeout = jsonPlayer.heartbeat || 5000; // Default to 5 seconds if not provided
                            break;               
                        // restart the headet
                        case "restart":
                            break;

                        case "expression":
                            this.controller.sendExpression(this.getIdClient(ws), jsonPlayer.expr);
                            break;

                        case "ask":
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
                if (model.getPlayerState(idPlayer) !== undefined) {
                    model.setPlayerConnection(
                        idPlayer,
                        false,
                        `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`
                    );
                    console.log("-> The player " + idPlayer + " disconnected");
                }
            });

            ws.on('error', (error) => {
                const idPlayer = this.getIdClient(ws);
                model.setPlayerConnection(
                    idPlayer,
                    false,
                    `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`
                );
                console.error("-> The player " + idPlayer + " had an error and disconnected");
                console.error(error);
            });
        });

        this.playerSocket.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`\x1b[31m-> The port ${process.env.HEADSET_WS_PORT} is already in use. Choose a different port in settings.json.\x1b[0m`);
            } else {
                console.error(`\x1b[31m-> An error occured for the player server, code: ${err.code}\x1b[0m`);
                console.error(err);
            }
        });

        this.pingInterval = setInterval(this.checkHeartbeats.bind(this), 1000); // Check is alive every 1 seconds
    }

    // Getters
    getIdClient(ws) {
        return this.playerSocketClientsId[this.playerSocketClients.indexOf(ws)];
    }

    getWsClient(id) {
        return this.playerSocketClients[this.playerSocketClientsId.indexOf(id)];
    }

    /**
     * Check heartbeats for all connected clients
     */
    checkHeartbeats() {
        const now = Date.now();
        this.playerSocket.clients.forEach((ws) => {
            if (!ws.isAlive && (now - ws.lastPing > ws.heartbeatTimeout)) {
                console.warn('Terminating dead socket from player ' + this.getIdClient(ws));
                return ws.terminate();
            }

            ws.isAlive = false;
            ws.send(JSON.stringify({"type":"ping"}));
            ws.lastPing = now;
            if (useVerbose) console.log("Sending ping to "+ this.getIdClient(ws));
        });
    }

    /**
     * Send the json_simulation to the players. It seperates the json to send only the necessary information to the players.
     * @returns 
     */
    broadcastSimulationOutput(jsonOutput) {
        if (jsonOutput.contents === undefined) return;
        try {
            jsonOutput.contents.forEach((element) => {
                element.id.forEach((idPlayer) => {
                    const index = this.playerSocketClientsId.indexOf(idPlayer);
                    if (index !== -1) {
                        const jsonOutputPlayer = {};
                        jsonOutputPlayer.contents = element.contents;
                        jsonOutputPlayer.type = "json_output";
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
     * Notifies players about a change about it state
     * @param {int} idPlayer - The id of the player that need to be informed about a change
     * @param {JSON} jsonPlayer - The jsonPlayer to be sent
     */
    notifyPlayerChange(idPlayer, jsonPlayer) {
        const index = this.playerSocketClientsId.indexOf(idPlayer);
        if (index !== -1) {
            // Preparing JSON
            const jsonStatePlayer = {};
            jsonStatePlayer.type = "json_state";
            jsonStatePlayer.id_player = idPlayer;

            // Sending JSON
            this.playerSocketClients[index].send(JSON.stringify({ ...jsonStatePlayer, ...jsonPlayer }));
            if (useVerbose) console.log("[DEBUG Player " + idPlayer + "] Receiving state update " + JSON.stringify({ ...jsonStatePlayer, ...jsonPlayer }));
        }
    }

    /**
     * Cleans from the display all the players that are disconnected and not in game
     */
    cleanAll() {
        let model = this.controller.modelManager.getModelList()[this.controller.choosedLearningPackageIndex];
        for (let idPlayer in model.getAllPlayers()) {
            if (model.getPlayerState(idPlayer) !== undefined
                && !model.getPlayerState(idPlayer).connected
                && !model.getPlayerState(idPlayer).in_game) {
                const index = this.playerSocketClientsId.indexOf(idPlayer);
                this.playerSocketClientsId.splice(index, 1);
                this.playerSocketClients.splice(index, 1);
                model.withdrawPlayer(idPlayer);
            }
        }
    }

    close() {
        clearInterval(this.pingInterval);
        this.playerSocket.close();
    }
}

export default PlayerServer;
