const WebSocket = require('ws');
const fs = require('fs');

const PLAYER_WS_PORT = 8080;
const IP_ADDRESS = "192.168.0.64"
const TIME_ACTIVITY = 5*1000
const STAGGERED = false;

const NB_MEASUREMENTS = 15

function logList(start, end, steps) {
    const result = [];
    
    for (let i = 0; i <= steps; i++) {
      const value = Math.pow(10, start + i * (end - start) / steps);
      result.push(value);
    }
    
    return result;
  }

class Measurer {
    constructor() {
        this.loglist = logList(0,9,NB_MEASUREMENTS)
        this.results = []
        this.counter = 0;
        this.continue_measure()
    }

    add_result(map) {
        this.results.push(map);
        if (this.counter == NB_MEASUREMENTS) this.conclude()
        else this.continue_measure()
    }

    continue_measure() {
        new Collector(this, 2,100,Math.floor(this.loglist[this.counter]));
        this.counter++;
    }

    conclude() {
        // Convertir l'objet JSON en chaîne
        const jsonString = JSON.stringify(this.results, null, 2); // Le paramètre '2' indique l'indentation de 2 espaces pour une meilleure lisibilité
        console.log(jsonString);
        // Enregistrer la chaîne JSON dans un fichier
        fs.writeFile('results_measurer.json', jsonString, 'utf-8', (err) => {
        if (err) {
            console.error('Erreur lors de l\'enregistrement du fichier :', err);
            }
        });
    }
}


class Collector {
    constructor(measurer, nb_clients, frequency_messages, length_messages) {
        this.measurer = measurer;
        this.FREQUENCY_MESSAGES = frequency_messages;
        this.LENGTH_MESSAGES = length_messages;
        this.NB_CLIENTS = nb_clients;
        this.counter_clients_connected = 0;
        this.number_clients = this.NB_CLIENTS;
        var delay = 0
        for (let i = 0; i < this.number_clients; i++) {
            if (STAGGERED) new Client(i, this, delay);
            else new Client(i, this, 0);
            delay = delay + this.FREQUENCY_MESSAGES/this.NB_CLIENTS
        }
        this.results = []
        console.log("Please wait",Math.floor(TIME_ACTIVITY/1000),"seconds...");
        setTimeout(this.analyse_results.bind(this), TIME_ACTIVITY+2000)
    }

    add_result(map_results) {
        this.results.push(map_results)
    }
    analyse_results() {
        // Initialize variables for aggregations
        let totalLost = 0;
        let totalSuccess = 0;
        let durations = [];

        // Aggregate results from the Maps
        this.results.forEach(map => {
            totalLost += map.get('nb_lost');
            totalSuccess += map.get('nb_success');
            durations = durations.concat(map.get('durations'));
        });
        // Calculate the proportion of lost
        let proportionLost = totalLost / (totalLost + totalSuccess);

        // Calculate the average of durations
        let averageDurations = durations.reduce((acc, value) => acc + value, 0) / durations.length;

        //Printing durations
        const filePath = 'results_collector.txt';
        const contentText = JSON.stringify(durations);
        fs.writeFile(filePath, contentText, (err) => {
            if (!err) {
                console.log('Content successfully saved to the file');
            }
        });

        // Calculate the median of durations
        durations.sort((a, b) => a - b);
        let medianDurations = 0;

        if (durations.length % 2 === 0) {
            // If the length is even, take the average of the two middle values
            medianDurations = (durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2;
        } else {
            // If the length is odd, take the middle value
            medianDurations = durations[Math.floor(durations.length / 2)];
        }
        // Display the results
        const flow_messages = 1000/this.FREQUENCY_MESSAGES*this.NB_CLIENTS
        console.log("Results:")
        console.log("Length messages", this.LENGTH_MESSAGES,"char");
        console.log("Flow messages:", flow_messages,"msg/s");
        console.log('Proportion of lost:', Math.round(proportionLost*100),"%","("+totalLost+"/"+(totalLost + totalSuccess)+")");
        console.log('Average of durations:', averageDurations,"ms");
        console.log('Median of durations:', medianDurations,"ms");

        //console.log(this.results);
        this.measurer.add_result({
            length_messages: this.LENGTH_MESSAGES,
            flow_messages: flow_messages,
            nb_lost: totalLost,
            nb_success: totalSuccess,
            avg_durations: averageDurations,
            med_durations: medianDurations
        });
    }
}

class Client {
    constructor(name, collector, delay) {
        this.collector = collector;
        this.name = name
        this.received_messages = new Map();
        this.sent_messages = new Map();
        this.client_socket = this.create_socket();
        this.message_counter = 0;
        setTimeout(this.end.bind(this), TIME_ACTIVITY + delay)
        this.id_timeout = setTimeout(this.send_message.bind(this), this.collector.FREQUENCY_MESSAGES + delay)
    }

    create_socket() {
        const client_socket = new WebSocket("ws://"+IP_ADDRESS+":"+PLAYER_WS_PORT);
        const name = this.name;
        const client = this;
        client_socket.onopen = function() {
            client.collector.counter_clients_connected = client.collector.counter_clients_connected + 1;
            if (client.collector.counter_clients_connected == client.collector.number_clients) {
                console.log("-> All the clients are connected");
            }
            client_socket.send(JSON.stringify({type:"connection", id:"P"+name}))
        };

        client_socket.onmessage = function(event) {
            var json = JSON.parse(event.data)

            if (json.type == "json_simulation") {
                var id = parseInt(json.contents.id_message)
                client.received_messages.set(id, new Date().getTime())
            }
            
            if (json.type == "pong") {
                var id = json.id
                client.received_messages.set(id, new Date().getTime())
            }
        };
        return client_socket
    }

    send_message() {
        if (this.client_socket != undefined && this.client_socket.readyState === WebSocket.OPEN) {

            //To send to test the connection with GAMA
            //this.client_socket.send(JSON.stringify({
            //    "type": "ping",
            //    "id": this.message_counter,
            //    "message": 'A'.repeat(this.collector.LENGTH_MESSAGES)
            //}));


            
            // To send to test the connection with the middleware
            this.client_socket.send(JSON.stringify({
                "type": "expression",
                "expr": "do reply($id,\""+this.message_counter+"\",\""+'A'.repeat(this.collector.LENGTH_MESSAGES)+"\");"
            }));
            this.sent_messages.set(this.message_counter, new Date().getTime())
            this.message_counter = this.message_counter + 1;
        }
        this.id_timeout = setTimeout(this.send_message.bind(this), this.collector.FREQUENCY_MESSAGES);
    }

    end() {
        clearTimeout(this.id_timeout)
        setTimeout(this.close.bind(this),1000)
    }

    close() {
        this.client_socket.close()
        this.calculate_results()
    }

    calculate_results() {
        var nb_lost = 0;
        var nb_sucess = 0;
        const delta_time = []
        const id_message_lost = []
        this.sent_messages.forEach((time_sent, id) => {
            const time_received = this.received_messages.get(id)
            if (time_received == undefined) {
                nb_lost = nb_lost + 1;
                id_message_lost.push(id)
            }
            else {
                nb_sucess = nb_sucess + 1
                delta_time.push(time_received-time_sent)
            }
        })
        this.collector.add_result(new Map([
            ['nb_lost', nb_lost],
            ['nb_success', nb_sucess],
            ['durations', delta_time],
            ['id_message_lost', id_message_lost]
        ]));
    }
}


new Measurer()