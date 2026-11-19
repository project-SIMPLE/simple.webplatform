import { configure, type LogRecord, reset } from "@logtape/logtape";
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

import {
	extractCreatePlayerId,
	GAMA_ERROR_MESSAGES,
	GAMA_PROBE_EXPR,
	GAMA_PROBE_TIMEOUT_MS,
} from "../core/Constants.ts";
import type Controller from "../core/Controller.ts";
import GamaConnector, { LATEST_WINS_ACK_TIMEOUT_MS } from "./GamaConnector.ts";

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
			addEveryPlayer: vi.fn(),
			notifyPlayerError: vi.fn(),
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

function receiveFrame(socket: FakeWebSocket, message: unknown) {
	socket.onmessage?.({ data: JSON.stringify(message) });
}

/**
 * Connect and launch the platform's own experiment (id "e1"), the way a session really starts:
 * load sent, load acked, then GAMA reports `state`. Frames sent meanwhile are cleared.
 * Only an experiment the platform launched (or adopted) accepts players and asks (issue #156).
 */
function launchOwn(gama: GamaConnector, socket: FakeWebSocket, state = "RUNNING") {
	socket.onopen?.();
	gama.launchExperiment();
	receiveFrame(socket, {
		type: "CommandExecutedSuccessfully",
		command: { type: "load", model: "/models/Demo/DemoModelVR.gaml", experiment: "vr_xp" },
		content: "e1",
	});
	receiveFrame(socket, { type: "SimulationStatus", exp_id: "e1", content: state });
	socket.sent = [];
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

	it("SimulationStatus updates experiment id and state of the platform's experiment", () => {
		const { gama, socket } = newConnector();
		launchOwn(gama, socket, "PAUSED");
		receive(socket, { type: "SimulationStatus", exp_id: "e1", content: "RUNNING" });
		expect(gama.getJsonGama().experiment_id).toBe("e1");
		expect(gama.getJsonGama().experiment_state).toBe("RUNNING");
	});

	it("SimulationStatus RUNNING->NONE tears down the launch loop and players", () => {
		const { gama, controller, socket } = newConnector();
		launchOwn(gama, socket, "RUNNING");
		receive(socket, { type: "SimulationStatus", exp_id: "e1", content: "NONE" });

		expect(controller.cancelLaunchInterval).toHaveBeenCalled();
		expect(controller.player_manager.disableAllPlayerInGame).toHaveBeenCalled();
		expect(gama.getJsonGama().experiment_state).toBe("NONE");
		expect(gama.getJsonGama().experiment_id).toBe("");
		expect(gama.canTalkToExperiment()).toBe(false);
	});

	it("SimulationOutput is parsed and broadcast", () => {
		const { controller, socket } = newConnector();
		receive(socket, { type: "SimulationOutput", content: JSON.stringify({ foo: "bar" }) });
		expect(controller.broadcastSimulationOutput).toHaveBeenCalledWith({ foo: "bar" });
	});

	// A GAML `write` arrives as { message, color }. Treating it as a parse error made every
	// `write` of the model flush the trace buffer and switch file logging to full trace.
	it("SimulationOutput console output from a GAML write is neither broadcast nor logged as an error", async () => {
		const records: LogRecord[] = [];
		await configure({
			reset: true,
			sinks: { memory: (record) => records.push(record) },
			loggers: [{ category: ["sim"], sinks: ["memory"], lowestLevel: "trace" }],
		});
		try {
			const { controller, socket } = newConnector();
			const consoleOutput = {
				type: "SimulationOutput",
				content: { message: "Start rain at time 90s\n", color: null },
				exp_id: "",
			};
			expect(() => receive(socket, consoleOutput)).not.toThrow();
			expect(controller.broadcastSimulationOutput).not.toHaveBeenCalled();
			expect(records.filter((r) => r.level === "error" || r.level === "fatal")).toEqual([]);
		} finally {
			await reset();
		}
	});

	// Each headset `ask` is acked by GAMA, and each ack clears content_error. Notifying the
	// monitors on every ack re-sent the whole state hundreds of times per second.
	it("command acks do not notify the monitors while content_error stays empty", () => {
		const { controller, socket } = newConnector();
		const ack = {
			type: "CommandExecutedSuccessfully",
			content: "",
			command: { type: "ask", action: "move_player_external", agent: "simulation[0].unity_linker[0]" },
		};
		receive(socket, ack);
		vi.mocked(controller.notifyMonitor).mockClear();

		for (let i = 0; i < 100; i++) receive(socket, ack);
		expect(controller.notifyMonitor).not.toHaveBeenCalled();
	});

	it("an ack after a GAMA error clears content_error and notifies the monitors once", () => {
		const { gama, controller, socket } = newConnector();
		receive(socket, { type: GAMA_ERROR_MESSAGES[0], content: "boom" });
		vi.mocked(controller.notifyMonitor).mockClear();

		const ack = { type: "CommandExecutedSuccessfully", content: "", command: { type: "ask" } };
		receive(socket, ack);
		receive(socket, ack);
		expect(gama.getJsonGama().content_error).toBe("");
		expect(controller.notifyMonitor).toHaveBeenCalledTimes(1);
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

	// The headless GAMA server (gama-headless.sh -socket) never pushes
	// SimulationStatus — only command acks. The connector must derive the
	// experiment lifecycle from CommandExecutedSuccessfully frames alone.
	it("acks drive the full lifecycle when no SimulationStatus is pushed (headless GAMA)", () => {
		const { gama, controller, socket } = newConnector();
		socket.onopen?.();

		receive(socket, {
			type: "CommandExecutedSuccessfully",
			command: { type: "load", model: "/m.gaml", experiment: "vr_xp" },
			content: "483", // headless returns the experiment id here
		});
		expect(gama.getJsonGama().experiment_name).toBe("vr_xp");
		expect(gama.getJsonGama().experiment_id).toBe("483");
		expect(gama.getJsonGama().experiment_state).toBe("PAUSED");

		receive(socket, { type: "CommandExecutedSuccessfully", command: { type: "play", exp_id: "483" }, content: "" });
		expect(gama.getJsonGama().experiment_state).toBe("RUNNING");
		// The load ack alone makes the experiment the platform's own: players can join
		expect(gama.canTalkToExperiment()).toBe(true);

		receive(socket, { type: "CommandExecutedSuccessfully", command: { type: "pause", exp_id: "483" }, content: "" });
		expect(gama.getJsonGama().experiment_state).toBe("PAUSED");

		receive(socket, { type: "CommandExecutedSuccessfully", command: { type: "stop", exp_id: "483" }, content: "" });
		expect(gama.getJsonGama().experiment_state).toBe("NONE");
		expect(gama.getJsonGama().experiment_id).toBe("");
		expect(gama.canTalkToExperiment()).toBe(false);
		expect(controller.cancelLaunchInterval).toHaveBeenCalled();
		expect(controller.player_manager.disableAllPlayerInGame).toHaveBeenCalled();
	});

	it("a load ack does not override state/id already set by SimulationStatus (GUI GAMA)", () => {
		const { gama, socket } = newConnector();
		socket.onopen?.();
		gama.launchExperiment();

		// GUI order: NOTREADY push (with the real exp_id) arrives before the ack.
		receive(socket, { type: "SimulationStatus", exp_id: "0", content: "NOTREADY" });
		receive(socket, {
			type: "CommandExecutedSuccessfully",
			command: { type: "load", model: "/m.gaml", experiment: "vr_xp" },
			content: "vr_xp", // GUI returns the experiment name here
		});

		expect(gama.getJsonGama().experiment_id).toBe("0");
		expect(gama.getJsonGama().experiment_state).toBe("NOTREADY");
		expect(gama.getJsonGama().experiment_name).toBe("vr_xp");
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
		launchOwn(gama, socket, "RUNNING");

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
		launchOwn(gama, socket, "RUNNING");
		(controller.player_manager.getPlayerState as ReturnType<typeof vi.fn>).mockReturnValue({ in_game: false });

		gama.removeInGamePlayer("p1");
		expect(socket.sent).toHaveLength(0);
	});
});

// Adversarial frames, faults and wrong-order commands driven through the real on* handlers.
describe("GamaConnector chaos — malformed frames & lifecycle", () => {
	function receive(socket: FakeWebSocket, raw: unknown) {
		socket.onmessage?.({ data: typeof raw === "string" ? raw : JSON.stringify(raw) });
	}

	it("survives a non-JSON frame without changing state", () => {
		const { gama, socket } = newConnector();
		socket.onopen?.();
		const before = { ...gama.getJsonGama() };
		expect(() => receive(socket, "definitely not json {{{")).not.toThrow();
		expect(gama.getJsonGama()).toEqual(before);
	});

	it("ignores an unknown message type", () => {
		const { gama, socket } = newConnector();
		receive(socket, { type: "SomethingWeInvented", content: "x" });
		expect(gama.getJsonGama().content_error).toBe("");
		expect(gama.getJsonGama().experiment_state).toBe("NONE");
	});

	it.each(GAMA_ERROR_MESSAGES)("records the %s error frame as content_error", (type) => {
		const { gama, socket } = newConnector();
		const frame = { type, content: "boom" };
		receive(socket, frame);
		expect(gama.getJsonGama().content_error).toEqual(frame);
	});

	it("does not broadcast a SimulationOutput whose content is not JSON", () => {
		const { controller, socket } = newConnector();
		expect(() => receive(socket, { type: "SimulationOutput", content: "not-json{{{" })).not.toThrow();
		expect(controller.broadcastSimulationOutput).not.toHaveBeenCalled();
	});

	it("cleans up when the socket closes mid-experiment", () => {
		const { gama, controller, socket } = newConnector();
		launchOwn(gama, socket, "RUNNING");
		socket.onclose?.({ wasClean: false });
		expect(gama.getJsonGama().connected).toBe(false);
		expect(gama.getJsonGama().experiment_state).toBe("NONE");
		expect(gama.getJsonGama().experiment_id).toBe("");
		expect(controller.cancelLaunchInterval).toHaveBeenCalled();
		expect(controller.player_manager.disableAllPlayerInGame).toHaveBeenCalled();
	});

	it("reconnects after a connection error (GAMA appearing late)", () => {
		vi.useFakeTimers();
		try {
			const { socket } = newConnector();
			const before = FakeWebSocket.instances.length;
			socket.onerror?.({ error: { code: "ECONNREFUSED" } });
			socket.readyState = 3; // the errored socket is now CLOSED
			vi.advanceTimersByTime(5000);
			expect(FakeWebSocket.instances.length).toBe(before + 1);
		} finally {
			vi.useRealTimers();
		}
	});

	it("guards commands issued in the wrong state (no frames sent)", () => {
		const { gama, socket } = newConnector();
		socket.onopen?.(); // connected, state NONE
		gama.pauseExperiment(); // only acts while RUNNING
		gama.resumeExperiment(); // only acts while PAUSED
		gama.removeInGamePlayer("p1"); // NONE/NOTREADY guard
		gama.sendAsk({ type: "ask", action: "a", args: "{}", agent: "x" });
		expect(socket.sent).toHaveLength(0);
	});

	it("launchExperiment is a no-op once an experiment is already live", () => {
		const { gama, socket } = newConnector();
		launchOwn(gama, socket, "RUNNING");
		const sentBefore = socket.sent.length;
		gama.launchExperiment(); // guard: only when connected && state === "NONE"
		expect(socket.sent.length).toBe(sentBefore);
	});

	// It used to poll every 1 ms, forever, for a PAUSED that never comes from these states.
	it.each(["NONE", "NOTREADY", "PAUSED"])("stopExperiment from %s sends the stop without waiting", async (state) => {
		const { gama, socket } = newConnector();
		launchOwn(gama, socket, state);

		await gama.stopExperiment();
		expect(socket.sent.map((s) => JSON.parse(s).type)).toEqual(["stop"]);
	});

	it("stopExperiment while RUNNING pauses, waits for GAMA, then stops", async () => {
		const { gama, socket } = newConnector();
		launchOwn(gama, socket, "RUNNING");

		const stopping = gama.stopExperiment();
		expect(socket.sent.map((s) => JSON.parse(s).type)).toEqual(["pause"]);
		receive(socket, { type: "SimulationStatus", exp_id: "e1", content: "PAUSED" });

		await stopping;
		expect(socket.sent.map((s) => JSON.parse(s).type)).toEqual(["pause", "stop"]);
	});

	it("stopExperiment stops anyway when GAMA never confirms the pause", async () => {
		vi.useFakeTimers();
		try {
			const { gama, socket } = newConnector();
			launchOwn(gama, socket, "RUNNING");

			const stopping = gama.stopExperiment();
			await vi.advanceTimersByTimeAsync(6000);
			await stopping;
			expect(socket.sent.map((s) => JSON.parse(s).type)).toEqual(["pause", "stop"]);
		} finally {
			vi.useRealTimers();
		}
	});
});

// Each headset sends its position and followed geometries every frame. When GAMA falls behind,
// queueing them all built an ever-growing backlog of positions already out of date.
describe("GamaConnector latest-wins asks", () => {
	function running() {
		const ctx = newConnector();
		launchOwn(ctx.gama, ctx.socket, "RUNNING");
		return ctx;
	}
	const move = (id: string, x: number) => ({
		type: "ask",
		action: "move_player_external",
		args: JSON.stringify({ id, x: String(x) }),
		agent: "simulation[0].unity_linker[0]",
	});
	const ack = (socket: FakeWebSocket, command: object) =>
		socket.onmessage?.({ data: JSON.stringify({ type: "CommandExecutedSuccessfully", content: "", command }) });
	const sentArgs = (socket: FakeWebSocket) => socket.sent.map((s) => JSON.parse(s).args);

	it("sends every ask while GAMA answers each one before the next", () => {
		const { gama, socket } = running();
		for (let x = 1; x <= 3; x++) {
			gama.sendAsk(move("Player_101", x), "192.168.68.101");
			ack(socket, move("Player_101", x));
		}
		expect(sentArgs(socket)).toEqual([1, 2, 3].map((x) => move("Player_101", x).args));
	});

	it("keeps only the newest ask while the previous one is unanswered, and sends it on the answer", () => {
		const { gama, socket } = running();
		gama.sendAsk(move("Player_101", 1), "192.168.68.101");
		gama.sendAsk(move("Player_101", 2), "192.168.68.101"); // replaced by 3 before being sent
		gama.sendAsk(move("Player_101", 3), "192.168.68.101");
		expect(sentArgs(socket)).toEqual([move("Player_101", 1).args]);

		ack(socket, move("Player_101", 1));
		expect(sentArgs(socket)).toEqual([move("Player_101", 1).args, move("Player_101", 3).args]);
	});

	it("holds each headset back separately", () => {
		const { gama, socket } = running();
		gama.sendAsk(move("Player_101", 1), "192.168.68.101");
		gama.sendAsk(move("Player_102", 1), "192.168.68.102"); // another headset: not held back
		expect(socket.sent).toHaveLength(2);
	});

	it("does not coalesce other actions, nor asks without a known sender", () => {
		const { gama, socket } = running();
		const other = { type: "ask", action: "ChangeTreeState", args: "{}", agent: "simulation[0].unity_linker[0]" };
		gama.sendAsk(other, "192.168.68.101");
		gama.sendAsk(other, "192.168.68.101");
		gama.sendAsk(move("Player_101", 1));
		gama.sendAsk(move("Player_101", 2));
		expect(socket.sent).toHaveLength(4);
	});

	it("stops holding asks back when an answer never comes", () => {
		vi.useFakeTimers();
		try {
			const { gama, socket } = running();
			gama.sendAsk(move("Player_101", 1), "192.168.68.101");
			gama.sendAsk(move("Player_101", 2), "192.168.68.101");
			expect(socket.sent).toHaveLength(1);

			vi.advanceTimersByTime(LATEST_WINS_ACK_TIMEOUT_MS);
			gama.sendAsk(move("Player_101", 3), "192.168.68.101");
			expect(sentArgs(socket)).toEqual([move("Player_101", 1).args, move("Player_101", 3).args]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("treats a refused ask as answered", () => {
		const { gama, socket } = running();
		gama.sendAsk(move("Player_101", 1), "192.168.68.101");
		gama.sendAsk(move("Player_101", 2), "192.168.68.101");
		socket.onmessage?.({
			data: JSON.stringify({ type: GAMA_ERROR_MESSAGES[0], content: "boom", command: move("Player_101", 1) }),
		});
		expect(sentArgs(socket)).toEqual([move("Player_101", 1).args, move("Player_101", 2).args]);
	});

	// Headsets often send identical followed geometries; GAMA answers in order, so the
	// oldest identical ask is the one answered.
	it("matches an answer to the oldest of identical asks from two headsets", () => {
		vi.useFakeTimers();
		try {
			const { gama, socket } = running();
			const trees = (x: number) => ({ ...move("", 0), action: "move_geoms_followed", args: `trees ${x}` });
			gama.sendAsk(trees(0), "192.168.68.101");
			vi.advanceTimersByTime(5);
			gama.sendAsk(trees(0), "192.168.68.102");
			gama.sendAsk(trees(1), "192.168.68.101"); // waits for the first answer
			gama.sendAsk(trees(2), "192.168.68.102"); // waits for the second answer

			ack(socket, trees(0)); // answers 101's ask, sent first
			expect(sentArgs(socket)).toEqual(["trees 0", "trees 0", "trees 1"]);
			ack(socket, trees(0)); // then 102's
			expect(sentArgs(socket)).toEqual(["trees 0", "trees 0", "trees 1", "trees 2"]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("forgets unanswered asks when the GAMA socket closes", () => {
		const { gama, socket } = running();
		gama.sendAsk(move("Player_101", 1), "192.168.68.101");
		socket.onclose?.({ wasClean: false }); // unclean: the connector keeps the socket to retry
		const lost = socket.sent;
		launchOwn(gama, socket, "RUNNING"); // reconnected, experiment relaunched

		gama.sendAsk(move("Player_101", 2), "192.168.68.101"); // not held back by the lost one
		const asks = [...lost, ...socket.sent].map((s) => JSON.parse(s)).filter((m) => m.type === "ask");
		expect(asks.map((m) => m.args)).toEqual([move("Player_101", 1).args, move("Player_101", 2).args]);
	});
});

// Regression: issue #156 — "SIMPLE Unity Plugin preview fails when GAMA is started before Webplatform".
// GAMA already had an experiment open (from its own interface) when the platform connected. Its
// SimulationStatus poisoned experiment_id/state, players were sent `do create_player(...)` against
// it, GAMA answered "nil value detected", and the player stayed in_game forever: no retry.
describe("GamaConnector — issue #156 (experiment GAMA runs before the platform)", () => {
	const sentFrames = (socket: FakeWebSocket) => socket.sent.map((s) => JSON.parse(s));
	const probeFrame = (expId: string) => ({ type: "expression", exp_id: expId, expr: GAMA_PROBE_EXPR });

	function connected() {
		const ctx = newConnector();
		ctx.socket.onopen?.();
		receiveFrame(ctx.socket, { type: "ConnectionSuccessful", content: "" });
		return ctx;
	}
	const probeOk = (socket: FakeWebSocket, expId: string, content: string) =>
		receiveFrame(socket, { type: "CommandExecutedSuccessfully", content, command: probeFrame(expId) });
	const probeFails = (socket: FakeWebSocket, expId: string) =>
		receiveFrame(socket, { type: "UnableToExecuteRequest", content: "nil value detected", command: probeFrame(expId) });

	it("probes GAMA for a pre-existing experiment as soon as the connection succeeds", () => {
		const { socket } = connected();
		expect(sentFrames(socket)).toEqual([probeFrame("0")]);
	});

	it("does not probe when the platform's own load is already in flight", () => {
		const { gama, socket } = newConnector();
		socket.onopen?.();
		gama.launchExperiment();
		receiveFrame(socket, { type: "ConnectionSuccessful", content: "" });
		expect(sentFrames(socket).map((m) => m.type)).toEqual(["load"]);
	});

	it.each([
		["false|3565", "RUNNING"],
		["true|12", "PAUSED"],
	])("adopts a usable pre-existing experiment (probe reply %s -> %s) and adds the waiting players", (reply, state) => {
		const { gama, controller, socket } = connected();
		probeOk(socket, "0", reply);

		expect(gama.getJsonGama().experiment_state).toBe(state);
		expect(gama.getJsonGama().experiment_id).toBe("0");
		expect(gama.getJsonGama().foreign_experiment_detected).toBe(false);
		expect(gama.canTalkToExperiment()).toBe(state === "RUNNING" || state === "PAUSED");
		expect(controller.player_manager.addEveryPlayer).toHaveBeenCalledTimes(1);
	});

	it("silently ignores an unusable pre-existing experiment found on connect", () => {
		const { gama, controller, socket } = connected();
		probeFails(socket, "0");

		expect(gama.getJsonGama().experiment_state).toBe("NONE");
		expect(gama.getJsonGama().experiment_id).toBe("");
		// No proof an experiment exists (the probe also fails on an empty GAMA): no banner, no error
		expect(gama.getJsonGama().foreign_experiment_detected).toBe(false);
		expect(gama.getJsonGama().content_error).toBe("");
		expect(controller.player_manager.addEveryPlayer).not.toHaveBeenCalled();
	});

	it("rejects the experiment when GAMA never answers the probe", () => {
		vi.useFakeTimers();
		try {
			const { gama, socket } = connected();
			vi.advanceTimersByTime(GAMA_PROBE_TIMEOUT_MS);
			// A late answer to the abandoned probe is not taken as a usable experiment
			probeOk(socket, "0", "false|1");
			expect(gama.canTalkToExperiment()).toBe(false);
			expect(gama.getJsonGama().experiment_state).toBe("NONE");
		} finally {
			vi.useRealTimers();
		}
	});

	// The exact #156 failure: a foreign status used to make the platform believe its experiment was live
	it("a SimulationStatus from a foreign experiment does not let players in", () => {
		const { gama, controller, socket } = connected();
		probeFails(socket, "0");
		socket.sent = [];

		receiveFrame(socket, { type: "SimulationStatus", exp_id: "7", content: "PAUSED" });
		expect(gama.getJsonGama().experiment_state).toBe("NONE");
		expect(gama.getJsonGama().experiment_id).toBe("");

		gama.addInGamePlayer("192.168.68.101");
		gama.sendExpression("Player_101", "do something;");
		gama.sendAsk({ type: "ask", action: "move_player_external", args: "{}", agent: "x" }, "192.168.68.101");
		expect(sentFrames(socket)).toEqual([probeFrame("7")]); // only the probe of the new experiment
		expect(controller.player_manager.getPlayerId).not.toHaveBeenCalled();
	});

	it("warns the monitors when a foreign experiment proven to exist cannot be used, and clears it once closed", () => {
		const { gama, socket } = connected();
		probeFails(socket, "0");

		receiveFrame(socket, { type: "SimulationStatus", exp_id: "7", content: "PAUSED" });
		probeFails(socket, "7");
		expect(gama.getJsonGama().foreign_experiment_detected).toBe(true);

		// Further statuses of the rejected experiment are not probed again...
		socket.sent = [];
		receiveFrame(socket, { type: "SimulationStatus", exp_id: "7", content: "PAUSED" });
		expect(socket.sent).toHaveLength(0);

		// ...until it is closed in GAMA
		receiveFrame(socket, { type: "SimulationStatus", exp_id: "7", content: "NONE" });
		expect(gama.getJsonGama().foreign_experiment_detected).toBe(false);
	});

	it("re-probes a rejected foreign experiment when it starts running (play pressed in GAMA)", () => {
		const { gama, socket } = connected();
		probeFails(socket, "0");
		receiveFrame(socket, { type: "SimulationStatus", exp_id: "7", content: "PAUSED" });
		probeFails(socket, "7");
		socket.sent = [];

		receiveFrame(socket, { type: "SimulationStatus", exp_id: "7", content: "RUNNING" });
		expect(sentFrames(socket)).toEqual([probeFrame("7")]);
		probeOk(socket, "7", "false|1");

		expect(gama.canTalkToExperiment()).toBe(true);
		expect(gama.getJsonGama().experiment_id).toBe("7");
		expect(gama.getJsonGama().foreign_experiment_detected).toBe(false);
	});

	it("does not probe a foreign experiment that is still NOTREADY", () => {
		const { socket } = connected();
		probeFails(socket, "0");
		socket.sent = [];
		receiveFrame(socket, { type: "SimulationStatus", exp_id: "7", content: "NOTREADY" });
		expect(socket.sent).toHaveLength(0);
	});

	it("still lets the admin launch an experiment while a foreign one is rejected", () => {
		const { gama, socket } = connected();
		probeFails(socket, "0");
		receiveFrame(socket, { type: "SimulationStatus", exp_id: "7", content: "PAUSED" });
		probeFails(socket, "7");
		socket.sent = [];

		gama.launchExperiment();
		expect(sentFrames(socket).map((m) => m.type)).toEqual(["load"]);
		receiveFrame(socket, {
			type: "CommandExecutedSuccessfully",
			command: { type: "load", model: "/m.gaml", experiment: "vr_xp" },
			content: "8",
		});
		expect(gama.canTalkToExperiment()).toBe(true);
		expect(gama.getJsonGama().experiment_id).toBe("8");
	});

	it("an admin launch cancels a pending probe", () => {
		const { gama, controller, socket } = connected();
		gama.launchExperiment();
		probeOk(socket, "0", "false|1"); // answer to the cancelled probe: ignored
		expect(controller.player_manager.addEveryPlayer).not.toHaveBeenCalled();
		expect(gama.canTalkToExperiment()).toBe(false); // still waiting for our own load ack
	});

	it("a failed load leaves the platform without an experiment, ready to launch again", () => {
		const { gama, socket } = connected();
		probeFails(socket, "0");
		gama.launchExperiment();
		receiveFrame(socket, { type: "SimulationStatus", exp_id: "0", content: "NOTREADY" });
		receiveFrame(socket, {
			type: "UnableToExecuteRequest",
			content: "model not found",
			command: { type: "load", model: "/m.gaml", experiment: "vr_xp" },
		});

		expect(gama.getJsonGama().experiment_state).toBe("NONE");
		expect(gama.getJsonGama().loading).toBe(false);
		expect(gama.canTalkToExperiment()).toBe(false);
		socket.sent = [];
		gama.launchExperiment();
		expect(sentFrames(socket).map((m) => m.type)).toEqual(["load"]);
	});

	// The player used to stay in_game after GAMA refused it, so it was never added again
	it("rolls back a player GAMA refused to create, and tells its headset", () => {
		const { gama, controller, socket } = newConnector();
		launchOwn(gama, socket, "RUNNING");

		gama.addInGamePlayer("Player_101");
		const createFrame = sentFrames(socket).at(-1);
		expect(createFrame.expr).toBe('do create_player("Player_101");');

		receiveFrame(socket, { type: "UnableToExecuteRequest", content: "nil value detected", command: createFrame });
		expect(controller.player_manager.togglePlayerInGame).toHaveBeenCalledWith("Player_101", false);
		expect(controller.player_manager.notifyPlayerError).toHaveBeenCalledWith("Player_101", "experiment_not_available");
	});

	it("forgets the experiment it owned when the GAMA connection drops", () => {
		const { gama, socket } = newConnector();
		launchOwn(gama, socket, "RUNNING");
		expect(gama.canTalkToExperiment()).toBe(true);

		socket.onclose?.({ wasClean: false });
		socket.onopen?.(); // reconnected: the old experiment must be proven usable again
		receiveFrame(socket, { type: "SimulationStatus", exp_id: "e1", content: "RUNNING" });
		expect(gama.canTalkToExperiment()).toBe(false);
	});
});

describe("extractCreatePlayerId", () => {
	it("extracts the player id from a create_player expression", () => {
		expect(extractCreatePlayerId('do create_player("Player_101");')).toBe("Player_101");
	});

	it.each([['do remove_player("Player_101");'], ["do something;"], [undefined], [42]])(
		"returns null for anything else (%s)",
		(expr) => {
			expect(extractCreatePlayerId(expr)).toBeNull();
		},
	);
});
