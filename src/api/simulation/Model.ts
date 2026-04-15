import path from 'path';
import {VU_MODEL_SETTING_JSON} from "../core/Constants.ts";
import { Logger, getLogger } from '@logtape/logtape';
import fs from "fs";

const logger: Logger = getLogger(["simulation", "Model"]);

class Model {
    readonly #jsonSettings: VU_MODEL_SETTING_JSON;

    /**
     * Creates a Model object based on VU founded by the ModelManager
     * @param {string} settingsPath - Path to the settings file
     * @param {VU_MODEL_SETTING_JSON} jsonSettings - Json content _Stringyfied_ of the settings file
     */
    constructor(settingsPath: string, jsonSettings: VU_MODEL_SETTING_JSON) {
        this.#jsonSettings = jsonSettings;

        logger.debug("Parsing new model {json}", { json: this.#jsonSettings.name });

        //if the path is relative, we rebuild it using the path of the settings.json it is found in
        const absoluteModelFilePath = path.isAbsolute(this.#jsonSettings.model_file_path) ? this.#jsonSettings.model_file_path : path.join(path.dirname(settingsPath), this.#jsonSettings.model_file_path);

        if (!fs.existsSync(absoluteModelFilePath))
            logger.error(`GAML model for VU ${this.#jsonSettings.name} can't be found at ${absoluteModelFilePath}. Please check the path in the settings.json file.`)

        this.#jsonSettings.model_file_path = absoluteModelFilePath;
    }

    // Getters

    /**
     * Gets the model file path
     * @returns {string} - The path to the model file
     */
    getModelFilePath(): string {
        return this.#jsonSettings.model_file_path;
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
     * @returns {VU_MODEL_SETTING_JSON} - The JSON settings
     */
    getJsonSettings(): VU_MODEL_SETTING_JSON {
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
            modelFilePath: this.#jsonSettings.model_file_path
        };
    }

    toString() {
        return this.#jsonSettings.model_file_path;
    }


}

export default Model;
