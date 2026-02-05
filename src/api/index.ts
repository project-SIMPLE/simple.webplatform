// Import des modules nécessaires
import { spawn, spawnSync } from "child_process";
import dotenv from 'dotenv';
import {
    configure,
    getConsoleSink,
    getLogger,
    getLevelFilter,
    withFilter, fingersCrossed
} from "@logtape/logtape";
import { getRotatingFileSink } from "@logtape/file";
import { getPrettyFormatter } from "@logtape/pretty";

import Controller from './core/Controller.ts';
import { StaticServer } from './infra/StaticServer.ts';
import path from 'path';
import { fileURLToPath } from 'url';

/*
    TOOLBOX ================================
 */

function isCommandAvailable(commandName: string): boolean {
    if (process.platform === "win32") {
        const checkAdbProcess = spawnSync("where", [commandName]);
        return checkAdbProcess.status === 0;
    } else {
        const checkAdbProcess = spawnSync("which", [commandName]);
        return checkAdbProcess.status === 0;
    }
}

/*
    PROCESS .env FILE ================================
 */

// Load options
const isPackaged = (process as any).pkg || process.env.PKG_EXECPATH || process.argv[0].endsWith('node') === false;
const exeDir = isPackaged ? path.dirname(process.execPath) : process.cwd();
dotenv.config({ path: path.join(exeDir, '.env') });

// Fix for some dependencies (like evilscan) that might use undeclared variables
(global as any).targetMatch = undefined;

// Default value for every option value
// GAMA =====
process.env.GAMA_WS_PORT =                  process.env.GAMA_WS_PORT                || '1000';
process.env.GAMA_IP_ADDRESS =               process.env.GAMA_IP_ADDRESS             || 'localhost';
process.env.LEARNING_PACKAGE_PATH =         process.env.LEARNING_PACKAGE_PATH       || "./learning-packages";
process.env.EXTRA_LEARNING_PACKAGE_PATH =   process.env.EXTRA_LEARNING_PACKAGE_PATH || "";

const ENV_AGGRESSIVE_DISCONNECT: boolean = process.env.AGGRESSIVE_DISCONNECT !== undefined ? ['true', '1', 'yes'].includes(process.env.AGGRESSIVE_DISCONNECT.toLowerCase()) : false;
// ! GAMA =====

// Headsets  =====
process.env.HEADSET_WS_PORT =               process.env.HEADSET_WS_PORT             || '8080';
// ! Headsets  =====

// Scrcpy =====
const ENV_SCRCPY_FORCE_H265: boolean = process.env.SCRCPY_FORCE_H265 !== undefined ? ['true', '1', 'yes'].includes(process.env.SCRCPY_FORCE_H265.toLowerCase()) : false;
// ! Scrcpy =====

// Website =====
process.env.WEB_APPLICATION_PORT =          process.env.WEB_APPLICATION_PORT        || '5173';
process.env.MONITOR_WS_PORT =               process.env.MONITOR_WS_PORT             || '8001';

const HEADSETS_IP: string[] =               process.env.HEADSETS_IP ? process.env.HEADSETS_IP.split(';').filter((value) => value.trim() !== '') : [];
// ! Website  =====

// Debug  =====
const ENV_EXTRA_VERBOSE: boolean = process.env.EXTRA_VERBOSE !== undefined ? ['true', '1', 'yes'].includes(process.env.EXTRA_VERBOSE.toLowerCase()) : false;

// Make verbose option more user friendly and ts-friendly
const ENV_VERBOSE: boolean = ENV_EXTRA_VERBOSE ?
    true :
    process.env.VERBOSE !== undefined ?
        ['true', '1', 'yes'].includes(process.env.VERBOSE.toLowerCase())
        : false;

        
const ENV_GAMALESS: boolean = process.env.ENV_GAMALESS !== undefined ? ['true', '1', 'yes'].includes(process.env.ENV_GAMALESS.toLowerCase()) : false;

const useAdb: boolean = isCommandAvailable("adb") && (() => {
    const checkAdb = spawnSync("adb", ["devices"]);
    return checkAdb.status === 0;
})();

/*
    SETUP LOGGING SYSTEM ================================
 */

const logConfig = configure({
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
            getRotatingFileSink("errorLog.log", {
                maxSize: 0x400 * 0x400 * 100,  // 100 MiB
                maxFiles: 5,
            }),
            { triggerLevel: "error" }
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

const logger = getLogger(["core", "index"]);

/*
    APPLICATION ENTRY POINT ================================
 */

async function start() {
    await logConfig;
    logger.info(`Starting the SIMPLE Webplatform !`);

    logger.debug(`Node version: ${process.version}`);
    logger.debug(`Module version: ${process.versions.modules}`);
    logger.debug(`Platform: ${process.platform}`);
    logger.debug(`Arch: ${process.arch}`);
    logger.debug(`Is Packaged: {isPackaged}`, {isPackaged});
    logger.debug(`NODE_ENV: ${process.env.NODE_ENV}`);

    logger.trace(process.env);

    // Start static server to serve the frontend in production/executable mode
    if (process.env.NODE_ENV === 'production' || isPackaged) {
        new StaticServer();
    }

    const c = new Controller(useAdb);
    await c.initialize();
}

start().catch(err => {
    console.error("Failed to start application:", err);
    process.exit(1);
});

export {
    ENV_GAMALESS,
    ENV_VERBOSE,
    ENV_EXTRA_VERBOSE,
    useAdb,
    ENV_AGGRESSIVE_DISCONNECT,
    HEADSETS_IP,
    ENV_SCRCPY_FORCE_H265
};
