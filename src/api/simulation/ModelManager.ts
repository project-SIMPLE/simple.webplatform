import fs from 'fs';
import path from 'path';
import { isAbsolute } from 'path';
import { ANSI_COLORS as color } from '../core/Constants.ts';
import Model from './Model.ts';
import { ENV_VERBOSE } from '../index.ts';
import Controller from "../core/Controller.ts";

/**
 * Inteface to make manipulation of the json file easier 
 * these are incomplete and do not represent the full structure of the json file
 * but contain what is necessary to parse them
 */
interface Settings {
    type: "json_settings";
    model_file_path: string;
    name: string;
}
interface Catalog {
    type: "catalog";
    name: string;
    entries: Settings[] | Catalog[];
}

class ModelManager {
    controller: Controller;
    models: Model[];
    activeModel: Model | undefined;
    jsonList: string[] = [];  // List of all the models as written in each settings.json file, useful to keep the structure of subprojects

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
     * checks for the type of settings
     * if it is a single model, it is directly added to the modelList
     * if it is a catalog, it will parse it and it's sub objects
     * if it is an array, it will parse the array and create a model for each object, and read catalogs if any
     * @returns {Model[]} - List of models
     */
    #initModelsList(): Model[] {
        let modelList: Model[] = [];
        let directoriesWithProjects: string[] = [];

        directoriesWithProjects.push(isAbsolute(process.env.LEARNING_PACKAGE_PATH!) ? process.env.LEARNING_PACKAGE_PATH! : path.join(process.cwd(), process.env.LEARNING_PACKAGE_PATH!));

        if (process.env.EXTRA_LEARNING_PACKAGE_PATH != "") {
            directoriesWithProjects.push(isAbsolute(process.env.EXTRA_LEARNING_PACKAGE_PATH!) ? process.env.EXTRA_LEARNING_PACKAGE_PATH! : path.join(process.cwd(), process.env.EXTRA_LEARNING_PACKAGE_PATH!));
        }

        directoriesWithProjects.forEach((packageRootDir) => {
            const packageFolder: string[] = ["."].concat(fs.readdirSync(packageRootDir));

            // Browse in learning package folder to find available packages
            packageFolder.forEach((file) => {
                const folderPath = path.join(packageRootDir, file);

                if (fs.statSync(folderPath).isDirectory()) {
                    const settingsPath = path.join(folderPath, "settings.json");
                    // Verify if there is a settings file
                    if (fs.existsSync(settingsPath)) {
                        if (ENV_VERBOSE) {
                            console.log(`${color.magenta}[MODEL MANAGER] ${color.reset} Append new package to ModelManager: ${folderPath}`);
                        }
                        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
                        this.jsonList.push(settings); // add the settings file to the list of json files
                        console.log(this.jsonList)
                        if (ENV_VERBOSE) {
                            console.log(`${color.magenta}[MODEL MANAGER] ${color.reset} Found settings file in " + ${folderPath}`);
                        }
                        if (settings.type === "catalog") { //it's a catalog, i.e it contains a subset of catalogs and models
                            if (ENV_VERBOSE) {
                                console.log(`${color.magenta}[MODEL MANAGER] ${color.reset} Found catalog in " + ${folderPath}`);
                            }
                            this.parseCatalog(settings, modelList, settingsPath)
                        } else if (Array.isArray(settings)) {
                            if (ENV_VERBOSE) {
                                console.log(`${color.magenta}[MODEL MANAGER] ${color.reset}  Found array in ${color.cyan}${folderPath}${color.reset},iterating through`);
                            }
                            for (const item of settings) {
                                if (ENV_VERBOSE) {
                                    console.log(`${color.magenta}[MODEL MANAGER] ${color.reset} item: ${item.type}`)
                                }
                                this.parseCatalog(item, modelList, settingsPath)
                            }

                        } else if (settings.type === "json_settings") {
                            console.log("settings.model_file_path", settings.model_file_path)

                            modelList = modelList.concat(
                                new Model(settingsPath, JSON.stringify(settings), settings.model_file_path)
                            );
                        }
                        console.log(modelList.toString())
                    } else {
                        if (ENV_VERBOSE) {
                            console.warn(`${color.orange} Couldn't find settings file for folder ${color.green} ${folderPath}`);
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

    // -------------------

    /**
    *returns the model with the model_file_path specified 
    * @filepath the path of the model, specified in the settings.json of the model
    * @returns {Model} sets the active model to the model found 
    */
    setActiveModelByFilePath(filePath: string) {
        let modelFound = this.models.find(model => model.getJsonSettings().model_file_path === filePath);
        return this.activeModel = modelFound
    }

    getActiveModel() {
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
     * used to send the models structure to the front end for proper display
     * @returns {string} - JSON string of the list of models as written in each settings.json file
     */
    getCatalogListJSON(): string {
        return JSON.stringify(this.jsonList);
    }

    /**
     * Retrieve the list of models
     * @returns {Model[]} - Array of models
     */
    getModelList(): Model[] {
        return this.models;
    }
    /**
     * recursively parse a Json catalog passed in parameter
     * adds the list of model to a list provided in parameter.
     * declared as a separate function to be used recursively
     * @param catalog a json catalog object containing catalogs or settings
     * @param list the list of models containing all parsed models throughout all the settings files
     * @param settingsPath the path of the current settings being parsed, used for creating models in the constructor
     */
    parseCatalog(catalog: Catalog, list: Model[], settingsPath: string) {
        for (const entry of catalog.entries) {
            if ('type' in entry) {
                console.log("entry found:", entry)
                if (entry.type === "json_settings") {
                    console.log(`${color.magenta}[MODEL MANAGER] ${color.reset} ${entry.name}`)

                    const model = new Model(settingsPath, JSON.stringify(entry));
                    console.log(model.toString())
                    list.push(model);
                } else if (entry.type === "catalog") {
                    this.parseCatalog(entry, list, settingsPath);
                }
            }
        }
    }
}



export default ModelManager;
