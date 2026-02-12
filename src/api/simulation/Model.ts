import path from 'path';
import { JsonSettings } from "../core/Constants.ts";
import { Logger, getLogger } from '@logtape/logtape';

const logger: Logger = getLogger(["api", "simulation"]);

class Model {
    readonly #jsonSettings: SETTINGS_FILE_JSON;
    readonly #modelFilePath: string;

    /**
     * Creates a Model object based on VU founded by the ModelManager
     * @param {string} settingsPath - Path to the settings file
     * @param {string} jsonSettings - Json content _Stringyfied_ of the settings file
     */
    constructor(settingsPath: string, jsonSettings: string) {
        this.#jsonSettings = JSON.parse(jsonSettings);

        logger.debug("Parsing {json}", { json: this.#jsonSettings });

        //if the path is relative, we rebuild it using the path of the settings.json it is found in
        const modelFilePath = this.#jsonSettings.model_file_path;
        if (path.isAbsolute(modelFilePath)) {
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
     * @returns {SETTINGS_FILE_JSON} - The JSON settings
     */
    getJsonSettings(): SETTINGS_FILE_JSON {
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
