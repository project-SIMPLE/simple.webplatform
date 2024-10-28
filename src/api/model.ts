import fs from 'fs';
import path from 'path';

export interface PlayerState {
    connected: boolean;
    in_game: boolean;
    date_connection: string;
}

interface JsonSettings {
    model_file_path: string;
    experiment_name: string;
}

class Model {
    controller: any;
    jsonPlayers: Record<string, PlayerState>;
    jsonSettings: JsonSettings;
    modelFilePath: string;

    /**
     * Creates the model
     * @param {any} controller - The controller of the server project
     * @param {string} settingsPath - Path to the settings file
     */
    constructor(controller: any, settingsPath: string) {
        this.controller = controller;
        this.jsonPlayers = {};
        this.jsonSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as JsonSettings;
        this.modelFilePath = path.join(path.dirname(settingsPath), this.jsonSettings.model_file_path);
    }

    /**
     * Converts the model to a JSON format
     * @returns {object} - The JSON representation of the model
     */
    toJSON() {
        return {
            type: "json_simulation_list",
            jsonSettings: this.jsonSettings,
            modelFilePath: this.modelFilePath
        };
    }

    /**
     * Gets the complete state of the model
     * @returns {object} - The state of the model
     */
    getAll() {
        return {
            type: "json_state",
            gama: this.controller.gama_connector.getJsonGama(),
            player: this.jsonPlayers
        };
    }

    // Players

    /**
     * Gets all players
     * @returns {Record<string, PlayerState>} - A record of all players
     */
    getAllPlayers(): Record<string, PlayerState> {
        return this.jsonPlayers;
    }

    /**
     * Gets the state of a specific player
     * @param {string} idPlayer - Player ID
     * @returns {PlayerState} - The state of the player
     */
    getPlayerState(idPlayer: string): PlayerState {
        return this.jsonPlayers[idPlayer];
    }

    /**
     * Inserts a new player
     * @param {string} idPlayer - Player ID
     */
    insertPlayer(idPlayer: string) {
        this.jsonPlayers[idPlayer] = {
            connected: false,
            in_game: false,
            date_connection: ""
        };
        this.controller.notifyMonitor();
    }

    /**
     * Withdraws a player
     * @param {string} idPlayer - Player ID
     */
    withdrawPlayer(idPlayer: string) {
        delete this.jsonPlayers[idPlayer];
        this.controller.notifyMonitor();
    }

    /**
     * Sets the connection state of a player
     * @param {string} idPlayer - Player ID
     * @param {boolean} connected - Connection status
     */
    setPlayerConnection(idPlayer: string, connected: boolean) {
        this.jsonPlayers[idPlayer].connected = connected;
        this.jsonPlayers[idPlayer].date_connection = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`;
        this.controller.notifyPlayerChange(idPlayer, this.jsonPlayers[idPlayer]);
        this.controller.notifyMonitor();
    }

    /**
     * Sets the in-game status of a player
     * @param {string} idPlayer - Player ID
     * @param {boolean} inGame - In-game status
     */
    setPlayerInGame(idPlayer: string, inGame: boolean) {
        this.jsonPlayers[idPlayer].in_game = inGame;
        this.controller.notifyPlayerChange(idPlayer, this.jsonPlayers[idPlayer]);
        this.controller.notifyMonitor();
    }

    /**
     * Sets all players' in-game status to false
     */
    setRemoveInGameEveryPlayers() {
        for (let idPlayer in this.jsonPlayers) {
            if (this.jsonPlayers[idPlayer] !== undefined) {
                this.jsonPlayers[idPlayer].in_game = false;
                this.controller.notifyPlayerChange(idPlayer, this.jsonPlayers[idPlayer]);
            }
        }
        this.controller.notifyMonitor();
    }

    // Settings

    /**
     * Gets the model file path
     * @returns {string} - The path to the model file
     */
    getModelFilePath(): string {
        return this.modelFilePath;
    }

    /**
     * Gets the experiment name
     * @returns {string} - The name of the experiment
     */
    getExperimentName(): string {
        return this.jsonSettings.experiment_name;
    }

    /**
     * Gets the JSON settings
     * @returns {JsonSettings} - The JSON settings
     */
    getJsonSettings(): JsonSettings {
        return this.jsonSettings;
    }

    /**
     * Changes the JSON settings
     * @param {JsonSettings} jsonSettings - The new JSON settings
     */
    setJsonSettings(jsonSettings: JsonSettings) {
        this.jsonSettings = jsonSettings;
        fs.writeFileSync('settings.json', JSON.stringify(jsonSettings, null, 2), 'utf-8');
        this.controller.restart();
    }
}

export default Model;
