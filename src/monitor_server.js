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
     * @param {Controller} controller - The server model of the project
     */
    constructor(controller) {
        this.controller = controller;
        this.monitor_ws_port = controller.json_settings.monitor_ws_port != undefined ? controller.json_settings.monitor_ws_port : DEFAULT_MONITOR_WS_PORT;
        this.monitor_socket = new WebSocket.Server({ port: this.monitor_ws_port });

        this.monitor_socket.on('connection', function connection(ws) {
            monitor_socket_clients.push(ws)
            controller.notifyMonitor();
            controller.sendJsonSettings()
            ws.on('message', function incoming(message) {
                const json_monitor = JSON.parse(message)
                const type = json_monitor['type']
                if (type == "launch_experiment") controller.launchExperiment()
                else if (type == "stop_experiment") controller.stopExperiment()
                else if (type == "pause_experiment") controller.pauseExperiment()
                else if (type == "resume_experiment") controller.resumeExperiment()
                else if (type == "try_connection") controller.connectGama()
                else if (type == "add_every_players") controller.addEveryPlayers()
                else if (type == "remove_every_players") controller.removeEveryPlayers()
                else if (type == "add_player_headset") controller.addPlayer(json_monitor["id"])
                else if (type == "remove_player_headset") controller.removePlayer(json_monitor["id"])
                else if (type == "json_settings") controller.changeJsonSettings(json_monitor)
                else if (type == "clean_all") controller.clean_all()
            })
        });
    }

    /**
     * Sends the json_state to the monitor
     */
    sendMonitorJsonState() {
        if (monitor_socket_clients != undefined) monitor_socket_clients.forEach((client) => {
            client.send(JSON.stringify(this.controller.json_state));
        })
    }

    /**
     * Send the json_setting to the monitor
     */
    sendMonitorJsonSettings() {
        if (monitor_socket_clients != undefined) monitor_socket_clients.forEach((client) => {
            client.send(JSON.stringify(this.controller.json_settings));
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