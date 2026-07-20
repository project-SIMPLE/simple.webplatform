import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Controller from "../../src/api/core/Controller.ts";
import GamaConnector from "../../src/api/simulation/GamaConnector.ts";
import Model from "../../src/api/simulation/Model.ts";
import type { VU_MODEL_SETTING_JSON } from "../../src/common/types.ts";
import { gamaUrl, isGamaReachable } from "../setup/gama-probe.ts";

// Point GamaConnector at the same server the probe checks.
process.env.GAMA_IP_ADDRESS ||= "localhost";
process.env.GAMA_WS_PORT ||= "1000";

// Real GAMA required. When none is reachable the whole suite is skipped, so the
// unit/frontend lanes always run offline. To run locally, start GAMA with its
// WebSocket server enabled on GAMA_WS_PORT (default 1000).
const reachable = await isGamaReachable();
if (!reachable) {
	console.warn(`[integration] No GAMA server at ${gamaUrl()} — skipping GAMA integration tests.`);
}

// Minimal Controller wiring: a real Model for the bundled demo, plus no-op
// stubs for the collaborators GamaConnector calls during a session.
function makeHarness(model: Model): Controller {
	return {
		notifyMonitor: () => {},
		cancelLaunchInterval: () => {},
		broadcastSimulationOutput: () => {},
		player_manager: {
			disableAllPlayerInGame: () => {},
			getPlayerState: () => undefined,
			getPlayerId: (id: string) => id,
			togglePlayerInGame: () => {},
		},
		model_manager: {
			getActiveModel: () => model,
		},
	} as unknown as Controller;
}

async function waitFor(predicate: () => boolean, timeoutMs: number, label: string) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (predicate()) return;
		await new Promise((r) => setTimeout(r, 100));
	}
	throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${label}`);
}

const LIVE_STATES = ["RUNNING", "PAUSED", "NOTREADY"];

describe.skipIf(!reachable)("GamaConnector <-> live GAMA", () => {
	let gama: GamaConnector;

	beforeAll(async () => {
		const demoDir = path.resolve(process.cwd(), "learning-packages/demo");
		const settingsPath = path.join(demoDir, "settings.json");
		const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as VU_MODEL_SETTING_JSON;
		const model = new Model(settingsPath, settings);

		gama = new GamaConnector(makeHarness(model));
		await waitFor(() => gama.getJsonGama().connected, 10_000, "connection to GAMA");
	});

	afterAll(async () => {
		// Best-effort cleanup so we never leave an experiment running on the server.
		try {
			if (LIVE_STATES.includes(gama?.getJsonGama().experiment_state)) {
				await gama.stopExperiment();
			}
		} catch {
			/* ignore */
		}
		gama?.close();
	});

	it("establishes a connection to the GAMA server", () => {
		expect(gama.getJsonGama().connected).toBe(true);
	});

	it("loads the demo experiment and reaches a live experiment state", async () => {
		gama.launchExperiment();
		await waitFor(
			() => gama.getJsonGama().experiment_id !== "" && LIVE_STATES.includes(gama.getJsonGama().experiment_state),
			15_000,
			"demo experiment to load",
		);
		expect(gama.getJsonGama().experiment_id).not.toBe("");
		expect(gama.getJsonGama().content_error).toBe("");
	});

	it("pauses and resumes a running experiment", async () => {
		// Bring the experiment to RUNNING if it isn't already.
		if (gama.getJsonGama().experiment_state === "PAUSED") {
			gama.resumeExperiment();
			await waitFor(() => gama.getJsonGama().experiment_state === "RUNNING", 10_000, "resume before pause");
		}

		if (gama.getJsonGama().experiment_state === "RUNNING") {
			gama.pauseExperiment();
			await waitFor(() => gama.getJsonGama().experiment_state === "PAUSED", 10_000, "pause");
			expect(gama.getJsonGama().experiment_state).toBe("PAUSED");

			gama.resumeExperiment();
			await waitFor(() => gama.getJsonGama().experiment_state === "RUNNING", 10_000, "resume");
			expect(gama.getJsonGama().experiment_state).toBe("RUNNING");
		}
	});

	it("stops the experiment and returns to NONE", async () => {
		await gama.stopExperiment();
		await waitFor(() => gama.getJsonGama().experiment_state === "NONE", 10_000, "stop");
		expect(gama.getJsonGama().experiment_state).toBe("NONE");
	});
});
