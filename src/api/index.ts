// Import des modules nécessaires
import * as os from "node:os";
import {spawn} from "child_process";
import dotenv from 'dotenv';

import Controller from './controller';
import DeviceFinder from './adb/DeviceFinder';

// Load options
dotenv.config();

// Default value for every option value
process.env.GAMA_WS_PORT =          process.env.GAMA_WS_PORT          || '1000';
process.env.GAMA_IP_ADDRESS =       process.env.GAMA_IP_ADDRESS       || 'localhost';
process.env.HEADSET_WS_PORT =       process.env.HEADSET_WS_PORT       || '8080';
process.env.MONITOR_WS_PORT =       process.env.MONITOR_WS_PORT       || '8001';
process.env.LEARNING_PACKAGE_PATH = process.env.LEARNING_PACKAGE_PATH || "./learning-packages";
process.env.EXTRA_LEARNING_PACKAGE_PATH = process.env.EXTRA_LEARNING_PACKAGE_PATH || "";

// Make verbose option more user friendly and ts-friendly
const useVerbose: boolean = process.env.VERBOSE !== undefined ? ['true', '1', 'yes'].includes(process.env.VERBOSE.toLowerCase()) : false;

if (useVerbose) {
    console.log(process.env);
}

/*
    APPLICATION ENTRY POINT ================================
 */

console.log('\n\x1b[95mWelcome to Gama Server Middleware !\x1b[0m\n');

const c = new Controller();

// =========================================================

async function isCommandAvailable(commandName: string): Promise<boolean> {
    return new Promise((resolve) => {
        const checkAdbProcess = spawn('which', [commandName]);

        checkAdbProcess.on('close', (code) => {
            resolve(code === 0); // Resolve true if exit code is 0 (adb found), false otherwise
        });
    });
}


/*
    Pro-actively looking for Meta Quest devices to connect with ADB using an external script
    Requires:
        - ZSH
        - nmap
        - ADB
 */
// Disabled while not properly documented
if (os.platform() !== 'win32'){
    if (
        await isCommandAvailable("nmap") &&
        await isCommandAvailable("adb") &&
        await isCommandAvailable("zsh")
    ){
        try {
            // Wait for 2 seconds before starting auto-scanning, to be sure ADB is well connected with server
            await new Promise(resolve => setTimeout(resolve, 2000));
            await new DeviceFinder(c).scanAndConnect();
        } catch (error) {
            console.error('[ADB FINDER] Error:', error);
        }
    }else{
        console.error("[ADB FINDER] One or several of those tools are not available on your computer:", "zsh, nmap, adb");
        console.error("[ADB FINDER] Skipping finder now...");
    }
}else{
    console.warn("[ADB FINDER] Sorry, this feature is not available on Windows.");
    console.warn("[ADB FINDER] Skipping finder now...");
}

export { useVerbose };