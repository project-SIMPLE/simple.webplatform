import WebSocket from 'ws';
import { useVerbose } from './index.js';

// Global variables about the state of the connector. This is only for internal purposes.
let gama_socket: WebSocket;
let index_messages: number;
let continue_sending = false;
let do_sending = false;
let list_messages: any[];
let function_to_call: () => void;
let current_id_player: string;

interface GamaState {
    connected: boolean;
    experiment_state: string;
    loading: boolean;
    content_error: string;
    experiment_id: string;
    experiment_name: string;
}

// List of error messages for Gama Server
const gama_error_messages = [
    "SimulationStatusError",
    "SimulationErrorDialog",
    "SimulationError",
    "RuntimeError",
    "GamaServerError",
    "MalformedRequest",
    "UnableToExecuteRequest"
];

/**
 * This class creates a websocket client for Gama Server.
 */
class GamaConnector {
    controller: any;
    model: any;
    jsonGamaState: GamaState;
    gama_socket: WebSocket;

    /**
     * Constructor of the websocket client
     * @param {any} controller - The controller of the project
     */
    constructor(controller: any) {
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

        this.gama_socket = this.connectGama();
    }

    getJsonGama(){
        return this.jsonGamaState;
    }

    setGamaConnection(connected: boolean) {
        this.jsonGamaState.connected = connected;
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
     * @returns {object}
     */
    jsonTogglePlayer(toggle: "create" | "remove") {
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
    connectGama(): WebSocket {
        this.setGamaLoading(true);
        const sendMessages = this.sendMessages.bind(this);
        gama_socket = new WebSocket(`ws://${process.env.GAMA_IP_ADDRESS}:${process.env.GAMA_WS_PORT}`);

        gama_socket.onopen = () => {
            console.log("-> Connected to Gama Server");
            this.setGamaConnection(true);
            this.setGamaExperimentState('NONE');
        };

        gama_socket.onmessage = (event: WebSocket.MessageEvent) => {
            try {
                const message = JSON.parse(event.data as string);
                const type = message.type;

                switch (type) {
                    case "SimulationStatus":
                        if (useVerbose) console.log("[DEBUG] Message received from Gama Server: SimulationStatus = " + message.content);

                        this.setGamaExperimentId(message.exp_id);
                        if (['NONE', 'NOTREADY'].includes(message.content) && ['RUNNING', 'PAUSED', 'NOTREADY'].includes(this.jsonGamaState.experiment_state)) {
                            this.model.setRemoveInGameEveryPlayers();
                        }

                        this.setGamaExperimentState(message.content);
                        break;

                    case "SimulationOutput":
                        try {
                            this.controller.broadcastSimulationOutput(JSON.parse(message.content));
                        } catch (error) {
                            console.error("\x1b[31m-> Unable to parse received message:\x1b[0m");
                            console.error(message.content);
                        }
                        break;

                    case "CommandExecutedSuccessfully":
                        if (useVerbose) {
                            console.log("\x1b[32m[DEBUG GamaConnector] Message received from Gama Server: CommandExecutedSuccessfully\x1b[0m");
                        }

                        this.setGamaContentError('');
                        if (message.command.type === "load") this.setGamaExperimentName(message.content);

                        continue_sending = true;
                        setTimeout(sendMessages, 100);

                        try {
                            this.controller.broadcastSimulationOutput(message);
                        } catch (exception) {
                            console.error(exception);
                        }
                        break;
                }

                // If a known GAMA error
                if (gama_error_messages.includes(type)) {
                    console.error("Error message received from Gama Server:");
                    console.error(message);

                    this.setGamaContentError(message);
                    this.setGamaLoading(false);

                    throw new Error("A problem appeared in the last message. Please check the response from the Server");
                }
            } catch (error) {
                console.error("\x1b[31m" + error + "\x1b[0m");
            }
        };

        gama_socket.addEventListener('close', (event) => {
            this.setGamaConnection(false);
            this.setGamaExperimentState("NONE");
            this.setGamaLoading(false);
            this.model.setRemoveInGameEveryPlayers();
            if (event.wasClean) {
                console.log('-> The connection with Gama Server was properly closed');
            } else {
                console.error('-> The connection with Gama Server was interrupted suddenly');
            }
        });

        gama_socket.addEventListener('error', (error) => {
            console.error("-> Failed to connect with Gama Server");
            console.error(error);
        });

        this.setGamaLoading(false);

        return gama_socket;
    }

    /**
     * Sends the message contained in the list @var list_messages at the index @var index_messages.
     */
    sendMessages() {
        if (do_sending && continue_sending) {
            if (index_messages < list_messages.length) {
                if (typeof list_messages[index_messages] === "function") {
                    gama_socket.send(JSON.stringify(list_messages[index_messages]()));
                    if (useVerbose) {
                        if (list_messages[index_messages]().expr !== undefined)
                            console.log("Expression sent to Gama Server: " + '\'' + list_messages[index_messages]().expr + '\'' + " Waiting for the answer (if any)...");
                        else console.log("Message sent to Gama Server: type " + list_messages[index_messages]().type + ". Waiting for the answer (if any)...");
                    }
                } else {
                    gama_socket.send(JSON.stringify(list_messages[index_messages]));
                }
                continue_sending = false;
                index_messages = index_messages + 1;
            } else {
                function_to_call();
                do_sending = false;
            }
        }
    }

    /**
     * Asks Gama to launch the experiment
     */
    launchExperiment() {
        if (this.jsonGamaState.connected && this.jsonGamaState.experiment_state === 'NONE') {
            list_messages = [this.jsonLoadExperiment()];
            index_messages = 0;
            do_sending = true;
            continue_sending = true;
            this.setGamaLoading(true);
            function_to_call = () => {
                this.setGamaLoading(false);
            };
            this.sendMessages();

            this.model = this.controller.model_manager.getActiveModel();
        } else {
            console.warn("GAMA is not connected or an experiment is already running...");
        }
    }

    /**
     * Asks Gama to stop the experiment
     */
    stopExperiment() {
        const currentState = this.jsonGamaState.experiment_state;

        if (currentState === 'RUNNING') {
            console.log("Pausing the simulation before stopping...");
            this.pauseExperiment(() => {
                console.log("Simulation paused. Now stopping...");
                this.executeStopExperiment();
            });
        } else if (['PAUSED', 'NOTREADY'].includes(currentState)) {
            this.executeStopExperiment();
        }
    }

    executeStopExperiment() {
        list_messages = [this.jsonControlGamaExperiment("stop")];
        index_messages = 0;
        do_sending = true;
        continue_sending = true;

        this.setGamaLoading(true);
        function_to_call = () => {
            this.setGamaLoading(false);
            this.model.setRemoveInGameEveryPlayers();
        };

        this.sendMessages();
    }

    /**
     * Asks Gama to pause the experiment
     */
    pauseExperiment(callback: () => void) {
        if (this.jsonGamaState.experiment_state === 'RUNNING') {
            list_messages = [this.jsonControlGamaExperiment("pause")];
            index_messages = 0;
            do_sending = true;
            continue_sending = true;
            this.setGamaLoading(true);

            function_to_call = () => {
                this.setGamaLoading(false);
                if (typeof callback === 'function') {
                    callback();
                }
            };
            this.sendMessages();
        }
    }

    /**
     * Asks Gama to play the experiment
     */
    resumeExperiment() {
        if (this.jsonGamaState.experiment_state === 'PAUSED') {
            list_messages = [this.jsonControlGamaExperiment("play")];
            index_messages = 0;
            do_sending = true;
            continue_sending = true;
            this.setGamaLoading(true);
            function_to_call = () => {
                this.setGamaLoading(false);
            };
            this.sendMessages();
        }
    }

    /**
     * Asks Gama to add a player in the simulation
     * @param {string} idPlayer - The id of the player to be added
     */
    addInGamePlayer(idPlayer: string) {
        if (['NONE', "NOTREADY"].includes(this.jsonGamaState.experiment_state)) return;

        if (this.model.getPlayerState(idPlayer) && this.model.getPlayerState(idPlayer).in_game) return;

        current_id_player = idPlayer;
        list_messages = [this.jsonTogglePlayer("create")];
        index_messages = 0;
        do_sending = true;
        continue_sending = true;
        function_to_call = () => {
            console.log("-> The Player " + idPlayer + " has been added to Gama");
            this.model.setPlayerInGame(idPlayer, true);
        };
        this.sendMessages();
    }

    /**
     * Asks Gama to remove a player in the simulation
     * @param {string} idPlayer - The id of the player
     */
    removeInGamePlayer(idPlayer: string) {
        console.log("Start removing player from game: " + idPlayer);

        if (['NONE', "NOTREADY"].includes(this.jsonGamaState.experiment_state)) {
            console.log("Gama Simulation is not running, cannot remove player");
            return;
        }

        const playerState = this.model.getPlayerState(idPlayer);
        if (playerState && !playerState.in_game) {
            console.log("Player " + idPlayer + " is already out of the game");
            return;
        }

        current_id_player = idPlayer;
        list_messages = [this.jsonTogglePlayer("remove")];
        index_messages = 0;
        do_sending = true;
        continue_sending = true;
        function_to_call = () => {
            this.model.setPlayerInGame(idPlayer, false);
        };
        this.sendMessages();
    }

    /**
     * Adds all the players which are connected but not authenticated
     */
    addInGameEveryPlayers() {
        let index = 0;
        for (let idPlayer in this.model.getAllPlayers()) {
            if (this.model.getPlayerState(idPlayer) && this.model.getPlayerState(idPlayer).connected && !this.model.getPlayerState(idPlayer).in_game) {
                const id_player_copy = idPlayer;
                setTimeout(() => { this.addInGamePlayer(id_player_copy); }, 300 * index);
                index += 1;
            }
        }
    }

    /**
     * Removes all the players which are authenticated
     */
    removeInGameEveryPlayers() {
        if (["RUNNING", 'PAUSED'].includes(this.jsonGamaState.experiment_state)) {
            let index = 0;
            for (let idPlayer in this.model.getAllPlayers()) {
                if (this.model.getPlayerState(idPlayer) && this.model.getPlayerState(idPlayer).in_game) {
                    const id_player_copy = idPlayer;
                    setTimeout(() => { this.removeInGamePlayer(id_player_copy); }, 300 * index);
                    index += 1;
                }
            }
        } else {
            this.model.setRemoveInGameEveryPlayers();
        }
    }

    /**
     * Sends an expression for a certain player
     * @param {string} idPlayer - The id of the player to apply this expression
     * @param {string} expr - The expression. If this expression contains $id, it will be replaced by the id of the player which asked the method
     */
    sendExpression(idPlayer: string, expr: string) {
        if (['NONE', "NOTREADY"].includes(this.jsonGamaState.experiment_state)) return;

        expr = expr.replace('$id', "\"" + idPlayer + "\"");
        list_messages = [this.jsonSendExpression(expr)];
        index_messages = 0;
        do_sending = true;
        continue_sending = true;
        function_to_call = () => {
            console.log("-> The Player of id " + idPlayer + " called the function: " + expr + " successfully.");
        };
        this.sendMessages();
    }

    /**
     * Sends an ask to GAMA
     * @param {object} json - The JSON containing the information of the ask
     */
    sendAsk(json: any) {
        if (['NONE', "NOTREADY"].includes(this.jsonGamaState.experiment_state)) return;

        list_messages = [json];
        index_messages = 0;
        do_sending = true;
        continue_sending = true;
        function_to_call = () => { };
        this.sendMessages();
    }

    close() {
        this.gama_socket.close();
    }
}

export default GamaConnector;
