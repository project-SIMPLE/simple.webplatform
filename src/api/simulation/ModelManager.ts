import fs from 'fs';
import path from 'path';
import { isAbsolute } from 'path';
import { VU_MODEL_SETTING_JSON, VU_CATALOG_SETTING_JSON, MIN_VU_MODEL_SETTING_JSON, MIN_VU_CATALOG_SETTING_JSON } from '../core/Constants.ts';
import Model from './Model.ts';
import Controller from "../core/Controller.ts";
import {getLogger} from "@logtape/logtape";

// Override the log function
const logger= getLogger(["simulation", "ModelManager"]);

class ModelManager {
    controller: Controller;
    models: Model[];
    activeModel: Model | undefined;
    monitorNestedModels: any[] = [];

    /**
     * Creates the model manager
     * @param {any} controller - The controller of the server project
     */
    constructor(controller: Controller) {
        this.controller = controller;
        this.models = []
        this.#initModelsList();
    }

    /**
     * Initialize the models list by scanning the learning packages
     * checks for the type of settings
     * if it is a single model, it is directly added to the modelList
     * if it is a catalog, it will parse it, and it's sub objects
     * if it is an array, it will parse the array and create a model for each object, and read catalogs if any
     */
    #initModelsList(): void {
        const directoriesWithProjects: string[] = [];

        directoriesWithProjects.push(isAbsolute(process.env.LEARNING_PACKAGE_PATH!) ? process.env.LEARNING_PACKAGE_PATH! : path.join(process.cwd(), process.env.LEARNING_PACKAGE_PATH!));

        if (process.env.EXTRA_LEARNING_PACKAGE_PATH != "") {
            directoriesWithProjects.push(isAbsolute(process.env.EXTRA_LEARNING_PACKAGE_PATH!) ? process.env.EXTRA_LEARNING_PACKAGE_PATH! : path.join(process.cwd(), process.env.EXTRA_LEARNING_PACKAGE_PATH!));
        }

        directoriesWithProjects.forEach((packageRootDir) => {
            const packageFolder: string[] = ["."].concat(fs.readdirSync(packageRootDir));

            // Browse in the learning package folder to find available packages
            packageFolder.forEach((file) => {
                const folderPath = path.join(packageRootDir, file);

                if (fs.statSync(folderPath).isDirectory()) {
                    const settingsPath = path.join(folderPath, "settings.json");
                    // Verify if there is a settings file
                    if (fs.existsSync(settingsPath)) {
                        logger.debug(`Append new package to ModelManager: ${folderPath}`);

                        const settings: VU_MODEL_SETTING_JSON|VU_CATALOG_SETTING_JSON = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

                        switch (settings.type) {
                            //it's a catalog, i.e it contains a subset of catalogs and models
                            case "catalog":
                                logger.debug(`Found catalog in ${folderPath}`);

                                // Save final recursion in variable
                                this.monitorNestedModels.push({
                                    "type": "catalog",
                                    "name": settings.name,
                                    "entries": this.parseCatalog(settings, settingsPath),
                                    ...(settings.splashscreen !== undefined && { "splashscreen": settings.splashscreen })
                                });

                                break;

                            case "json_settings":
                                logger.debug(`Found single game settings in ${folderPath}`);

                                // Directly save new models not in catalog
                                this.monitorNestedModels.push(
                                    this.saveNewModel(settingsPath, settings)
                                );

                                break;

                            default:
                                // TODO: Remove ?
                                if (Array.isArray(settings)) {
                                    logger.debug(`Found array in ${folderPath},iterating through`);
                                    // @ts-expect-error I don't know what this code is supposed to catch
                                    // Will probably remove it soon...
                                    for (const item of settings) {
                                        logger.debug(`\titem: ${item.type}`);
                                        this.parseCatalog(item, settingsPath);
                                    }
                                } else {
                                    logger.error(`Can't identify setting's type from ${settingsPath}`);
                                    logger.error(`{settings}`, {settings});
                                }
                        }
                    } else {
                        logger.warn(`Couldn't find settings file in folder ${folderPath}`);
                    }
                }
            });
        });
    }

    /**
     * recursively parse a Json catalog passed in parameter
     * adds the list of model to a list provided in parameter.
     * declared as a separate function to be used recursively
     * @param catalog a json catalog object containing catalogs or settings
     * @param settingsPath the path of the current settings being parsed, used for creating models in the constructor
     */
    parseCatalog(catalog: VU_CATALOG_SETTING_JSON, settingsPath: string) {
        const catalogName: string = catalog.name;

        logger.debug(`Start parsing catalog: ${catalogName}`);
        logger.trace(`{catalog}`,{catalog});

        let cleanedEntry: MIN_VU_MODEL_SETTING_JSON[] = [];
        let cleanedCatalog: MIN_VU_CATALOG_SETTING_JSON[] = [];

        for (const entry of catalog.entries) {
            logger.info(`[${catalogName}] Parsing entry found: {entry}`, {entry: entry.name});
            switch (entry.type) {
                case "catalog":
                    logger.debug(`[${catalogName}] Found catalog, parsing it recursively`)
                    cleanedCatalog.push({
                        "type": "catalog",
                        "name": entry.name,
                        // @ts-expect-error Can't properly set what are entries since it can be a list of any MIN_VU
                        "entries": this.parseCatalog(entry, settingsPath),
                        ...(entry.splashscreen !== undefined && { "splashscreen": entry.splashscreen })
                    })
                    break;
                // @ts-expect-error If unknown, trying to parse it as a legacy entry...
                default:
                    logger.warn(`[${catalogName}] Unknown type for this entry: {entry}`, {entry});
                    logger.warn(`[${catalogName}] Trying to parse it as a legacy entry...`);
                case "json_settings":
                    try {
                        logger.debug(`[${catalogName}] Parsing json_settings entry`);

                        cleanedEntry.push(
                            this.saveNewModel(settingsPath, entry)
                        );
                    } catch (e) {
                        logger.error(`[${catalogName}] Couldn't parse catalog entry: {entry}, error: {e}`, {entry, e});
                    }
            }
        }

        return [...cleanedEntry, ...cleanedCatalog];
    }

    // -------------------

    saveNewModel(settingsPath: string, settings: VU_MODEL_SETTING_JSON): MIN_VU_MODEL_SETTING_JSON {
        logger.debug(`Saving new model: ${settings.name}`);
        logger.trace(`{settings}`,{settings});

        // TODO Check that settings if of type VU_MODEL_SETTING_JSON
        const newModel: Model = new Model(settingsPath, settings);
        const cleanedJson: VU_MODEL_SETTING_JSON = newModel.getJsonSettings();

        return {
            type: "json_settings",
            name: cleanedJson.name,
            splashscreen: cleanedJson.splashscreen,
            // -1 as `push` return the new array size, not the index
            // Add full Model object for GAMA
            model_index: (this.models.push(newModel) - 1)
        }
    }

    // -------------------

    setActiveModelByIndex(index: number) {
        logger.debug(`Setting active model to index ${index}`);
        this.activeModel = this.models[index];
    }

    getActiveModel() {
        return this.activeModel !== undefined ? this.activeModel : this.models[0];
    }

    // -------------------

    /**
     * used to send the models structure to the front end for proper display
     * @returns {string} - JSON string of the list of models as written in each settings.json file
     */
    getCatalogListJSON(): string {
        return JSON.stringify(this.monitorNestedModels);
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
