//Imports
const WebSocket = require('ws');
const {useVerbose} = require("../index");

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
        this.monitor_socket = new WebSocket.Server({ port: process.env.MONITOR_WS_PORT });

        this.monitor_socket_clients = [];

        /*
            Handling middleware socket connections and message routing
         */

        this.monitor_socket.on('connection', (socket) => {
            this.monitor_socket_clients.push(socket)
            this.sendMonitorJsonState();
            this.sendMonitorJsonSettings();
            socket.on('message', (message) => {
                try {
                    const json_monitor = JSON.parse(message)
                    const type = json_monitor['type']
                    switch (type){
                        case "launch_experiment":
                            this.controller.launchExperiment();
                            break;
                        case "stop_experiment":
                            this.controller.stopExperiment();
                            break;
                        case "pause_experiment":
                            this.controller.pauseExperiment();
                            break;
                        case "resume_experiment":
                            this.controller.resumeExperiment();
                            break;
                        case "try_connection":
                            this.controller.connectGama();
                            break;
                        case "add_every_players":
                            this.controller.addInGameEveryPlayers();
                            break;
                        case "remove_every_players":
                            this.controller.removeInGameEveryPlayers();
                            break;
                        case "add_player_headset":
                            this.controller.addInGamePlayer(json_monitor["id"]);
                            break;
                        case "remove_player_headset":
                            this.controller.removeInGamePlayer(json_monitor["id"]);
                            break;
                        case "json_settings":
                            this.controller.changeJsonSettings(json_monitor);
                            break;
                        case "clean_all":
                            this.controller.cleanAll();
                            break;
                        default:
                            console.log("\x1b[31m-> The last message received from the monitor had an unknown type.\x1b[0m");
                    }
                }
                catch (exception) {
                    console.error("\x1b[31m-> The last message received from the monitor created an internal error.\x1b[0m");
                    console.error(exception);
                }
            });
        });

        this.monitor_socket.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`\x1b[31m-> The port ${process.env.MONITOR_WS_PORT} is already in use. Choose a different port in settings.json.\x1b[0m`);
            }
            else {
                console.log(`\x1b[31m-> An error occured for the monitor server, code: ${err.code}\x1b[0m`)
            }
        })
    }

    /**
     * Sends the json_state to the monitor
     */
    sendMonitorJsonState() {
        if (this.monitor_socket_clients !== undefined) this.monitor_socket_clients.forEach((client) => {
            client.send(JSON.stringify(this.controller.modelManager.getModelList()[this.controller.choosedLearningPackageIndex].getAll()));
        })
    }

    /**
     * Send the json_setting to the monitor
     */
    sendMonitorJsonSettings() {
        if (this.monitor_socket_clients !== undefined) this.monitor_socket_clients.forEach((client) => {
            client.send(JSON.stringify(this.controller.modelManager.getModelList()[this.controller.choosedLearningPackageIndex].getJsonSettings()));
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