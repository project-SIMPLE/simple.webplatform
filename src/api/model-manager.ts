import fs from 'fs';
import path from 'path';
import { isAbsolute } from 'path';

import Model from './model';
import { useVerbose } from './index';
import Controller from "./controller.ts";

class ModelManager {
    controller: Controller;
    models: Model[];
    activeModel: Model | undefined;

    /**
     * Creates the model manager
     * @param {any} controller - The controller of the server project
     */
    constructor(controller: Controller) {
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
            const packageFolder:string[] = ["."].concat(fs.readdirSync(packageRootDir));

            // Browse in learning package folder to find available packages
            packageFolder.forEach((file) => {
                const folderPath = path.join(packageRootDir, file);

                if (fs.statSync(folderPath).isDirectory()) {
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

    setActiveModelByIndex(index: number) {
        this.activeModel = this.models[index];
    }

    setActiveModelByFilePath(filePath: string) {
        return this.models.find(model => model.getModelFilePath() === filePath);
    }

    getActiveModel(){
        return this.activeModel !== undefined ? this.activeModel : this.models[0];
    }

    // -------------------

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
