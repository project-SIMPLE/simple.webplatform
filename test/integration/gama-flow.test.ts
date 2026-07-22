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

	it("pauses, resumes and stops the experiment from the monitor", async () => {
		// Ensure it is running first (idempotent if the previous test left it live).
		if (!LIVE_STATES.includes(experimentState(controller))) {
			monitor.send({ type: "launch_experiment" });
			await waitFor(() => LIVE_STATES.includes(experimentState(controller)), 15_000, "experiment to go live");
		}
		// Wait for GAMA to finish loading (leave the transient NOTREADY state) before
		// issuing control commands — resume/pause are no-ops until the experiment is
		// actually loaded (PAUSED/RUNNING).
		await waitFor(() => ["RUNNING", "PAUSED"].includes(experimentState(controller)), 15_000, "experiment ready");
		if (experimentState(controller) !== "RUNNING") {
			monitor.send({ type: "resume_experiment" });
			await waitFor(() => experimentState(controller) === "RUNNING", 10_000, "resume");
		}

		monitor.send({ type: "pause_experiment" });
		await waitFor(() => experimentState(controller) === "PAUSED", 10_000, "pause");
		expect(experimentState(controller)).toBe("PAUSED");

		monitor.send({ type: "resume_experiment" });
		await waitFor(() => experimentState(controller) === "RUNNING", 10_000, "resume");
		expect(experimentState(controller)).toBe("RUNNING");

		monitor.send({ type: "stop_experiment" });
		await waitFor(() => experimentState(controller) === "NONE", 10_000, "stop");
		expect(experimentState(controller)).toBe("NONE");
	});

	// Regression: issue #35 — "Cannot relaunch gama with VU then clicked on Red
	// Cross Button". After stopping an experiment (the Stop / red-cross action),
	// launching again failed to bring GAMA back up. A stop must leave GAMA in a
	// clean, relaunchable state.
	it("relaunches cleanly after a full stop (issue #35)", async () => {
		// Ensure we start from a stopped experiment (idempotent w.r.t. prior tests).
		if (experimentState(controller) !== "NONE") {
			monitor.send({ type: "stop_experiment" });
			await waitFor(() => experimentState(controller) === "NONE", 10_000, "stop before relaunch");
		}
		expect(experimentState(controller)).toBe("NONE");

		// Relaunch — this is what used to fail after a Stop with an established VU.
		monitor.send({ type: "launch_experiment" });
		await waitFor(() => LIVE_STATES.includes(experimentState(controller)), 15_000, "relaunch after stop");
		expect(LIVE_STATES).toContain(experimentState(controller));
	});
});
