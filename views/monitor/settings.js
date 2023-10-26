const monitorLink = document.getElementById("monitor-link");
    monitorLink.addEventListener("click", function(event) {
        event.preventDefault();
        // Redirigez l'utilisateur vers la page /monitor
        window.location.href = "/monitor";
    });

// Ajoutez un gestionnaire d'événements pour le lien "Settings"
const settingsLink = document.getElementById("settings-link");
settingsLink.addEventListener("click", function(event) {
    event.preventDefault();
    // Redirigez l'utilisateur vers la page /settings
    window.location.href = "/settings";
});

const helpLink = document.getElementById("help-link");
helpLink.addEventListener("click", function(event) {
    event.preventDefault();
    // Redirigez l'utilisateur vers la page /help
    window.location.href = "/help";
});

document.addEventListener("DOMContentLoaded", function() {
    const jsonForm = document.getElementById("json-form");

    const hostname = window.location.hostname;
    const socket = new WebSocket('ws://'+hostname+':80');

    socket.onopen = function() {
    };

    socket.onmessage = function(event){
        const json_state = JSON.parse(event.data)
        if (json_state.type == "json_setting") {
            const jsonDisplay = document.getElementById("json-display");
            jsonDisplay.textContent = JSON.stringify(jsonData, null, 2);
        }
    }

    jsonForm.addEventListener("submit", function(event) {
        event.preventDefault();

        // Update JSON data with form values
        jsonData = {
            type:"json_setting",
            gama_ws_port: parseInt(document.getElementById("gama-ws-port").value),
            monitor_ws_port: parseInt(document.getElementById("monitor-ws-port").value),
            vr_ws_port: parseInt(document.getElementById("vr-ws-port").value),
            app_port: parseInt(document.getElementById("app-port").value),
            model_file_relative: document.getElementById("model-file-relative").value,
            model_file_absolute: document.getElementById("model-file-absolute").value,
            ip_address_gama_server: document.getElementById("ip-address-gama-server").value
        };

        // Display updated JSON data
        jsonDisplay.textContent = JSON.stringify(jsonData, null, 2);
        socket.send(JSON.stringify(jsonData))
    });
});
