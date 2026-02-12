import uWS, { TemplatedApp } from "uWebSockets.js";

import { Controller } from "../core/Controller.ts";
import { JsonMonitor } from "../core/Constants.ts";
import { getLogger } from "@logtape/logtape";
import path from 'path';
const logger = getLogger(["monitor", "MonitorServer"]);

/**
 * Creates a Websocket Server for handling monitor connections
 */
export class MonitorServer {
    private controller: Controller;
    private wsClients: Set<uWS.WebSocket<any>>;
    private wsServer!: TemplatedApp; //: WebSocketServer;

    /**
     * Creates the websocket server
     * @param {Controller} controller - The controller of the project
     */
    constructor(controller: Controller) {
        this.controller = controller;
        this.wsClients = new Set<uWS.WebSocket<any>>();

        const host = process.env.WEB_APPLICATION_HOST || "0.0.0.0";
        const port = parseInt(process.env.MONITOR_WS_PORT || "8001", 10);

        this.wsServer = uWS.App(); //new WebSocketServer({ host, port });

        this.wsServer.listen(host, port, (token) => {
            if (token) {
                logger.info(`Creating monitor server on: ws://${host}:${port}`);
            } else {
                logger.fatal("Failed to listen on the specified port and host");
                process.exit(1);
            }
        });

        this.wsServer.ws("/*", {
            // compression: (uWS.SHARED_COMPRESSOR | uWS.SHARED_DECOMPRESSOR), // Enable compression
            idleTimeout: 30, // 30 seconds timeout

            open: (ws) => {
                logger.debug("Connected to monitor server");
                this.wsClients.add(ws);
                this.sendMonitorGamaState();
                this.sendMonitorJsonSettings();
            },
            message: (ws, message) => {
                const jsonMonitor: JsonMonitor = JSON.parse(
                    Buffer.from(message).toString(),
                );
                const type = jsonMonitor.type;
                (logger.trace("Received message on monitor server : {jsonMonitor}"),
                    { jsonMonitor });

                switch (type) {
                    case "launch_experiment":
                        logger.trace("Launching experiment");
                        this.controller.launchExperiment();
                        break;

                    case "stop_experiment":
                        logger.trace("Stoping experiment");
                        this.controller.stopExperiment();
                        break;

                    case "pause_experiment":
                        logger.trace("Pausing experiment");
                        this.controller.pauseExperiment();
                        break;

                    case "resume_experiment":
                        logger.trace("Resuming experiment");
                        this.controller.resumeExperiment();
                        break;

                    case "try_connection":
                        logger.trace("Manually trying to connect to GAMA");
                        this.controller.connectGama();
                        break;

                    case "add_player_headset":
                        logger.trace("Adding a new player headset");
                        if (jsonMonitor.id) {
                            this.controller.addInGamePlayer(jsonMonitor.id);
                        }
                        break;

                    case "screen_control": //TODO
                        {
                            const messageString = JSON.parse(Buffer.from(message).toString()); //? can't parse the payload of the jsonMonitor for some reason
                            logger.warn(`data recieved:${messageString.display_type}`);
                            this.sendMessageByWs({
                                type: "screen_control",
                                display_type: messageString.display_type,
                            });
                        }
                        break;

                    case "remove_player_headset":
                        logger.trace("Removing a player headset");
                        if (jsonMonitor.id) {
                            this.controller.purgePlayer(jsonMonitor.id);
                        } else {
                            logger.error(
                                "Failed to remove player headset, missing PlayerID\n{jsonMonitor}",
                                { jsonMonitor },
                            );
                        }
                        break;

                    case "get_simulation_informations":
                        logger.trace("Requesting and sending back simulation information");
                        this.sendMessageByWs(
                            this.controller.getSimulationInformations(),
                            ws,
                        );
                        break;

                    case "get_simulation_by_index":
                        logger.trace("Requesting and sending back simulation by index");
                        {
                            const index = jsonMonitor.simulationIndex;



                            if (
                                index !== undefined &&
                                index >= 0 &&
                                index < this.controller.model_manager.getModelList().length
                            ) {
                                // Retrieve the simulation based on the index
                                this.controller.model_manager.setActiveModelByIndex(index);
                                logger.debug(
                                    "set active model to",
                                    this.controller.model_manager.getActiveModel().toString(),
                                );
                                console.log(
                                    this.controller.model_manager.activeModel?.getExperimentName(),
                                );
                                const selectedSimulation =
                                    this.controller.model_manager.getActiveModel();

                                logger.trace("Sending back");
                                this.sendMessageByWs(
                                    {
                                        type: "get_simulation_by_index",
                                        simulation: selectedSimulation.getJsonSettings(), // Assuming getJsonSettings returns the relevant data
                                    },
                                    ws,
                                );

                                logger.debug("Opening virtual universe {selectedSimulation}", {
                                    selectedSimulation: selectedSimulation.getJsonSettings(),
                                });
                            } else {
                                throw new Error(`Invalid index received or out of bounds. [Index: ${index}]`);
                                
                            }
                            break;
                        }
                    case "send_simulation":
                        {
                            logger.trace("Sending simulation");
                            const simulationFromStream = JSON.parse(
                                Buffer.from(message).toString(),
                            );
                            logger.debug("received simulation {sim} from upstream",{sim : simulationFromStream.simulation })
                            logger.trace("filepath of sim: {filepath}",{filepath : simulationFromStream.simulation.model_file_path })
                            const total_path: string = path.join( simulationFromStream.simulation.root, simulationFromStream.simulation.model_file_path)
                            console.log("total path calculated:",total_path) 
                            try{
                                
                                this.controller.model_manager.setActiveModelByFilePath(     //récupérer aussi le préfixe avant le chemin relatif pour le convertir en chemin absolu avant, ce qui évite les conflits comme deux modèles avec exactement le même nom
                                         total_path
                            );
                            } catch(e){
                                logger.error("path is undefined, cancelling",e)
                            }
                            try{
                                if(this.controller.model_manager.getActiveModel() == undefined){
                                    throw new Error("active model of the controller is undefined");
                                    
                                }
                            
                            } catch(error){
                                logger.error("error when fetching active model:",error)
                            }
                            const selectedSimulation = this.controller.model_manager.getActiveModel();
                            logger.debug("Selected simulation sent to gama: {json}", {
                                json: selectedSimulation.getJsonSettings(),
                            });
                            this.sendMessageByWs(
                                {
                                    type: "get_simulation_by_index",
                                    simulation: selectedSimulation.getJsonSettings(),
                                },
                                ws,
                            );
                        }
                        break;

                    default:
                        logger.warn(
                            "The last message received from the monitor had an unknown type.\n{jsonMonitor}",
                            { jsonMonitor },
                        );
                }
            },

            close: (ws, code: number, message) => {
                try {
                    this.wsClients.delete(ws);
                    logger.debug(
                        `Connection closed. Code: ${code}, Reason: ${Buffer.from(message).toString()}`,
                    );

                    // Handle specific close codes
                    switch (code) {
                        case 1001:
                            logger.warn(`[ERR ${code}] Connection timed out...`);
                            break;

                        case 1003:
                            logger.error(
                                `[ERR ${code}] Unsupported data sent by the client.`,
                            );
                            break;

                        case 1006:
                        case 1009:
                            logger.error(`[ERR ${code}] Message too big!`);
                            if (message) {
                                logger.error("Message : {message}", { message });
                                if (typeof message.byteLength !== "undefined") {
                                    logger.error(`Message size: ${message.byteLength} bytes`);
                                }
                            }
                            break;

                        default:
                            if (code !== 1000)
                                // 1000 = Normal Closure
                                logger.error(`[ERR ${code}] Unexpected closure`);
                            else logger.debug(`Closing normally`);
                    }
                } catch (err) {
                    logger.fatal("Error during close handling: {err}", { err });
                }
            },
        });
    }

    /**
     * Sends the json_state to the monitor
     */
    sendMonitorGamaState(): void {
        if (
            this.controller.model_manager.getActiveModel() !== undefined &&
            this.controller.gama_connector !== undefined
        ) {
            const messageToSend = {
                type: "json_state",
                gama: this.controller.gama_connector.getJsonGama(),
                player: this.controller.player_manager.getArrayPlayerList(),
            };

            logger.trace("Sending monitor gama state:\n{messageToSend}", {
                messageToSend,
            });
            this.sendMessageByWs(messageToSend);
        }
    }

    /**
     * Send the json_setting to the monitor
     */
    sendMonitorJsonSettings(): void {
        if (this.controller.model_manager.getActiveModel() !== undefined) {
            logger.trace("Sending monitor json settings:\n{json}", {
                json: this.controller.model_manager.getActiveModel().getJsonSettings(),
            });
            this.sendMessageByWs(
                this.controller.model_manager.getActiveModel().getJsonSettings(),
            );
        }
    }

    /**
     *
     * @param message Any string which will be JSON.stringify before sending
     * @param clientWsId (optional) WS to send the message to
     * @return void
     */
    sendMessageByWs(message: string, clientWsId?: any): void {
        if (this.wsClients !== undefined) {
            this.wsClients.forEach((client) => {
                if (clientWsId == undefined || clientWsId == client) {
                    const r: number = client.send(JSON.stringify(message), false, true); // Force message compression

                    switch (r) {
                        case 0:
                            (logger.warn(
                                `Backpressure is building up. Data will be drain overtime to {client}`,
                            ),
                            {
                                client: Buffer.from(
                                    client.getRemoteAddressAsText(),
                                ).toString(),
                            });
                            break;
                        case 2:
                            (logger.error(
                                `Backpressure detected. Data not sent to client {client}`,
                            ),
                            {
                                client: Buffer.from(
                                    client.getRemoteAddressAsText(),
                                ).toString(),
                            });
                            break;
                        default:
                        case 1:
                            logger.trace(`Properly sent message to client {client}`, {
                                client: Buffer.from(client.getRemoteAddressAsText()).toString(),
                            });
                    }
                }
            });
        }
    }

    /**
     * Closes the websocket server
     */
    close(): void {
        logger.trace("Closing monitor server...");
        this.wsServer.close();
    }
}

export default MonitorServer;
