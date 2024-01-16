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
        const json_state = JSON.parse(event.data)
        console.log(json_state);
        if (json_state.type == "json_state") {
            // About GAMA
            document.querySelector("#try-connection").disabled =  json_state["gama"]["connected"] ? true : false
            document.querySelector("#gama-connection-state").innerHTML = json_state["gama"]["connected"] ? "&#10004; Connected": "&#x274C; Not connected"
            document.querySelector("#gama-connection-state").style = json_state["gama"]["connected"] ? "color:green;" : "color:red;"
            document.querySelector("#gama-loader").style.visibility = json_state["gama"]["loading"] ? "visible" : "hidden";
            document.querySelector("#content-error").innerHTML = json_state.gama.content_error != "" ? "Error: " + json_state.gama.content_error.type + ", see log for more details.": ""

            //About experiment state
            if (!json_state.gama.connected) {
                document.querySelector("#simulation-launched").innerHTML = "Please start Gama Server and then click on Try Connection..."
                document.querySelector("#simulation-launched").style = "color:red;"
                document.querySelector("#start-simulation").disabled =  true
                document.querySelector("#stop-simulation").disabled =  true
                document.querySelector('#pause-simulation').disabled = true
                document.querySelector('#resume-simulation').disabled = true
                document.querySelector('#add-everyone').disabled = true
                document.querySelector('#remove-everyone').disabled = true
            }
            else {
                if (json_state.gama.experiment_state == 'NONE') {
                    document.querySelector("#simulation-launched").innerHTML = "&#x274C; Simulation not launched"
                    document.querySelector("#simulation-launched").style = "color:red;"
                    document.querySelector("#start-simulation").disabled =  false
                    document.querySelector("#stop-simulation").disabled =  true
                    document.querySelector('#pause-simulation').disabled = true
                    document.querySelector('#resume-simulation').disabled = true
                    document.querySelector('#add-everyone').disabled = true
                    document.querySelector('#remove-everyone').disabled = true
                }
                if (json_state.gama.experiment_state == 'NOTREADY') {
                    document.querySelector("#simulation-launched").innerHTML = "&#x274C; Simulation not ready"
                    document.querySelector("#simulation-launched").style = "color:red;"
                    document.querySelector("#start-simulation").disabled =  true
                    document.querySelector("#stop-simulation").disabled =  true
                    document.querySelector('#pause-simulation').disabled = true
                    document.querySelector('#resume-simulation').disabled = true
                    document.querySelector('#add-everyone').disabled = true
                    document.querySelector('#remove-everyone').disabled = true
                }
                if (json_state.gama.experiment_state == 'PAUSED') {
                    document.querySelector("#simulation-launched").innerHTML = "&#x231B;  Simulation paused"
                    document.querySelector("#simulation-launched").style = "color:orange;"
                    document.querySelector("#start-simulation").disabled =  true
                    document.querySelector("#stop-simulation").disabled =  false
                    document.querySelector('#pause-simulation').disabled = true
                    document.querySelector('#resume-simulation').disabled = false
                    document.querySelector('#add-everyone').disabled = false
                    document.querySelector('#remove-everyone').disabled = false
                }
                if (json_state.gama.experiment_state == 'RUNNING') {
                    document.querySelector("#simulation-launched").innerHTML = "&#10004; Simulation started"
                    document.querySelector("#simulation-launched").style = "color:green;"
                    document.querySelector("#start-simulation").disabled =  true
                    document.querySelector("#stop-simulation").disabled =  false
                    document.querySelector('#pause-simulation').disabled = false
                    document.querySelector('#resume-simulation').disabled = true
                    document.querySelector('#add-everyone').disabled = false
                    document.querySelector('#remove-everyone').disabled = false
                }
            }

            // About VR    
            document.querySelector("#player-container").innerHTML = ""
            for (var element in json_state.player) {
                const player_button_add_span = document.createElement('span')
                const player_button_add = document.createElement('button')
                player_button_add_span.appendChild(player_button_add)
                player_button_add.innerHTML = "Add"
                player_button_add.disabled = true
                player_button_add.classList.add("button-player-add"); 

                const player_button_remove_span = document.createElement('span')
                const player_button_remove = document.createElement('button')
                player_button_remove_span.appendChild(player_button_remove)
                player_button_remove.innerHTML = "Remove"
                player_button_remove.disabled = true
                player_button_remove.classList.add("button-player-remove");

                const player_icon_span = document.createElement('span')
                player_icon_span.classList.add('player-icon-span')

                const player_li = document.createElement('p')
                player_li.classList.add("player_li")

                const player_info_span = document.createElement('span')


                const player_info_div = document.createElement('div')
                player_info_div.classList.add("info-div")
                
                const player_id = document.createElement('li')
                const player_status = document.createElement('li')
                const player_date = document.createElement('li')
                player_id.innerHTML = "ID: <b>" + String(element) + "</b>"
                if (['RUNNING','PAUSED'].includes(json_state["gama"]["experiment_state"])) {
                    
                    if (json_state["player"][element]["in_game"]) {
                        player_button_add.disabled = true
                        player_button_remove.disabled = false
                        player_status.innerHTML = "Status: In game"
                        if (json_state["player"][element]["connected"]){
                            player_icon_span.innerHTML = "&#10004;"
                            player_icon_span.style = "color:green;"
                            player_id.style = "color:green;"
                            player_status.style = "color:green;"
                            player_date.innerHTML = "Connected at: " + json_state["player"][element]["date_connection"] 
                            player_date.style = "color:green;"
                        }
                        else {
                            player_icon_span.innerHTML = "&#x274C;"
                            player_id.style = "color:red;"
                            player_status.style = "color:red;"
                            player_date.innerHTML = "Last connection at: " + json_state["player"][element]["date_connection"] 
                            player_date.style = "color:red;"
                        }
                    }
                    else {
                        player_button_add.disabled = false
                        player_button_remove.disabled = true
                        player_status.innerHTML = "Status: Not in game"
                        if (json_state["player"][element]["connected"]){
                            player_icon_span.innerHTML = "&#x231B;"
                            player_id.style = "color:orange;"
                            player_status.style = "color:orange;"
                            player_date.innerHTML = "Connected at: " + json_state["player"][element]["date_connection"] 
                            player_date.style = "color:orange;"
                        }
                        else {
                            player_icon_span.innerHTML = "&#x274C;"
                            player_id.style = "color:red;"
                            player_status.style = "color:red;"
                            player_date.innerHTML = "Last connection at: " + json_state["player"][element]["date_connection"] 
                            player_date.style = "color:red;"
                        }
                    }
                }
                else {
                    player_button_add.disabled = true
                    player_button_remove.disabled = true
                    if (json_state["player"][element]["connected"]){
                        player_icon_span.innerHTML = "&#x231B;"
                        player_id.style = "color:orange;"
                        player_status.innerHTML = "Status: Not in game"
                        player_status.style = "color:orange;"
                        player_date.innerHTML = "Connected at: " + json_state["player"][element]["date_connection"] 
                        player_date.style = "color:orange;"
                    }
                    else {
                        player_icon_span.innerHTML = "&#x274C;"
                        player_id.style = "color:red;"
                        player_status.innerHTML = "Status: Not in game"
                        player_status.style = "color:red;"
                        player_date.innerHTML = "Last connection at: " + json_state["player"][element]["date_connection"] 
                        player_date.style = "color:red;"
                    }
                }
                
                document.querySelector("#player-container").appendChild(player_li)
                player_li.appendChild(player_button_add_span)
                player_li.appendChild(player_button_remove_span)
                player_li.appendChild(player_icon_span)
                player_li.appendChild(player_info_span)
                player_info_span.appendChild(player_info_div)
                player_info_div.appendChild(player_id)
                player_info_div.appendChild(player_status)
                player_info_div.appendChild(player_date)

                player_button_add.id_player = element
                player_button_add.addEventListener('click', () => {
                    socket.send(JSON.stringify({"type":"add_player_headset","id":player_button_add.id_player}))
                })

                player_button_remove.id_player = element
                player_button_remove.addEventListener('click', () => {
                    socket.send(JSON.stringify({"type":"remove_player_headset","id":player_button_remove.id_player}))
                })
            }
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

    document.querySelector('#pause-simulation').addEventListener('click', () => {
        socket.send(JSON.stringify({"type":"pause_experiment"}))
    })

    document.querySelector('#resume-simulation').addEventListener('click', () => {
        socket.send(JSON.stringify({"type":"resume_experiment"}))
    })

    document.querySelector("#add-everyone").addEventListener('click', () => {
        socket.send(JSON.stringify({"type":"add_every_players"}))
    })

    document.querySelector("#remove-everyone").addEventListener('click', () => {
        socket.send(JSON.stringify({"type":"remove_every_players"}))
    })

    document.querySelector("#clean-all").addEventListener('click', () => {
        socket.send(JSON.stringify({"type":"clean_all"}))
    })

    socket.addEventListener('close', (event) => {
        if (event.wasClean) {
            console.log('The WebSocket connection with Gama Server was properly be closed');
        } else {
            console.error('The Websocket connection with Gama Server interruped suddenly');
            document.querySelector("#connection-state").innerHTML = "&#x274C; The middleware disconnected ! Please refresh this page when the server came back to work"
            document.querySelector("#connection-state").style = "color:red;"
            document.querySelector(".sections").style = "display:none;"
        }
        console.log(`Closure id : ${event.code}, Reason : ${event.reason}`);
    })

    socket.addEventListener('error', (error) => {
        document.querySelector("#connection-state").innerHTML = "&#x274C; The middleware disconnected ! Please refresh this page when the server came back to work"
        document.querySelector("#connection-state").style = "color:red;"
        document.querySelector(".sections").style = "display:none;"
    });
    }

