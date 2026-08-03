import { afterAll, beforeAll, describe, expect, it } from "vitest";
import GamaConnector from "../../src/api/simulation/GamaConnector.ts";
import { demoModel, type GamaHarness, makeGamaHarness, waitFor } from "../setup/gama-harness.ts";
import { gamaUrl, isGamaReachable } from "../setup/gama-probe.ts";

// Wrong-order commands against a REAL GAMA server. NB: stopExperiment() with
// nothing running loops forever (see test/chaos-findings.md), so it is never
// called on an idle connector — afterAll only stops a live experiment.
process.env.GAMA_IP_ADDRESS ||= "localhost";
process.env.GAMA_WS_PORT ||= "1000";

const reachable = await isGamaReachable();
if (!reachable) {
	console.warn(`[integration] No GAMA server at ${gamaUrl()} — skipping GAMA chaos tests.`);
}

const LIVE_STATES = ["RUNNING", "PAUSED", "NOTREADY"];
const isLive = (gama: GamaConnector) => LIVE_STATES.includes(gama.getJsonGama().experiment_state);

describe.skipIf(!reachable)("GAMA chaos — wrong-order commands (live GAMA)", () => {
	let gama: GamaConnector;
	let harness: GamaHarness;

	beforeAll(async () => {
		harness = makeGamaHarness(demoModel());
		gama = new GamaConnector(harness.controller);
		await waitFor(() => gama.getJsonGama().connected, 10_000, "connection to GAMA");
	});

	afterAll(async () => {
		try {
			if (gama && isLive(gama)) await gama.stopExperiment();
		} catch {
			/* ignore */
		}
		gama?.close();
	});

	it("ignores player/experiment commands issued before any experiment exists", async () => {
		harness.players.set("p1", { in_game: false });
		gama.sendExpression("p1", 'write "before launch";');
		gama.addInGamePlayer("p1");
		gama.pauseExperiment();
		gama.resumeExperiment();
		gama.removeInGamePlayer("p1");
		await new Promise((r) => setTimeout(r, 400));
		expect(gama.getJsonGama().content_error).toBe("");
		expect(gama.getJsonGama().experiment_state).toBe("NONE");
	});

	it("a redundant launch while one is already live does not error", async () => {
		gama.launchExperiment();
		await waitFor(() => gama.getJsonGama().experiment_id !== "" && isLive(gama), 15_000, "experiment to load");
		gama.launchExperiment(); // guard: only acts when state === "NONE"
		await new Promise((r) => setTimeout(r, 400));
		expect(gama.getJsonGama().content_error).toBe("");
		expect(isLive(gama)).toBe(true);
	});
});
