import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GAMA_PROBE_EXPR, GAMA_PROBE_TIMEOUT_MS } from "../../src/api/core/Constants.ts";
import GamaConnector from "../../src/api/simulation/GamaConnector.ts";
import { demoModel, type GamaHarness, makeGamaHarness, waitFor } from "../setup/gama-harness.ts";
import { gamaUrl, isGamaReachable } from "../setup/gama-probe.ts";

// Issue #156 against a live GAMA: the connector probes GAMA for an experiment it did not launch
// and only talks to experiments it owns. The unit tests fake GAMA's answers; these check that a
// real GAMA answers the probe the way the connector expects.
process.env.GAMA_IP_ADDRESS ||= "localhost";
process.env.GAMA_WS_PORT ||= "1000";

const reachable = await isGamaReachable();
if (!reachable) {
	console.warn(`[integration] No GAMA server at ${gamaUrl()} — skipping foreign-experiment probe tests.`);
}

const LIVE_STATES = ["RUNNING", "PAUSED", "NOTREADY"];

// The pending probe is private; reading it is the only way to tell "refused" from "timed out"
const probePending = (gama: GamaConnector) => (gama as unknown as { probe: unknown }).probe !== null;

describe.skipIf(!reachable)("GamaConnector foreign-experiment probe <-> live GAMA (issue #156)", () => {
	let gama: GamaConnector;
	let harness: GamaHarness;

	beforeAll(async () => {
		harness = makeGamaHarness(demoModel());
		gama = new GamaConnector(harness.controller);
		await waitFor(() => gama.getJsonGama().connected, 10_000, "connection to GAMA");
	});

	afterAll(async () => {
		try {
			if (LIVE_STATES.includes(gama?.getJsonGama().experiment_state)) await gama.stopExperiment();
		} catch {
			/* ignore */
		}
		gama?.close();
	});

	// The headless server keeps experiments per client, so a new connection never finds one:
	// GAMA must refuse the probe right away (not leave it to time out), without an error shown.
	it("adopts nothing when GAMA has no experiment for this client, and gets an immediate answer", async () => {
		await waitFor(() => !probePending(gama), GAMA_PROBE_TIMEOUT_MS - 500, "GAMA to answer the connection probe");

		expect(gama.canTalkToExperiment()).toBe(false);
		expect(gama.getJsonGama().experiment_state).toBe("NONE");
		expect(gama.getJsonGama().foreign_experiment_detected).toBe(false);
		expect(gama.getJsonGama().content_error).toBe("");
	});

	it("can talk to the experiment it launched itself", async () => {
		gama.launchExperiment();
		await waitFor(() => gama.canTalkToExperiment(), 15_000, "own experiment to become controllable");
		expect(gama.getJsonGama().experiment_id).not.toBe("");
	});

	// adoptForeignExperiment reads the run state from this reply: "true|<cycle>" means paused
	it('a live experiment answers the probe expression as "<paused>|<cycle>"', async () => {
		harness.broadcastSimulationOutput.mockClear();
		gama.sendExpression("probe-check", GAMA_PROBE_EXPR);

		await waitFor(
			() => harness.broadcastSimulationOutput.mock.calls.some(([m]) => m?.command?.expr === GAMA_PROBE_EXPR),
			10_000,
			"GAMA to answer the probe expression",
		);
		const [reply] = harness.broadcastSimulationOutput.mock.calls.find(([m]) => m?.command?.expr === GAMA_PROBE_EXPR)!;
		expect(reply.type).toBe("CommandExecutedSuccessfully");
		expect(String(reply.content)).toMatch(/^(true|false)\|\d+$/);
	});
});
