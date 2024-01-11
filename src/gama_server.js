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

var server_model_copy;
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
     * @param {ServerModel} server_model - The model of the project
     */
    constructor(server_model) {
        this.server_model = server_model;
        server_model_copy = server_model;
        this.gama_ws_port = this.server_model.json_settings.gama_ws_port != undefined ? this.server_model.json_settings.gama_ws_port : DEFAULT_GAMA_WS_PORT;
        this.gama_error_messages = gama_error_messages;
        model_file = this.server_model.json_settings.type_model_file_path == "absolute" ? this.server_model.json_settings.model_file_path : process.cwd() + "/" + this.server_model.json_settings.model_file_path
        experiment_name = this.server_model.json_settings.experiment_name;
        this.gama_socket = this.connectGama();
    }

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
            "exp_id": server_model_copy.json_state.gama.experiment_id,
        }
    } 
    stop_experiment() {
        return  {
            "type": "stop",
            "exp_id": server_model_copy.json_state.gama.experiment_id,
        }
    }
    pause_experiment() {
        return {
            "type": "pause",
            "exp_id": server_model_copy.json_state.gama.experiment_id,
        }
    }
    add_player() {
        return  {
            "type": "expression",
            "content": "Add a new VR headset", 
            "exp_id": server_model_copy.json_state.gama.experiment_id,
            "expr": "do create_player(\""+current_id_player+"\");"
        }
    }
    remove_player() {
        return  {
            "type": "expression",
            "content": "Remove a VR ", 
            "exp_id": server_model_copy.json_state.gama.experiment_id,
            "expr": "do remove_player(\""+current_id_player+"\");"
        }
    }

    send_expression() {
        return  {
            "type": "expression",
            "content": "Send an expression", 
            "exp_id": server_model_copy.json_state.gama.experiment_id,
            "expr": current_expression
        }
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
                    console.log("Message sent to Gama-Server:");
                    console.log(list_messages[index_messages]());
                    console.log("Waiting for the answer (if any)...")
                }
                else gama_socket.send(JSON.stringify(list_messages[index_messages]));
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
        if (this.server_model.json_state["gama"]["connected"] == true && this.server_model.json_state["gama"]["experiment_state"] == 'NONE') {
            list_messages = [this.load_experiment];
            index_messages = 0;
            do_sending = true;
            continue_sending = true;
            this.server_model.json_state["gama"]["loading"] = true
            this.server_model.notifyMonitor();
            function_to_call = () => {
                this.server_model.json_state["gama"]["loading"] = false
                this.server_model.notifyMonitor();
            }
            this.sendMessages()
        }
    }
    /**
     * Asks Gama to stop the experiment
     */
    stopExperiment() {
        if (['RUNNING','PAUSED','NOTREADY'].includes(this.server_model.json_state["gama"]["experiment_state"])) {
            list_messages = [this.stop_experiment];
            index_messages = 0;
            do_sending = true;
            continue_sending = true;
            this.server_model.json_state["gama"]["loading"] = true
            this.server_model.notifyMonitor();
            function_to_call = () => {
                this.server_model.json_state["gama"]["loading"] = false
                this.server_model.unauthentifyEveryPlayers();
                this.server_model.notifyMonitor();
            }
            this.sendMessages()
        }
    }

    /**
     * Asks Gama to pause the experiment
     */
    pauseExperiment() {
        if (['RUNNING'].includes(this.server_model.json_state["gama"]["experiment_state"])) {
            list_messages = [this.pause_experiment];
            index_messages = 0;
            do_sending = true;
            continue_sending = true;
            this.server_model.json_state["gama"]["loading"] = true
            this.server_model.notifyMonitor();
            function_to_call = () => {
                this.server_model.json_state["gama"]["loading"] = false
                this.server_model.notifyMonitor();
            }
            this.sendMessages()
        }
    }

    /**
     * Asks Gama to play the experiment
     */
    resumeExperiment() {
        if (this.server_model.json_state["gama"]["experiment_state"] == 'PAUSED') {
            list_messages = [this.play_experiment];
            index_messages = 0;
            do_sending = true;
            continue_sending = true;
            this.server_model.json_state["gama"]["loading"] = true
            this.server_model.notifyMonitor();
            function_to_call = () => {
                this.server_model.json_state["gama"]["loading"] = false
                this.server_model.notifyMonitor();
            }
            this.sendMessages()
        }
    }

    /**
     * Ask Gama to add a player in the simulation
     * @param {String} id_player - The id of the player to be added
     * @returns 
     */

    addPlayer(id_player) {
        if (['NONE',"NOTREADY"].includes(this.server_model.json_state["gama"]["experiment_state"])) return
        if (this.server_model.json_state.player[id_player].authentified) return
        current_id_player = id_player
        list_messages = [this.add_player];
        index_messages = 0;
        do_sending = true;
        continue_sending = true;
        function_to_call = () => {
            console.log("The Player: "+id_player+" has been added to Gama");
            this.server_model.json_state["player"][id_player]["authentified"] = true
            this.server_model.notifyMonitor();
        }
        this.sendMessages()
    }

    /**
     * Asks Gama to remove a plyer in the simulation
     * @param {String} id_player - The id of the player
     * @returns 
     */

    removePlayer(id_player) {
        if (['NONE',"NOTREADY"].includes(this.server_model.json_state["gama"]["experiment_state"])) return
        if (!this.server_model.json_state.player[id_player].authentified) return
        current_id_player = id_player
        list_messages = [this.remove_player];
        index_messages = 0;
        do_sending = true;
        continue_sending = true;
        function_to_call = () => {
            console.log("The Player: "+id_player+" has been removed from Gama");
            this.server_model.json_state["player"][id_player]["authentified"] = false
            this.server_model.notifyMonitor();
        }
        this.sendMessages()
    }

    /**
     * Adds all the players which are connected but not authenticated
     */

    addEveryPlayers() {
        var index = 0
        this.server_model.json_state.player.id_connected.forEach(id_player => {
            if (this.server_model.json_state.player[id_player].connected && !this.server_model.json_state.player[id_player].authentified) {
                setTimeout(() => {this.addPlayer(id_player)},500*index);
                index = index + 1
            }
        });
    }

    /**
     * Removes all the players which are authenticated
     */
    removeEveryPlayers() {
        if (["RUNNING",'PAUSED'].includes(this.server_model.json_state.gama.experiment_state)){
            var index = 0
            this.server_model.json_state.player.id_connected.forEach(id_player => {
                if (this.server_model.json_state.player[id_player].authentified) {
                    setTimeout(() => {this.removePlayer(id_player);},500*index);
                    index = index + 1
                }
            });
        }
        else {
            this.server_model.json_state.player.id_connected.forEach(id_player => {
                this.server_model.json_state.player[id_player].authentified = false;
            });
            this.server_model.notifyMonitor();
        }
    }

    /**
     * Sends an expression for a certain player
     * @param {String} id_player - The id of the player to apply this expression
     * @param {String} expr - The expression. If this expression contains $id, it will be replaced by the id of the player wich asked the method
     * @returns 
     */

    sendExpression(id_player, expr) {
        if (['NONE',"NOTREADY"].includes(this.server_model.json_state["gama"]["experiment_state"])) return
        expr = expr.replace('$id', "\"" + id_player + "\"")
        current_expression = expr
        list_messages = [this.send_expression];
        index_messages = 0;
        do_sending = true;
        continue_sending = true;
        function_to_call = () => {
            console.log("The Player: "+id_player+" called the function: "+expr);
        }
        this.sendMessages()
    }
    /**
     * Connects the websocket client with gama server and manage the messages received
     * @returns 
     */
    connectGama() {
        this.server_model.json_state["gama"]["loading"] = true
        this.server_model.notifyMonitor();
        const server_model = this.server_model;
        const sendMessages = this.sendMessages;
        gama_socket = new WebSocket("ws://"+this.server_model.json_settings.ip_address_gama_server+":"+this.gama_ws_port);
    
        gama_socket.onopen = function() {
            console.log("-> Connected to Gama Server");
            server_model.json_state["gama"]["connected"] = true
            server_model.json_state["gama"]["experiment_state"] = 'NONE'
            server_model.notifyMonitor();
        };
    
        gama_socket.onmessage = function(event) {
            try {
                const message = JSON.parse(event.data)
                
                if (message.type == "SimulationStatus") {
                    console.log("Message received from Gama Server:");
                    console.log(message);
                    server_model.json_state.gama.experiment_id = message.exp_id;
                    if (['NONE','NOTREADY'].includes(message.content) && ['RUNNING','PAUSED','NOTREADY'].includes(server_model.json_state.gama.experiment_state)) {
                        server_model.unauthentifyEveryPlayers();
                        
                    }
                    server_model.json_state.gama.experiment_state = message.content;
                    server_model.notifyMonitor();
                }
                if (message.type == "SimulationOutput") {
                    try {
                        server_model.json_simulation = JSON.parse(message.content)
                        server_model.notifyPlayerClients();
                    }
                    catch (error) {
                        console.log("\x1b[41m-> Unable to parse recived message:\x1b[0m");
                        console.log(message.content);
                    }
                }
                if (message.type == "CommandExecutedSuccessfully") {
                    console.log("Message received from Gama Server:");
                    console.log(message);
                    server_model.json_state.gama.content_error = ""
                    if (message.command != undefined && message.command.type == "load") server_model.json_state.gama.experiment_name = message.content
                    continue_sending = true
                    setTimeout(sendMessages,300)
                    try {
                        const content = JSON.parse(message.content)
                        server_model.json_simulation = content
                        server_model.notifyPlayerClients();
                    }
                    catch (exception) {}
                }
                if (gama_error_messages.includes(message.type)) {
                    console.log("Message received from Gama Server:");
                    console.log(message);
                    server_model.json_state.gama.content_error = message
                    server_model.json_state.gama.loading = false
                    server_model.notifyMonitor();
                    throw "A problem appeared in the last message. Please check the response from the Server"
                }
            }
            catch (error) {
                console.log("\x1b[41m")
                console.log(error+" \x1b[0m");
            }
        }
        gama_socket.addEventListener('close', (event) => {
            server_model.json_state["gama"]["connected"] = false;
            server_model.json_state["gama"]["experiment_state"] = "NONE";
            server_model.json_state["gama"]["loading"] = false;
            server_model.json_state["player"]["id_connected"].forEach(id_player => {
                server_model.json_state["player"][id_player]["authentified"] = false;
            });
            server_model.notifyMonitor();
            if (event.wasClean) {
                console.log('-> The WebSocket connection with Gama Server was properly be closed');
            } else {
                console.log('-> The Websocket connection with Gama Server interruped suddenly');
            }
        })
        gama_socket.addEventListener('error', (error) => {
            console.log("-> Failed to connect with Gama Server")
            
        });
        this.server_model.json_state["gama"]["loading"] = false
        this.server_model.notifyMonitor();
        return gama_socket
    }
    close(){
        this.gama_socket.close()
    }
}

module.exports = ConnectorGamaServer;