//Imports
const WebSocket = require('ws');

// Default values
const DEFAULT_MONITOR_WS_PORT = 80;

var monitor_socket_clients = []

class MonitorServer {
    constructor(server_model) {
        this.server_model = server_model;
        this.monitor_ws_port = server_model.json_settings.monitor_ws_port != undefined ? server_model.json_settings.monitor_ws_port : DEFAULT_MONITOR_WS_PORT;
        this.monitor_socket = new WebSocket.Server({ port: this.monitor_ws_port });

        this.monitor_socket.on('connection', function connection(ws) {
            monitor_socket_clients.push(ws)
            server_model.notifyMonitor();
            ws.on('message', function incoming(message) {
                const json_monitor = JSON.parse(message)
                const type = json_monitor['type']
                if (type == "launch_experiment") server_model.launchExperiment()
                else if (type == "stop_experiment") server_model.stopExperiment()
                else if (type == "try_connection") server_model.connectGama()
                else if (type == "add_vr_headset") server_model.addNewVrHeadset(json_monitor["id"])
                else if (type == "remove_vr_headset") server_model.removeVrHeadset(json_monitor["id"])
                else if (type == "json_setting") server_model.chqngeJsonSetting(json_monitor)
            })
        });
    }

    sendMonitorInformation() {
        if (monitor_socket_clients != undefined) monitor_socket_clients.forEach((client) => {
            client.send(JSON.stringify(this.server_model.json_state));
        })
    }

    
}

module.exports = MonitorServer;