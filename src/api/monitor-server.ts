import uWS, {TemplatedApp} from 'uWebSockets.js';

import { Controller } from './controller';
import { JsonMonitor } from "./constants.ts"
import {useVerbose} from "./index.ts";

/**
 * Creates a Websocket Server for handling monitor connections
 */
export class MonitorServer {
    private controller: Controller;
    private wsClients: Set<uWS.WebSocket<any>>;
    private wsServer!: TemplatedApp;//: WebSocketServer;

    /**
     * Creates the websocket server
     * @param {Controller} controller - The controller of the project
     */
    constructor(controller: Controller) {
        this.controller = controller;
        this.wsClients = new Set<uWS.WebSocket<any>>();

        const host = process.env.WEB_APPLICATION_HOST || 'localhost';
        const port = parseInt(process.env.MONITOR_WS_PORT || '8080', 10);

        this.wsServer = uWS.App(); //new WebSocketServer({ host, port });

        this.wsServer.listen(host, port, (token) => {
            if (token) {
                console.log(`[MONITOR SERVER] Creating monitor server on: ws://${host}:${port}`);
            } else {
                console.error('[MONITOR SERVER] Failed to listen on the specified port and host');
            }
        });

        this.wsServer.ws('/*', {
            compression: uWS.SHARED_COMPRESSOR, // Enable compression
            // .send() - Compressed automatically if client supports it

            // Maximum length of *received* message.
            maxPayloadLength: 16 * 1024,

            idleTimeout: 30, // 30 seconds timeout

            open: (ws) => {
                console.log("[MONITOR SERVER] Connected to monitor server");
                this.wsClients.add(ws);
                this.sendMonitorGamaState();
                this.sendMonitorJsonSettings();
            },
            message: (ws, message) => {
                const jsonMonitor: JsonMonitor = JSON.parse(Buffer.from(message).toString());
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

                    case "add_player_headset":
                        if (jsonMonitor.id) {
                            this.controller.addInGamePlayer(jsonMonitor.id);
                        }
                        break;

                    case "remove_player_headset":
                        if (jsonMonitor.id) {
                            this.controller.purgePlayer(jsonMonitor.id);
                        } else {
                            console.error("[MONITOR] Failed to remove player headset, missing PlayerID");
                        }
                        break;

                    case "get_simulation_informations":
                        //console.log(this.controller.getSimulationInformations());
                        // data processed on the front-end by the Web socket Manager
                        ws.send(this.controller.getSimulationInformations(), false, true); // Force message compression
                    break;

                    case "get_simulation_by_index":
                        const index = jsonMonitor.simulationIndex;

                        if (index !== undefined && index >= 0 && index < this.controller.model_manager.getModelList().length) {
                            // Retrieve the simulation based on the index
                            this.controller.model_manager.setActiveModelByIndex(index);

                            const selectedSimulation = this.controller.model_manager.getActiveModel();

                            const success = ws.send(JSON.stringify({
                                type: "get_simulation_by_index",
                                simulation: selectedSimulation.getJsonSettings() // Assuming getJsonSettings returns the relevant data
                            }), false, true); // Force message compression
                            if (!success) {console.error('[MONITOR WS] Backpressure detected. Data not sent.')}

                            if (useVerbose) console.log("[MONITOR] Opening virtual universe", selectedSimulation.getJsonSettings());
                        } else {
                            console.error("[MONITOR] Invalid index received or out of bounds");
                        }
                        break;

                    // TODO : Add way to change layout on M2L2 main screen
                    // in the component that displays the monitoring screens, create a useEffect that listens to this variable
                    // directly use the variable in the component with conditional rendering
                    // case "set_gama_screen":
                    //     const success = ws.send(JSON.stringify({
                    //         type: "setMonitorScreen",
                    //         mode: 'gama_screen'
                    //     }));
                    //     if (!success) {console.error('[MONITOR WS] Backpressure detected. Data not sent.')}
                    //     break;
                    //
                    // //
                    // case "set_shared_screen":
                    //     console.log("shared screen !");
                    //     const success = ws.send(JSON.stringify({
                    //         type: "setMonitorScreen",
                    //         mode: 'shared_screen'
                    //     }));
                    //     if (!success) {console.error('[MONITOR WS] Backpressure detected. Data not sent.')}
                    //     break;

                    default:
                        console.warn("\x1b[31m[MONITOR] The last message received from the monitor had an unknown type.\x1b[0m");
                        console.warn(jsonMonitor);
                }
            },

            close: (ws, code: number, message) => {
                try {
                    this.wsClients.delete(ws)
                    console.log(`[MONITOR] Connection closed. Code: ${code}, Reason: ${Buffer.from(message).toString()}`);

                    // Handle specific close codes
                    switch (code) {
                        case 1003:
                            console.error('[MONITOR] Unsupported data sent by the client.');
                            break;

                        case 1006:
                        case 1009:
                            console.error('[MONITOR] Message too big!');
                            console.error('[MONITOR] Message size:', message.byteLength, 'bytes');
                            console.error('[MONITOR] Message :', message);
                            break;

                        default:
                            if (code !== 1000) // 1000 = Normal Closure
                                console.error('[MONITOR] Unexpected closure');
                            else
                                if (useVerbose) console.log(`[MONITOR] Connection normally`);
                    }
                } catch (err) {
                    console.error('[MONITOR] Error during close handling:', err);
                }
            },
        });
    }

    /**
     * Sends the json_state to the monitor
     */
    sendMonitorGamaState(): void {
        if (this.wsClients !== undefined && this.controller.model_manager.getActiveModel() !== undefined) {
            this.wsClients.forEach((client) => {
                client.send(JSON.stringify({
                    type: "json_state",
                    gama: this.controller.gama_connector.getJsonGama(),
                    player: this.controller.player_manager.getArrayPlayerList(),
                }), false, true); // Force message compression
            });
        }
    }

    /**
     * Send the json_setting to the monitor
     */
    sendMonitorJsonSettings(): void {
        if (this.wsClients !== undefined && this.controller.model_manager.getActiveModel() !== undefined) {
            this.wsClients.forEach((client) => {
                client.send(JSON.stringify(this.controller.model_manager.getActiveModel().getJsonSettings()), false, true); // Force message compression
            });
        }
    }

    /**
     * Closes the websocket server
     */
    close(): void {
        this.wsServer.close();
    }
}

export default MonitorServer;
