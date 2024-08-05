//Imports
const WebSocket = require('ws');

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
        this.monitorSocket = new WebSocket.Server({ port: process.env.MONITOR_WS_PORT });

        this.monitorSocketClients = [];

        /*
            Handling middleware socket connections and message routing
         */

        this.monitorSocket.on('connection', (socket) => {
            this.monitorSocketClients.push(socket)
            this.sendMonitorJsonState();
            this.sendMonitorJsonSettings();
            socket.on('message', (message) => {
                try {
                    const jsonMonitor = JSON.parse(message)
                    const type = jsonMonitor['type']
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
                            this.controller.addInGamePlayer(jsonMonitor["id"]);
                            break;
                        case "remove_player_headset":
                            this.controller.removeInGamePlayer(jsonMonitor["id"]);
                            break;
                        case "json_settings":
                            this.controller.changeJsonSettings(jsonMonitor);
                            break;
                        case "clean_all":
                            this.controller.cleanAll();
                            break;
                        default:
                            console.warn("\x1b[31m-> The last message received from the monitor had an unknown type.\x1b[0m");
                            console.warn(jsonMonitor);
                    }
                }
                catch (exception) {
                    console.error("\x1b[31m-> The last message received from the monitor created an internal error.\x1b[0m");
                    console.error(exception);
                }
            });
        });

        this.monitorSocket.on('error', (err) => {
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
        if (this.monitorSocketClients !== undefined) this.monitorSocketClients.forEach((client) => {
            client.send(JSON.stringify(this.controller.modelManager.getModelList()[this.controller.choosedLearningPackageIndex].getAll()));
        })
    }

    /**
     * Send the json_setting to the monitor
     */
    sendMonitorJsonSettings() {
        if (this.monitorSocketClients !== undefined) this.monitorSocketClients.forEach((client) => {
            client.send(JSON.stringify(this.controller.modelManager.getModelList()[this.controller.choosedLearningPackageIndex].getJsonSettings()));
        })
    }
    
    /**
     * Closes the websocket server
     */
    close() {
        this.monitorSocket.close()
    }
    
}

module.exports = MonitorServer;