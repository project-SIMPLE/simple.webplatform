import { afterAll, beforeAll, describe, expect, it } from "vitest";
import GamaConnector from "../../src/api/simulation/GamaConnector.ts";
import { demoModel, type GamaHarness, makeGamaHarness, waitFor } from "../setup/gama-harness.ts";
import { gamaUrl, isGamaReachable } from "../setup/gama-probe.ts";

process.env.GAMA_IP_ADDRESS ||= "localhost";
process.env.GAMA_WS_PORT ||= "1000";

const reachable = await isGamaReachable();
if (!reachable) {
	console.warn(`[integration] No GAMA server at ${gamaUrl()} — skipping GAMA player-lifecycle tests.`);
}

const LIVE_STATES = ["RUNNING", "PAUSED", "NOTREADY"];
const isLive = (gama: GamaConnector) => LIVE_STATES.includes(gama.getJsonGama().experiment_state);

describe.skipIf(!reachable)("GAMA player lifecycle (live GAMA)", () => {
	let gama: GamaConnector;
	let harness: GamaHarness;

	beforeAll(async () => {
		harness = makeGamaHarness(demoModel());
		gama = new GamaConnector(harness.controller);
		await waitFor(() => gama.getJsonGama().connected, 10_000, "connection to GAMA");
		gama.launchExperiment();
		await waitFor(() => gama.getJsonGama().experiment_id !== "" && isLive(gama), 15_000, "demo experiment to load");
	});

	afterAll(async () => {
		try {
			if (gama && isLive(gama)) await gama.stopExperiment();
		} catch {
			/* ignore */
		}
		gama?.close();
	});

	it("adds a player into the running experiment (create_player)", async () => {
		harness.players.set("player-1", { in_game: false });
		gama.addInGamePlayer("player-1");
		await new Promise((r) => setTimeout(r, 500));
		expect(gama.getJsonGama().content_error).toBe("");
		expect(isLive(gama)).toBe(true);
	});

	it("removes the player from the experiment (remove_player)", async () => {
		harness.players.set("player-1", { in_game: true });
		gama.removeInGamePlayer("player-1");
		await new Promise((r) => setTimeout(r, 500));
		expect(gama.getJsonGama().content_error).toBe("");
	});

	it("sends a raw expression without erroring the experiment", async () => {
		gama.sendExpression("player-1", 'write "hello from the test suite";');
		await new Promise((r) => setTimeout(r, 500));
		expect(gama.getJsonGama().content_error).toBe("");
		expect(isLive(gama)).toBe(true);
	});
});
