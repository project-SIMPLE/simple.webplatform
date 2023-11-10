//Imports
const WebSocket = require('ws');

// Default values
const DEFAULT_PLAYER_WS_PORT = 8080;

const player_socket_clients = []
const player_socket_clients_id = []

/**
 * Cresates a websocket server to handle player connections
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

        this.player_socket.on('connection', function connection(ws) {
            ws.on('message', function incoming(message) {
                const json_player = JSON.parse(message)
                if (json_player.type == "connection") {
                    //Si le casque a déjà été connecté
                    if (server_model.json_state["player"]["id_connected"].includes(json_player.id)) {
                        const index = player_socket_clients_id.indexOf(json_player.id)
                        player_socket_clients[index] = ws
                        server_model.json_state["player"][json_player.id]["date_connection"] = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`
                        server_model.json_state["player"][json_player.id]["connected"] = true
                        server_model.notifyMonitor();
                    }
                    //Sinon
                    else {
                        player_socket_clients.push(ws)
                        player_socket_clients_id.push(json_player.id)
                        console.log(json_player);
                        server_model.json_state["player"]["id_connected"].push(json_player.id)
                        server_model.json_state["player"][json_player.id] = {}
                        server_model.json_state["player"][json_player.id]["date_connection"] = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`
                        server_model.json_state["player"][json_player.id]["authentified"] = false
                        server_model.json_state["player"][json_player.id]["connected"] = true
                        server_model.notifyMonitor();
                    }
                }
                if (json_player.type =="expression") {
                    const index = player_socket_clients.indexOf(ws)
                    const id_player = player_socket_clients_id[index]
                    console.log(json_player);
                    console.log(id_player);
                    server_model.sendExpression(id_player, json_player.expr);
                }
        
                // if (json_player.type == "exit" && server_model.json_state["player"]["id_connected"].includes(json_player.id) && server_model.json_state["player"][json_player.id]["authentified"] == true){
                //     server_model.removePlayerHeadset()
                // }
            });
        
            ws.on('close', () => {
                const index = player_socket_clients.indexOf(ws)
                const id_player = player_socket_clients_id[index]
                server_model.json_state["player"][id_player]["connected"] = false
                server_model.json_state["player"][id_player]["date_connection"] = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`
                server_model.notifyMonitor();
            })
        
            ws.on('error', (error) => {
                const index = player_socket_clients.indexOf(ws)
                const id_player = player_socket_clients_id[index]
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
        this.server_model.json_simulation.contents.forEach((element) => {
            const id_player = element.id[0]
            const index = player_socket_clients_id.indexOf(id_player)
            if (index != -1) {
                const json_simulation_player = {}
                json_simulation_player.contents = element.contents
                json_simulation_player.type = "json_simulation"
                player_socket_clients[index].send(JSON.stringify(json_simulation_player))
            }
        });
        // for (var id_player in this.server_model.json_simulation) {
        //     if (this.server_model.json_simulation[id_player] != undefined) {
        //         const index = player_socket_clients_id.indexOf(id_player)
        //         const json_simulation_player = this.server_model.json_simulation[id_player];
        //         json_simulation_player.type = "json_simulation"
        //         player_socket_clients[index].send(JSON.stringify(json_simulation_player))
        //     } 
        // }
    }
    /**
     * Send the json_state to the player. It seperates the json to send only the necessary information to the players.
     */
    broadcastJsonStatePlayer() {
        player_socket_clients.forEach((client) => {
            const index = player_socket_clients.indexOf(client)
            const id_player = player_socket_clients_id[index]
            const json_state = this.server_model.json_state
            const json_state_player = {}
            json_state_player.type = json_state.type
            json_state_player.gama = json_state.gama
            json_state_player.player = {}
            json_state_player.player[id_player] = json_state.player[id_player]
            client.send(JSON.stringify(json_state_player));
        })
    }


    // removeEveryPlayers() {
    //     this.server_model.json_state["player"]["id_connected"].forEach(id_player => {
    //         this.server_model.json_state["player"][id_player]["authentified"] = false
    //     });
    // }

    /**
     * Closes the websocket server
     */
    close() {
        this.player_socket.close()
    }
}

module.exports = PlayerServer;