// src/api/infra/TuiConfig.ts
//
// First-run configuration wizard for simple.webplatform.
// Collects the values from .env.example and writes a .env next to the
// executable (or the project root in dev). Designed to run before dotenv
// loads in src/api/index.ts.
//
//   import { ensureConfig } from "./infra/TuiConfig.js";
//   await ensureConfig();        // no-op if .env already exists
//   // ...then load dotenv and start the server
//
// deps: npm i @clack/prompts

import { existsSync, statSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { cancel, confirm, group, intro, isCancel, note, outro, path, text } from "@clack/prompts";

// In a pkg binary, the real on-disk location is the executable's directory.
// In dev (tsx/vite), fall back to the current working directory.
// @ts-expect-error `process.pkg` is injected by @yao-pkg/pkg at runtime.
const isPackaged = typeof process.pkg !== "undefined";
const baseDir = isPackaged ? dirname(process.execPath) : process.cwd();
const envPath = join(baseDir, ".env");

const forceReconfigure = process.argv.includes("--configure");

// Defaults for the advanced network block. Used both for the non-interactive
// fallback and whenever the user skips the advanced step.
const NETWORK_DEFAULTS = {
	headsetWsPort: "8080",
	monitorWsPort: "8001",
	webHost: "0.0.0.0",
	webPort: "8000",
} as const;

// DeviceFinder can only auto-scan for headsets when the server sits in this
// subnet; outside it, auto-detection disables itself. Keep in sync with
// src/api/android/adb/DeviceFinder.ts.
const HEADSET_SUBNET_PREFIX = "192.168.68";

/**
 * True if this machine has a non-internal IPv4 address in the headset subnet —
 * i.e. runtime auto-detection would actually find something. Mirrors the
 * interface walk in DeviceFinder.autoDetectDevices().
 */
function isOnHeadsetSubnet(): boolean {
	for (const [name, infos] of Object.entries(networkInterfaces())) {
		// Skip loopback and tailscale/VPN interfaces, like DeviceFinder does.
		if (name.startsWith("lo") || name.startsWith("tail")) continue;
		for (const i of infos ?? []) {
			if (i.family === "IPv4" && !i.internal && i.address.startsWith(HEADSET_SUBNET_PREFIX)) {
				return true;
			}
		}
	}
	return false;
}

// Clack passes `undefined` to `validate` when a field is submitted empty (the
// default value is only applied afterwards), so every validator coerces first.

/** Validate a TCP port (1–65535). Returns an error string or undefined. */
export function validatePort(value: string | undefined): string | undefined {
	const trimmed = (value ?? "").trim();
	if (!trimmed) return "Port is required";
	if (!/^\d+$/.test(trimmed)) return "Port must be a number";
	const n = Number(trimmed);
	if (!Number.isInteger(n) || n < 1 || n > 65535) {
		return "Enter a port between 1 and 65535";
	}
	return undefined;
}

/**
 * Validate a TCP port and ensure it doesn't collide with ports already chosen
 * earlier in the wizard. `used` is the list of previously-entered port values.
 */
export function validatePortUnique(value: string | undefined, used: Array<string | undefined>): string | undefined {
	const base = validatePort(value);
	if (base) return base;
	const n = Number((value ?? "").trim());
	if (used.some((p) => p !== undefined && Number(p) === n)) {
		return "This port is already used by another service";
	}
	return undefined;
}

/** True if `v` is a well-formed IPv4 literal (each octet 0–255). */
export function isIpv4(v: string): boolean {
	const m = v.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (!m) return false;
	return m.slice(1).every((octet) => Number(octet) <= 255);
}

// Hostname per RFC-1123: dot-separated labels, each 1–63 chars of
// alphanumerics/hyphens, no leading/trailing hyphen, no empty labels.
export const HOSTNAME_RE =
	/^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/** Validate a hostname or IPv4 literal. */
export function validateHost(value: string | undefined): string | undefined {
	const v = (value ?? "").trim();
	if (!v) return "Host is required";
	// Digits-and-dots only -> it's meant to be an IPv4, so require a valid one.
	// (Catches typos like "1992.22..22" that aren't valid hostnames either.)
	if (/^[\d.]+$/.test(v)) {
		return isIpv4(v) ? undefined : "Invalid IPv4 address";
	}
	if (!HOSTNAME_RE.test(v)) return "Invalid host format";
	return undefined;
}

/**
 * Validate an optional ";"-separated list of headset IPv4 addresses.
 * Empty input is allowed (the setting is optional).
 */
export function validateHeadsetsIp(value: string | undefined): string | undefined {
	const v = value ?? "";
	if (!v.trim()) return undefined;
	const parts = v
		.split(";")
		.map((s) => s.trim())
		.filter(Boolean);
	if (parts.length === 0) return undefined;
	const invalid = parts.filter((p) => !isIpv4(p));
	if (invalid.length) return `Invalid IP address: ${invalid.join(", ")}`;
	return undefined;
}

/** True if `p` points to an existing folder (relative paths resolve against baseDir). */
function folderExists(p: string): boolean {
	const full = isAbsolute(p) ? p : resolve(baseDir, p);
	try {
		return statSync(full).isDirectory();
	} catch {
		return false; // ENOENT (or no permission) -> treat as missing
	}
}

/** Default .env contents, used when we cannot run an interactive prompt. */
export function defaultEnv(): string {
	return [
		"GAMA_WS_PORT=1000",
		"GAMA_IP_ADDRESS=localhost",
		`HEADSET_WS_PORT=${NETWORK_DEFAULTS.headsetWsPort}`,
		`MONITOR_WS_PORT=${NETWORK_DEFAULTS.monitorWsPort}`,
		`WEB_APPLICATION_HOST=${NETWORK_DEFAULTS.webHost}`,
		`WEB_APPLICATION_PORT=${NETWORK_DEFAULTS.webPort}`,
		"VERBOSE=false",
		"EXTRA_VERBOSE=false",
		'LEARNING_PACKAGE_PATH="./learning-packages"',
		"ENV_GAMALESS=false",
		"AGGRESSIVE_DISCONNECT=false",
		"",
	].join("\n");
}

// Result shape from the wizard. GAMA and advanced-network fields are optional
// because they are only asked under their respective gates.
export interface WizardResult {
	useGama: boolean;
	gamaIp?: string;
	gamaWsPort?: string;
	learningPath: string;
	useExtraLearningPath: boolean;
	extraLearningPath: string;
	autoDetectHeadsets: boolean;
	headsetsIp?: string;
	verbose: boolean;
	extraVerbose: boolean;
	aggressiveDisconnect: boolean;
	advanced: boolean;
	headsetWsPort?: string;
	monitorWsPort?: string;
	webHost?: string;
	webPort?: string;
}

export function buildEnv(cfg: WizardResult): string {
	const lines: string[] = [];

	// Advanced network values fall back to defaults when the step was skipped.
	const headsetWsPort = cfg.headsetWsPort ?? NETWORK_DEFAULTS.headsetWsPort;
	const monitorWsPort = cfg.monitorWsPort ?? NETWORK_DEFAULTS.monitorWsPort;
	const webHost = cfg.webHost ?? NETWORK_DEFAULTS.webHost;
	const webPort = cfg.webPort ?? NETWORK_DEFAULTS.webPort;

	// GAMA connection only matters when not running GAMA-less.
	if (cfg.useGama) {
		lines.push(`GAMA_WS_PORT=${cfg.gamaWsPort}`, `GAMA_IP_ADDRESS=${cfg.gamaIp}`, "");
	}

	lines.push(
		`HEADSET_WS_PORT=${headsetWsPort}`,
		"",
		`MONITOR_WS_PORT=${monitorWsPort}`,
		"",
		`WEB_APPLICATION_HOST=${webHost}`,
		`WEB_APPLICATION_PORT=${webPort}`,
		"",
		`VERBOSE=${cfg.verbose}`,
		"",
		// useGama === true  ->  ENV_GAMALESS=false
		`ENV_GAMALESS=${!cfg.useGama}`,
	);

	// Learning packages are only asked (and only relevant) in GAMA mode.
	if (cfg.useGama && cfg.learningPath) {
		lines.push("", `LEARNING_PACKAGE_PATH="${cfg.learningPath}"`);
		if (cfg.extraLearningPath?.trim()) {
			lines.push(`EXTRA_LEARNING_PACKAGE_PATH="${cfg.extraLearningPath.trim()}"`);
		}
	}
	if (cfg.extraVerbose ?? false) {
		lines.push("", `EXTRA_VERBOSE=${cfg.extraVerbose}`);
	}
	// Left unset when auto-detection is enabled, so DeviceFinder scans on startup.
	if (cfg.headsetsIp?.trim()) {
		lines.push("", `HEADSETS_IP="${cfg.headsetsIp.trim()}"`);
	}
	lines.push("", `AGGRESSIVE_DISCONNECT=${cfg.aggressiveDisconnect ?? false}`, "");

	return lines.join("\n");
}

/**
 * Ensure a .env exists. If one is already present and --configure was not
 * passed, this is a no-op. Otherwise run the wizard (or, with no TTY, write
 * sensible defaults so a headless launch never blocks).
 */
export async function ensureConfig(): Promise<void> {
	if (existsSync(envPath) && !forceReconfigure) {
		return;
	}

	// No interactive terminal (double-click on some platforms, service,
	// piped stdin): never block. Write defaults and carry on.
	if (!process.stdin.isTTY) {
		if (!existsSync(envPath)) {
			writeFileSync(envPath, defaultEnv(), "utf8");
			console.warn(`No .env found and no terminal attached — wrote defaults to ${envPath}`);
		}
		return;
	}

	intro("SIMPLE WebPlatform — initial configuration");
	note(`Configuration will be written to:\n${envPath}`, "Location");

	// Only worth offering headset auto-detection when this machine is actually on
	// the subnet DeviceFinder scans; otherwise force manual entry.
	const canAutoDetectHeadsets = isOnHeadsetSubnet();

	const cfg = await group(
		{
			useGama: () =>
				confirm({
					message: "Do you want to use the webplatform with GAMA?",
					initialValue: true,
				}),

			// Conditional steps: branch INSIDE the function using prior `results`.
			// Returning undefined skips the prompt (the key comes back undefined).
			gamaIp: ({ results }) =>
				results.useGama
					? text({
							message: "GAMA server IP address",
							placeholder: "localhost",
							initialValue: "localhost",
							validate: validateHost,
						})
					: undefined,

			gamaWsPort: ({ results }) =>
				results.useGama
					? text({
							message: "GAMA WebSocket port",
							initialValue: "1000",
							validate: validatePort,
						})
					: undefined,

			learningPath: ({ results }) =>
				results.useGama
					? path({
							message: "Learning packages folder (relative path from here, or absolute path)",
							root: `${process.cwd()}/`,
							directory: true,
							validate: (v) => {
								const p = (v ?? "").trim();
								if (!p) return "Learning packages folder is required";
								return folderExists(p) ? undefined : "Folder not found";
							},
						})
					: undefined,

			useExtraLearningPath: ({ results }) =>
				results.useGama
					? confirm({
							message: "Do you want to set an extra path to learning packages?",
							initialValue: false,
						})
					: undefined,

			extraLearningPath: ({ results }) =>
				results.useGama && results.useExtraLearningPath
					? path({
							message: "Extra learning packages folder (optional, leave blank to skip)",
							root: `${process.cwd()}/`,
							directory: true,
							// allow empty (it's optional), otherwise it must exist
							validate: (v) => {
								const p = (v ?? "").trim();
								if (!p) return undefined;
								const same = resolve(baseDir, p) === resolve(baseDir, (results.learningPath as string) ?? "");
								if (same) return "This path should not be the same as the previous path";
								return folderExists(p) ? undefined : "Folder not found";
							},
						})
					: undefined,

			aggressiveDisconnect: ({ results }) =>
				results.useGama
					? confirm({
							message: "Aggressively remove players from GAMA on device disconnect?",
							initialValue: false,
						})
					: undefined,

			// --- Default config ---

			// Only offered when this machine is on the headset subnet: leaving
			// HEADSETS_IP unset lets DeviceFinder auto-scan on first run. Off-subnet,
			// this prompt is skipped and we fall through to manual entry.
			autoDetectHeadsets: () =>
				canAutoDetectHeadsets
					? confirm({
							message: "Auto-detect headsets on the local network? (Otherwise list their IPs manually)",
							initialValue: true,
						})
					: undefined,

			headsetsIp: ({ results }) =>
				results.autoDetectHeadsets
					? undefined
					: text({
							message: 'Headset IPs to scrcpy (optional, ";"-separated)',
							placeholder: "192.168.68.101;192.168.68.102",
							defaultValue: "",
							validate: validateHeadsetsIp,
						}),

			verbose: () =>
				confirm({
					message: "Enable verbose logging? (Useful while developing VU)",
					initialValue: false,
				}),

			// --- Advanced gate (declared BEFORE the steps it controls) ---
			advanced: () =>
				confirm({
					message: "Configure advanced network settings? (Application's ports & bind address)",
					initialValue: false,
				}),

			webHost: ({ results }) =>
				results.advanced
					? text({
							message: "Web application host / bind address (Default setting make it reachable on your local network)",
							initialValue: NETWORK_DEFAULTS.webHost,
							validate: validateHost,
						})
					: undefined,
			webPort: ({ results }) =>
				results.advanced
					? text({
							message: "Web application port (Which port serves the web interface)",
							initialValue: NETWORK_DEFAULTS.webPort,
							validate: (v) => validatePortUnique(v, [results.gamaWsPort]),
						})
					: undefined,
			monitorWsPort: ({ results }) =>
				results.advanced
					? text({
							message: "Monitor WebSocket port (Which port is used to update the web interface/streams)",
							initialValue: NETWORK_DEFAULTS.monitorWsPort,
							validate: (v) => validatePortUnique(v, [results.gamaWsPort, results.webPort]),
						})
					: undefined,
			headsetWsPort: ({ results }) =>
				results.advanced
					? text({
							message: "Headset WebSocket port (⚠️ Change it only if you know what you're doing ⚠️)",
							initialValue: NETWORK_DEFAULTS.headsetWsPort,
							validate: (v) => validatePortUnique(v, [results.gamaWsPort, results.webPort, results.monitorWsPort]),
						})
					: undefined,
			extraVerbose: ({ results }) =>
				results.advanced
					? confirm({
							message: "Enable *EXTRA* verbose logging? (Useful to develop the webplatform itself)",
							initialValue: false,
						})
					: undefined,
		},
		{
			onCancel: () => {
				cancel("Configuration cancelled — no .env written.");
				process.exit(0);
			},
		},
	);

	// Final cross-check: a custom GAMA port (asked before the advanced step) can
	// still collide with a default port the user never got prompted for.
	const resolved = cfg as WizardResult;
	const portEntries: Array<[string, string]> = [
		["HEADSET_WS_PORT", resolved.headsetWsPort ?? NETWORK_DEFAULTS.headsetWsPort],
		["MONITOR_WS_PORT", resolved.monitorWsPort ?? NETWORK_DEFAULTS.monitorWsPort],
		["WEB_APPLICATION_PORT", resolved.webPort ?? NETWORK_DEFAULTS.webPort],
	];
	if (resolved.useGama && resolved.gamaWsPort) {
		portEntries.push(["GAMA_WS_PORT", resolved.gamaWsPort]);
	}
	const seen = new Map<number, string>();
	for (const [name, value] of portEntries) {
		const n = Number(value);
		const other = seen.get(n);
		if (other) {
			cancel(`Port ${n} is used by both ${other} and ${name}. Re-run configuration with distinct ports.`);
			process.exit(1);
		}
		seen.set(n, name);
	}

	const shouldProceed = await confirm({
		message: "[Finished] Is all the configuration above correct?",
		initialValue: true,
	});

	// shouldProceed can itself be the cancel symbol (truthy!), so check isCancel
	// explicitly rather than relying on `!shouldProceed`.
	if (isCancel(shouldProceed) || !shouldProceed) {
		cancel("Configuration cancelled — no .env written.");
		process.exit(0);
	}

	writeFileSync(envPath, buildEnv(cfg as WizardResult), "utf8");
	outro(`Saved configuration to ${envPath}`);
}
