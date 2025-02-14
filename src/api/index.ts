// Import des modules nécessaires
import * as os from "node:os";
import {spawn} from "child_process";
import dotenv from 'dotenv';

import Controller from './controller';
import DeviceFinder from './adb/DeviceFinder';

// Load options
dotenv.config();

// Default value for every option value
process.env.GAMA_WS_PORT =                process.env.GAMA_WS_PORT                || '1000';
process.env.GAMA_IP_ADDRESS =             process.env.GAMA_IP_ADDRESS             || 'localhost';
process.env.WEB_APPLICATION_PORT =        process.env.WEB_APPLICATION_PORT        || '5173';
process.env.HEADSET_WS_PORT =             process.env.HEADSET_WS_PORT             || '8080';
process.env.MONITOR_WS_PORT =             process.env.MONITOR_WS_PORT             || '8001';
process.env.LEARNING_PACKAGE_PATH =       process.env.LEARNING_PACKAGE_PATH       || "./learning-packages";
process.env.EXTRA_LEARNING_PACKAGE_PATH = process.env.EXTRA_LEARNING_PACKAGE_PATH || "";
const HEADSETS_IP: string[] =             process.env.HEADSETS_IP ? process.env.HEADSETS_IP.split(';').filter((value) => value.trim() !== '') : [];

const useAggressiveDisconnect: boolean = process.env.AGGRESSIVE_DISCONNECT !== undefined ? ['true', '1', 'yes'].includes(process.env.AGGRESSIVE_DISCONNECT.toLowerCase()) : false;

const useExtraVerbose: boolean = process.env.EXTRA_VERBOSE !== undefined ? ['true', '1', 'yes'].includes(process.env.EXTRA_VERBOSE.toLowerCase()) : false;

// Make verbose option more user friendly and ts-friendly
const useVerbose: boolean = useExtraVerbose ?
    true :
    process.env.VERBOSE !== undefined ?
        ['true', '1', 'yes'].includes(process.env.VERBOSE.toLowerCase())
        : false;

if (useExtraVerbose) {
  console.log(process.env);
}

/*
    APPLICATION ENTRY POINT ================================
 */

console.log("\n\x1b[95mWelcome to Gama Server Middleware !\x1b[0m\n");

const useAdb: boolean = (await isCommandAvailable("adb"))

  ? await new Promise((resolve) => {
      console.log("Waking up ADB...");
      const checkAdb = spawn("adb", ["devices"]);

            checkAdb.on('close', (code) => {
                resolve(code === 0); // Resolve true if exit code is 0 (adb found), false otherwise
            });
        }) : false;

const c = new Controller(useAdb);

// =========================================================

async function isCommandAvailable(commandName: string): Promise<boolean> {
  if (os.platform() === "win32") {
    const checkAdbProcess = spawn("where", [commandName]);
    return new Promise((resolve) => {
        checkAdbProcess.on("close", (code) => {
            resolve(code === 0); // Resolve true if exit code is 0 (adb found), false otherwise
        });
        });
  } else {
    return new Promise((resolve) => {
      const checkAdbProcess = spawn("which", [commandName]);

      checkAdbProcess.on("close", (code) => {
        resolve(code === 0); // Resolve true if exit code is 0 (adb found), false otherwise
      });
    });
  }
}

/*
    Pro-actively looking for Meta Quest devices to connect with ADB using an external script
    Requires:
        - ZSH
        - nmap
        - ADB
    OR on windows:
        - Powershell
        - nmap
        - ADB
 */
// Disabled while not properly documented

  if (os.platform() !== "win32") {
  if (
    useAdb &&
    (await isCommandAvailable("nmap")) &&
    (await isCommandAvailable("zsh")) 
  )   
  {
    try {
      await new DeviceFinder(c).scanAndConnect();
    } catch (error) {
      console.error("\x1b[36m[ADB FINDER]\x1b[0m Error:", error);
    }
  } else {
    console.error(
      "\x1b[36m[ADB FINDER]\x1b[0m One or several of those tools are not available on your computer:",
      "zsh, nmap, adb"
    );
    console.error("\x1b[36m[ADB FINDER]\x1b[0m Skipping finder now...");
  }
} else {
   if(
    useAdb &&
    (await isCommandAvailable("nmap")) &&
    (await isCommandAvailable("powershell"))
   )  {
    try {
      await new DeviceFinder(c).scanAndConnect();
    } catch (error) {
      console.error("[ADB FINDER] Error:", error);
    }
  } else {
    console.error(
      "\x1b[36m[ADB FINDER]\x1b[0m One or several of those tools are not available on your computer:",
      "zsh, nmap, adb"
    );
    console.error("\x1b[36m[ADB FINDER]\x1b[0m Skipping finder now...");
  }

//    console.warn("[ADB FINDER] Sorry, this feature is not available on Windows.");
//    console.warn("[ADB FINDER] Skipping finder now...");
 }

export {
  useVerbose,
  useExtraVerbose,
  useAdb,
  useAggressiveDisconnect,
  HEADSETS_IP,
};
