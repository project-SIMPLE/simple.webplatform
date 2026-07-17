import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Controller from "../../src/api/core/Controller.ts";
import { freePort } from "../setup/free-port.ts";
import { waitFor } from "../setup/gama-harness.ts";
import { gamaUrl, isGamaReachable } from "../setup/gama-probe.ts";
import { openClient, type TestClient } from "../setup/ws-client.ts";

// Fully mock-free path: a real Controller (real MonitorServer + PlayerManager +
// GamaConnector, adb off) driven by a real monitor WebSocket client against a
// live GAMA server. No component under test is stubbed.
process.env.GAMA_IP_ADDRESS ||= "localhost";
process.env.GAMA_WS_PORT ||= "1000";
process.env.LEARNING_PACKAGE_PATH ||= "./learning-packages";
process.env.EXTRA_LEARNING_PACKAGE_PATH ||= "";

const reachable = await isGamaReachable();
if (!reachable) {
	console.warn(`[integration] No GAMA server at ${gamaUrl()} — skipping monitor→Controller→GAMA flow test.`);
}

const LIVE_STATES = ["RUNNING", "PAUSED", "NOTREADY"];
const experimentState = (c: Controller) => c.gama_connector?.getJsonGama().experiment_state ?? "NONE";

describe.skipIf(!reachable)("monitor → Controller → GAMA launch flow (live GAMA)", () => {
	let controller: Controller;
	let monitor: TestClient;

	beforeAll(async () => {
		process.env.MONITOR_WS_PORT = String(await freePort());
		process.env.HEADSET_WS_PORT = String(await freePort());

		// Constructor brings up MonitorServer + PlayerManager + GamaConnector; we skip
		// initialize() to avoid the adb/UPS/3h-timer side effects (not needed here).
		controller = new Controller(false);
		await waitFor(() => controller.gama_connector?.getJsonGama().connected === true, 10_000, "GAMA connection");

		monitor = openClient(`ws://127.0.0.1:${process.env.MONITOR_WS_PORT}`);
		await monitor.waitOpen();
	});

	afterAll(async () => {
		try {
			controller?.cancelLaunchInterval();
			if (LIVE_STATES.includes(experimentState(controller))) await controller.gama_connector?.stopExperiment();
		} catch {
			/* ignore */
		}
		await monitor?.close();
		try {
			controller?.gama_connector?.close();
			controller?.monitor_server.close();
			controller?.player_manager.close();
		} catch {
			/* ignore */
		}
	});

	it("launches the experiment when the monitor sends launch_experiment", async () => {
		monitor.send({ type: "launch_experiment" });
		await waitFor(() => LIVE_STATES.includes(experimentState(controller)), 15_000, "experiment to go live");
		expect(LIVE_STATES).toContain(experimentState(controller));
		// The monitor also receives the updated state broadcast.
		const state = await monitor.waitFor((m) => m.type === "json_state", 5_000);
		expect(state.gama).toBeDefined();
	});
});
