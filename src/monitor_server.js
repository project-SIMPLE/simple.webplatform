//Imports
const WebSocket = require('ws');

// Default values
const DEFAULT_MONITOR_WS_PORT = 80;

var monitor_socket_clients = []

/**
 * Creates a Websocket Server for handling monitor connections
 */
class MonitorServer {
    /**
     * Creates the websocket server
     * @param {ServerModel} server_model - The server model of the project
     */
    constructor(server_model) {
        this.server_model = server_model;
        this.monitor_ws_port = server_model.json_settings.monitor_ws_port != undefined ? server_model.json_settings.monitor_ws_port : DEFAULT_MONITOR_WS_PORT;
        this.monitor_socket = new WebSocket.Server({ port: this.monitor_ws_port });

        this.monitor_socket.on('connection', function connection(ws) {
            monitor_socket_clients.push(ws)
            server_model.notifyMonitor();
            server_model.sendJsonSettings()
            ws.on('message', function incoming(message) {
                const json_monitor = JSON.parse(message)
                const type = json_monitor['type']
                if (type == "launch_experiment") server_model.launchExperiment()
                else if (type == "stop_experiment") server_model.stopExperiment()
                else if (type == "pause_experiment") server_model.pauseExperiment()
                else if (type == "resume_experiment") server_model.resumeExperiment()
                else if (type == "try_connection") server_model.connectGama()
                else if (type == "add_every_players") server_model.addEveryPlayers()
                else if (type == "remove_every_players") server_model.removeEveryPlayers()
                else if (type == "add_player_headset") server_model.addPlayer(json_monitor["id"])
                else if (type == "remove_player_headset") server_model.removePlayer(json_monitor["id"])
                else if (type == "json_settings") server_model.changeJsonSettings(json_monitor)
                else if (type == "clean_all") server_model.clean_all()
            })
        });
    }

    /**
     * Sends the json_state to the monitor
     */
    sendMonitorJsonState() {
        if (monitor_socket_clients != undefined) monitor_socket_clients.forEach((client) => {
            client.send(JSON.stringify(this.server_model.json_state));
        })
    }

    /**
     * Send the json_setting to the monitor
     */
    sendMonitorJsonSettings() {
        if (monitor_socket_clients != undefined) monitor_socket_clients.forEach((client) => {
            client.send(JSON.stringify(this.server_model.json_settings));
        })
    }
    /**
     * Send the json_simulation to the monitor
     */
    sendMonitorJsonSimulation() {
        var json_simulation = this.server_model.json_simulation
        json_simulation.type = "json_simulation"
        if (monitor_socket_clients != undefined) monitor_socket_clients.forEach((client) => {
            client.send(JSON.stringify(json_simulation));
        })
    }
    /**
     * Closes the websocket server
     */
    close() {
        this.monitor_socket.close()
    }
    
}

module.exports = MonitorServer;