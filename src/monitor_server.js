//Imports
const WebSocket = require('ws');

// Default values
const DEFAULT_MONITOR_WS_PORT = 8001;

var monitor_socket_clients = []

/**
 * Creates a Websocket Server for handling monitor connections
 */
class MonitorServer {
    /**
     * Creates the websocket server
     * @param {Controller} controller - The controller of the project
     */
    constructor(controller) {
        this.controller = controller;
        const monitor_server = this
        this.monitor_ws_port = controller.model.getJsonSettings().monitor_ws_port != undefined ?  controller.model.getJsonSettings().monitor_ws_port : DEFAULT_MONITOR_WS_PORT;
        var monitor_ws_port = this.monitor_ws_port
        this.monitor_socket = new WebSocket.Server({ port: this.monitor_ws_port });

        this.monitor_socket.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`\x1b[31m-> The port ${monitor_ws_port} is already in use. Choose a different port in settings.json.\x1b[0m`);
            }
            else {
                console.log(`\x1b[31m-> An error occured for the monitor server, code: ${err.code}\x1b[0m`)
            }
        })

        this.monitor_socket.on('connection', function connection(ws) {
            monitor_socket_clients.push(ws)
            monitor_server.sendMonitorJsonState();
            monitor_server.sendMonitorJsonSettings()
            ws.on('message', function incoming(message) {
                try {
                    const json_monitor = JSON.parse(message)
                    const type = json_monitor['type']
                    if (type == "launch_experiment") controller.launchExperiment()
                    else if (type == "stop_experiment") controller.stopExperiment()
                    else if (type == "pause_experiment") controller.pauseExperiment()
                    else if (type == "resume_experiment") controller.resumeExperiment()
                    else if (type == "try_connection") controller.connectGama()
                    else if (type == "add_every_players") controller.addInGameEveryPlayers()
                    else if (type == "remove_every_players") controller.removeInGameEveryPlayers()
                    else if (type == "add_player_headset") controller.addInGamePlayer(json_monitor["id"])
                    else if (type == "remove_player_headset") controller.removeInGamePlayer(json_monitor["id"])
                    else if (type == "json_settings") controller.changeJsonSettings(json_monitor)
                    else if (type == "clean_all") controller.cleanAll()
                    else console.log("\x1b[31m-> The last message received from the monitor had an unknown type.\x1b[0m");
                }
                catch (exception) {
                    console.log("\x1b[31m-> The last message received from the monitor created an internal error.\x1b[0m");
                }
            })
        });
    }

    /**
     * Sends the json_state to the monitor
     */
    sendMonitorJsonState() {
        if (monitor_socket_clients != undefined) monitor_socket_clients.forEach((client) => {
            client.send(JSON.stringify(this.controller.model.getAll()));
        })
    }

    /**
     * Send the json_setting to the monitor
     */
    sendMonitorJsonSettings() {
        if (monitor_socket_clients != undefined) monitor_socket_clients.forEach((client) => {
            client.send(JSON.stringify(this.controller.model.getJsonSettings()));
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