//Imports
const WebSocket = require('ws');

// Default values
const DEFAULT_PLAYER_WS_PORT = 8080;

const player_socket_clients = []
const player_socket_clients_id = []

var pongTimeoutId;

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
     * @param {Controller} controller - The server model of the project
     */
    constructor(controller) {
        this.controller = controller;
        this.player_ws_port = controller.model.getJsonSettings().player_ws_port != undefined ? controller.model.getJsonSettings().player_ws_port : DEFAULT_PLAYER_WS_PORT;
        var player_ws_port = this.player_ws_port
        this.player_socket = new WebSocket.Server({ port: this.player_ws_port });
        const player_server = this;

        this.player_socket.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`\x1b[31m-> The port ${player_ws_port} is already in use. Choose a different port in settings.json.\x1b[0m`);
            }
            else {
                console.log(`\x1b[31m-> An error occured for the player server, code: ${err.code}\x1b[0m`)
            }
        })

        this.player_socket.on('connection', function connection(ws) {
            ws.on('message', function incoming(message) {
                const json_player = JSON.parse(message)
                if (json_player.type == "pong") {
                    clearTimeout(pongTimeoutId);
                    setTimeout(() => {
                        player_server.sendPing(getIdClient(ws))
                    }, 5000);
                }
                if (json_player.type == "ping") {
                    ws.send(JSON.stringify({
                        "type": "pong",
                        "id": json_player.id,
                        "message": json_player.message
                    }));
                }
                else if (json_player.type == "connection") {
                    //Si le casque a déjà été connecté
                    if (controller.model.getPlayerState(json_player.id) != undefined) {
                        const index = player_socket_clients_id.indexOf(json_player.id)
                        player_socket_clients[index] = ws
                        controller.model.setPlayerConnection(json_player.id, true, `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`)
                        if (json_player.set_heartbeat != undefined && json_player.set_heartbeat) player_server.sendPing(json_player.id)
                        console.log('-> Reconnection of the player of id '+json_player.id);
                    }
                    //Sinon
                    else {
                        player_socket_clients.push(ws)
                        player_socket_clients_id.push(json_player.id)
                        controller.model.insertPlayer(json_player.id)
                        controller.model.setPlayerConnection(json_player.id, true, `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`)
                        if (json_player.enable_ping_pong != undefined && json_player.enable_ping_pong) player_server.sendPing(json_player.id)
                        controller.notifyMonitor();
                        console.log('-> New connection of the player of id '+json_player.id);
                    }
                }
                else if (json_player.type =="expression") {
                    const id_player = getIdClient(ws)
                //    console.log('-> Sending expression for the player '+id_player+':')
                    controller.sendExpression(id_player, json_player.expr);
                }
                else if (json_player.type =="ask") {
                    const id_player = getIdClient(ws)
                 //   console.log('-> Sending ask for the player '+id_player+':')
                    controller.sendAsk(json_player);
                }
                else if (json_player.type =="disconnect_properly") {
                    const id_player = getIdClient(ws)
                    controller.removeInGamePlayer(id_player)
                    ws.close()
                }
            });
        
            ws.on('close', () => {
                const id_player = getIdClient(ws)
                if (controller.model.getPlayerState(id_player) != undefined) {
                    controller.model.setPlayerConnection(id_player, false, `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`)
                    console.log("-> The player "+getIdClient(ws)+" disconnected");
                }
            })
        
            ws.on('error', (error) => {
                const id_player = getIdClient(ws)
                controller.model.setPlayerConnection(json_player.id, false, `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`)
                console.log("-> The player "+getIdClient(ws)+" disconnected");
            });
        
        });
    }

    /**
     * Send the json_simulation to the players. It seperates the json to send only the necessary information to the players.
     * @returns 
     */
    broadcastSimulationOutput(json_output) {
        if (json_output.contents == undefined) return
	//console.log('PRENVOI')
	//console.log(player_socket_clients_id)
	
        try {
            json_output.contents.forEach((element) => {
                element.id.forEach((id_player) => {
                    const index = player_socket_clients_id.indexOf(id_player)
                    if (index != -1) {
			//console.log('ENVOI')
                        const json_output_player = {}
                        json_output_player.contents = element.contents
                        json_output_player.type = "json_output"
                        player_socket_clients[index].send(JSON.stringify(json_output_player))
                      //  console.log(JSON.stringify(json_output_player));
                    }
                })
            });
        }
        catch (exception) {
            //Exception are written in red
            console.log("\x1b[31m -> The following message hasn't the correct format:\x1b[0m");
            console.log(json_output);
        }
    }

    sendPing(id_player) {
        const ws = getWsClient(id_player)
        try {
            ws.send("{\"type\":\"ping\"}");
            setTimeout(() => {
                ws.send("{\"type\":\"ping\"}");
            }, 1000)
            setTimeout(() => {
                ws.send("{\"type\":\"ping\"}");
            }, 2000)
            pongTimeoutId = setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    // Fermer la connexion si le pong n'est pas reçu dans les temps
                    ws.terminate();
                    console.log('-> The connection with player '+id_player+" has been interrupted due to pong non-response");
                }
            }, 3000);
        }
        catch (error) {
            console.log("\x1b[31m -> Error when sending ping message\x1b[0m");
        }
        
    }

    notifyPlayerChange(id_player, json_player) {
        const index = player_socket_clients_id.indexOf(id_player)
        if (index != -1) {
            const json_state_player = {}
            json_state_player.type = "json_state"
            json_state_player.id_player = id_player
            const concatenated_json_state_player = { ...json_state_player, ...json_player };
            player_socket_clients[index].send(JSON.stringify(concatenated_json_state_player))
            //console.log(json_simulation_player);
        }
    }

    cleanAll() {
        var to_remove = []
        for(var id_player in this.controller.model.getAllPlayers()) {
            if (this.controller.model.getPlayerState(id_player) != undefined && !this.controller.model.getPlayerState(id_player).connected && !this.controller.model.getPlayerState(id_player).in_game) {
                    const index = player_socket_clients_id.indexOf(id_player)
                    player_socket_clients_id.splice(index,1)
                    player_socket_clients.splice(index,1)
                    this.controller.model.withdrawPlayer(id_player)
                }
        }
    }

    /**
     * Closes the websocket server
     */
    close() {
        this.player_socket.close()
    }
}

module.exports = PlayerServer;