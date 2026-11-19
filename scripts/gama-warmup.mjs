#!/usr/bin/env node
/**
 * Warm a freshly started GAMA server up before the tests that use it.
 *
 * The CI "Start GAMA WebSocket server" steps only wait for the TCP port to open.
 * GAMA then still has to finish booting and, on the first `load`, compile the
 * model, which is far slower than every later load. That first compile landed
 * inside the integration tests' 15 s budgets, and on the slower macOS runners it
 * no longer fit (the first launch test timed out while every other one passed).
 *
 * This script does that first load once, outside the tests, with a generous
 * budget: it connects (retrying until GAMA accepts WebSocket connections), loads
 * the demo learning package's experiment, waits for GAMA's acknowledgement, then
 * stops the experiment so the tests start from a clean server.
 *
 * Usage:
 *   node scripts/gama-warmup.mjs [--settings=<learning package settings.json>] [--timeout=<seconds>]
 *
 *   --settings  defaults to learning-packages/demo/settings.json, the model the
 *               integration tests launch.
 *   --timeout   whole warm-up budget, default 300 s.
 *
 * GAMA's address comes from GAMA_IP_ADDRESS / GAMA_WS_PORT, like GamaConnector.
 * Exits 0 once the load is acknowledged, 1 otherwise (GAMA error, or timeout).
 */

import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import WebSocket from "ws";

const flags = process.argv.slice(2);
const flag = (name, fallback) => flags.find((f) => f.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

const settingsPath = resolve(flag("settings", "learning-packages/demo/settings.json"));
const timeoutMs = Number(flag("timeout", "300")) * 1000;
const url = `ws://${process.env.GAMA_IP_ADDRESS || "localhost"}:${process.env.GAMA_WS_PORT || "1000"}`;

// Same error types GamaConnector treats as errors (src/api/core/Constants.ts)
const GAMA_ERRORS = [
	"SimulationStatusError",
	"SimulationErrorDialog",
	"SimulationError",
	"RuntimeError",
	"GamaServerError",
	"MalformedRequest",
	"UnableToExecuteRequest",
];

const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
// Relative model paths are relative to the settings.json, as in Model.ts
const model = isAbsolute(settings.model_file_path)
	? settings.model_file_path
	: resolve(dirname(settingsPath), settings.model_file_path);
const experiment = settings.experiment_name;

const started = Date.now();
const deadline = started + timeoutMs;
const elapsed = () => `${((Date.now() - started) / 1000).toFixed(1)} s`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(message) {
	console.log(`::error::GAMA warm-up failed after ${elapsed()}: ${message}`);
	process.exit(1);
}

/** Opens a WebSocket to GAMA, retrying until it accepts one or the budget runs out. */
async function connect() {
	let lastError = "";
	while (Date.now() < deadline) {
		const ws = new WebSocket(url);
		const outcome = await new Promise((done) => {
			ws.once("open", () => done(null));
			ws.once("error", (err) => done(err.message || err.code || String(err)));
		});
		if (outcome === null) return ws;
		lastError = outcome;
		ws.terminate();
		await sleep(1000);
	}
	fail(`no WebSocket connection to ${url} (${lastError})`);
}

/** Resolves with the first GAMA message for which `match` returns true; rejects on a GAMA error. */
function waitForMessage(ws, match, budgetMs) {
	return new Promise((done, reject) => {
		const timer = setTimeout(() => {
			ws.off("message", onMessage);
			reject(new Error(`no answer within ${Math.round(budgetMs / 1000)} s`));
		}, budgetMs);
		function onMessage(raw) {
			let message;
			try {
				message = JSON.parse(raw.toString());
			} catch {
				return;
			}
			if (GAMA_ERRORS.includes(message.type)) {
				clearTimeout(timer);
				ws.off("message", onMessage);
				reject(new Error(`${message.type}: ${JSON.stringify(message.content ?? message).slice(0, 500)}`));
			} else if (match(message)) {
				clearTimeout(timer);
				ws.off("message", onMessage);
				done(message);
			}
		}
		ws.on("message", onMessage);
	});
}

const isAck = (type) => (m) => m.type === "CommandExecutedSuccessfully" && m.command?.type === type;

console.log(`GAMA warm-up: loading "${experiment}" from ${model} on ${url}`);
const ws = await connect();
console.log(`Connected after ${elapsed()}`);

let ack;
try {
	const loaded = waitForMessage(ws, isAck("load"), deadline - Date.now());
	ws.send(JSON.stringify({ type: "load", model, experiment }));
	ack = await loaded;
} catch (err) {
	fail(`load of "${experiment}": ${err.message}`);
}
console.log(`Experiment loaded after ${elapsed()} (id ${ack.content})`);

// Leave the server as the tests expect it: no experiment. A missed stop isn't
// fatal, the server is warm either way.
try {
	const stopped = waitForMessage(ws, isAck("stop"), 30_000);
	ws.send(JSON.stringify({ type: "stop", exp_id: ack.content }));
	await stopped;
	console.log(`Experiment stopped after ${elapsed()}`);
} catch (err) {
	console.log(`::warning::GAMA warm-up: stopping the experiment failed (${err.message}), continuing`);
}

ws.close();
console.log(`GAMA is warm (${elapsed()})`);
process.exit(0);
