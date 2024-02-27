//Imports
const WebSocket = require('ws');

// Default values
const DEFAULT_GAMA_WS_PORT = 6868

//Global variables about the state of the connector. This is only for internal purposes.
var gama_socket
var index_messages;
var continue_sending = false;
var do_sending = false;
var list_messages;
var function_to_call;
var current_id_player;
var current_expression;

var controller_copy;
var model_file;
var experiment_name

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
class ConnectorGamaServer {
    /**
     * Constructor of the websocket client
     * @param {Controller} controller - The controller of the project
     */
    constructor(controller) {
        this.controller = controller;
        controller_copy = controller;
        this.gama_ws_port = this.controller.model.getJsonSettings().gama_ws_port != undefined ? this.controller.model.getJsonSettings().gama_ws_port : DEFAULT_GAMA_WS_PORT;
        this.gama_error_messages = gama_error_messages;
        model_file = this.controller.model.getJsonSettings().type_model_file_path == "absolute" ? this.controller.model.getJsonSettings().model_file_path : process.cwd() + "/" + this.controller.model.getJsonSettings().model_file_path
        experiment_name = this.controller.model.getJsonSettings().experiment_name;
        this.gama_socket = this.connectGama();
    }

    // -------------------

    /* Protocol messages about Gama Server */
    
    //You can add here new protocol messages

    load_experiment() {
        return {
        "type": "load",
        "model": model_file,
        "experiment": experiment_name
        }
    }
    play_experiment() {
        return {
            "type": "play",
            "exp_id": controller_copy.model.getGama().experiment_id,
        }
    } 
    stop_experiment() {
        return  {
            "type": "stop",
            "exp_id": controller_copy.model.getGama().experiment_id,
        }
    }
    pause_experiment() {
        return {
            "type": "pause",
            "exp_id": controller_copy.model.getGama().experiment_id,
        }
    }
    add_player() {
        return  {
            "type": "expression",
            "content": "Add a new VR headset", 
            "exp_id": controller_copy.model.getGama().experiment_id,
            "expr": "do create_player(\""+current_id_player+"\");"
        }
    }
    remove_player() {
        return  {
            "type": "expression",
            "content": "Remove a VR ", 
            "exp_id": controller_copy.model.getGama().experiment_id,
            "expr": "do remove_player(\""+current_id_player+"\");"
        }
    }

    send_expression() {
        return  {
            "type": "expression",
            "content": "Send an expression", 
            "exp_id": controller_copy.model.getGama().experiment_id,
            "expr": current_expression
        }
    }

    // --------------------

    /**
     * Sends the message contained in the list @var list_messages at the index @var index_messages.
     */
    sendMessages() {
        if (do_sending && continue_sending) {
            if (index_messages < list_messages.length) {
                //console.log("--> Sending message " + index_messages)
                if (typeof list_messages[index_messages] == "function") {
                    gama_socket.send(JSON.stringify(list_messages[index_messages]()))
                    if (this.controller.model.getJsonSettings().verbose) {
                        if (list_messages[index_messages]().expr != undefined) 
                            console.log("Expression sent to Gama Server: "+'\''+list_messages[index_messages]().expr+'\'' +" Waiting for the answer (if any)...");
                        else console.log("Message sent to Gama-Server: type "+list_messages[index_messages]().type+ ". Waiting for the answer (if any)...");
                    }
                    else {
                        if( list_messages[index_messages]().expr != undefined && (list_messages[index_messages]().expr.includes('create_player') || list_messages[index_messages]().expr.includes('remove_player'))) {
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
        if (this.controller.model.getGama().connected == true && this.controller.model.getGama().experiment_state == 'NONE') {
            list_messages = [this.load_experiment];
            index_messages = 0;
            do_sending = true;
            continue_sending = true;
            this.controller.model.setGamaLoading(true)
            function_to_call = () => {
                this.controller.model.setGamaLoading(false)
            }
            this.sendMessages()
        }
    }

    /**
     * Asks Gama to stop the experiment
     */
    stopExperiment() {
        if (['RUNNING','PAUSED','NOTREADY'].includes(this.controller.model.getGama().experiment_state)) {
            list_messages = [this.stop_experiment];
            index_messages = 0;
            do_sending = true;
            continue_sending = true;
            this.controller.model.setGamaLoading(true)
            function_to_call = () => {
                this.controller.model.setGamaLoading(false)
                this.controller.model.setRemoveInGameEveryPlayers()
            }
            this.sendMessages()
        }
    }

    /**
     * Asks Gama to pause the experiment
     */
    pauseExperiment() {
        if (['RUNNING'].includes(this.controller.model.getGama().experiment_state)) {
            list_messages = [this.pause_experiment];
            index_messages = 0;
            do_sending = true;
            continue_sending = true;
            this.controller.model.setGamaLoading(true)
            function_to_call = () => {
                this.controller.model.setGamaLoading(false)
            }
            this.sendMessages()
        }
    }

    /**
     * Asks Gama to play the experiment
     */
    resumeExperiment() {
        if (this.controller.model.getGama().experiment_state == 'PAUSED') {
            list_messages = [this.play_experiment];
            index_messages = 0;
            do_sending = true;
            continue_sending = true;
            this.controller.model.setGamaLoading(true)
            function_to_call = () => {
                this.controller.model.setGamaLoading(false)
            }
            this.sendMessages()
        }
    }

    /**
     * Ask Gama to add a player in the simulation
     * @param {String} id_player - The id of the player to be added
     * @returns 
     */

    addInGamePlayer(id_player) {
        if (['NONE',"NOTREADY"].includes(this.controller.model.getGama().experiment_state)) return
        if (this.controller.model.getPlayerState(id_player) != undefined && this.controller.model.getPlayerState(id_player).in_game) return
        current_id_player = id_player
        list_messages = [this.add_player];
        index_messages = 0;
        do_sending = true;
        continue_sending = true;
        function_to_call = () => {
            console.log("-> The Player "+id_player+" has been added to Gama");
            this.controller.model.setPlayerInGame(id_player, true)
        }
        this.sendMessages()
    }

    /**
     * Asks Gama to remove a plyer in the simulation
     * @param {String} id_player - The id of the player
     * @returns 
     */

    removeInGamePlayer(id_player) {
        if (['NONE',"NOTREADY"].includes(this.controller.model.getGama().experiment_state)) return
        if (this.controller.model.getPlayerState(id_player) != undefined && !this.controller.model.getPlayerState(id_player).in_game) return
        current_id_player = id_player
        list_messages = [this.remove_player];
        index_messages = 0;
        do_sending = true;
        continue_sending = true;
        function_to_call = () => {
            console.log("-> The Player: "+id_player+" has been removed from Gama");
            this.controller.model.setPlayerInGame(id_player, false)
        }
        this.sendMessages()
    }

    /**
     * Adds all the players which are connected but not authenticated
     */

    addInGameEveryPlayers() {
        var index = 0
        for(var id_player in this.controller.model.getAllPlayers()) {
            if (this.controller.model.getPlayerState(id_player) != undefined && this.controller.model.getPlayerState(id_player).connected && !this.controller.model.getPlayerState(id_player).in_game) {
                const id_player_copy = id_player
                setTimeout(() => {this.addInGamePlayer(id_player_copy)},300*index);
                index = index + 1
            }
        }
    }

    /**
     * Removes all the players which are authenticated
     */
    removeInGameEveryPlayers() {
        if (["RUNNING",'PAUSED'].includes(this.controller.model.getGama().experiment_state)){
            var index = 0
            for(var id_player in this.controller.model.getAllPlayers()) {
                if (this.controller.model.getPlayerState(id_player) != undefined && this.controller.model.getPlayerState(id_player).in_game) {
                    const id_player_copy = id_player
                    setTimeout(() => {this.removeInGamePlayer(id_player_copy)},300*index);
                    index = index + 1
                }
            }
        }
        else {
            this.controller.model.setRemoveInGameEveryPlayers();
        }
    }

    /**
     * Sends an expression for a certain player
     * @param {String} id_player - The id of the player to apply this expression
     * @param {String} expr - The expression. If this expression contains $id, it will be replaced by the id of the player wich asked the method
     * @returns 
     */

    sendExpression(id_player, expr) {
        if (['NONE',"NOTREADY"].includes(this.controller.model.getGama().experiment_state)) return
        expr = expr.replace('$id', "\"" + id_player + "\"")
        current_expression = expr
        list_messages = [this.send_expression];
        index_messages = 0;
        do_sending = true;
        continue_sending = true;
        function_to_call = () => {
            console.log("-> The Player of id "+id_player+" called the function: "+expr+" successfully.");
        }
        this.sendMessages()
    }

    /**
     * Sends an ask to GAMA
     * @param {JSON} json - The JSON containing the information of the ask
     * @returns 
     */
    sendAsk(json) {
        if (['NONE',"NOTREADY"].includes(this.controller.model.getGama().experiment_state)) return
        list_messages = [json];
        index_messages = 0;
        do_sending = true;
        continue_sending = true;
        function_to_call = () => {
            if (this.controller.model.getJsonSettings().verbose) {
                console.log("-> The ask: "+json.action+" was sent successfully");
            }
        }
        this.sendMessages()
    }
    
    /**
     * Connects the websocket client with gama server and manage the messages received
     * @returns 
     */
    connectGama() {
        this.controller.model.setGamaLoading(true)
        const controller = this.controller;
        const sendMessages = this.sendMessages;
        gama_socket = new WebSocket("ws://"+this.controller.model.getJsonSettings().ip_address_gama_server+":"+this.gama_ws_port);
    
        gama_socket.onopen = function() {
            console.log("-> Connected to Gama Server");
            controller.model.setGamaConnection(true)
            controller.model.setGamaExperimentState('NONE')
        };
    
        gama_socket.onmessage = function(event) {
            try {
                const message = JSON.parse(event.data)
                if (controller.model.getJsonSettings().verbose) {
                    console.log("Message received from Gama:");
                    console.log(message)
                }
              
                if (message.type == "SimulationStatus") {
                    if (controller.model.getJsonSettings().verbose) console.log("Message received from Gama Server: SimulationStatus = "+message.content);
                 //   console.log(message);
                    controller.model.setGamaExperimentId(message.exp_id)
                    if (['NONE','NOTREADY'].includes(message.content) && ['RUNNING','PAUSED','NOTREADY'].includes(controller.model.getGama().experiment_state)) {
                        controller.model.setRemoveInGameEveryPlayers();
                        
                    }
                    controller.model.setGamaExperimentState(message.content)
                }
                if (message.type == "SimulationOutput") {
                    try {
                        controller.broadcastSimulationOutput(JSON.parse(message.content));
                    }
                    catch (error) {
                        console.log("\x1b[31m-> Unable to parse recived message:\x1b[0m");
                        console.log(message.content);
                    }
                }
                if (message.type == "CommandExecutedSuccessfully") {
                    if (controller.model.getJsonSettings().verbose) {
                        console.log("\x1b[32mMessage received from Gama Server: CommandExecutedSuccessfully for "+message.command.type+ ' '+ (message.command.expr!= undefined ? '\''+message.command.expr+'\'' : 'command') + '\x1b[0m');
                    }
                    else if(message.command.expr != undefined && (message.command.expr.includes('create_player') ||message.command.expr.includes('remove_player'))) {
                        console.log("\x1b[32mMessage received from Gama Server: CommandExecutedSuccessfully for "+message.command.type+ ' '+ (message.command.expr!= undefined ? '\''+message.command.expr+'\'' : 'command') + '\x1b[0m');
                    }
                    controller.model.setGamaContentError('')
                    if (message.command != undefined && message.command.type == "load") controller.model.setGamaExperimentName(message.content)
                    continue_sending = true
                    setTimeout(sendMessages,100)
                    try {
                        const content = JSON.parse(message.content)
                        controller.broadcastSimulationOutput(content);
                    }
                    catch (exception) {
                    }
                }
                if (gama_error_messages.includes(message.type)) {
                    console.log("Error message received from Gama Server:");
                    console.log(message);
                    controller.model.setGamaContentError(message)
                    this.controller.model.setGamaLoading(false)
                    throw "A problem appeared in the last message. Please check the response from the Server"
                }
            }
            catch (error) {
                console.log("\x1b[31m" + error +" \x1b[0m");
            }
        }
        gama_socket.addEventListener('close', (event) => {
            controller.model.setGamaConnection(false)
            controller.model.setGamaExperimentState("NONE")
            controller.model.setGamaLoading(false)
            controller.model.setRemoveInGameEveryPlayers()
            if (event.wasClean) {
                console.log('-> The connection with Gama Server was properly be closed');
            } else {
                console.log('-> The connection with Gama Server interruped suddenly');
            }
        })
        gama_socket.addEventListener('error', (error) => {
            console.log("-> Failed to connect with Gama Server");
            
        });
        controller.model.setGamaLoading(false)
        return gama_socket
    }
    close(){
        this.gama_socket.close()
    }
}

module.exports = ConnectorGamaServer;