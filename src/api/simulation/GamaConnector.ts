import WebSocket from 'ws';
import { ENV_VERBOSE, ENV_EXTRA_VERBOSE } from '../index.ts';
import { GamaState, GAMA_ERROR_MESSAGES, JsonPlayerAsk } from "../core/Constants.ts";
import Model from "./Model.ts";
import Controller from "../core/Controller.ts";
import {getLogger, Logger} from "@logtape/logtape";

// Override the log function
const logger: Logger = getLogger(["sim", "GamaConnector"]);

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

    getJsonGama() {
        return this.jsonGamaState;
    }

    setGamaConnection(connected: boolean) {
        this.jsonGamaState.connected = connected;
        this.setGamaLoading(!connected);
        this.controller.notifyMonitor();
    }

    setGamaLoading(loading: boolean) {
        this.jsonGamaState.loading = loading;
        this.controller.notifyMonitor();
    }
    setGamaContentError(contentError: string) {
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

    /**
     * Asks the GAMA server to load an experiment, ready to be started.
     * @param filepath optional string of a path to the model to launch the experiment from. Will default to using the active model's value if omitted.
     * @param exp_name string of the name of the experiment to launch. Will default to using the active model's value if omitted.
     * @returns a JSON payload of type load to be sent to the Gama server
     */
    jsonLoadExperiment(filepath?: string, exp_name?: string) {
        const model = this.controller.model_manager.getActiveModel();
        console.log(model.getExperimentName())
        logger.debug("[GAMA CONNECTOR]: active model experiment to be loaded: {modelName}", {modelName: model.getExperimentName()})
        if (model.getExperimentName() === undefined) {
            logger.error("[GAMA CONNECTOR]: the name of the experiment is undefined")
        } else {
            console.log("GAMA CONNECTOR:",model.getModelFilePath())
            const payload = {
                type: "load",
                model: filepath ? filepath : model.getModelFilePath(),
                experiment: exp_name ? exp_name : model.getExperimentName()
            }
            this.listMessages = [payload]
            this.sendMessages()
        }


        return {
            type: "load",
            model: filepath ? filepath : model.getModelFilePath(),
            experiment: exp_name ? exp_name : model.getExperimentName()
        };
    }

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

    jsonSendExpression(expr: string) {
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
            && (this.gama_socket.readyState === WebSocket.CONNECTING
                || this.gama_socket.readyState === WebSocket.OPEN)
        ) {
            if (ENV_VERBOSE) logger.warn("Already connected or connecting. Skipping.");
            return; // Prevent multiple connection attempts
        }

        this.setGamaLoading(true);

        try {
            this.gama_socket = new WebSocket(`ws://${process.env.GAMA_IP_ADDRESS}:${process.env.GAMA_WS_PORT}`);

            this.gama_socket.onopen = () => {
                logger.debug(`Opening connection with GAMA Server`);

                this.setGamaConnection(true);
                this.setGamaExperimentState('NONE');
            };

            this.gama_socket.onmessage = (event: WebSocket.MessageEvent) => {
                try {
                    const message = JSON.parse(event.data as string);
                    const type = message.type;

                    if (ENV_EXTRA_VERBOSE) {
                        logger.trace("Message received from Gama Server:\n{message}", { message });
                    }

                    switch (type) {
                        case "SimulationStatus":
                            logger.trace(`Message received from Gama Server: SimulationStatus = ${message.content}`);

                            this.setGamaExperimentId(message.exp_id);
                            if (['NONE', 'NOTREADY'].includes(message.content) && ['RUNNING', 'PAUSED', 'NOTREADY'].includes(this.jsonGamaState.experiment_state)) {
                                this.controller.player_manager.disableAllPlayerInGame();
                                this.controller.notifyMonitor();
                            }

                            this.setGamaExperimentState(message.content);
                            break;

                        case "SimulationOutput":
                            try {
                                this.controller.broadcastSimulationOutput(JSON.parse(message.content));
                            } catch (error) {
                                logger.error(`-> Unable to parse received message: ${message}`);
                            }
                            break;

                        case "CommandExecutedSuccessfully":
                            logger.trace("Message received from Gama Server: CommandExecutedSuccessfully\n{message}", { message });

                            this.setGamaContentError('');
                            if (message.command.type === "load") this.setGamaExperimentName(message.content);

                            try {
                                this.controller.broadcastSimulationOutput(message);
                            } catch (exception) {
                                logger.error("Failed to broadcast Simulation Output from Gama Server\n{exception}", { exception });
                            }
                            break;

                        case "ConnectionSuccessful":
                            logger.info(`Connected to Gama Server on ws://${process.env.GAMA_IP_ADDRESS}:${process.env.GAMA_WS_PORT}`);
                            break;

                        default:
                            // If a known GAMA error
                            if (GAMA_ERROR_MESSAGES.includes(type)) {
                                logger.error("Error message received from Gama Server: {message}", { message });

                                this.setGamaContentError(message);
                                //this.setGamaLoading(false);
                            } else {
                                logger.error("Unknown message received from Gama Server: {message}", { message });
                            }
                    }

                } catch (error) {
                    logger.fatal("Error with the WebSocket with Gama Server:\n{error}", { error });

                    if (error instanceof SyntaxError) logger.error(`Invalid JSON received:\n${event.data}`);
                }
            };

            this.gama_socket.onclose = (event) => {
                this.setGamaConnection(false);
                this.setGamaExperimentState("NONE");

                // Always calls remove in game players when the socket closes
                this.controller.player_manager.disableAllPlayerInGame();
                this.controller.notifyMonitor();

                if (event.wasClean) {
                    logger.info('Connection with Gama Server closed cleanly, not reconnecting');
                    this.gama_socket = null;
                }
            };

            this.gama_socket.onerror = (error) => {
                if (error.error.code == 'ECONNREFUSED') {
                    logger.trace(`Show full stack for Error CONNREFUSED {error}`, {error});
                    logger.error(`The platform can't connect to GAMA, please verify that GAMA is open/running and that it's reachable at the address ${process.env.GAMA_IP_ADDRESS}:${process.env.GAMA_WS_PORT}`);
                } else {
                    logger.error(`An error happened within the Gama Server WebSocket\n{error}`, { error });
                }
                this.setGamaConnection(false);

                logger.warn("Reconnecting in 5s...");
                setTimeout(() => this.connectGama(), 5000);
            };

        } catch (error) {  // in case the Websocket instantiation fails for some rare reason
            logger.fatal("An error broke the WebSocket:\n{error}", { error });
            this.gama_socket = null; // Set to null if there was an error, so a reconnection may be triggered

            this.setGamaConnection(false);
            this.setGamaExperimentState("NONE");
            this.controller.player_manager.disableAllPlayerInGame();
            this.controller.notifyMonitor();

            logger.warn("Reconnecting in 5s...");
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

                        this.gama_socket.send(JSON.stringify(message()));

                        if (ENV_VERBOSE)
                            if (message().expr !== undefined)
                                logger.debug("Expression sent to Gama Server: " + '\'' + message().expr + '\'' + " Waiting for the answer (if any)...");
                            else
                                logger.debug("Message sent to Gama Server: type " + message().type + ". Waiting for the answer (if any)...");
                    } else {
                        this.gama_socket.send(JSON.stringify(message));
                    }
            }
            catch (e) {
                logger.error("Error while sending this command to GAMA:\n{message}", { message });
                logger.error(`${e}`);
            }
            finally {
                logger.trace("Message sent to GAMA: {message}", { message });
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
        logger.debug("[GAMA CONNECTOR]Called launch experiment")
        if (this.jsonGamaState.connected && this.jsonGamaState.experiment_state === 'NONE') {
            this.listMessages = [this.jsonLoadExperiment()];
            console.log("LOG DE LIST MESSAGES", this.listMessages)
            this.setGamaLoading(true);
            logger.debug("[GAMA CONNECTOR] called LaunchExperiment")
            this.sendMessages(() => {
                this.setGamaLoading(false);
            });

            this.model = this.controller.model_manager.getActiveModel();
        } else {
            logger.warn("GAMA is not connected or an experiment is already running...");
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
        while (this.jsonGamaState.experiment_state != "PAUSED") {
            await new Promise(resolve => setTimeout(resolve, 1));
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
            logger.debug("Pausing simulation...")
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
     * @param {string} playerWsId - The id of the player to be added
     */
    addInGamePlayer(playerWsId: string) {
        if (['NONE', "NOTREADY"].includes(this.jsonGamaState.experiment_state))
            return;

        if (this.controller.player_manager.getPlayerState(playerWsId) && this.controller.player_manager.getPlayerState(playerWsId)!.in_game)
            return;

        this.listMessages = [this.jsonTogglePlayer("create", this.controller.player_manager.getPlayerId(playerWsId)!)];

        this.sendMessages(() => {
            logger.debug(`The Player ${playerWsId} has been added to Gama`);
        });
    }

    /**
     * Asks Gama to remove a player in the simulation
     * @param {string} idPlayer - The id of the player
     */
    removeInGamePlayer(idPlayer: string) {
        logger.debug(`Removing player from game: ${idPlayer}`);

        if (['NONE', "NOTREADY"].includes(this.jsonGamaState.experiment_state)) {
            logger.debug("Gama Simulation is not running, cannot remove player");
            return;
        }

        const playerState = this.controller.player_manager.getPlayerState(idPlayer);
        if (playerState && !playerState.in_game) {
            logger.debug(`Player ${idPlayer} is already out of the game`);
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
            logger.trace(`-> The Player of id ${idPlayer} called the function: ${expr} successfully.`);
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
