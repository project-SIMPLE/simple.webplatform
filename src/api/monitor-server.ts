import uWS, { TemplatedApp } from 'uWebSockets.js';

import { Controller } from './controller';
import { JsonMonitor } from "./constants.ts"
import { useExtraVerbose, useVerbose } from "./index.ts";

// Override the log function
const log = (...args: any[]) => {
    console.log("\x1b[33m[MONITOR SERVER]\x1b[0m", ...args);
};
const logWarn = (...args: any[]) => {
    console.warn("\x1b[33m[MONITOR SERVER]\x1b[0m", "\x1b[43m", ...args, "\x1b[0m");
};
const logError = (...args: any[]) => {
    console.error("\x1b[33m[MONITOR SERVER]\x1b[0m", "\x1b[41m", ...args, "\x1b[0m");
};

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
        const port = parseInt(process.env.MONITOR_WS_PORT || '8001', 10);

        this.wsServer = uWS.App(); //new WebSocketServer({ host, port });

        this.wsServer.listen(host, port, (token) => {
            if (token) {
                log(`Creating monitor server on: ws://${host}:${port}`);
            } else {
                logError('Failed to listen on the specified port and host');
            }
        });

        this.wsServer.ws('/*', {
            // compression: (uWS.SHARED_COMPRESSOR | uWS.SHARED_DECOMPRESSOR), // Enable compression
            idleTimeout: 30, // 30 seconds timeout

            open: (ws) => {
                log("Connected to monitor server");
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

                    case "screen_control": //TODO
                        const messageString = JSON.parse(Buffer.from(message).toString()); //? can't parse the payload of the jsonMonitor for some reason
                        logWarn(`[MONITOR SERVER] data recieved:${messageString.display_type}`);
                        this.sendMessageByWs({type: "screen_control", display_type: messageString.display_type});
                        break;
                        

                    case "remove_player_headset":
                        if (jsonMonitor.id) {
                            this.controller.purgePlayer(jsonMonitor.id);
                        } else {
                            logError("Failed to remove player headset, missing PlayerID");
                        }
                        break;

                    case "get_simulation_informations":
                        this.sendMessageByWs(this.controller.getSimulationInformations(), ws);
                        break;

                    case "get_simulation_by_index":
                        const index = jsonMonitor.simulationIndex;

                        if (index !== undefined && index >= 0 && index < this.controller.model_manager.getModelList().length) {
                            // Retrieve the simulation based on the index
                            this.controller.model_manager.setActiveModelByIndex(index);

                            const selectedSimulation = this.controller.model_manager.getActiveModel();

                            this.sendMessageByWs({
                                type: "get_simulation_by_index",
                                simulation: selectedSimulation.getJsonSettings() // Assuming getJsonSettings returns the relevant data
                            }, ws);

                            if (useVerbose) log("Opening virtual universe", selectedSimulation.getJsonSettings());
                        } else {
                            logError("Invalid index received or out of bounds");
                        }
                        break;

                        
                        case "send_simulation":
                            const simulationFromStream = JSON.parse(Buffer.from(message).toString());
                            // console.log(JSON.stringify(simulationFromStream));
                            console.log("simulationFromStream.type",simulationFromStream.simulation.model_file_path)
                            console.log("[MONITOR SERVER] case send_simulation: JSON recieved");
                            this.controller.model_manager.setActiveModelByFilePath(simulationFromStream.simulation.model_file_path);
                            const selectedSimulation = this.controller.model_manager.getActiveModel();
                            console.log(selectedSimulation.getJsonSettings()); //TODO
                            
                            this.sendMessageByWs({
                                type: "get_simulation_by_index",
                                simulation: selectedSimulation.getJsonSettings()
                            }, ws);
                            break;

                    default:
                        logWarn("The last message received from the monitor had an unknown type.");
                        logWarn(jsonMonitor);
                }
            },

            close: (ws, code: number, message) => {
                try {
                    this.wsClients.delete(ws);
                    log(`Connection closed. Code: ${code}, Reason: ${Buffer.from(message).toString()}`);

                    // Handle specific close codes
                    switch (code) {
                        case 1001:
                            logWarn('Connection timed out...');
                            break;

                        case 1003:
                            logError('Unsupported data sent by the client.');
                            break;

                        case 1006:
                        case 1009:
                            logError('Message too big!');
                            if (message) {
                                logError('Message :', message);
                                if (typeof message.byteLength !== 'undefined') {
                                    logError('Message size:', message.byteLength, 'bytes');
                                }
                            }
                            break;

                        default:
                            if (code !== 1000) // 1000 = Normal Closure
                                logError('Unexpected closure');
                            else
                                if (useVerbose) log(`Closing normally`);
                    }
                } catch (err) {
                    logError('Error during close handling:', err);
                }
            },
        });
    }

    /**
     * Sends the json_state to the monitor
     */
    sendMonitorGamaState(): void {
        if (this.controller.model_manager.getActiveModel() !== undefined
            && this.controller.gama_connector !== undefined) {
            this.sendMessageByWs({
                type: "json_state",
                gama: this.controller.gama_connector.getJsonGama(),
                player: this.controller.player_manager.getArrayPlayerList(),
            });
        }
    }

    /**
     * Send the json_setting to the monitor
     */
    sendMonitorJsonSettings(): void {
        if (this.controller.model_manager.getActiveModel() !== undefined) {
            this.sendMessageByWs(this.controller.model_manager.getActiveModel().getJsonSettings());
        }
    }

    /**
     *
     * @param message Any string which will be JSON.stringify before sending
     * @param clientWsId (optional) WS to send the the message to
     * @return void
     */
    sendMessageByWs(message: any, clientWsId?: any): void {
        if (this.wsClients !== undefined) {
            this.wsClients.forEach((client) => {
                if (clientWsId == undefined || clientWsId == client) {
                    const r: number = client.send(
                        JSON.stringify(message),
                        false, true); // Force message compression

                    switch (r) {
                        case 0:
                            logWarn('Backpressure is building up. Data will be drain overtime to client', client.getRemoteAddressAsText());
                            break;
                        case 2:
                            logError('Backpressure detected. Data not sent to client', client.getRemoteAddressAsText());
                            break;
                        default:
                        case 1:
                            if (useExtraVerbose) log("[DEBUG] Properly sent message", message, "to client", client.getRemoteAddressAsText());
                    }
                }
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
