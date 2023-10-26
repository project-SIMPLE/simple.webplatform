//Imports
const WebSocket = require('ws');

// Default values
const DEFAULT_VR_WS_PORT = 8080;

const vr_socket_clients = []
const vr_socket_clients_id = []

class VrServer {
    constructor(server_model) {
        this.server_model = server_model;
        this.vr_ws_port = server_model.json_state.vr_ws_port != undefined ? server_model.json_state.vr_ws_port : DEFAULT_VR_WS_PORT;
        this.vr_socket = new WebSocket.Server({ port: this.vr_ws_port });

        this.vr_socket.on('connection', function connection(ws) {
            ws.on('message', function incoming(message) {
                const json_vr = JSON.parse(message)
                if (json_vr.type == "connection") {
                    //Si le casque a déjà été connecté
                    if (server_model.json_state["vr"]["id_connected"].includes(json_vr.id)) {
                        const index = vr_socket_clients_id.indexOf(json_vr.id)
                        vr_socket_clients[index] = ws
                        server_model.json_state["vr"][json_vr.id]["date_connection"] = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`
                        server_model.json_state["vr"][json_vr.id]["state"] = "connected"
                        server_model.notifyMonitor();
                    }
                    //Sinon
                    else {
                        vr_socket_clients.push(ws)
                        vr_socket_clients_id.push(json_vr.id)
                        console.log(json_vr);
                        server_model.json_state["vr"]["id_connected"].push(json_vr.id)
                        server_model.json_state["vr"][json_vr.id] = {}
                        server_model.json_state["vr"][json_vr.id]["date_connection"] = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`
                        server_model.json_state["vr"][json_vr.id]["authentified"] = false
                        server_model.json_state["vr"][json_vr.id]["state"] = "connected"
                        server_model.notifyMonitor();
                    }
                    if (server_model.json_state["vr"][json_vr.id]["authentified"] == false){
                        server_model.addNewVrHeadset(json_vr.id)
                    }
                }
        
                // if (json_vr.type == "exit" && server_model.json_state["vr"]["id_connected"].includes(json_vr.id) && server_model.json_state["vr"][json_vr.id]["authentified"] == true){
                //     server_model.removeVrHeadset()
                // }
            });
        
            ws.on('close', () => {
                const index = vr_socket_clients.indexOf(ws)
                const id_vr = vr_socket_clients_id[index]
                server_model.json_state["vr"][id_vr]["state"] = "unconnected"
                server_model.json_state["vr"][id_vr]["date_connection"] = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`
                server_model.notifyMonitor();
            })
        
            ws.on('error', (error) => {
                const index = vr_socket_clients.indexOf(ws)
                const id_vr = vr_socket_clients_id[index]
                server_model.json_state["vr"][id_vr]["state"] = "unconnected"
                server_model.json_state["vr"][id_vr]["date_connection"] = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`
                server_model.notifyMonitor();
            });
        
        });
    }

    broadcastSimulationVR() {
        for (var id_vr in this.server_model.json_simulation) {
            if (this.server_model.json_simulation[id_vr] != undefined && id_vr != "count" && id_vr != "random_content") {
                const index = vr_socket_clients_id.indexOf(id_vr)
                const json_simulation_vr = this.server_model.json_simulation[id_vr];
                json_simulation_vr.type = "json_simulation"
                vr_socket_clients[index].send(JSON.stringify(json_simulation_vr))
            } 
        }
    }

    broadcastJsonStateVr() {
        vr_socket_clients.forEach((client) => {
            client.send(JSON.stringify(this.server_model.json_state));
        })
    }
}

module.exports = VrServer;