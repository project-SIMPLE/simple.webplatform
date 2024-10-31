import fs from 'fs';
import path from 'path';
import Model, { PlayerState } from './model';
import { useVerbose } from './index';
import { isAbsolute } from 'path';

class ModelManager {
    controller: any;
    models: Model[];
    activeModel: Model | undefined;

    /**
     * Creates the model manager
     * @param {any} controller - The controller of the server project
     */
    constructor(controller: any) {
        this.controller = controller;
        this.models = this.#initModelsList();
    }

    /**
     * Initialize the models list by scanning the learning packages
     * @returns {Model[]} - List of models
     */
    #initModelsList(): Model[] {
        let modelList: Model[] = [];
        let directoriesWithProjects: string[] = [];

        directoriesWithProjects.push(isAbsolute(process.env.LEARNING_PACKAGE_PATH!) ? process.env.LEARNING_PACKAGE_PATH! : path.join(process.cwd(), process.env.LEARNING_PACKAGE_PATH!));

        if ( process.env.EXTRA_LEARNING_PACKAGE_PATH != "" ){
            directoriesWithProjects.push(isAbsolute(process.env.EXTRA_LEARNING_PACKAGE_PATH!) ? process.env.EXTRA_LEARNING_PACKAGE_PATH! : path.join(process.cwd(), process.env.EXTRA_LEARNING_PACKAGE_PATH!));
        }

        directoriesWithProjects.forEach((packageRootDir) => {
            const packageFolder = fs.readdirSync(packageRootDir);

            // Browse in learning package folder to find available packages
            packageFolder.forEach((file) => {
                const folderPath = path.join(packageRootDir, file);
                const stat = fs.statSync(folderPath);

                if (stat && stat.isDirectory()) {
                    // Verify if there is a settings file
                    if (fs.existsSync(path.join(folderPath, "settings.json"))) {
                        if (useVerbose) {
                            console.log("[MODEL MANAGER] Append new package to ModelManager: " + folderPath);
                        }
                        modelList = modelList.concat(
                            new Model(path.join(folderPath, "settings.json"))
                        );
                    } else {
                        if (useVerbose) {
                            console.warn("Couldn't find settings file for folder " + folderPath);
                        }
                    }
                }
            });
        })

        return modelList;
    }

    // -------------------

    setActiveModel(newModel: Model) {
        this.activeModel = newModel;
    }

    setActiveModelByIndex(index: number) {
        this.activeModel = this.models[index];
    }

    getActiveModel(){
        return this.activeModel !== undefined ? this.activeModel : this.models[0];
    }

    // -------------------

    /**
     * Retrieve the list of players from the first model
     * @returns {Record<string, PlayerState> | null} - List of players
     */
    getListPlayers(): Record<string, PlayerState> | null {
        if (this.models.length > 0) {
            console.log("this.models:", this.models);
            const players = this.controller.player_manager.getPlayerList();
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
}

export default ModelManager;
