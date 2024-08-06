//Imports
const WebSocket = require('ws');

const { useVerbose } = require('../index.js');

//Global variables about the state of the connector. This is only for internal purposes.
var gama_socket
var index_messages;
var continue_sending = false;
var do_sending = false;
var list_messages;
var function_to_call;
var current_id_player;

//List of error messages for Gama Server
const gama_error_messages = ["SimulationStatusError",
        "SimulationErrorDialog",
        "SimulationError",
        "RuntimeError",
        "GamaServerError",
        "MalformedRequest",
        "UnableToExecuteRequest"]

/**
 * This class creates a websocket client for Gama Server.
 */
class GamaConnector {
    /**
     * Constructor of the websocket client
     * @param {Controller} controller - The controller of the project
     */
    constructor(controller) {
        this.controller = controller;
        this.model = this.controller.modelManager.getModelList()[this.controller.choosedLearningPackageIndex];
        this.gama_socket = this.connectGama();
    }

    // -------------------

    /* Protocol messages about Gama Server */
    
    //You can add here new protocol messages

    jsonLoadExperiment = () => {
        return {
        "type": "load",
        "model": this.model.getModelFilePath(),
        "experiment": this.model.getExperimentName()
        }
    }

    /**
     * Allow to control gama execution
     * @param {String} type - Only accepted values : [stop, pause, play]
     * @returns {{exp_id: (string|*), type}}
     */
    jsonControlGamaExperiment = type => ({
        "type": type,
        "exp_id": this.model.getGama().experiment_id,
    });

    /**
     * Create or remove player from simulation
     * @param {String} toggle - Only accepted values : [create, remove]
     * @returns json
     */
    jsonTogglePlayer = toggle => ({
        "type": "expression",
        "exp_id": this.model.getGama().experiment_id,
        "expr": `do ${toggle}_player("${current_id_player}");`
    })

    jsonSendExpression = expr => ({
            "type": "expression",
            "content": "Send an expression",
            "exp_id": this.model.getGama().experiment_id,
            "expr": expr
    })

    // --------------------

    /**
     * Connects the websocket client with gama server and manage the messages received
     * @returns
     */
    connectGama() {
        this.model.setGamaLoading(true);
        const sendMessages = this.sendMessages;
        gama_socket = new WebSocket("ws://" + process.env.GAMA_IP_ADDRESS + ":" + process.env.GAMA_WS_PORT);

        gama_socket.onopen = ()=> {
            console.log("-> Connected to Gama Server");
            this.model.setGamaConnection(true)
            this.model.setGamaExperimentState('NONE')
        };

        gama_socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data)
                const type = message.type;
                if (useVerbose) {
                    console.log("Message received from Gama:");
                    console.log(message)
                }

                switch (type){
                    case "SimulationStatus":
                        if (useVerbose) console.log("Message received from Gama Server: SimulationStatus = "+message.content);

                        this.model.setGamaExperimentId(message.exp_id)
                        if (['NONE','NOTREADY'].includes(message.content) && ['RUNNING','PAUSED','NOTREADY'].includes(this.model.getGama().experiment_state)) {
                            this.model.setRemoveInGameEveryPlayers();
                        }

                        this.model.setGamaExperimentState(message.content)
                        break;

                    case "SimulationOutput":
                        try {
                            if (useVerbose) console.log("Message received from Gama Server: SimulationOutput = "+message.content);
                            this.controller.broadcastSimulationOutput(JSON.parse(message.content));
                        }
                        catch (error) {
                            console.error("\x1b[31m-> Unable to parse received message:\x1b[0m");
                            console.error(message.content);
                        }
                        break;

                    case "CommandExecutedSuccessfully":
                        if (useVerbose) {
                            console.log("\x1b[32mMessage received from Gama Server: CommandExecutedSuccessfully for "+message.command.type+ ' '+ (message.command.expr !== undefined ? '\''+message.command.expr+'\'' : 'command') + '\x1b[0m');
                        }
                        else if(
                            message.command.expr !== undefined
                            && (message.command.expr.includes('create_player')
                                || message.command.expr.includes('remove_player'))
                        ) {
                            console.log("\x1b[32mMessage received from Gama Server: CommandExecutedSuccessfully for "+message.command.type+ ' '+ '\''+message.command.expr+'\'' + '\x1b[0m');
                        }

                        this.model.setGamaContentError('')
                        if (message.command.type === "load") this.model.setGamaExperimentName(message.content)

                        continue_sending = true
                        setTimeout(sendMessages,100)

                        try {
                            const content = JSON.parse(message.content)
                            this.controller.broadcastSimulationOutput(content);
                        }
                        catch (exception) {
                            console.error(exception);
                        }
                        break;
                }

                // If a known GAMA error
                if (gama_error_messages.includes(type)) {
                    console.error("Error message received from Gama Server:");
                    console.error(message);

                    this.model.setGamaContentError(message)
                    this.model.setGamaLoading(false)

                    throw "A problem appeared in the last message. Please check the response from the Server"
                }
            }
            catch (error) {
                console.error("\x1b[31m" + error +" \x1b[0m");
            }
        }

        gama_socket.addEventListener('close', (event) => {
            this.model.setGamaConnection(false)
            this.model.setGamaExperimentState("NONE")
            this.model.setGamaLoading(false)
            this.model.setRemoveInGameEveryPlayers()
            if (event.wasClean) {
                console.log('-> The connection with Gama Server was properly be closed');
            } else {
                console.error('-> The connection with Gama Server interruped suddenly');
            }
        })

        gama_socket.addEventListener('error', (error) => {
            console.error("-> Failed to connect with Gama Server");
            console.error(error);
        });

        this.model.setGamaLoading(false)

        return gama_socket
    }

    /**
     * Sends the message contained in the list @var list_messages at the index @var index_messages.
     */
    sendMessages() {
        if (do_sending && continue_sending) {
            if (index_messages < list_messages.length) {
                //console.log("--> Sending message " + index_messages)
                if (typeof list_messages[index_messages] == "function") {
                    gama_socket.send(JSON.stringify(list_messages[index_messages]()))
                    if (useVerbose) {
                        if (list_messages[index_messages]().expr !== undefined)
                            console.log("Expression sent to Gama Server: "+'\''+list_messages[index_messages]().expr+'\'' +" Waiting for the answer (if any)...");
                        else console.log("Message sent to Gama-Server: type "+list_messages[index_messages]().type+ ". Waiting for the answer (if any)...");
                    }
                    else {
                        if( list_messages[index_messages]().expr !== undefined && (list_messages[index_messages]().expr.includes('create_player') || list_messages[index_messages]().expr.includes('remove_player'))) {
                            console.log("Expression sent to Gama Server: "+'\''+list_messages[index_messages]().expr+'\'' +" Waiting for the answer (if any)...");
                        }
                    }
                }
                else gama_socket.send(JSON.stringify(list_messages[index_messages]));
              //  console.log(JSON.stringify(list_messages[index_messages]));
                continue_sending = false;
                index_messages = index_messages + 1;
            }
            else {
                function_to_call()
                do_sending = false
            }
        }
    }

    /**
     * Asks Gama to launch the experiment
     */
    launchExperiment() {
        if (this.model.getGama().connected === true && this.model.getGama().experiment_state === 'NONE') {
            list_messages = [this.jsonLoadExperiment];
            index_messages = 0;
            do_sending = true;
            continue_sending = true;
            this.model.setGamaLoading(true)
            function_to_call = () => {
                this.model.setGamaLoading(false)
            }
            this.sendMessages()
        } else {
            console.warn("GAMA is not connected or an experiment is already running...");
        }
    }

    /**
     * Asks Gama to stop the experiment
     */
    stopExperiment() {
        if (['RUNNING','PAUSED','NOTREADY'].includes(this.model.getGama().experiment_state)) {
            list_messages = [this.jsonControlGamaExperiment("stop")];
            index_messages = 0;
            do_sending = true;
            continue_sending = true;
            this.model.setGamaLoading(true)
            function_to_call = () => {
                this.model.setGamaLoading(false)
                this.model.setRemoveInGameEveryPlayers()
            }
            this.sendMessages()
        }
    }

    /**
     * Asks Gama to pause the experiment
     */
    pauseExperiment() {
        if (this.model.getGama().experiment_state === 'RUNNING') {
            list_messages = [this.jsonControlGamaExperiment("pause")];
            index_messages = 0;
            do_sending = true;
            continue_sending = true;
            this.model.setGamaLoading(true)
            function_to_call = () => {
                this.model.setGamaLoading(false)
            }
            this.sendMessages()
        }
    }

    /**
     * Asks Gama to play the experiment
     */
    resumeExperiment() {
        if (this.model.getGama().experiment_state === 'PAUSED') {
            list_messages = [this.jsonControlGamaExperiment("play")];
            index_messages = 0;
            do_sending = true;
            continue_sending = true;
            this.model.setGamaLoading(true)
            function_to_call = () => {
                this.model.setGamaLoading(false)
            }
            this.sendMessages()
        }
    }

    /**
     * Ask Gama to add a player in the simulation
     * @param {String} idPlayer - The id of the player to be added
     * @returns 
     */
    addInGamePlayer(idPlayer) {
        // Is simulation running ?
        if (['NONE',"NOTREADY"].includes(this.model.getGama().experiment_state)) return

        // Is player already in the simulation ?
        if (this.model.getPlayerState(idPlayer) !== undefined && this.model.getPlayerState(idPlayer).in_game) return

        current_id_player = idPlayer
        list_messages = [this.jsonTogglePlayer("add")];
        index_messages = 0;
        do_sending = true;
        continue_sending = true;
        function_to_call = () => {
            console.log("-> The Player "+idPlayer+" has been added to Gama");
            this.model.setPlayerInGame(idPlayer, true)
        }
        this.sendMessages()
    }

    /**
     * Asks Gama to remove a plyer in the simulation
     * @param {String} idPlayer - The id of the player
     * @returns 
     */
    removeInGamePlayer(idPlayer) {
        // Is simulation running ?
        if (['NONE',"NOTREADY"].includes(this.model.getGama().experiment_state)) return

        // Is player already removed from the simulation ?
        if (this.model.getPlayerState(idPlayer) !== undefined && !this.model.getPlayerState(idPlayer).in_game) return

        current_id_player = idPlayer
        list_messages = [this.jsonTogglePlayer("remove")];
        index_messages = 0;
        do_sending = true;
        continue_sending = true;
        function_to_call = () => {
            console.log("-> The Player: "+idPlayer+" has been removed from Gama");
            this.model.setPlayerInGame(idPlayer, false)
        }
        this.sendMessages()
    }

    /**
     * Adds all the players which are connected but not authenticated
     */
    addInGameEveryPlayers() {
        var index = 0
        for(var idPlayer in this.model.getAllPlayers()) {
            if (
                this.model.getPlayerState(idPlayer) !== undefined
                && this.model.getPlayerState(idPlayer).connected
                && !this.model.getPlayerState(idPlayer).in_game
            ) {
                const id_player_copy = idPlayer
                setTimeout(() => {this.addInGamePlayer(id_player_copy)},300*index);
                index = index + 1
            }
        }
    }

    /**
     * Removes all the players which are authenticated
     */
    removeInGameEveryPlayers() {
        if (["RUNNING",'PAUSED'].includes(this.model.getGama().experiment_state)){
            var index = 0
            for(var idPlayer in this.model.getAllPlayers()) {
                if (this.model.getPlayerState(idPlayer) !== undefined && this.model.getPlayerState(idPlayer).in_game) {
                    const id_player_copy = idPlayer
                    setTimeout(() => {this.removeInGamePlayer(id_player_copy)},300*index);
                    index = index + 1
                }
            }
        } else {
            this.model.setRemoveInGameEveryPlayers();
        }
    }

    /**
     * Sends an expression for a certain player
     * @param {String} idPlayer - The id of the player to apply this expression
     * @param {String} expr - The expression. If this expression contains $id, it will be replaced by the id of the player wich asked the method
     * @returns 
     */
    sendExpression(idPlayer, expr) {
        if (['NONE',"NOTREADY"].includes(this.model.getGama().experiment_state)) return

        expr = expr.replace('$id', "\"" + idPlayer + "\"")
        list_messages = [this.jsonSendExpression(expr)];
        index_messages = 0;
        do_sending = true;
        continue_sending = true;
        function_to_call = () => {
            console.log("-> The Player of id "+idPlayer+" called the function: "+expr+" successfully.");
        }
        this.sendMessages()
    }

    /**
     * Sends an ask to GAMA
     * @param {JSON} json - The JSON containing the information of the ask
     * @returns 
     */
    sendAsk(json) {
        if (['NONE',"NOTREADY"].includes(this.model.getGama().experiment_state)) return

        list_messages = [json];
        index_messages = 0;
        do_sending = true;
        continue_sending = true;
        function_to_call = () => {
            if (useVerbose) {
                console.log("-> The ask: "+json.action+" was sent successfully");
            }
        }
        this.sendMessages()
    }

    close(){
        this.gama_socket.close()
    }
}

module.exports = GamaConnector;