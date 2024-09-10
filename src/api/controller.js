import GamaConnector from './gama_connector.js';
import MonitorServer from './monitor-server.js';
import PlayerServer from './player-server.js';
import ModelManager from './model-manager.js';

/**
 * Creates the model of the project
 */
class Controller {
    /**
     * Instanciates all the components of the server
     */
    constructor() {
        this.choosedLearningPackageIndex = 0;
        this.modelManager = new ModelManager(this);
        this.monitor_server = new MonitorServer(this);
        this.player_server = new PlayerServer(this);
        this.gama_connector = new GamaConnector(this);
    }

    /**
     * Restarts all tVoicihe components whcih needs to be restarted
     */
    restart(){
        this.player_server.close()
        this.gama_connector.close()
        this.monitor_server.close()
        this.player_server = new PlayerServer(this);
        this.gama_connector = new GamaConnector(this);
        this.monitor_server = new MonitorServer(this);  
    }

    /**
     * Changes the json_settings, then restart the player server, the gama connector, the monitor server
     * @param {JSON} json_settings - The new json
     */
    changeJsonSettings(json_settings){
        this.model.setJsonSettings(json_settings)
    }

     /**
     * get simulations infos, appeler model-manager pas le model directement
     * @returns {JSON} - The json of the simulation
     * tester l'appel de la méthode 
     *   
     */
     getSimulationInformations(){
        return this.modelManager.getModelListJSON();
    }

    getPlayerList(){ 
        return this.modelManager.getListPlayers();
    }

    /**
     * Sends to the monitor the updated json_state
     */
    notifyMonitor() {
        this.monitor_server.sendMonitorJsonState();
    }
    /**
     * Sends a message to a player containing json_player whan a change about him occured.
     * @param {int} id_player - The is of the player that needs to be informed
     * @param {JSON} json_player - The new json_player to be sent
     */

    notifyPlayerChange(id_player, json_player) {
        this.player_server.notifyPlayerChange(id_player, json_player)
    }

    /**
     * Sends to the correct player a the new json of its updated information
     * @param {JSON} json_output - The new updated json of the player
     */
    broadcastSimulationOutput(json_output) {
        this.player_server.broadcastSimulationOutput(json_output)
    }

    /**
     * Removes every players wich are authenticated
     */
    removeInGameEveryPlayers() {
        this.gama_connector.removeInGameEveryPlayers();
    }

    /**
     * Add every connected but not authenticated players to the simulation
     */
    addInGameEveryPlayers() {
        this.gama_connector.addInGameEveryPlayers();
    }

    /**
     * Adds a new player to the simulation
     * @param {String} id_player - The id of the player
     */
    addInGamePlayer(id_player) {
        this.gama_connector.addInGamePlayer(id_player);
    }

    /**
     * Removes a new player to the simulation
     * @param {String} id_player - The id of the player
     */
    removeInGamePlayer(id_player) {
        this.gama_connector.removeInGamePlayer(id_player);
    }

    /**
     * Cleans from the display all the players that are disconnected and not in game
     */
    cleanAll() {
        this.player_server.cleanAll();
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

// module.exports = Controller;
export default Controller;
