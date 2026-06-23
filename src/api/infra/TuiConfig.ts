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

import { existsSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, isAbsolute, resolve } from "node:path";
import {
  intro,
  outro,
  group,
  text,
  confirm,
  isCancel,
  cancel,
  note,
} from "@clack/prompts";

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

/** Validate a TCP port (1–65535). Returns an error string or undefined. */
function validatePort(value: string): string | undefined {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    return "Enter a port between 1 and 65535";
  }
  return undefined;
}

/** Validate a hostname / IP literal. */
function validateHost(value: string): string | undefined {
  if (!value) return "Host is required";
  if (!/^[a-zA-Z0-9.-]+$/.test(value)) return "Invalid host format";
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
function defaultEnv(): string {
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
    "GAMALESS=false",
    "",
  ].join("\n");
}

// Result shape from the wizard. GAMA and advanced-network fields are optional
// because they are only asked under their respective gates.
interface WizardResult {
  useGama: boolean;
  gamaIp?: string;
  gamaWsPort?: string;
  learningPath: string;
  extraLearningPath: string;
  headsetsIp: string;
  verbose: boolean;
  extraVerbose: boolean;
  aggressiveDisconnect: boolean;
  advanced: boolean;
  headsetWsPort?: string;
  monitorWsPort?: string;
  webHost?: string;
  webPort?: string;
}

function buildEnv(cfg: WizardResult): string {
  const lines: string[] = [];

  // Advanced network values fall back to defaults when the step was skipped.
  const headsetWsPort = cfg.headsetWsPort ?? NETWORK_DEFAULTS.headsetWsPort;
  const monitorWsPort = cfg.monitorWsPort ?? NETWORK_DEFAULTS.monitorWsPort;
  const webHost = cfg.webHost ?? NETWORK_DEFAULTS.webHost;
  const webPort = cfg.webPort ?? NETWORK_DEFAULTS.webPort;

  // GAMA connection only matters when not running GAMA-less.
  if (cfg.useGama) {
    lines.push(
      `GAMA_WS_PORT=${cfg.gamaWsPort}`,
      `GAMA_IP_ADDRESS=${cfg.gamaIp}`,
      "",
    );
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
    `EXTRA_VERBOSE=${cfg.extraVerbose}`,
    "",
    `LEARNING_PACKAGE_PATH="${cfg.learningPath}"`,
    "",
    // useGama === true  ->  GAMALESS=false
    `GAMALESS=${!cfg.useGama}`,
  );

  if (cfg.extraLearningPath && cfg.extraLearningPath.trim()) {
    lines.push(`EXTRA_LEARNING_PACKAGE_PATH="${cfg.extraLearningPath.trim()}"`);
  }
  if (cfg.headsetsIp.trim()) {
    lines.push("", `HEADSETS_IP="${cfg.headsetsIp.trim()}"`);
  }
  lines.push("", `AGGRESSIVE_DISCONNECT=${cfg.aggressiveDisconnect}`, "");

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
            }) : undefined,

      gamaWsPort: ({ results }) =>
        results.useGama
          ? text({
              message: "GAMA WebSocket port",
              initialValue: "1000",
              validate: validatePort,
            }) : undefined,

      learningPath: ({ results }) =>
        results.useGama
          ? text({
            message: "Learning packages folder (relative path from here, or aboslute path)",
            placeholder: "./learning-packages",
            validate: (v) => {
              if (!v) return 'You should give a valide path';
              return folderExists(v) ? undefined : "Folder not found";
            },
          }) : undefined,

      extraLearningPath: ({ results }) =>
        results.useGama
          ? text({
            message: "Extra learning packages folder (optional, leave blank to skip)",
            defaultValue: "",
            // allow empty (it's optional), otherwise it must exist
            validate: (v) => {
              if (v == results.learningPath) 
                return "This path should not be the same as previous given path";
              return !v.trim() || folderExists(v) ? undefined : "Folder not found";
            },
          }) : undefined,

      aggressiveDisconnect: ({ results }) =>
        results.useGama
          ? confirm({
            message: "Aggressively remove players from GAMA on device disconnect?",
            initialValue: false,
          }) : undefined,

      // --- Default config ---

      headsetsIp: () =>
        text({
          message: 'Headset IPs to scrcpy (optional, ";"-separated)',
          placeholder: "192.168.68.101;192.168.68.102",
          defaultValue: "",
        }),

      verbose: () =>
        confirm({
          message: "Enable verbose logging? (Useful while developping VU)",
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
            }) : undefined,
      webPort: ({ results }) =>
        results.advanced
          ? text({
              message: "Web application port (Which port serves the web interface)",
              initialValue: NETWORK_DEFAULTS.webPort,
              validate: validatePort,
            }) : undefined,
      monitorWsPort: ({ results }) =>
        results.advanced
          ? text({
              message: "Monitor WebSocket port (Which port is used to update the web interface/streams)",
              initialValue: NETWORK_DEFAULTS.monitorWsPort,
              validate: validatePort,
            }) : undefined,
      headsetWsPort: ({ results }) =>
        results.advanced
          ? text({
              message: "Headset WebSocket port (⚠️ Change it only if you know what you're doing ⚠️)",
              initialValue: NETWORK_DEFAULTS.headsetWsPort,
              validate: validatePort,
            }) : undefined,
      extraVerbose: ({ results }) =>
        results.advanced
          ? confirm({
            message: "Enable *EXTRA* verbose logging? (Useful to develop the webplatform itself)",
            initialValue: false,
          }) : undefined,
    },
    {
      onCancel: () => {
        cancel("Configuration cancelled — no .env written.");
        process.exit(0);
      },
    },
  );

  // Guard each value (Ctrl+C inside a step) before the final review.
  if (Object.values(cfg).some((v) => isCancel(v))) {
    cancel("Configuration cancelled — no .env written.");
    process.exit(0);
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