import { WebSocketServer, WebSocket } from 'ws';
import { Controller } from './controller';

interface JsonMonitor {
    type: string;
    id?: string;
    simulationIndex?: number;
}

/**
 * Creates a Websocket Server for handling monitor connections
 */
export class MonitorServer {
    private controller: Controller;
    private monitorSocketClients: WebSocket[];
    private monitorSocket!: WebSocketServer;

    /**
     * Creates the websocket server
     * @param {Controller} controller - The controller of the project
     */
    constructor(controller: Controller) {
        this.controller = controller;
        this.monitorSocketClients = [];

        try {
            const host = process.env.WEB_APPLICATION_HOST || 'localhost';
            const port = parseInt(process.env.MONITOR_WS_PORT || '8080', 10);

            this.monitorSocket = new WebSocketServer({ host, port });
            console.log(`[MONITOR SERVER] Creating monitor server on: ws://${host}:${port}`);
        } catch (e) {
            console.error("[MONITOR SERVER] Failed to create WebSocket server", e);
        }

        this.monitorSocket.on('connection', (socket: WebSocket) => {
            this.monitorSocketClients.push(socket);
            console.log("[MONITOR SERVER] Connected to monitor server");
            this.sendMonitorJsonState();
            this.sendMonitorJsonSettings();
            socket.on('message', (message) => {
                try {
                    const jsonMonitor: JsonMonitor = JSON.parse(message.toString());
                    const type = jsonMonitor.type;
                    switch (type) {
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
                            if (jsonMonitor.id) {
                                this.controller.addInGamePlayer(jsonMonitor.id);
                            }
                            break;
                        case "remove_player_headset":
                            if (jsonMonitor.id) {
                                // remove the player from the simulation
                                this.controller.removeInGamePlayer(jsonMonitor.id);
                                // Send message to socket Manager
                                console.log("les joueurs après delete ::: ", this.controller.getPlayerList());
                                socket.send(JSON.stringify({
                                    type: "remove_player_headset",
                                    id: jsonMonitor.id,
                                    player: this.controller.getPlayerList() // list of player to update in the webSocket -> web interface (seems not to render the accurate list)
                                }));
                            }
                            break;
                        case "json_settings":
                            this.controller.changeJsonSettings(jsonMonitor);
                            break;
                        case "clean_all":
                            this.controller.cleanAll();
                            break;
                        case "get_simulation_informations":
                            // send to the Web socket Manager
                            socket.send(this.controller.getSimulationInformations());
                            break;
                        case "get_simulation_by_index":
                            const index = jsonMonitor.simulationIndex;

                            if (index !== undefined && index >= 0 && index < this.controller.modelManager.getModelList().length) {
                                // Retrieve the simulation based on the index
                                const selectedSimulation = this.controller.modelManager.getModelList()[index];

                                socket.send(JSON.stringify({
                                    type: "get_simulation_by_index",
                                    simulation: selectedSimulation.getJsonSettings() // Assuming getJsonSettings returns the relevant data
                                }));
                            } else {
                                console.error("Invalid index received or out of bounds");
                            }

                        break;

                        // in the component that displays the monitoring screens, create a useEffect that listens to this variable
                        // directly use the variable in the component with conditional rendering                        
                        case "set_gama_screen":
                            socket.send(JSON.stringify({
                                type: "setMonitorScreen",
                                mode: 'gama_screen'
                            }));
                            break;
                        case "set_shared_screen":
                            console.log("shared screen !");
                            socket.send(JSON.stringify({
                                type: "setMonitorScreen",
                                mode: 'shared_screen'
                            }));
                            break;
                        default:
                            console.warn("\x1b[31m-> The last message received from the monitor had an unknown type.\x1b[0m");
                            console.warn(jsonMonitor);
                    }
                } catch (exception) {
                    console.error("\x1b[31m-> The last message received from the monitor created an internal error.\x1b[0m");
                    console.error(exception);
                }
            });
        });

        this.monitorSocket.on('error', (err: Error) => {
            if ('code' in err && err.code === 'EADDRINUSE') {
                console.log(`\x1b[31m-> The port ${process.env.MONITOR_WS_PORT} is already in use. Choose a different port in settings.json.\x1b[0m`);
            } else {
                console.log(`\x1b[31m-> An error occurred for the monitor server, code: ${(err as any).code}\x1b[0m`);
            }
        });
    }

    /**
     * Sends the json_state to the monitor
     */
    sendMonitorJsonState(): void {
        if (this.monitorSocketClients !== undefined) {
            this.monitorSocketClients.forEach((client: WebSocket) => {
                client.send(JSON.stringify(this.controller.modelManager.getModelList()[this.controller.choosedLearningPackageIndex].getAll()));
            });
        }
    }

    /**
     * Send the json_setting to the monitor
     */
    sendMonitorJsonSettings(): void {
        if (this.monitorSocketClients !== undefined) {
            this.monitorSocketClients.forEach((client: WebSocket) => {
                client.send(JSON.stringify(this.controller.modelManager.getModelList()[this.controller.choosedLearningPackageIndex].getJsonSettings()));
            });
        }
    }

    /**
     * Closes the websocket server
     */
    close(): void {
        this.monitorSocket.close();
    }
}

export default MonitorServer;
