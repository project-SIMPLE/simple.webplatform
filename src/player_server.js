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
     * @param {ServerModel} server_model - The server model of the project
     */
    constructor(server_model) {
        this.server_model = server_model;
        this.player_ws_port = server_model.json_settings.player_ws_port != undefined ? server_model.json_settings.player_ws_port : DEFAULT_PLAYER_WS_PORT;
        this.player_socket = new WebSocket.Server({ port: this.player_ws_port });
        const player_server = this;

        this.player_socket.on('connection', function connection(ws) {
            ws.on('message', function incoming(message) {
                const json_player = JSON.parse(message)
                if (json_player.type == "pong") {
                    clearTimeout(pongTimeoutId);
                    setTimeout(() => {
                        player_server.sendPing(getIdClient(ws))
                    }, 5000);
                }
                else if (json_player.type == "connection") {
                    //Si le casque a déjà été connecté
                    if (server_model.json_state["player"]["id_connected"].includes(json_player.id)) {
                        const index = player_socket_clients_id.indexOf(json_player.id)
                        player_socket_clients[index] = ws
                        server_model.json_state["player"][json_player.id]["date_connection"] = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`
                        server_model.json_state["player"][json_player.id]["connected"] = true
                        if (json_player.enable_ping_pong != undefined && json_player.enable_ping_pong) player_server.sendPing(json_player.id)
                        server_model.notifyMonitor();
                        console.log('-> Reconnection of the id: '+json_player.id);
                    }
                    //Sinon
                    else {
                        player_socket_clients.push(ws)
                        player_socket_clients_id.push(json_player.id)
                        server_model.json_state["player"]["id_connected"].push(json_player.id)
                        server_model.json_state["player"][json_player.id] = {}
                        server_model.json_state["player"][json_player.id]["date_connection"] = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`
                        server_model.json_state["player"][json_player.id]["authentified"] = false
                        server_model.json_state["player"][json_player.id]["connected"] = true
                        if (json_player.enable_ping_pong != undefined && json_player.enable_ping_pong) player_server.sendPing(json_player.id)
                        server_model.notifyMonitor();
                        console.log('-> New connection of the id: '+json_player.id);
                    }
                }
                else if (json_player.type =="expression") {
                    const id_player = getIdClient(ws)
                    console.log('-> Sending expression for the player '+id_player+':')
                    console.log(json_player);
                    server_model.sendExpression(id_player, json_player.expr);
                }
                else if (json_player.type =="disconnect_properly") {
                    const id_player = getIdClient(ws)
                    server_model.removePlayer(id_player)
                }
            });
        
            ws.on('close', () => {
                const id_player = getIdClient(ws)
                server_model.json_state["player"][id_player]["connected"] = false
                server_model.json_state["player"][id_player]["date_connection"] = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`
                server_model.notifyMonitor();
                console.log("-> The player: "+getIdClient(ws)+" disconnected");
            })
        
            ws.on('error', (error) => {
                const id_player = getIdClient(ws)
                server_model.json_state["player"][id_player]["connected"] = false
                server_model.json_state["player"][id_player]["date_connection"] = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`
                server_model.notifyMonitor();
            });
        
        });
    }

    /**
     * Send the json_simulation to the players. It seperates the json to send only the necessary information to the players.
     * @returns 
     */
    broadcastSimulationPlayer() {
        if (this.server_model.json_simulation.contents == undefined) return
        try {
            this.server_model.json_simulation.contents.forEach((element) => {
                element.id.forEach((id_player) => {
                    const index = player_socket_clients_id.indexOf(id_player)
                    if (index != -1) {
                        const json_simulation_player = {}
                        json_simulation_player.contents = element.contents
                        json_simulation_player.type = "json_simulation"
                        player_socket_clients[index].send(JSON.stringify(json_simulation_player))
                        console.log("LA   "+id_player);
                        console.log(json_simulation_player);
                    }
                })
            });
        }
        catch (exception) {
            //Exception are written in red
            console.log("\x1b[41m -> The following message hasn't the correct format:\x1b[0m");
            console.log(this.server_model.json_simulation);
        }
    }

    sendPing(id_player) {
        const ws = getWsClient(id_player)
        ws.send("{\"type\":\"ping\"}");
        pongTimeoutId = setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
                // Fermer la connexion si le pong n'est pas reçu dans les temps
                ws.terminate();
                console.log('-> The connection with: '+id_player+" has been interrupted due to pong non-response");
            }
        }, 3000);
    }
    /**
     * Send the json_state to the player. It seperates the json to send only the necessary information to the players.
     */
    broadcastJsonStatePlayer() {
        player_socket_clients.forEach((client) => {
            const id_player = getIdClient(client)
            const json_state = this.server_model.json_state
            const json_state_player = {}
            json_state_player.type = json_state.type
            json_state_player.gama = json_state.gama
            json_state_player.player = {}
            json_state_player.player[id_player] = json_state.player[id_player]
            client.send(JSON.stringify(json_state_player));
        })
    }

    clean_all() {
        var to_remove = []
        this.server_model.json_state.player.id_connected.forEach((player_id, idx) => {
            if (this.server_model.json_state.player[player_id] != undefined && !this.server_model.json_state.player[player_id].connected&& 
            !this.server_model.json_state.player[player_id].authentified) {
                const index = player_socket_clients_id.indexOf(player_id)
                player_socket_clients_id.splice(index,1)
                player_socket_clients.splice(index,1)
                this.server_model.json_state.player.id_connected.splice(idx,1)
                this.server_model.json_state.player[player_id] = undefined
            }
        })
        this.server_model.notifyMonitor();
    }

    

    /**
     * Closes the websocket server
     */
    close() {
        this.player_socket.close()
    }
}

module.exports = PlayerServer;