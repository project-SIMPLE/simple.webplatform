var json_state;
const id_unique = generateGuid();
const hostname = window.location.hostname;
var socket;

function gama_to_html(inputString) {
    if (inputString == undefined) return "No Strategy"
    let modifiedString = inputString.replace(/_/g, ' ');
    modifiedString = modifiedString.replace(/\b\w/g, (match) => match.toUpperCase());
    return modifiedString;
}

function html_to_gama(inputString) {
    let modifiedString = inputString.replace(/ /g, '_');
    modifiedString = modifiedString.toLowerCase();
    return modifiedString;
}

function generateGuid() {
    return 'xxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

fetch('/getWsGamePort')
    .then(response => response.json())
        .then(data => {
            console.log(data);
            socket = createWebSocket(data.player_ws_port)
});

function createWebSocket(player_ws_port) {
    const socket = new WebSocket('ws://'+hostname+':'+ player_ws_port);

    socket.onopen = function() {
        document.querySelector("#connection-state").innerHTML = "&#10004; Connected to central Server"
        document.querySelector("#connection-state").style = "color:green;"
        message = {type:"connection", id:id_unique}
        socket.send(JSON.stringify(message))
    };

    socket.onmessage = function(event) {
        var json = JSON.parse(event.data)
        console.log(json);
        if (json.type == "json_state") {
            
            json_state = json;
            const in_game = json_state.in_game;
            document.querySelector("#authentification-state").innerHTML = in_game ? "&#10004; In game" : "&#x274C; Not yet in the game, please wait"
            document.querySelector("#authentification-state").style = in_game ? "color:green;" : "color:red;";
        }
        else if (json.type == "json_output") {
            const json_simulation = json;
            document.querySelector("#himself-view").innerHTML =  json_simulation.contents.name == undefined ? "(enter your name)" : json_simulation.contents.name ;
            const color = "rgb("+ json_simulation.contents.color.red + ", "+ json_simulation.contents.color.green + ", "+ json_simulation.contents.color.blue + ");"
            document.querySelector("#himself-color-area").style = 'background-color:'+ color
            document.querySelector("#nb-agents-view").innerHTML = json_simulation.contents.nb_agents
            document.querySelector("#strategy-view").innerHTML = gama_to_html(json_simulation.contents.strategy);
            console.log(json_simulation.contents.strategy);
            document.querySelector("#attack-rate-view").innerHTML = Math.round(json_simulation.contents.attack_rate*100)+"%";
            document.querySelector("#predator-view").innerHTML = json_simulation.contents.predator.name == undefined ? "..." : json_simulation.contents.predator.name ;
            const color_predator = "rgb("+ json_simulation.contents.predator.color.red + ", "+ json_simulation.contents.predator.color.green + ", "+ json_simulation.contents.predator.color.blue + ");"
            document.querySelector("#predator-color-area").style = 'background-color:'+ color_predator
            document.querySelector("#prey-view").innerHTML = json_simulation.contents.prey.name == undefined ? "..." : json_simulation.contents.prey.name ;
            const color_prey = "rgb("+ json_simulation.contents.prey.color.red + ", "+ json_simulation.contents.prey.color.green + ", "+ json_simulation.contents.prey.color.blue + ");"
            document.querySelector("#prey-color-area").style = 'background-color:'+ color_prey
        }
    };
    
    socket.addEventListener('close', (event) => {
        document.querySelector("#connection-state").innerHTML = "&#x274C; The central server disconnected ! Please refresh this page when the server came back to work"
        document.querySelector("#connection-state").style = "color:red;font-weight: bold;"
        if (event.wasClean) {
            console.log('The WebSocket connection with Gama Server was properly be closed');
        } else {
            console.error('The Websocket connection with Gama Server interruped suddenly');
        }
        console.log(`Closure id : ${event.code}, Reason : ${event.reason}`);

    })

    socket.addEventListener('error', (error) => {
        document.querySelector("#connection-state").innerHTML = "&#x274C; The cetral server disconnected ! Please refresh this page when the server came back to work"
        document.querySelector("#connection-state").style = "color:red;font-weight: bold;"
    });

    return socket;
}

document.querySelector("#name-button").addEventListener('click', ()=>{
        socket.send(JSON.stringify({
            "type": "expression",
            "expr": "do set_name($id,\""+document.querySelector("#name-input").value+"\");"
        }))
    });

document.querySelector("#attack-rate-button").addEventListener('click', ()=>{
    console.log(document.querySelector("#attack-rate-input"));
    console.log(document.querySelector("#attack-rate-input").value);
    socket.send(JSON.stringify({
        "type": "expression",
        "expr": "do change_attack_rate($id,\""+document.querySelector("#attack-rate-input").value+"\");"
    }))
});

document.querySelector("#strategy-button").addEventListener('click', ()=>{
    const new_strategy = document.querySelector("#strategy-input").value
    socket.send(JSON.stringify({
        "type": "expression",
        "expr": "do change_strategy($id,\""+html_to_gama(new_strategy)+"\");"
    }))
});