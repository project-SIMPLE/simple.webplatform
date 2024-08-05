const fs = require('fs');
const path = require('path');

class Model {

    /**
     * Creates the model
     * @param {Controller} controller - The controller of the server project
     * @param {string} settingsPath
     */

    constructor(controller, settingsPath) {
        this.controller = controller
        this.jsonGama = {
            connected:false,
            experiment_state:"NONE",
            loading:false,
            content_error:"",
            experiment_id:"",
            experiment_name:""
        }
        this.jsonPlayers = {}
        this.jsonSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        this.modelFilePath = path.join(path.dirname(settingsPath),this.jsonSettings.model_file_path);
    }

    // Getter all

    getAll() {
        return {
            type:"json_state",
            gama: this.jsonGama,
            player : this.jsonPlayers
        }
    }

    // GAMA

    getGama() {
        return this.jsonGama
    }

    setGamaConnection(connected) {
        this.jsonGama.connected = connected
        this.controller.notifyMonitor()
    }

    setGamaExperimentState(experimentState) {
        this.jsonGama.experiment_state = experimentState
        this.controller.notifyMonitor()
    }

    setGamaLoading(loading) {
        this.jsonGama.loading = loading
        this.controller.notifyMonitor()
    }

    setGamaContentError(contentError) {
        this.jsonGama.content_error = contentError
        this.controller.notifyMonitor()
    }

    setGamaExperimentId(experimentId) {
        this.jsonGama.experiment_id = experimentId
    }

    setGamaExperimentName(experimentName) {
        this.jsonGama.experiment_name = experimentName
        this.controller.notifyMonitor()
    }

    // Players

    getAllPlayers() {
        return this.jsonPlayers
    }

    getPlayerState(idPlayer) {
        return this.jsonPlayers[idPlayer]
    }

    insertPlayer(idPlayer) {
        this.jsonPlayers[idPlayer] = {
            connected : false,
            in_game : false,
            date_connection : ""
        }
        this.controller.notifyMonitor()
    }

    withdrawPlayer(idPlayer) {
        this.jsonPlayers[idPlayer] = undefined
        this.controller.notifyMonitor()
    }

    setPlayerConnection(idPlayer, connected) {
        this.jsonPlayers[idPlayer].connected = connected
        this.jsonPlayers[idPlayer].date_connection = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`
        this.controller.notifyPlayerChange(idPlayer, this.jsonPlayers[idPlayer])
        this.controller.notifyMonitor()
    }

    setPlayerInGame(idPlayer, inGame) {
        this.jsonPlayers[idPlayer].in_game = inGame
        this.controller.notifyPlayerChange(idPlayer, this.jsonPlayers[idPlayer])
        this.controller.notifyMonitor()
    }

    setRemoveInGameEveryPlayers() {
        for (let idPlayer in this.jsonPlayers) {
            if (this.jsonPlayers[idPlayer] !== undefined) {
                this.jsonPlayers[idPlayer].in_game = false
                this.controller.notifyPlayerChange(idPlayer, this.jsonPlayers[idPlayer])
            }
        }
        this.controller.notifyMonitor()
    }

    //Settings

    getModelFilePath() {
        return this.modelFilePath;
    }

    getJsonSettings() {
        return this.jsonSettings
    }

    /**
     * Changes the json_settings
     * @param {JSON} jsonSettings - The new json
     */
    setJsonSettings(jsonSettings){
        this.jsonSettings = jsonSettings
        fs.writeFileSync('settings.json', JSON.stringify(jsonSettings,null, 2), 'utf-8')
        this.controller.restart()
    }
}

module.exports = Model;