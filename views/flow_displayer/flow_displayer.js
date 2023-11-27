const hostname = window.location.hostname;

fetch('/getWsMonitorPort')
      .then(response => response.json())
      .then(data => {
        createWebSocket(data.monitor_ws_port)
      });

function createWebSocket(monitor_ws_port) {
    const socket = new WebSocket('ws://'+hostname+':'+monitor_ws_port);

    socket.onopen = function() {
    };

    socket.onmessage = function(event){
        const json = JSON.parse(event.data)
        const formattedJSON = JSON.stringify(json, null, 2);
        if (json.type == "json_state") {
            document.getElementById('json-state-display').textContent = json.gama.content_error.content;
        }
        else if (json.type == "json_simulation") {
            document.getElementById('json-simulation-display').textContent = formattedJSON;
        }
    } 

    socket.addEventListener('close', (event) => {
        

        if (event.wasClean) {
            console.log('The WebSocket connection with Gama Server was properly be closed');
        } else {
            console.error('The Websocket connection with Gama Server interruped suddenly');
            document.querySelector("#connection-state").innerHTML = "&#x274C; The central server disconnected ! Please refresh this page when the server came back to work"
            document.querySelector("#connection-state").style = "color:red;"
        }
        console.log(`Closure id : ${event.code}, Reason : ${event.reason}`);
    })

    socket.addEventListener('error', (error) => {
        document.querySelector("#connection-state").innerHTML = "&#x274C; The cetral server disconnected ! Please refresh this page when the server came back to work"
        document.querySelector("#connection-state").style = "color:red;"
    });
}

