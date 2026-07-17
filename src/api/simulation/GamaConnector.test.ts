import { beforeEach, describe, expect, it, vi } from "vitest";

// Replace the `ws` client with a fake that never touches the network. It records
// created instances and sent frames, and lets tests drive the on* handlers.
// Defined via vi.hoisted so both the (hoisted) vi.mock factory and the test body
// can reference the same class.
const { FakeWebSocket } = vi.hoisted(() => {
	class FakeWebSocket {
		static CONNECTING = 0;
		static OPEN = 1;
		static instances: FakeWebSocket[] = [];

		url: string;
		readyState = FakeWebSocket.CONNECTING;
		sent: string[] = [];
		onopen: (() => void) | null = null;
		onmessage: ((event: { data: string }) => void) | null = null;
		onclose: ((event: { wasClean: boolean }) => void) | null = null;
		onerror: ((error: { error: { code?: string } }) => void) | null = null;

		constructor(url: string) {
			this.url = url;
			FakeWebSocket.instances.push(this);
		}
		send(data: string) {
			this.sent.push(data);
		}
		close() {
			this.readyState = 3;
		}
	}
	return { FakeWebSocket };
});
type FakeWebSocket = InstanceType<typeof FakeWebSocket>;

vi.mock("ws", () => ({ default: FakeWebSocket }));

import type Controller from "../core/Controller.ts";
import GamaConnector from "./GamaConnector.ts";

// Spy Controller exposing just what GamaConnector touches.
function makeController() {
	return {
		notifyMonitor: vi.fn(),
		cancelLaunchInterval: vi.fn(),
		broadcastSimulationOutput: vi.fn(),
		player_manager: {
			disableAllPlayerInGame: vi.fn(),
			getPlayerState: vi.fn(),
			getPlayerId: vi.fn((id: string) => id),
			togglePlayerInGame: vi.fn(),
		},
		model_manager: {
			getActiveModel: vi.fn(() => ({
				getModelFilePath: () => "/models/Demo/DemoModelVR.gaml",
				getExperimentName: () => "vr_xp",
			})),
		},
	} as unknown as Controller;
}

function newConnector() {
	const controller = makeController();
	const gama = new GamaConnector(controller);
	const socket = FakeWebSocket.instances.at(-1)!;
	return { gama, controller, socket };
}

beforeEach(() => {
	FakeWebSocket.instances = [];
	vi.stubEnv("GAMA_IP_ADDRESS", "localhost");
	vi.stubEnv("GAMA_WS_PORT", "1000");
});

describe("GamaConnector JSON builders", () => {
	it("jsonLoadExperiment uses the active model's file path and experiment name", () => {
		const { gama } = newConnector();
		expect(gama.jsonLoadExperiment()).toEqual({
			type: "load",
			model: "/models/Demo/DemoModelVR.gaml",
			experiment: "vr_xp",
		});
	});

	it("jsonControlGamaExperiment echoes the current experiment id", () => {
		const { gama } = newConnector();
		gama.setGamaExperimentId("exp-42");
		expect(gama.jsonControlGamaExperiment("pause")).toEqual({ type: "pause", exp_id: "exp-42" });
	});

	it("jsonTogglePlayer builds a create/remove GAML expression", () => {
		const { gama } = newConnector();
		gama.setGamaExperimentId("exp-1");
		expect(gama.jsonTogglePlayer("create", "p3")).toEqual({
			type: "expression",
			exp_id: "exp-1",
			expr: 'do create_player("p3");',
		});
		expect(gama.jsonTogglePlayer("remove", "p3").expr).toBe('do remove_player("p3");');
	});

	it("getJsonState wraps the gama state with an empty player list", () => {
		const { gama } = newConnector();
		const state = gama.getJsonState();
		expect(state.type).toBe("json_state");
		expect(state.player).toEqual([]);
		expect(state.gama).toBe(gama.getJsonGama());
	});
});

describe("GamaConnector connection", () => {
	it("connects to the configured GAMA URL and flips connection state on open", () => {
		const { gama, socket } = newConnector();
		expect(socket.url).toBe("ws://localhost:1000");
		expect(gama.getJsonGama().connected).toBe(false);

		socket.onopen?.();
		expect(gama.getJsonGama().connected).toBe(true);
		expect(gama.getJsonGama().experiment_state).toBe("NONE");
	});
});

describe("GamaConnector message dispatch", () => {
	function receive(socket: FakeWebSocket, message: unknown) {
		socket.onmessage?.({ data: JSON.stringify(message) });
	}

	it("SimulationStatus updates experiment id and state", () => {
		const { gama, socket } = newConnector();
		receive(socket, { type: "SimulationStatus", exp_id: "e1", content: "RUNNING" });
		expect(gama.getJsonGama().experiment_id).toBe("e1");
		expect(gama.getJsonGama().experiment_state).toBe("RUNNING");
	});

	it("SimulationStatus RUNNING->NONE tears down the launch loop and players", () => {
		const { gama, controller, socket } = newConnector();
		receive(socket, { type: "SimulationStatus", exp_id: "e1", content: "RUNNING" });
		receive(socket, { type: "SimulationStatus", exp_id: "e1", content: "NONE" });

		expect(controller.cancelLaunchInterval).toHaveBeenCalled();
		expect(controller.player_manager.disableAllPlayerInGame).toHaveBeenCalled();
		expect(gama.getJsonGama().experiment_state).toBe("NONE");
	});

	it("SimulationOutput is parsed and broadcast", () => {
		const { controller, socket } = newConnector();
		receive(socket, { type: "SimulationOutput", content: JSON.stringify({ foo: "bar" }) });
		expect(controller.broadcastSimulationOutput).toHaveBeenCalledWith({ foo: "bar" });
	});

	it("CommandExecutedSuccessfully of a load stores the experiment name", () => {
		const { gama, socket } = newConnector();
		receive(socket, {
			type: "CommandExecutedSuccessfully",
			command: { type: "load" },
			content: "vr_xp_123",
		});
		expect(gama.getJsonGama().experiment_name).toBe("vr_xp_123");
		expect(gama.getJsonGama().content_error).toBe("");
	});

	it("known GAMA error types are recorded as content_error", () => {
		const { gama, socket } = newConnector();
		const errorFrame = { type: "RuntimeError", content: "boom" };
		receive(socket, errorFrame);
		expect(gama.getJsonGama().content_error).toEqual(errorFrame);
	});
});

describe("GamaConnector command guards", () => {
	it("sendExpression substitutes $id and sends when an experiment is live", () => {
		const { gama, socket } = newConnector();
		gama.setGamaExperimentId("e1");
		receive_state(gama, socket, "RUNNING");

		gama.sendExpression("p9", "ask $id { do something; }");
		const lastSent = JSON.parse(socket.sent.at(-1)!);
		expect(lastSent.expr).toBe('ask "p9" { do something; }');
	});

	it("sendExpression is a no-op when no experiment is running", () => {
		const { gama, socket } = newConnector();
		// experiment_state defaults to "NONE"
		gama.sendExpression("p9", "ask $id { }");
		expect(socket.sent).toHaveLength(0);
	});

	it("addInGamePlayer does nothing while state is NONE/NOTREADY", () => {
		const { gama, controller, socket } = newConnector();
		gama.addInGamePlayer("p1");
		expect(socket.sent).toHaveLength(0);
		expect(controller.player_manager.getPlayerId).not.toHaveBeenCalled();
	});

	it("removeInGamePlayer skips players already out of the game", () => {
		const { gama, controller, socket } = newConnector();
		receive_state(gama, socket, "RUNNING");
		(controller.player_manager.getPlayerState as ReturnType<typeof vi.fn>).mockReturnValue({ in_game: false });

		gama.removeInGamePlayer("p1");
		expect(socket.sent).toHaveLength(0);
	});
});

// Drive a SimulationStatus so the connector's experiment_state reflects `state`.
function receive_state(_gama: GamaConnector, socket: FakeWebSocket, state: string) {
	socket.onmessage?.({ data: JSON.stringify({ type: "SimulationStatus", exp_id: "e1", content: state }) });
}
