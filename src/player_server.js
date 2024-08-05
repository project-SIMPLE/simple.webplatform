//Imports
const WebSocket = require('ws');

const { useVerbose } = require('../index.js');

const player_socket_clients = []
const player_socket_clients_id = []

var pongTimeout1Attempt = {};
var pongTimeout2Attempt = {};

function getIdClient(ws) {
    const index = player_socket_clients.indexOf(ws)
    return player_socket_clients_id[index]
}

function getWsClient(id) {
    const index = player_socket_clients_id.indexOf(id)
    return player_socket_clients[index]
}

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
        this.playerSocket = new WebSocket.Server({ port: process.env.HEADSET_WS_PORT });

        this.playerSocket.on('connection', (ws) => {
            ws.on('message', (message) => {
                try {
                    const jsonPlayer = JSON.parse(message)
                    const type = jsonPlayer['type']
                    if (useVerbose) {
                        console.log("Reception of this following message from the player " + getIdClient(ws));
                        console.log(jsonPlayer);
                    }
                    switch (type){
                        case "pong":
                            clearTimeout(pongTimeout1Attempt[getIdClient(ws)]);
                            clearTimeout(pongTimeout2Attempt[getIdClient(ws)])
                            setTimeout(() => {
                                this.sendPing(getIdClient(ws))
                            }, 5000);
                            break;

                        case "ping":
                            ws.send(JSON.stringify({
                                "type": "pong",
                                "id": jsonPlayer.id,
                                "message": jsonPlayer.message
                            }));
                            break;

                        case "connection":
                            // Reconnection of the headset
                            if (this.controller.modelManager.getModelList()[this.controller.choosedLearningPackageIndex].getPlayerState(jsonPlayer.id) !== undefined) {
                                const index = player_socket_clients_id.indexOf(jsonPlayer.id)
                                player_socket_clients[index] = ws
                                this.controller.modelManager.getModelList()[this.controller.choosedLearningPackageIndex].setPlayerConnection(jsonPlayer.id, true)
                                if (jsonPlayer.set_heartbeat !== undefined && jsonPlayer.set_heartbeat){
                                    const id = jsonPlayer.id
                                    setTimeout(() => {player_server.sendPing(id)}, 4000)
                                }
                                console.log('-> Reconnection of the player of id '+jsonPlayer.id);
                            }
                            // First connection of the headset
                            else {
                                player_socket_clients.push(ws)
                                player_socket_clients_id.push(jsonPlayer.id)
                                this.controller.modelManager.getModelList()[this.controller.choosedLearningPackageIndex].insertPlayer(jsonPlayer.id)
                                this.controller.modelManager.getModelList()[this.controller.choosedLearningPackageIndex].setPlayerConnection(jsonPlayer.id, true)
                                if (jsonPlayer.set_heartbeat !== undefined && jsonPlayer.set_heartbeat){
                                    const id = jsonPlayer.id
                                    setTimeout(() => {player_server.sendPing(id)}, 4000)
                                }
                                console.log('-> New connection of the player of id '+jsonPlayer.id);
                            }
                            break;

                        case "expression":
                            controller.sendExpression(getIdClient(ws), jsonPlayer.expr);
                            break;

                        case "ask":
                            controller.sendAsk(jsonPlayer);
                            break;

                        case "disconnect_properly":
                            controller.removeInGamePlayer(getIdClient(ws))
                            ws.close()
                            break;

                        default:
                            console.warn("\x1b[31m-> The last message received from " + getIdClient(ws) + " had an unknown type.\x1b[0m");
                            console.warn(jsonPlayer);
                    }
                }
                catch(exception) {
                    console.error("\x1b[31m-> The last message received from " + getIdClient(ws) + " created an internal error.\x1b[0m");
                    console.error(exception);
                }
            });
        
            ws.on('close', () => {
                const idPlayer = getIdClient(ws)
                if (this.controller.modelManager.getModelList()[this.controller.choosedLearningPackageIndex].getPlayerState(idPlayer) !== undefined) {
                    this.controller.modelManager.getModelList()[this.controller.choosedLearningPackageIndex].setPlayerConnection(idPlayer, false, `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`)
                    console.log("-> The player "+getIdClient(ws)+" disconnected");
                }
            })
        
            ws.on('error', (error) => {
                const idPlayer = getIdClient(ws)
                this.controller.modelManager.getModelList()[this.controller.choosedLearningPackageIndex].setPlayerConnection(idPlayer, false, `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`)
                console.error("-> The player "+getIdClient(ws)+" disconnected");
                console.error(error);
            });
        
        });

        this.playerSocket.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`\x1b[31m-> The port ${process.env.HEADSET_WS_PORT} is already in use. Choose a different port in settings.json.\x1b[0m`);
            }
            else {
                console.error(`\x1b[31m-> An error occured for the player server, code: ${err.code}\x1b[0m`)
                console.error(err)
            }
        })
    }

    /**
     * Send the json_simulation to the players. It seperates the json to send only the necessary information to the players.
     * @returns 
     */
    broadcastSimulationOutput(jsonOutput) {
        if (jsonOutput.contents === undefined) return
        //console.log('PRENVOI')
        //console.log(player_socket_clients_id)
	
        try {
            jsonOutput.contents.forEach((element) => {
                element.id.forEach((idPlayer) => {
                    const index = player_socket_clients_id.indexOf(idPlayer)
                    if (index !== -1) {
            			//console.log('ENVOI')
                        const jsonOutputPlayer = {}
                        jsonOutputPlayer.contents = element.contents
                        jsonOutputPlayer.type = "json_output"
                        player_socket_clients[index].send(JSON.stringify(jsonOutputPlayer))
                        //  console.log(JSON.stringify(jsonOutputPlayer));
                    }
                })
            });
        }
        catch (exception) {
            console.error("\x1b[31m-> The following message hasn't the correct format:\x1b[0m");
            console.error(jsonOutput);
        }
    }

    /**
     * Send ping messages for Heartbeat
     * @param {int} idPlayer - The id of the player that needs heartbeat
     */
    sendPing(idPlayer) {
        const ws = getWsClient(idPlayer)
        try {
            if (useVerbose) console.log("Sending ping to "+idPlayer);
            ws.send("{\"type\":\"ping\"}");
            pongTimeout1Attempt[idPlayer] = setTimeout(() => {
                if (useVerbose) console.log("Sending ping to "+idPlayer);
                ws.send("{\"type\":\"ping\"}");
            }, 3000);
            pongTimeout2Attempt[idPlayer] = setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.terminate();
                    console.log('\x1b[31m-> The connection with player '+idPlayer+" has been interrupted due to pong non-response\x1b[0m");
                }
            }, 6000);
        }
        catch (error) {
            console.error("\x1b[31m-> Error when sending ping message to "+idPlayer+"\x1b[0m");
            console.error(error);
        }
        
    }

    /**
     * Notifies players about a change about it state
     * @param {int} idPlayer - The id of the player that need to be informed about a change
     * @param {JSON} jsonPlayer - The jsonPlayer to be sent
     */

    notifyPlayerChange(idPlayer, jsonPlayer) {
        const index = player_socket_clients_id.indexOf(idPlayer)
        if (index !== -1) {
            // Preparing JSON
            const jsonStatePlayer = {}
            jsonStatePlayer.type = "json_state"
            jsonStatePlayer.id_player = idPlayer

            // Sending JSON
            player_socket_clients[index].send(JSON.stringify({ ...jsonStatePlayer, ...jsonPlayer }))
            if(useVerbose) console.log("[DEBUG Player "+idPlayer+"] Receiving state update " + JSON.stringify({ ...jsonStatePlayer, ...jsonPlayer }));
        }
    }

    /**
     * Cleans from the display all the players that are disconnected and not in game
     */

    cleanAll() {
        for(var idPlayer in this.controller.modelManager.getModelList()[this.controller.choosedLearningPackageIndex].getAllPlayers()) {
            if (this.controller.modelManager.getModelList()[this.controller.choosedLearningPackageIndex].getPlayerState(idPlayer) !== undefined
                && !this.controller.modelManager.getModelList()[this.controller.choosedLearningPackageIndex].getPlayerState(idPlayer).connected
                && !this.controller.modelManager.getModelList()[this.controller.choosedLearningPackageIndex].getPlayerState(idPlayer).in_game) {
                    const index = player_socket_clients_id.indexOf(idPlayer)
                    player_socket_clients_id.splice(index,1)
                    player_socket_clients.splice(index,1)
                    this.controller.modelManager.getModelList()[this.controller.choosedLearningPackageIndex].withdrawPlayer(idPlayer)
                }
        }
    }

    /**
     * Closes the websocket server
     */
    close() {
        this.playerSocket.close()
    }
}

module.exports = PlayerServer;