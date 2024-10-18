import fs from 'fs';
import path from 'path';
import Model, { PlayerState } from './model';
import JsonSettings from './model';
import { useVerbose } from './index';

class ModelManager {
    controller: any;
    models: Model[];

    /**
     * Creates the model manager
     * @param {any} controller - The controller of the server project
     */
    constructor(controller: any) {
        this.controller = controller;
        this.models = this.initModelsList();
    }

    /**
     * Initialize the models list by scanning the learning packages
     * @returns {Model[]} - List of models
     */
    initModelsList(): Model[] {
        let modelList: Model[] = [];
        const packageRootDir = path.join(process.cwd(), process.env.LEARNING_PACKAGE_PATH!);

        const packageFolder = fs.readdirSync(packageRootDir);

        // Browse in learning package folder to find available packages
        packageFolder.forEach((file) => {
            const folderPath = path.join(packageRootDir, file);
            const stat = fs.statSync(folderPath);

            if (stat && stat.isDirectory()) {
                // Verify if there is a settings file
                if (fs.existsSync(path.join(folderPath, "settings.json"))) {
                    if (useVerbose) {
                        console.log("[DEBUG] Append new package to ModelManager: " + folderPath);
                    }
                    modelList = modelList.concat(
                        new Model(this.controller, path.join(folderPath, "settings.json"))
                    );
                } else {
                    if (useVerbose) {
                        console.warn("Couldn't find settings file for folder " + folderPath);
                    }
                }
            }
        });

        return modelList;
    }

    /**
     * Retrieve the list of players from the first model
     * @returns {Record<string, PlayerState> | null} - List of players
     */
    getListPlayers(): Record<string, PlayerState> | null {
        if (this.models.length > 0) {
            console.log("this.models:", this.models);
            const players = this.models[0].getAllPlayers(); // Calls getAllPlayers() on the first instance of Model
            console.log("MODEL MANAGER, les players:", players);
            return players;
        } else {
            console.log('No models available.');
            return null;
        }
    }

    /**
     * Converts the model list to JSON format
     * @returns {string} - JSON string of models
     */
    getModelListJSON(): string {
        const jsonSafeModels = this.models.map(model => model.toJSON());
        return JSON.stringify(jsonSafeModels);
    }

    /**
     * Retrieve the list of models
     * @returns {Model[]} - Array of models
     */
    getModelList(): Model[] {
        return this.models;
    }

    setJsonSettings(json_settings: Model) {
        // Assuming you want to update some settings in the models
    }
}

export default ModelManager;
