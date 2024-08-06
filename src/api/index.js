// Import des modules nécessaires
import dotenv from 'dotenv';
import Controller from './controller.js';

console.log('\n\x1b[95mWelcome to Gama Server Middleware !\x1b[0m\n');

console.log("Starting application avec les paramètres système:", dotenv.config(), "\n");

// Définir les valeurs par défaut
process.env.GAMA_WS_PORT = process.env.GAMA_WS_PORT !== undefined ? process.env.GAMA_WS_PORT : 1000;
process.env.GAMA_IP_ADDRESS = process.env.GAMA_IP_ADDRESS !== undefined ? process.env.GAMA_IP_ADDRESS : 'localhost';
process.env.HEADSET_WS_PORT = process.env.HEADSET_WS_PORT !== undefined ? process.env.HEADSET_WS_PORT : 8080;
process.env.MONITOR_WS_PORT = process.env.MONITOR_WS_PORT !== undefined ? process.env.MONITOR_WS_PORT : 8001;
process.env.HTTP_PORT = process.env.HTTP_PORT !== undefined ? process.env.HTTP_PORT : 8000;
process.env.APP_IP_ADDRESS = process.env.APP_IP_ADDRESS !== undefined ? process.env.APP_IP_ADDRESS : 'localhost';
process.env.LEARNING_PACKAGE_PATH = process.env.LEARNING_PACKAGE_PATH !== undefined ? process.env.LEARNING_PACKAGE_PATH : "./learning-packages";

// Rendre le paramètre verbose un booléen
const useVerbose = process.env.VERBOSE !== undefined ? process.env.VERBOSE && ['true', '1', 'yes'].includes(process.env.VERBOSE.toLowerCase()) : false;

if (useVerbose) {
    console.log(process.env);
}

// Initialisation du contrôleur
new Controller();

export { useVerbose };
