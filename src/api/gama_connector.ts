import WebSocket from 'ws';

import { useVerbose, useExtraVerbose } from './index.js';
import {GamaState, GAMA_ERROR_MESSAGES, JsonPlayerAsk} from "./constants.ts";
import Model from "./model.ts";
import Controller from "./controller.ts";


// Override the log function
const log = (...args: any[]) => {
    console.log("\x1b[35m[GAMA CONNECTOR]\x1b[0m", ...args);
};
const logWarn = (...args: any[]) => {
    console.warn("\x1b[35m[GAMA CONNECTOR]\x1b[0m", "\x1b[43m", ...args, "\x1b[0m");
};
const logError = (...args: any[]) => {
    console.error("\x1b[35m[GAMA CONNECTOR]\x1b[0m", "\x1b[41m", ...args, "\x1b[0m");
};

/**
 * This class creates a websocket client for Gama Server.
 */
class GamaConnector {
    controller: Controller;
    model!: Model;
    jsonGamaState: GamaState;
    gama_socket: WebSocket | null = null;

    listMessages: any[] = [];

    /**
     * Constructor of the websocket client
     * @param {any} controller - The controller of the project
     */
    constructor(controller: Controller) {
        this.controller = controller;
        // Initialise class and settings before first attempt to connect to gama
        this.jsonGamaState = {
            connected: false,
            experiment_state: "NONE",
            loading: false,
            content_error: "",
            experiment_id: "",
            experiment_name: ""
        };

        this.connectGama();
    }

    getJsonGama(){
        return this.jsonGamaState;
    }

    setGamaConnection(connected: boolean) {
        this.jsonGamaState.connected = connected;
        this.setGamaLoading(!connected);
        this.controller.notifyMonitor();
    }

    setGamaLoading(loading: boolean){
        this.jsonGamaState.loading = loading;
        this.controller.notifyMonitor();
    }
    setGamaContentError(contentError: string){
        this.jsonGamaState.content_error = contentError;
        this.controller.notifyMonitor();
    }
    setGamaExperimentId(experimentId: string) {
        this.jsonGamaState.experiment_id = experimentId;
    }
    setGamaExperimentState(experimentState: string) {
        this.jsonGamaState.experiment_state = experimentState;
        this.controller.notifyMonitor();
    }
    setGamaExperimentName(experimentName: string) {
        this.jsonGamaState.experiment_name = experimentName;
        this.controller.notifyMonitor();
    }

    // -------------------

    getJsonState() {
        return {
            type: "json_state",
            gama: this.getJsonGama(),
            player: [],
        };
    }

    // -------------------

    /* Protocol messages about Gama Server */

    jsonLoadExperiment() {
        const model = this.controller.model_manager.getActiveModel();

        return {
            type: "load",
            model: model.getModelFilePath(),
            experiment: model.getExperimentName()
        };
    };

    /** 
     * Allow to control gama execution
     * @param {string} type - Only accepted values: [stop, pause, play]
     * @returns {{exp_id: string, type: string}}
     */
    jsonControlGamaExperiment(type: "stop" | "pause" | "play") {
        return {
            type: type,
            exp_id: this.jsonGamaState.experiment_id,
        };
    }

    /**
     * Create or remove player from simulation
     * @param {string} toggle - Only accepted values: [create, remove]
     * @param current_id_player
     * @returns {object}
     */
    jsonTogglePlayer(toggle: "create" | "remove", current_id_player: string) {
        return {
            type: "expression",
            exp_id: this.jsonGamaState.experiment_id,
            expr: `do ${toggle}_player("${current_id_player}");`
        };
    }

    jsonSendExpression (expr: string){
        return {
            type: "expression",
            content: "Send an expression",
            exp_id: this.jsonGamaState.experiment_id,
            expr: expr
        };
    }

    // --------------------

    /**
     * Connects the websocket client with gama server and manage the messages received
     * @returns WebSocket
     */
    connectGama(): void {
        if (this.gama_socket
            && ( this.gama_socket.readyState === WebSocket.CONNECTING
                || this.gama_socket.readyState === WebSocket.OPEN )
        ) {
            if (useVerbose) logWarn("Already connected or connecting. Skipping.");
            return; // Prevent multiple connection attempts
        }

        this.setGamaLoading(true);

        try {
            this.gama_socket = new WebSocket(`ws://${process.env.GAMA_IP_ADDRESS}:${process.env.GAMA_WS_PORT}`);

            this.gama_socket.onopen = () => {
                log(`Opening connection with GAMA Server`);

                this.setGamaConnection(true);
                this.setGamaExperimentState('NONE');
            };

            this.gama_socket.onmessage = (event: WebSocket.MessageEvent) => {
                try {
                    const message = JSON.parse(event.data as string);
                    const type = message.type;

                    switch (type) {
                        case "SimulationStatus":
                            if (useVerbose) log("[DEBUG] Message received from Gama Server: SimulationStatus = " + message.content);

                            this.setGamaExperimentId(message.exp_id);
                            if (['NONE', 'NOTREADY'].includes(message.content) && ['RUNNING', 'PAUSED', 'NOTREADY'].includes(this.jsonGamaState.experiment_state)) {
                                this.controller.player_manager.removeAllPlayerInGame();
                                this.controller.notifyMonitor();
                            }

                            this.setGamaExperimentState(message.content);
                            break;

                        case "SimulationOutput":
                            try {
                                this.controller.broadcastSimulationOutput(JSON.parse(message.content));
                            } catch (error) {
                                logError("-> Unable to parse received message:");
                                logError(message);
                            }
                            break;

                        case "CommandExecutedSuccessfully":
                            if (useExtraVerbose) {
                                log("[DEBUG] Message received from Gama Server: CommandExecutedSuccessfully");
                            }

                            this.setGamaContentError('');
                            if (message.command.type === "load") this.setGamaExperimentName(message.content);

                            try {
                                this.controller.broadcastSimulationOutput(message);
                            } catch (exception) {
                                logError("Failed to broadcast Simulation Output from Gama Server");
                                logError(exception);
                            }
                            break;

                        case "ConnectionSuccessful":
                            if (useVerbose) log(`Connected to Gama Server on ws://${process.env.GAMA_IP_ADDRESS}:${process.env.GAMA_WS_PORT}`);
                            break;

                        default:
                            // If a known GAMA error
                            if (GAMA_ERROR_MESSAGES.includes(type)) {
                                logError("Error message received from Gama Server:");
                                logError(message);

                                this.setGamaContentError(message);
                                //this.setGamaLoading(false);
                            } else {
                                logError("Unknown message received from Gama Server:", message);
                            }
                    }

                } catch (error) {
                    logError("Error with the WebSocket with Gama Server:");
                    logError(error);

                    if (error instanceof SyntaxError) {
                        logError("Invalid JSON received:", event.data);
                    }
                }
            };

            this.gama_socket.onclose = (event) => {
                this.setGamaConnection(false);
                this.setGamaExperimentState("NONE");

                // Always calls remove in game players when the socket closes
                this.controller.player_manager.removeAllPlayerInGame();
                this.controller.notifyMonitor();

                if (event.wasClean) {
                    log('Connection with Gama Server closed cleanly, not reconnecting');
                    this.gama_socket = null;
                } else {
                    logError('Connection with Gama Server interrupted suddenly');
                    this.gama_socket = null;
                    if (useVerbose) log(event);
                }
            };

            this.gama_socket.onerror = (error) => {
                logError("An error happened within the Gama Server WebSocket");
                if (useVerbose) console.error(error);
                this.setGamaConnection(false);

                logWarn("Reconnecting in 5s...");
                setTimeout(() => this.connectGama(), 5000);
            };


        } catch (error) {  // in case the Websocket instantiation fails for some rare reason
            logError("An error broke the WebSocket:", error);
            this.gama_socket = null; // Set to null if there was an error, so a reconnection may be triggered

            this.setGamaConnection(false);
            this.setGamaExperimentState("NONE");
            this.controller.player_manager.removeAllPlayerInGame();
            this.controller.notifyMonitor();

            logWarn("Reconnecting in 5s...");
            setTimeout(() => this.connectGama(), 5000);
        } finally {
            this.setGamaLoading(false);
        }
    }

    /**
     * Sends the message contained in the list @var this.listMessages at the index @var this.currentMessageIndex.
     */
    sendMessages(callback?: () => void) {
        const copy_listMessages = this.listMessages;
        for (const message of copy_listMessages) {
            try {
                if (this.gama_socket != null)
                    if (typeof message === "function") {
                        this.gama_socket.send( JSON.stringify( message() ) );
                        if (useVerbose)
                            if (message().expr !== undefined)
                                log("Expression sent to Gama Server: " + '\'' + message().expr + '\'' + " Waiting for the answer (if any)...");
                            else
                                log("Message sent to Gama Server: type " + message().type + ". Waiting for the answer (if any)...");
                    } else {
                        this.gama_socket.send( JSON.stringify( message ) );
                    }
            }
            catch (e) {
                logError("Error while sending this command to GAMA:", message);
                logError(e);
            }
            finally {
                this.listMessages.splice(this.listMessages.indexOf(message), 1);
            }
        }

        // Run final callback after sending every messages
        if (callback !== undefined) callback();
    }

    /**
     * Asks Gama to launch the experiment
     */
    launchExperiment() {
        if (this.jsonGamaState.connected && this.jsonGamaState.experiment_state === 'NONE') {
            this.listMessages = [this.jsonLoadExperiment()];
            this.setGamaLoading(true);

            this.sendMessages(() => {
                this.setGamaLoading(false);
            });

            this.model = this.controller.model_manager.getActiveModel();
        } else {
            logWarn("GAMA is not connected or an experiment is already running...");
        }
    }

    /**
     * Asks Gama to stop the experiment
     */
    async stopExperiment() {
        this.setGamaLoading(true);
        // Try to pause before closing experiment
        this.pauseExperiment();

        // Wait for simulation to be fully paused
        while (this.jsonGamaState.experiment_state != "PAUSED"){
            await new Promise( resolve => setTimeout(resolve, 1) );
        }

        // Stop experiment
        this.listMessages = [this.jsonControlGamaExperiment("stop")];

        this.sendMessages(() => {
            this.setGamaLoading(false);
        })

        this.jsonGamaState.experiment_state = "NONE";
    }

    /**
     * Asks Gama to pause the experiment
     */
    pauseExperiment(callback?: () => void) {
        if (this.jsonGamaState.experiment_state === 'RUNNING') {
            if (useVerbose) log("Pausing simulation...")
            this.listMessages = [this.jsonControlGamaExperiment("pause")];
            this.setGamaLoading(true);

            this.sendMessages(() => {
                this.setGamaLoading(false);
                if (typeof callback === 'function') {
                    callback();
                }
            });
        }
    }

    /**
     * Asks Gama to play the experiment
     */
    resumeExperiment() {
        if (this.jsonGamaState.experiment_state === 'PAUSED') {
            this.listMessages = [this.jsonControlGamaExperiment("play")];
            this.setGamaLoading(true);

            this.sendMessages(() => {
                this.setGamaLoading(false);
            });
        }
    }

    /**
     * Asks Gama to add a player in the simulation
     * @param {string} idPlayer - The id of the player to be added
     */
    addInGamePlayer(idPlayer: string) {
        if (['NONE', "NOTREADY"].includes(this.jsonGamaState.experiment_state))
            return;

        if (this.controller.player_manager.getPlayerState(idPlayer) && this.controller.player_manager.getPlayerState(idPlayer).in_game)
            return;

        this.listMessages = [this.jsonTogglePlayer("create", idPlayer)];

        this.sendMessages(() => {
            log("-> The Player " + idPlayer + " has been added to Gama");
        });
    }

    /**
     * Asks Gama to remove a player in the simulation
     * @param {string} idPlayer - The id of the player
     */
    removeInGamePlayer(idPlayer: string) {
        if (useVerbose) log("Removing player from game: " + idPlayer);

        if (['NONE', "NOTREADY"].includes(this.jsonGamaState.experiment_state)) {
            if (useVerbose) log("Gama Simulation is not running, cannot remove player");
            return;
        }

        const playerState = this.controller.player_manager.getPlayerState(idPlayer);
        if (playerState && !playerState.in_game) {
            if (useVerbose) log("Player " + idPlayer + " is already out of the game");
            return;
        }

        this.listMessages = [this.jsonTogglePlayer("remove", idPlayer)];

        this.sendMessages(() => {
            this.controller.player_manager.togglePlayerInGame(idPlayer, false);
            this.controller.notifyMonitor();
        });
    }

    /**
     * Sends an expression for a certain player
     * @param {string} idPlayer - The id of the player to apply this expression
     * @param {string} expr - The expression. If this expression contains $id, it will be replaced by the id of the player which asked the method
     */
    sendExpression(idPlayer: string, expr: string) {
        if (['NONE', "NOTREADY"].includes(this.jsonGamaState.experiment_state))
            return;

        expr = expr.replace('$id', "\"" + idPlayer + "\"");
        this.listMessages = [this.jsonSendExpression(expr)];

        this.sendMessages(() => {
            log("-> The Player of id " + idPlayer + " called the function: " + expr + " successfully.");
        });
    }

    /**
     * Sends an ask to GAMA
     * @param {object} json - The JSON containing the information of the ask
     */
    sendAsk(json: JsonPlayerAsk) {
        if (['NONE', "NOTREADY"].includes(this.jsonGamaState.experiment_state))
            return;

        this.listMessages = [json];

        this.sendMessages();
    }

    close() {
        if (this.gama_socket !== null) this.gama_socket.close();
    }
}

export default GamaConnector;
