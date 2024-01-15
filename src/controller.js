const ConnectorGamaServer = require('./gama_server.js');
const MonitorServer = require('./monitor_server.js');
const PlayerServer = require('./player_server.js');
const App = require('./app.js');
const fs = require('fs');

/**
 * Creates the model of the project
 */
class Controller {
    /**
     * Instanciates all the components of the server
     */
    constructor() {
        this.json_state = JSON.parse(fs.readFileSync('src/json_state.json', 'utf-8'));
        this.json_settings = JSON.parse(fs.readFileSync('settings.json', 'utf-8'));
        this.json_simulation = {};
        this.monitor_server = new MonitorServer(this);
        this.player_server = new PlayerServer(this);
        this.app = new App(this);
        this.gama_connector = new ConnectorGamaServer(this);
        console.log('-> Gama Server Middleware launched sucessfully');
        console.log('Note: Refresh the webpage localhost:'+this.json_settings.app_port+' if the connection failed');
    }

    /**
     * Restarts all the components whcih needs to be restarted
     */
    restart(){
        this.player_server.close()
        this.gama_connector.close()
        this.monitor_server.close()
        this.player_server = new PlayerServer(this);
        this.gama_connector = new ConnectorGamaServer(this);
        this.monitor_server = new MonitorServer(this);
    }

    /**
     * Changes the json_settings
     * @param {JSON} json_settings - The new json
     */
    changeJsonSettings(json_settings){
        this.json_settings = json_settings
        fs.writeFileSync('settings.json', JSON.stringify(json_settings,null, 2), 'utf-8')
        this.restart()
    }

    /**
     * Sends the json_settings to the monitor
     */
    sendJsonSettings() {
        this.monitor_server.sendMonitorJsonSettings();
    }

    /**
     * Sends to both the monitor and the players the json_state
     */
    notifyMonitor() {
        this.monitor_server.sendMonitorJsonState();
        this.player_server.broadcastJsonStatePlayer();
    }

    /**
     * Sends to both the monitor and the players the json_simulation
     */
    notifyPlayerClients() {
        this.player_server.broadcastSimulationPlayer()
    }

    /**
     * Removes every players wich are authenticated
     */
    removeEveryPlayers() {
        this.gama_connector.removeEveryPlayers();
    }

    unauthentifyEveryPlayers() {
        this.player_server.unauthentifyEveryPlayers();
    }

    /**
     * Add every connected but not authenticated players to the simulation
     */
    addEveryPlayers() {
        this.gama_connector.addEveryPlayers();
    }

    /**
     * Adds a new player to the simulation
     * @param {String} id_player - The id of the player
     */
    addPlayer(id_player) {
        this.gama_connector.addPlayer(id_player);
    }

    /**
     * Removes a new player to the simulation
     * @param {String} id_player - The id of the player
     */
    removePlayer(id_player) {
        this.gama_connector.removePlayer(id_player);
    }

    clean_all() {
        this.player_server.clean_all();
    }

    /**
     * Sends an expression for a certain player
     * @param {String} id_player - The id of the player to apply this expression
     * @param {String} expr - The expression. If this expression contains $id, it will be replaced by the id of the player wich asked the method
     * @returns 
     */
    sendExpression(id_player, expr) {
        this.gama_connector.sendExpression(id_player,expr);
    }

    /**
     * Sends an ask to Gama Server
     * @param {JSON} json - The ask
     * @returns 
     */
    sendAsk(json) {
        this.gama_connector.sendAsk(json)
    }

    /**
     * Cf GamaConnector
     */
    launchExperiment() {
        this.gama_connector.launchExperiment();
    }

    /**
     * Cf GamaConnector
     */
    stopExperiment() {
        this.gama_connector.stopExperiment();
    }

    /**
     * Cf GamaConnector
     */
    pauseExperiment() {
        this.gama_connector.pauseExperiment();
    }

    /**
     * Cf GamaConnector
     */
    resumeExperiment() {
        this.gama_connector.resumeExperiment();
    }

    /**
     * Cf GamaConnector
     */
    connectGama() {
        this.gama_connector.connectGama();
    }

}

module.exports = Controller;