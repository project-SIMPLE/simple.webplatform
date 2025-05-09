import fs from 'fs';
import path from 'path';
import { JsonSettings, ANSI_COLORS as color } from "./constants.ts";
interface Settings {
    type: "json_settings";
    model_file_path: string;
    name: string;
}
class Model {
    readonly #jsonSettings: JsonSettings;
    readonly #modelFilePath: string;

    /**
     * Creates the model
     * @param {any} controller - The controller of the server project
     * @param {string} settingsPath - Path to the settings file
     * @param {string} modelFilePath - an optionnnal parameter, if not present, the function defaults to searching for the path the old way
     */
    constructor(settingsPath: string, jsonSettings: string) {
        this.#jsonSettings = JSON.parse(jsonSettings);
        //if the path is relative, we rebuild it using the path of the settings.json it is found in
        const modelFilePath = this.#jsonSettings.model_file_path
        if (!path.isAbsolute(modelFilePath)) {
            this.#modelFilePath = modelFilePath;
        } else {
            this.#modelFilePath = path.join(path.dirname(settingsPath), this.#jsonSettings.model_file_path);
            
        }
    }

    // Getters

    /**
     * Gets the model file path
     * @returns {string} - The path to the model file
     */
    getModelFilePath(): string {
        return this.#modelFilePath;
    }

    /**
     * Gets the experiment name
     * @returns {string} - The name of the experiment
     */
    getExperimentName(): string {
        return this.#jsonSettings.experiment_name;
    }

    /**
     * Gets the JSON settings
     * @returns {JsonSettings} - The JSON settings
     */
    getJsonSettings(): JsonSettings {
        return this.#jsonSettings;
    }

    // Tools

    /**
     * Converts the model to a JSON format
     * @returns {object} - The JSON representation of the model
     */
    toJSON() {
        return {
            type: "json_simulation_list",
            jsonSettings: this.#jsonSettings,
            modelFilePath: this.#modelFilePath
        };
    }

    toString() {
        return this.#modelFilePath;
    }


}

export default Model;
