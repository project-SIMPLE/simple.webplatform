const fs = require('fs');

class Model {

    /**
     * Creates the model
     * @param {Controller} controller - The controller of the server project
     */

    constructor(controller) {
        this.controller = controller
        this.json_gama = {  
            connected:false,
            experiment_state:"NONE",
            loading:false,
            content_error:"",
            experiment_id:"",
            experiment_name:""
        }
        this.json_players = {}
        this.json_settings = JSON.parse(fs.readFileSync('settings.json', 'utf-8'));
    }

    // Getter all

    getAll() {
        return {
            type:"json_state",
            gama: this.json_gama,
            player : this.json_players
        }
    }

    // GAMA

    getGama() {
        return this.json_gama
    }

    setGamaConnection(connected) {
        this.json_gama.connected = connected
        this.controller.notifyMonitor()
    }

    setGamaExperimentState(experiment_state) {
        this.json_gama.experiment_state = experiment_state
        this.controller.notifyMonitor()
    }

    setGamaLoading(loading) {
        this.json_gama.loading = loading
        this.controller.notifyMonitor()
    }

    setGamaContentError(content_error) {
        this.json_gama.content_error = content_error
        this.controller.notifyMonitor()
    }

    setGamaExperimentId(experiment_id) {
        this.json_gama.experiment_id = experiment_id
    }

    setGamaExperimentName(experiment_name) {
        this.json_gama.experiment_name = experiment_name
        this.controller.notifyMonitor()
    }

    // Players

    getAllPlayers() {
        return this.json_players
    }

    getPlayerState(id_player) {
        return this.json_players[id_player]
    }

    insertPlayer(id_player) {
        this.json_players[id_player] = {
            connected : false,
            in_game : false,
            date_connection : ""
        }
        this.controller.notifyMonitor()
    }

    withdrawPlayer(id_player) {
        this.json_players[id_player] = undefined
        this.controller.notifyMonitor()
    }

    setPlayerConnection(id_player, connected) {
        this.json_players[id_player].connected = connected
        this.json_players[id_player].date_connection = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`
        this.controller.notifyPlayerChange(id_player, this.json_players[id_player])
        this.controller.notifyMonitor()
    }

    setPlayerInGame(id_player, in_game) {
        this.json_players[id_player].in_game = in_game
        this.controller.notifyPlayerChange(id_player, this.json_players[id_player])
        this.controller.notifyMonitor()
    }

    setRemoveInGameEveryPlayers() {
        for (var id_player in this.json_players) {
            if (this.json_players[id_player] != undefined) {
                this.json_players[id_player].in_game = false
                this.controller.notifyPlayerChange(id_player, this.json_players[id_player])
            }
        }
        this.controller.notifyMonitor()
    }

    //Settings

    getJsonSettings() {
        return this.json_settings
    }

    /**
     * Changes the json_settings
     * @param {JSON} json_settings - The new json
     */
    setJsonSettings(json_settings){
        this.json_settings = json_settings
        fs.writeFileSync('settings.json', JSON.stringify(json_settings,null, 2), 'utf-8')
        this.controller.restart()
    }

    /**
     * Sends the json_settings to the monitor
     */
    sendJsonSettings() {
        this.monitor_server.sendMonitorJsonSettings();
    }
}

module.exports = Model;