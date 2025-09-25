// Import des modules nécessaires
import {spawn} from "child_process";
import dotenv from 'dotenv';
import {
    configure,
    getConsoleSink,
    getLogger,
    getLevelFilter,
    withFilter, fingersCrossed
} from "@logtape/logtape";
import { getStreamFileSink } from "@logtape/file";
import { getPrettyFormatter } from "@logtape/pretty";

import Controller from './core/Controller.ts';

/*
    TOOLBOX ================================
 */

async function isCommandAvailable(commandName: string): Promise<boolean> {
    if (process.platform === "win32") {
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
    PROCESS .env FILE ================================
 */

// Load options
dotenv.config();

// Default value for every option value
// GAMA =====
process.env.GAMA_WS_PORT =                process.env.GAMA_WS_PORT                || '1000';
process.env.GAMA_IP_ADDRESS =             process.env.GAMA_IP_ADDRESS             || 'localhost';
process.env.LEARNING_PACKAGE_PATH =       process.env.LEARNING_PACKAGE_PATH       || "./learning-packages";
process.env.EXTRA_LEARNING_PACKAGE_PATH = process.env.EXTRA_LEARNING_PACKAGE_PATH || "";

const ENV_AGGRESSIVE_DISCONNECT: boolean = process.env.AGGRESSIVE_DISCONNECT !== undefined ? ['true', '1', 'yes'].includes(process.env.AGGRESSIVE_DISCONNECT.toLowerCase()) : false;
// ! GAMA =====

// Headsets  =====
process.env.HEADSET_WS_PORT =             process.env.HEADSET_WS_PORT             || '8080';
// ! Headsets  =====

// Scrcpy =====
const ENV_SCRCPY_FORCE_H265: boolean = process.env.SCRCPY_FORCE_H265 !== undefined ? ['true', '1', 'yes'].includes(process.env.SCRCPY_FORCE_H265.toLowerCase()) : false;
// ! Scrcpy =====

// Website =====
process.env.WEB_APPLICATION_PORT =        process.env.WEB_APPLICATION_PORT        || '5173';
process.env.MONITOR_WS_PORT =             process.env.MONITOR_WS_PORT             || '8001';

const HEADSETS_IP: string[] =             process.env.HEADSETS_IP ? process.env.HEADSETS_IP.split(';').filter((value) => value.trim() !== '') : [];
// ! Website  =====

// Debug  =====
const ENV_EXTRA_VERBOSE: boolean = process.env.EXTRA_VERBOSE !== undefined ? ['true', '1', 'yes'].includes(process.env.EXTRA_VERBOSE.toLowerCase()) : false;

// Make verbose option more user friendly and ts-friendly
const ENV_VERBOSE: boolean = ENV_EXTRA_VERBOSE ?
    true :
    process.env.VERBOSE !== undefined ?
        ['true', '1', 'yes'].includes(process.env.VERBOSE.toLowerCase())
        : false;

/*
    SETUP LOGGING SYSTEM ================================
 */

await configure({
    sinks: {
        // Simple non-blocking mode with default settings
        console: withFilter(
                getConsoleSink({
                    nonBlocking: true,
                    formatter: getPrettyFormatter({
                        wordWrap: false,
                        inspectOptions: {
                            depth: 3,
                            compact: false
                        },
                        categoryTruncate: "middle",
                        icons: false
                    })
                }),
                getLevelFilter(ENV_EXTRA_VERBOSE ? "trace" : ENV_VERBOSE ? "debug" : "info")
            ),
        file: fingersCrossed(
                getStreamFileSink("errorLog.log", {
                    highWaterMark: 32768  // 32KB buffer for high-volume logging
                }),
                {triggerLevel: "error"}
            )
    },
    loggers: [
        { category: ["logtape", "meta"], sinks: ["console"], lowestLevel: "warning" },
        {
            category: [], // wildcard
            sinks: [
                "file",
                "console"
            ]
        }
    ]
});
const logger= getLogger(["core", "index"]);

/*
    APPLICATION ENTRY POINT ================================
 */

logger.info(`Starting the SIMPLE Webplatform !`);

logger.trace(process.env);

const useAdb: boolean =
    (await isCommandAvailable("adb"))
        ? await new Promise((resolve) => {
            logger.debug("Waking up ADB...");
            const checkAdb = spawn("adb", ["devices"]);
            checkAdb.on('close', (code) => {
                resolve(code === 0); // Resolve true if exit code is 0 (adb found), false otherwise
            });
        })
        : false;

const c = new Controller(useAdb);
await c.initialize();

export {
  ENV_VERBOSE,
  ENV_EXTRA_VERBOSE,
  useAdb,
  ENV_AGGRESSIVE_DISCONNECT,
  HEADSETS_IP,
    ENV_SCRCPY_FORCE_H265
};
