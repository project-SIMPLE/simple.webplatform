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
var current_id_vr;

var server_model_copy;
var model_file;

//List of error messages for Gama Server
const gama_error_messages = ["SimulationStatusError",
        "SimulationErrorDialog",
        "SimulationError",
        "RuntimeError",
        "GamaServerError",
        "MalformedRequest",
        "UnableToExecuteRequest"]

class ConnectorGamaServer {
    constructor(server_model) {
        this.server_model = server_model;
        server_model_copy = server_model;
        this.gama_ws_port = this.server_model.json_settings.gama_ws_port != undefined ? this.server_model.json_settings.gama_ws_port : DEFAULT_GAMA_WS_PORT;
        this.gama_error_messages = gama_error_messages;
        model_file = this.server_model.json_settings.model_file_absolute != "" ? this.server_model.json_settings.model_file_absolute : process.cwd() + this.server_model.json_settings.model_file_relative
        this.connectGama();
    }

    /* Protocol messages about Gama Server */
    
    //You can add here new protocol messages

    load_experiment() {
        return {
        "type": "load",
        "model": model_file,
        "experiment": "test"
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
    add_vr_headset() {
        return  {
            "type": "expression",
            "content": "Add a new VR headset", 
            "exp_id": server_model_copy.json_state.gama.experiment_id,
            "expr": "create VrHeadset { id <- \""+current_id_vr+"\"; }"
        }
    }
    remove_vr_headset() {
        return  {
            "type": "expression",
            "content": "Remove a VR Headset", 
            "exp_id": server_model_copy.json_state.gama.experiment_id,
            "expr": "do removeVrHeadset(\""+current_id_vr+"\");"
        }
    }

    sendMessages() {
        if (do_sending && continue_sending) {
            if (index_messages < list_messages.length) {
                //console.log("--> Sending message " + index_messages)
                if (typeof list_messages[index_messages] == "function") {
                    gama_socket.send(JSON.stringify(list_messages[index_messages]()))
                    //console.log("Message sent to Gama-Server:");
                    //console.log(list_messages[index_messages]());
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

    launchExperiment() {
        if (this.server_model.json_state["gama"]["connected"] == true && this.server_model.json_state["gama"]["launched_experiment"] == false) {
            list_messages = [this.load_experiment, this.play_experiment];
            index_messages = 0;
            do_sending = true;
            continue_sending = true;
            this.server_model.json_state["gama"]["loading"] = true
            this.server_model.notifyMonitor();
            function_to_call = () => {
                this.server_model.json_state["gama"]["launched_experiment"] = true
                this.server_model.json_state["gama"]["loading"] = false
                this.server_model.notifyMonitor();
            }
            this.sendMessages()
        }
    }

    stopExperiment() {
        if (this.server_model.json_state["gama"]["launched_experiment"] == true) {
            list_messages = [this.stop_experiment];
            index_messages = 0;
            do_sending = true;
            continue_sending = true;
            this.server_model.json_state["gama"]["loading"] = true
            this.server_model.notifyMonitor();
            function_to_call = () => {
                this.server_model.json_state["gama"]["launched_experiment"] = false
                this.server_model.json_state["gama"]["loading"] = false
                this.server_model.json_state["vr"]["id_connected"].forEach(id_vr => {
                    this.server_model.json_state["vr"][id_vr]["authentified"] = false
                });
                this.server_model.notifyMonitor();
            }
            this.sendMessages()
        }
    }

    addNewVrHeadset(id_vr) {
        if (this.server_model.json_state["gama"]["launched_experiment"] == false) return
        current_id_vr = id_vr
        list_messages = [this.add_vr_headset];
        index_messages = 0;
        do_sending = true;
        continue_sending = true;
        function_to_call = () => {
            this.server_model.json_state["vr"][id_vr]["authentified"] = true
            this.server_model.notifyMonitor();
        }
        this.sendMessages()
    }

    removeVrHeadset(id_vr) {
        current_id_vr = id_vr
        list_messages = [this.remove_vr_headset];
        index_messages = 0;
        do_sending = true;
        continue_sending = true;
        function_to_call = () => {
            console.log("The Vr headset: "+id_vr+" has been removed from Gama");
            this.server_model.json_state["vr"][id_vr]["authentified"] = false
            this.server_model.notifyMonitor();
        }
        this.sendMessages()
    }

    connectGama() {
        this.server_model.json_state["gama"]["loading"] = true
        this.server_model.notifyMonitor();
        const server_model = this.server_model;
        const sendMessages = this.sendMessages;
        gama_socket = new WebSocket("ws://"+this.server_model.json_settings.ip_adress_gama_server+":"+this.gama_ws_port);
    
        gama_socket.onopen = function() {
            console.log("Connected to Gama Server");
            server_model.json_state["gama"]["connected"] = true
            server_model.json_state["gama"]["launched_experiment"] = false
            server_model.notifyMonitor();
        };
    
        gama_socket.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data)
                console.log(data);
                if (data.type == "SimulationOutput" && data.content != String({ message: '{}', color: null })) {
                    const cleaned_string = data.content.toString().substring(13,data.content.toString().length -15)
                    server_model.json_simulation = JSON.parse(cleaned_string)
                    server_model.notifyVrClients();

                }
                else {
                    if (data.content != String({ message: '{}', color: null })) console.log(data);
                }
                if (data.type == "CommandExecutedSuccessfully") {
                    if (data.command != undefined && data.command.type == "load") server_model.json_state.gama.experiment_id = data.content
                    continue_sending = true
                    setTimeout(sendMessages,300)
                }
                if (gama_error_messages.includes(data.type)) {
                    var command_type
                    if (data.command != undefined) command_type = data.command.type
                    server_model.json_state["gama"]["content_error"] = data.type + " for the command: "+ command_type
                    server_model.json_state["gama"]["loading"] = false
                    server_model.notifyMonitor();
                    server_model.json_state["gama"]["content_error"] = ""

                    throw "A problem appeared in the last message. Please check the response from the Server"
                }
            }
            catch (error) {
                console.log(error);
    
            }
        }
        gama_socket.addEventListener('close', (event) => {
            server_model.json_state["gama"]["connected"] = false;
            server_model.json_state["gama"]["launched_experiment"] = false;
            server_model.json_state["gama"]["loading"] = false;
            server_model.json_state["vr"]["id_connected"].forEach(id_vr => {
                server_model.json_state["vr"][id_vr]["authentified"] = false;
            });
            server_model.notifyMonitor();
            if (event.wasClean) {
                console.log('The WebSocket connection with Gama Server was properly be closed');
            } else {
                console.error('The Websocket connection with Gama Server interruped suddenly');
            }
            console.log(`Closure id : ${event.code}, Reason : ${event.reason}`);
        })
        gama_socket.addEventListener('error', (error) => {
            console.error('Websocket error :', error);
            
        });
        
        this.server_model.json_state["gama"]["loading"] = false
        this.server_model.notifyMonitor();
    }
}

module.exports = ConnectorGamaServer;