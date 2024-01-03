const WebSocket = require('ws');

const PLAYER_WS_PORT = 8080;
const IP_ADDRESS = "192.168.0.64"
const TIME_ACTIVITY = 10*1000
const FREQUENCY_MESSAGES = 100
const LENGTH_MESSAGES = 2000

const NB_CLIENTS = 20


class Collector {
    constructor() {
        this.counter_clients_connected = 0;
        this.number_clients = NB_CLIENTS;
        for (let i = 0; i < this.number_clients; i++) {
            new Client(i, this);
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
        const fs = require('fs');
        const filePath = 'results.txt';
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
        console.log("Results:")
        console.log('Proportion of lost:', Math.round(proportionLost*100),"%");
        console.log('Average of durations:', averageDurations,"ms");
        console.log('Median of durations:', medianDurations,"ms");
    }
}

class Client {
    constructor(name, collector) {
        this.collector = collector;
        this.name = name
        this.received_messages = new Map();
        this.sent_messages = new Map();
        this.client_socket = this.create_socket();
        this.message_counter = 0;
        setTimeout(this.end.bind(this), TIME_ACTIVITY)
        this.id_timeout = setTimeout(this.send_message.bind(this), FREQUENCY_MESSAGES)
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
            client_socket.send(JSON.stringify({type:"connection", id:name}))
        };

        client_socket.onmessage = function(event) {
            var json = JSON.parse(event.data)
            
            if (json.type == "pong") {
                var id = json.id
                client.received_messages.set(id, new Date().getTime())
            }
        };
        return client_socket
    }

    send_message() {
        if (this.client_socket != undefined && this.client_socket.readyState === WebSocket.OPEN) {
            this.client_socket.send(JSON.stringify({
                "type": "ping",
                "id": this.message_counter,
                "message": 'A'.repeat(LENGTH_MESSAGES)
            }));
            this.sent_messages.set(this.message_counter, new Date().getTime())
            this.message_counter = this.message_counter + 1;
        }
        this.id_timeout = setTimeout(this.send_message.bind(this), FREQUENCY_MESSAGES);
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
        this.sent_messages.forEach((time_sent, id) => {
            const time_received = this.received_messages.get(id)
            if (time_received == undefined) {
                nb_lost = nb_lost + 1;
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
        ]));
    }
}


new Collector()