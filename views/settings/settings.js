const hostname = window.location.hostname;


document.addEventListener("DOMContentLoaded", function() {

    fetch('/getWsMonitorPort')
      .then(response => response.json())
      .then(data => {
        createWebSocket(data.monitor_ws_port)
      });

});

  
function createWebSocket(monitor_ws_port) {
    const jsonForm = document.getElementById("json-form");
    const hostname = window.location.hostname;
    const socket = new WebSocket('ws://'+hostname+':'+monitor_ws_port);

    socket.onopen = function() {
    };

    socket.onmessage = function(event){
        const json_settings = JSON.parse(event.data)
        if (json_settings.type == "json_settings") {
            const jsonDisplay = document.getElementById("json-form");
            jsonDisplay.elements.gama_ws_port.value = json_settings.gama_ws_port;
            jsonDisplay.elements.monitor_ws_port.value = json_settings.monitor_ws_port;
            jsonDisplay.elements.player_ws_port.value = json_settings.player_ws_port;
            jsonDisplay.elements.app_port.value = json_settings.app_port;
            jsonDisplay.elements.model_file_path.value = json_settings.model_file_path;
            jsonDisplay.elements.player_web_interface.checked = json_settings.player_web_interface
            jsonDisplay.elements.player_html_file.value = json_settings.player_html_file;
            jsonDisplay.elements.experiment_name.value = json_settings.experiment_name;
            jsonDisplay.elements.ip_address_gama_server.value = json_settings.ip_address_gama_server;
            jsonDisplay.elements.model_file_path_type.value = json_settings.type_model_file_path == "absolute" ? "Absolute" : "Relative"
            jsonDisplay.elements.enable_verbose.checked = json_settings.verbose;
        }
        const player_web_interface = document.querySelector("#player-web-interface")
        document.getElementById("player-html-file-label").style = player_web_interface.checked ? "color: black;" : "color: #C5C5C5;";
        document.getElementById("player-html-file-input").disabled = !player_web_interface.checked;
    }

    jsonForm.addEventListener("submit", function(event) {
        event.preventDefault();
        const type_path = document.getElementById("model-file-path-type").value == "Absolute" ? "absolute" : "relative"
        const gama_ws_port = parseInt(document.getElementById("gama-ws-port").value)
        const monitor_ws_port = parseInt(document.getElementById("monitor-ws-port").value)
        const player_ws_port = parseInt(document.getElementById("player-ws-port").value)
        const app_port = parseInt(document.getElementById("app-port").value)
        // Update JSON data with form values
        if (gama_ws_port > 0 && monitor_ws_port > 0 && player_ws_port > 0 && app_port > 0) {
            json_settings = {
                type:"json_settings",
                gama_ws_port: gama_ws_port,
                monitor_ws_port: monitor_ws_port,
                player_ws_port: player_ws_port,
                app_port: app_port,
                model_file_path: document.getElementById("model-file-path").value,
                experiment_name: document.getElementById("experiment-name").value,
                ip_address_gama_server: document.getElementById("ip-address-gama-server").value,
                player_web_interface: document.getElementById("player-web-interface").checked,
                player_html_file: document.getElementById("player-html-file-input").value,
                type_model_file_path: type_path,
                verbose: document.getElementById("enable-verbose").checked
            };
            console.log(json_settings);
            // Display updated JSON data
            socket.send(JSON.stringify(json_settings))
            // Redirigez l'utilisateur vers la page /settings
            window.location.href = "/settings";
        }
        else {
            alert('Please enter valid port numbers');
        }
    });

    socket.addEventListener('close', (event) => {
        if (event.wasClean) {
            console.log('The WebSocket connection with Gama Server was properly be closed');
        } else {
            console.error('The Websocket connection with Gama Server interruped suddenly');
            document.querySelector("#connection-state").innerHTML = "&#x274C; The cetral server disconnected ! Please refresh this page when the server came back to work"
            document.querySelector("#connection-state").style = "color:red;"
            document.querySelector(".container").style = "display:none;"
        }
        console.log(`Closure id : ${event.code}, Reason : ${event.reason}`);
    })
    
    socket.addEventListener('error', (error) => {
        document.querySelector("#connection-state").innerHTML = "&#x274C; The cetral server disconnected ! Please refresh this page when the server came back to work"
        document.querySelector("#connection-state").style = "color:red;"
        document.querySelector(".container").style = "display:none;"
    });

    const player_web_interface = document.querySelector("#player-web-interface")
    player_web_interface.addEventListener("change", function() {
        document.getElementById("player-html-file-label").style = player_web_interface.checked ? "color: black;" : "color: #C5C5C5;";
        document.getElementById("player-html-file-input").disabled = !player_web_interface.checked;
    });
}
