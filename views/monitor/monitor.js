const hostname = window.location.hostname;

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

const socket = new WebSocket('ws://'+hostname+':80');

socket.onopen = function() {
    
};

socket.onmessage = function(event){
    const json_state = JSON.parse(event.data)
    if (json_state.type == "json_state") {

        // About GAMA
        document.querySelector("#try-connection").disabled =  json_state["gama"]["connected"] ? true : false
        document.querySelector("#gama-connection-state").innerHTML = json_state["gama"]["connected"] ? "&#10004; Connected": "&#x274C; Not connected"
        document.querySelector("#gama-connection-state").style = json_state["gama"]["connected"] ? "color:green;" : "color:red;"
        document.querySelector("#simulation-launched").innerHTML = json_state["gama"]["launched_experiment"] ? "&#10004; Simulation launched": "&#x274C; The simulation is not launched"
        document.querySelector("#simulation-launched").style = json_state["gama"]["launched_experiment"] ? "color:green;": "color:red;"
        document.querySelector("#gama-loader").style.visibility = json_state["gama"]["loading"] ? "visible" : "hidden";
        document.querySelector("#start-simulation").disabled =  json_state["gama"]["connected"]&& !json_state["gama"]["launched_experiment"]  ? false : true
        document.querySelector("#stop-simulation").disabled =  json_state["gama"]["connected"] &&  json_state["gama"]["launched_experiment"] ? false : true

        // About VR    
        document.querySelector("#vr-container").innerHTML = ""
        json_state["vr"]["id_connected"].forEach(element => {
            const vr_button_add_span = document.createElement('span')
            const vr_button_add = document.createElement('button')
            vr_button_add_span.appendChild(vr_button_add)
            vr_button_add.innerHTML = "Add"
            vr_button_add.disabled = true
            const vr_button_remove_span = document.createElement('span')
            const vr_button_remove = document.createElement('button')
            vr_button_remove_span.appendChild(vr_button_remove)
            vr_button_remove.innerHTML = "Remove"
            vr_button_remove.disabled = true
            const vr_li = document.createElement('p')
            vr_li.classList.add("vr_li")
            const vr_id = document.createElement('span')
            vr_id.classList.add("vr_id")
            const date_vr = document.createElement('span')
            date_vr.classList.add("date_vr")
            vr_button_add.classList.add("button-vr-add"); // Ajoutez une classe "button-add" au bouton "Add"
            vr_button_remove.classList.add("button-vr-remove");
            if (json_state["vr"][element]["state"] == "connected") {
                if (json_state["vr"][element]["authentified"] == false) {
                    vr_id.innerHTML = "   ID: "+ String(element)
                    vr_li.style = "color:orange;"
                    date_vr.innerHTML = " - Connected at: " + json_state["vr"][element]["date_connection"] + " - Status: Unauthentified"
                    if (json_state["gama"]["launched_experiment"] == true) {
                        vr_button_add.disabled = false
                        vr_button_remove.disabled = true
                    }
                }
                else {
                    vr_id.innerHTML = "   &#10004; ID: "+ String(element)
                    vr_li.style = "color:green;"
                    date_vr.innerHTML = " - Connected at: " + json_state["vr"][element]["date_connection"] + " - Status: Authentified"
                    if (json_state["gama"]["launched_experiment"] == true) {
                        vr_button_add.disabled = true
                        vr_button_remove.disabled = false
                    }
                }
            }

            else if (json_state["vr"][element]["state"] == "unconnected") {
                vr_id.innerHTML = "   &#x274C; ID: "+ String(element)
                vr_li.style = "color:red;"
                if (json_state.vr[element].authentified == true) {
                    date_vr.innerHTML = " - Last connection at: " + json_state["vr"][element]["date_connection"] + " - Status: Authentified"
                    vr_button_add.disabled = true
                    vr_button_remove.disabled = false
                }
                else {
                    date_vr.innerHTML = " - Last connection at: " + json_state["vr"][element]["date_connection"] + " - Status: Unauthentified"
                    vr_button_add.disabled = false
                    vr_button_remove.disabled = true
                }
                
            }
            
            document.querySelector("#vr-container").appendChild(vr_li)
            vr_li.appendChild(vr_button_add_span)
            vr_li.appendChild(vr_button_remove_span)
            vr_li.appendChild(vr_id)
            vr_li.appendChild(date_vr)

            vr_button_add.addEventListener('click', () => {
                socket.send(JSON.stringify({"type":"add_vr_headset","id":element}))
            })

            vr_button_remove.addEventListener('click', () => {
                socket.send(JSON.stringify({"type":"remove_vr_headset","id":element}))
            })
        });
    }
}

document.querySelector("#try-connection").addEventListener('click', () => {
    socket.send(JSON.stringify({"type":"try_connection"}))
})

document.querySelector("#start-simulation").addEventListener('click', () => {
    socket.send(JSON.stringify({"type":"launch_experiment"}))
})

document.querySelector("#stop-simulation").addEventListener('click', () => {
    socket.send(JSON.stringify({"type":"stop_experiment"}))
})

socket.addEventListener('close', (event) => {
    document.querySelector("#connection-state").innerHTML = "&#x274C; The central server disconnected ! Please refresh this page when the server came back to work"
    document.querySelector("#connection-state").style = "color:red;"
    document.querySelector("#main-display").style.display = "none"

    if (event.wasClean) {
        console.log('The WebSocket connection with Gama Server was properly be closed');
    } else {
        console.error('The Websocket connection with Gama Server interruped suddenly');
    }
    console.log(`Closure id : ${event.code}, Reason : ${event.reason}`);
})

socket.addEventListener('error', (error) => {
    document.querySelector("#connection-state").innerHTML = "&#x274C; The cetral server disconnected ! Please refresh this page when the server came back to work"
    document.querySelector("#connection-state").style = "color:red;"
    document.querySelector("#main-display").style.display = "none"
});

