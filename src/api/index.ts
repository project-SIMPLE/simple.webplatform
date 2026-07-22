// Import des modules nécessaires

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRotatingFileSink } from "@logtape/file";
import { configure, fingersCrossed, getConsoleSink, getLevelFilter, getLogger, withFilter } from "@logtape/logtape";
import { getPrettyFormatter } from "@logtape/pretty";
import dotenv from "dotenv";
import Controller from "./core/Controller.ts";
import { isMacMini } from "./infra/DeviceDetector.ts";
import { StaticServer } from "./infra/StaticServer.ts";
import { ensureConfig } from "./infra/TuiConfig.ts";

/*
    TOOLBOX ================================
 */

// Extracts the first valid IPv4 address found in a string, or returns null.
// Used to sanitize HEADSETS_IP entries that may carry stray characters (e.g. trailing quotes).
export const _extractIPv4 = (raw: string): string | null => {
	const match = raw.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
	if (!match) return null;
	const ip = match[1];
	return ip.split(".").every((octet) => Number(octet) >= 0 && Number(octet) <= 255) ? ip : null;
};

// Coerce an env-var string to a boolean: true for "true"/"1"/"yes" (case-insensitive),
// false for anything else (including undefined).
export function asBool(value: string | undefined): boolean {
	return value !== undefined ? ["true", "1", "yes"].includes(value.toLowerCase()) : false;
}

// Parse a ";"-separated HEADSETS_IP string into sanitized IPv4s. Pure: returns the
// extracted IPs plus human-readable warnings for tokens that were fixed or dropped
// (the caller logs them), so misconfigured entries are never silently ignored.
export function parseHeadsetsIp(raw: string | undefined): { ips: string[]; warnings: string[] } {
	const warnings: string[] = [];
	const tokens = raw ? raw.split(";").filter((value) => value.trim() !== "") : [];
	const ips = tokens.flatMap((token) => {
		const ip = _extractIPv4(token);
		if (!ip) {
			warnings.push(`Could not extract a valid IP from: "${token.trim()}"`);
			return [];
		}
		if (ip !== token.trim()) warnings.push(`Sanitized "${token.trim()}" → "${ip}"`);
		return [ip];
	});
	return { ips, warnings };
}

// Runs a command asynchronously and resolves with its exit code (or null if it failed to spawn).
function _runCommand(command: string, args: string[]): Promise<number | null> {
	return new Promise((resolve) => {
		const child = spawn(command, args, { stdio: "ignore" });
		child.on("error", () => resolve(null));
		child.on("close", (code) => resolve(code));
	});
}

async function isCommandAvailable(commandName: string): Promise<boolean> {
	const checker = process.platform === "win32" ? "where" : "which";
	return (await _runCommand(checker, [commandName])) === 0;
}

/*
    PLATFORM DETECTION ================================
 */

function _isSea(): boolean {
	try {
		// process.execPath is always an absolute path and works as a createRequire
		// base on any platform.  We avoid import.meta.url because it is not a valid
		// absolute path in Vite's CJS bundle output.
		const _req = createRequire(process.execPath);
		return (_req("node:sea") as { isSea(): boolean }).isSea();
	} catch (_) {
		return false;
	}
}

// Pure decision for whether the app runs as a packaged binary rather than via a
// `node`/`tsx` runner. Extracted from the eager const below so it can be unit
// tested across platforms. Issue #118: on Windows process.argv[0] is `node.exe`,
// which the old `.endsWith("node")` check misread as packaged, breaking .env
// loading. `path.basename(...).includes("node")` handles `node`, `node.exe` and
// full paths alike.
export function computeIsPlatformPackaged(opts: {
	pkg?: boolean;
	pkgExecPath?: string;
	isSea: boolean;
	argv0: string;
	argv1?: string;
}): boolean {
	// The runner isn't called `node`, and not starting the file from root `/snapshot`.
	const runnerIsNotNode = !path.basename(opts.argv0).includes("node") && !(opts.argv1 ?? "").startsWith("/snapshot");
	return Boolean(opts.pkg || opts.pkgExecPath || opts.isSea || runnerIsNotNode);
}

// Load options — this does not depend on the .env, so it is computed eagerly.
export const IS_PLATFORM_PACKAGED = computeIsPlatformPackaged({
	pkg: (process as typeof process & { pkg?: boolean }).pkg,
	pkgExecPath: process.env.PKG_EXECPATH,
	isSea: _isSea(),
	argv0: process.argv[0],
	argv1: process.argv[1],
});
const exeDir = IS_PLATFORM_PACKAGED ? path.dirname(process.execPath) : process.cwd();

// Fix for some dependencies (like evilscan) that might use undeclared variables
(globalThis as Record<string, unknown>).targetMatch = undefined;

/*
    RUNTIME OPTIONS ================================

    These are read from process.env, which is only populated after ensureConfig()
    and dotenv.config() have run inside bootstrap(). They are exported as mutable
    bindings and assigned there; every consumer reads them lazily (inside methods
    and constructors that only run once the server starts), so the values are
    always set by the time they are read.
 */

export let ENV_AGGRESSIVE_DISCONNECT = false;
export let ENV_EXTRA_VERBOSE = false;
export let ENV_VERBOSE = false;
export let ENV_GAMALESS = false;
export let HEADSETS_IP: string[] = [];
export let useAdb = false;

let logConfig: ReturnType<typeof configure>;
let logger: ReturnType<typeof getLogger>;

// Only the adb binary needs to exist to enable adb management. The (potentially slow on a
// cold boot) daemon start happens asynchronously in AdbManager.init(), so it never gates
// server startup / the frontend WebSocket connection.
async function _detectAdb(): Promise<boolean> {
	return isCommandAvailable("adb");
}

/*
    LOAD CONFIGURATION ================================

    Populates process.env from the .env (writing/prompting one first if needed),
    applies defaults, and derives the exported runtime options above.
 */

async function loadConfiguration(): Promise<void> {
	// Ensure a .env exists — no-op if one is already present, prompts on first run.
	await ensureConfig();

	dotenv.config({ path: path.join(exeDir, ".env") });

	// Default value for every option value
	// GAMA =====
	process.env.GAMA_WS_PORT = process.env.GAMA_WS_PORT || "1000";
	process.env.GAMA_IP_ADDRESS = process.env.GAMA_IP_ADDRESS || "localhost";
	process.env.LEARNING_PACKAGE_PATH = process.env.LEARNING_PACKAGE_PATH || "./learning-packages";
	process.env.EXTRA_LEARNING_PACKAGE_PATH = process.env.EXTRA_LEARNING_PACKAGE_PATH || "";

	ENV_AGGRESSIVE_DISCONNECT = asBool(process.env.AGGRESSIVE_DISCONNECT);
	// ! GAMA =====

	// Headsets  =====
	process.env.HEADSET_WS_PORT = process.env.HEADSET_WS_PORT || "8080";
	// ! Headsets  =====

	// Website =====
	process.env.WEB_APPLICATION_PORT = process.env.WEB_APPLICATION_PORT || "5173";
	process.env.MONITOR_WS_PORT = process.env.MONITOR_WS_PORT || "8001";
	// ! Website  =====

	// Debug  =====
	ENV_EXTRA_VERBOSE = asBool(process.env.EXTRA_VERBOSE);

	// Make verbose option more user friendly and ts-friendly
	ENV_VERBOSE = ENV_EXTRA_VERBOSE ? true : asBool(process.env.VERBOSE);

	// Supports legacy `ENV_GAMALESS` and linter `GAMALESS`. ENV_GAMALESS wins when set
	// (even to a falsy value); only then do we consult GAMALESS.
	ENV_GAMALESS =
		process.env.ENV_GAMALESS !== undefined ? asBool(process.env.ENV_GAMALESS) : asBool(process.env.GAMALESS);

	/*
	    SETUP LOGGING SYSTEM ================================
	 */

	logConfig = configure({
		sinks: {
			// Simple non-blocking mode with default settings
			console: withFilter(
				getConsoleSink({
					nonBlocking: true,
					formatter: getPrettyFormatter({
						wordWrap: false,
						inspectOptions: {
							depth: 3,
							compact: false,
						},
						categoryTruncate: "middle",
						icons: false,
					}),
				}),
				getLevelFilter(ENV_EXTRA_VERBOSE ? "trace" : ENV_VERBOSE ? "debug" : "info"),
			),
			file: fingersCrossed(
				getRotatingFileSink("errorLog.log", {
					maxSize: 0x400 * 0x400 * 100, // 100 MiB
					maxFiles: 5,
				}),
				{
					triggerLevel: "error",
					bufferLevel: "debug", // Buffer debug and below; info/warn pass through immediately
				},
			),
		},
		loggers: [
			{ category: ["logtape", "meta"], sinks: ["console"], lowestLevel: "warning" },
			{
				category: [], // wildcard
				sinks: ["file", "console"],
			},
		],
	});

	logger = getLogger(["core", "index"]);

	// HEADSETS_IP entries from .env may contain stray characters (e.g. `192.168.1.1"`) due to
	// shell quoting or copy-paste artifacts. We extract the first valid IPv4 from each token and
	// warn when the raw value had to be fixed, so misconfigured IPs are never silently ignored.
	const parsedHeadsets = parseHeadsetsIp(process.env.HEADSETS_IP);
	for (const warning of parsedHeadsets.warnings) logger.warn`[HEADSETS_IP] ${warning}`;
	HEADSETS_IP = parsedHeadsets.ips;
}

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
	logger.debug(`Is Packaged: {isPackaged}`, { isPackaged: IS_PLATFORM_PACKAGED });
	logger.debug(`NODE_ENV: ${process.env.NODE_ENV}`);
	logger.debug(`Is running on a Mac Mini: ${isMacMini()}`);

	logger.trace(process.env);

	// Start static server to serve the frontend in production/executable mode
	if (process.env.NODE_ENV === "production" || IS_PLATFORM_PACKAGED) {
		new StaticServer();
	}

	useAdb = await _detectAdb();

	const c = new Controller(useAdb);
	await c.initialize();
}

async function main() {
	await loadConfiguration();

	// Third-party ADB/scrcpy libraries can emit unhandled rejections during async
	// stream teardown (e.g. ExactReadableEndedError when a device disconnects mid-session).
	// Log and continue — a long-running server must not crash on library internals.
	process.on("unhandledRejection", (reason) => {
		logger.error("Unhandled promise rejection (ignored): {reason}", { reason });
	});

	await start();
}

// Only boot the platform when this module is the process entry point. Importing
// it (e.g. from the test suite) must not spin up servers, adb, timers, etc.
function _isEntryPoint(): boolean {
	// In a packaged SEA build this bundle is always the entry point.
	if (IS_PLATFORM_PACKAGED) return true;
	try {
		const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
		const self = fileURLToPath(import.meta.url);
		// Match dev (`tsx src/api/index.ts`) and any compiled `.js`/`.cjs` sibling.
		return entry === self || entry === self.replace(/\.ts$/, ".js") || entry === self.replace(/\.ts$/, ".cjs");
	} catch {
		return false;
	}
}

if (_isEntryPoint()) {
	main().catch((err) => {
		console.error("Failed to start application:", err);
		process.exit(1);
	});
}
