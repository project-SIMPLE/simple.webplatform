import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Controller } from "../../src/api/core/Controller.ts";
import { MonitorServer } from "../../src/api/monitoring/MonitorServer.ts";
import { freePort } from "../setup/free-port.ts";
import { openClient, type TestClient } from "../setup/ws-client.ts";

const SETTINGS = { type: "json_settings", name: "Demo" };

// Recording Controller at MonitorServer's output boundary, with a one-model
// model_manager so bounds checks and the active-model replies work.
function recordingController() {
	const activeModel = { getJsonSettings: () => SETTINGS, toString: () => "Demo" };
	return {
		launchExperiment: vi.fn(),
		stopExperiment: vi.fn(),
		pauseExperiment: vi.fn(),
		resumeExperiment: vi.fn(),
		addInGamePlayer: vi.fn(),
		purgePlayer: vi.fn(),
		getSimulationInformations: vi.fn(() => ({ type: "simulation_informations" })),
		model_manager: {
			getModelList: () => [activeModel],
			setActiveModelByIndex: vi.fn(),
			getActiveModel: () => activeModel,
		},
		player_manager: { getArrayPlayerList: () => ({}) },
		gama_connector: { getJsonGama: () => ({ connected: true, experiment_state: "NONE" }) },
	} as unknown as Controller;
}

describe("MonitorServer over a real WebSocket", () => {
	let server: MonitorServer;
	let controller: Controller;
	let client: TestClient;

	beforeEach(async () => {
		const port = await freePort();
		process.env.MONITOR_WS_PORT = String(port);
		controller = recordingController();
		server = new MonitorServer(controller);
		client = openClient(`ws://127.0.0.1:${port}`);
		await client.waitOpen();
	});

	afterEach(async () => {
		await client.close();
		server.close();
	});

	it("pushes json_state and settings to a freshly connected monitor", async () => {
		const state = await client.waitFor((m) => m.type === "json_state");
		expect(state.gama).toBeDefined();
		const settings = await client.waitFor((m) => m.type === "json_settings");
		expect(settings.name).toBe("Demo");
	});

	it.each([
		["launch_experiment", "launchExperiment"],
		["stop_experiment", "stopExperiment"],
		["pause_experiment", "pauseExperiment"],
		["resume_experiment", "resumeExperiment"],
	] as const)("routes %s to Controller.%s", async (type, method) => {
		client.send({ type });
		await vi.waitFor(() => expect(controller[method]).toHaveBeenCalledTimes(1));
	});

	it("routes add/remove_player_headset with the player id", async () => {
		client.send({ type: "add_player_headset", id: "p9" });
		await vi.waitFor(() => expect(controller.addInGamePlayer).toHaveBeenCalledWith("p9"));
		client.send({ type: "remove_player_headset", id: "p9" });
		await vi.waitFor(() => expect(controller.purgePlayer).toHaveBeenCalledWith("p9"));
	});

	it("returns the selected simulation for an in-bounds index", async () => {
		client.send({ type: "get_simulation_by_index", simulationIndex: 0 });
		const reply = await client.waitFor((m) => m.type === "get_simulation_by_index");
		expect(reply.simulation).toEqual(SETTINGS);
		expect(controller.model_manager?.setActiveModelByIndex).toHaveBeenCalledWith(0);
	});

	it("ignores an out-of-bounds index (no active-model change, no reply)", async () => {
		client.send({ type: "get_simulation_by_index", simulationIndex: 5 });
		await expect(client.waitFor((m) => m.type === "get_simulation_by_index", 500)).rejects.toThrow(/timed out/);
		expect(controller.model_manager?.setActiveModelByIndex).not.toHaveBeenCalled();
	});
});
