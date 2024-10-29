// Import des modules nécessaires
import dotenv from 'dotenv';
dotenv.config();
import Controller from './controller';
import DeviceFinder from './adb/DeviceFinder';

console.log('\n\x1b[95mWelcome to Gama Server Middleware !\x1b[0m\n');

// Définir les valeurs par défaut
process.env.GAMA_WS_PORT =          process.env.GAMA_WS_PORT          || '1000';
process.env.GAMA_IP_ADDRESS =       process.env.GAMA_IP_ADDRESS       || 'localhost';
process.env.HEADSET_WS_PORT =       process.env.HEADSET_WS_PORT       || '8080';
process.env.MONITOR_WS_PORT =       process.env.MONITOR_WS_PORT       || '8001';
process.env.LEARNING_PACKAGE_PATH = process.env.LEARNING_PACKAGE_PATH || "./learning-packages";
process.env.EXTRA_LEARNING_PACKAGE_PATH = process.env.EXTRA_LEARNING_PACKAGE_PATH || "";

// Rendre le paramètre verbose un booléen
const useVerbose: boolean = process.env.VERBOSE !== undefined ? ['true', '1', 'yes'].includes(process.env.VERBOSE.toLowerCase()) : false;

if (false) {
    console.log(process.env);
}

// Initialisation du contrôleur
const c = new Controller();

/*
    Pro-actively looking for Meta Quest devices to connect with ADB using an external script
    Requires:
        - ZSH
        - nmap
        - ADB
 */
// Disabled while not properly documented
if (false){
    const d = new DeviceFinder();
    (async () => {
        try {
            await d.scanAndConnect();
        } catch (error) {
            console.error('Error:', error);
        }
    })();
}

export { useVerbose };