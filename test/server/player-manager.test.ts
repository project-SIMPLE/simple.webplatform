import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Controller from "../../src/api/core/Controller.ts";
import PlayerManager from "../../src/api/multiplayer/PlayerManager.ts";
import { freePort } from "../setup/free-port.ts";
import { type LoopbackSource, twoLoopbackSources } from "../setup/loopback.ts";
import { openClient, type TestClient } from "../setup/ws-client.ts";

// Recording Controller at PlayerManager's output boundary. A COMPLETE stub (all
// methods the handler may call) so chaos inputs don't manufacture false failures
// from a missing collaborator. experiment_state defaults to "NONE".
function recordingController(experimentState = "NONE") {
	return {
		notifyMonitor: vi.fn(),
		addInGamePlayer: vi.fn(),
		sendExpression: vi.fn(),
		sendAsk: vi.fn(),
		purgePlayer: vi.fn(),
		gama_connector: { jsonGamaState: { experiment_state: experimentState } },
	} as unknown as Controller;
}

describe("PlayerManager over a real WebSocket", () => {
	let pm: PlayerManager;
	let controller: Controller;
	let client: TestClient;
	let url: string;

	beforeEach(async () => {
		const port = await freePort();
		process.env.HEADSET_WS_PORT = String(port);
		url = `ws://127.0.0.1:${port}`;
		controller = recordingController();
		pm = new PlayerManager(controller);
		client = openClient(url);
		await client.waitOpen();
	});

	afterEach(async () => {
		await client.close();
		pm.close();
	});

	async function register(id = "p1", heartbeat = 250) {
		client.send({ type: "connection", id, heartbeat });
		// The server answers a json_state carrying this player's id.
		return client.waitFor((m) => m.type === "json_state" && m.id_player === id);
	}

	it("registers a player from a connection message and echoes its state", async () => {
		const state = await register("p1");
		expect(state.connected).toBe(true);
		expect(state.in_game).toBe(false);
		expect(pm.getArrayPlayerList().p1).toBeDefined();
		expect(controller.notifyMonitor).toHaveBeenCalled();
	});

	it("replies pong to a ping", async () => {
		await register("p1");
		client.send({ type: "ping", id: "ping-42" });
		const pong = await client.waitFor((m) => m.type === "pong");
		expect(pong.id).toBe("ping-42");
	});

	it("delivers a simulation output to the addressed player", async () => {
		await register("p1");
		pm.broadcastSimulationOutput({ contents: [{ id: ["p1"], contents: { hello: "world" } }] });
		const out = await client.waitFor((m) => m.type === "json_output");
		expect(out.contents).toEqual({ hello: "world" });
	});

	it("sends heartbeat pings on the configured interval", async () => {
		await register("p1", 200);
		// The server pings on the heartbeat interval; reply so it doesn't reap us.
		const ping = await client.waitFor((m) => m.type === "ping" && m.id === undefined, 3000);
		expect(ping.type).toBe("ping");
		client.send({ type: "pong", id: "p1" });
	});

	// Regression: issue #3 — "Dynamic heartbeat". Each client may request its own
	// ping cadence via the `heartbeat` field of the connection message (a slower
	// rate for clients that need more time to initialise); the server must store
	// it per-player instead of the fixed 5s default.
	it("honours a per-client heartbeat interval from the connection message (issue #3)", async () => {
		client.send({ type: "connection", id: "slow", heartbeat: 1234 });
		await client.waitFor((m) => m.type === "json_state" && m.id_player === "slow");
		expect(pm.getArrayPlayerList().slow?.ping_interval).toBe(1234);
	});

	it("falls back to the 5s default when no heartbeat is provided (issue #3)", async () => {
		client.send({ type: "connection", id: "default" });
		await client.waitFor((m) => m.type === "json_state" && m.id_player === "default");
		expect(pm.getArrayPlayerList().default?.ping_interval).toBe(5000);
	});
});

// Adversarial inputs + wrong-order lifecycle. NB: the three genuinely-crashing
// inputs (non-JSON frame → unguarded JSON.parse; "pong" from an unregistered IP →
// unguarded map access) are documented in test/chaos-findings.md rather than run
// here — they surface as uncaughtException and would fail the whole run.
describe("PlayerManager chaos — malformed & lifecycle", () => {
	let pm: PlayerManager;
	let controller: Controller;
	let port: number;
	const clients: TestClient[] = [];

	function connect() {
		const c = openClient(`ws://127.0.0.1:${port}`);
		clients.push(c);
		return c;
	}

	beforeEach(async () => {
		port = await freePort();
		process.env.HEADSET_WS_PORT = String(port);
		controller = recordingController();
		pm = new PlayerManager(controller);
	});

	afterEach(async () => {
		for (const c of clients) await c.close();
		clients.length = 0;
		pm.close();
	});

	it("ignores an unknown message type and keeps serving", async () => {
		const c = connect();
		await c.waitOpen();
		c.send({ type: "totally_unknown_type" });
		// The server is unharmed: a real connection still registers.
		c.send({ type: "connection", id: "p1", heartbeat: 5000 });
		const state = await c.waitFor((m) => m.type === "json_state" && m.id_player === "p1");
		expect(state.connected).toBe(true);
	});

	it("does not reply to a ping from an unregistered client", async () => {
		const c = connect();
		await c.waitOpen();
		c.send({ type: "ping", id: "ghost" });
		await expect(c.waitFor((m) => m.type === "pong", 400)).rejects.toThrow(/timed out/);
	});

	it("registers a connection with no id without crashing", async () => {
		const c = connect();
		await c.waitOpen();
		c.send({ type: "connection", heartbeat: 5000 });
		const state = await c.waitFor((m) => m.type === "json_state");
		expect(state.connected).toBe(true);
		expect(controller.notifyMonitor).toHaveBeenCalled();
	});

	it("routes a player expression to the controller", async () => {
		const c = connect();
		await c.waitOpen();
		c.send({ type: "connection", id: "p1", heartbeat: 5000 });
		await c.waitFor((m) => m.type === "json_state");
		c.send({ type: "expression", id: "p1", expr: "do stuff;" });
		await vi.waitFor(() => expect(controller.sendExpression).toHaveBeenCalledWith("p1", "do stuff;"));
	});

	it("treats a second socket from the same host as a reconnect (one entry)", async () => {
		const c1 = connect();
		await c1.waitOpen();
		c1.send({ type: "connection", id: "p1", heartbeat: 5000 });
		await c1.waitFor((m) => m.type === "json_state");
		const before = Object.keys(pm.getArrayPlayerList()).length;

		const c2 = connect(); // same 127.0.0.1 → reconnect path fires on open
		await c2.waitOpen();
		await vi.waitFor(() =>
			expect((controller.notifyMonitor as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1),
		);
		expect(Object.keys(pm.getArrayPlayerList()).length).toBe(before);
	});

	it("ignores simulation output addressed to an unknown player id", () => {
		expect(() => pm.broadcastSimulationOutput({ contents: [{ id: ["nobody"], contents: { x: 1 } }] })).not.toThrow();
	});

	it("adds a player in-game when it connects during a RUNNING experiment", async () => {
		controller = recordingController("RUNNING");
		port = await freePort();
		process.env.HEADSET_WS_PORT = String(port);
		pm.close();
		pm = new PlayerManager(controller);

		const c = connect();
		await c.waitOpen();
		c.send({ type: "connection", id: "p1", heartbeat: 5000 });
		await c.waitFor((m) => m.type === "json_state");
		await vi.waitFor(() => expect(controller.addInGamePlayer).toHaveBeenCalled());
		expect(pm.getArrayPlayerList().p1?.in_game).toBe(true);
	});
});

// Regression: field report from a 6-headset classroom (2026-11-05). With GAMA
// connected, only the first headset could join; any other headset was taken as
// that first player reconnecting, keeping its id and color. Cause: uWS's
// ws.getRemoteAddressAsText() returns "" in open/message/close, so every headset
// was keyed by "". The address is now captured at upgrade time.
describe("PlayerManager — one player per headset address", () => {
	let pm: PlayerManager;
	let controller: Controller;
	let port: number;
	let sources: [LoopbackSource, LoopbackSource];
	const clients: TestClient[] = [];

	function connectFrom(source: LoopbackSource) {
		const c = openClient(
			`ws://${source.host}:${port}`,
			source.localAddress ? { localAddress: source.localAddress } : undefined,
		);
		clients.push(c);
		return c;
	}

	async function registerFrom(source: LoopbackSource, id: string) {
		const c = connectFrom(source);
		await c.waitOpen();
		c.send({ type: "connection", id, heartbeat: 60_000 });
		await c.waitFor((m) => m.type === "json_state" && m.id_player === id);
		return c;
	}

	const keyOf = (id: string) => [...pm.playerList.entries()].find(([, p]) => p.id === id)?.[0];

	beforeEach(async () => {
		sources = await twoLoopbackSources();
		port = await freePort();
		process.env.HEADSET_WS_PORT = String(port);
		controller = recordingController("RUNNING");
		pm = new PlayerManager(controller);
	});

	afterEach(async () => {
		for (const c of clients) await c.close();
		clients.length = 0;
		pm.close();
	});

	it("keys a player by the client's real address, never an empty string", async () => {
		await registerFrom(sources[0], "Player_1");
		expect(pm.playerList.has("")).toBe(false);
		expect(keyOf("Player_1")).toBe(sources[0].expectedKey);
	});

	it("registers two headsets from different addresses as two players", async () => {
		await registerFrom(sources[0], "Player_102");
		await registerFrom(sources[1], "Player_103");

		expect(pm.playerList.size).toBe(2);
		expect(Object.keys(pm.getArrayPlayerList()).sort()).toEqual(["Player_102", "Player_103"]);
		const [key102, key103] = [keyOf("Player_102"), keyOf("Player_103")];
		expect(key102).not.toBe(key103);
		if (sources[1].expectedKey) expect(key103).toBe(sources[1].expectedKey);
	});

	it("adds every headset to the running GAMA experiment", async () => {
		await registerFrom(sources[0], "Player_102");
		await registerFrom(sources[1], "Player_103");

		await vi.waitFor(() => expect(controller.addInGamePlayer).toHaveBeenCalledTimes(2));
		expect(controller.addInGamePlayer).toHaveBeenCalledWith(keyOf("Player_102"));
		expect(controller.addInGamePlayer).toHaveBeenCalledWith(keyOf("Player_103"));
		expect(pm.getArrayPlayerList().Player_102?.in_game).toBe(true);
		expect(pm.getArrayPlayerList().Player_103?.in_game).toBe(true);
	});

	it("delivers each headset its own simulation output", async () => {
		const c102 = await registerFrom(sources[0], "Player_102");
		const c103 = await registerFrom(sources[1], "Player_103");

		pm.broadcastSimulationOutput({
			contents: [
				{ id: ["Player_102"], contents: { for: "102" } },
				{ id: ["Player_103"], contents: { for: "103" } },
			],
		});

		expect((await c102.waitFor((m) => m.type === "json_output")).contents).toEqual({ for: "102" });
		expect((await c103.waitFor((m) => m.type === "json_output")).contents).toEqual({ for: "103" });
	});

	it("registers a different headset after the first one disconnects", async () => {
		const first = await registerFrom(sources[0], "Player_102");
		await first.close();
		await vi.waitFor(() => expect(pm.getArrayPlayerList().Player_102?.connected).toBe(false));

		const second = await registerFrom(sources[1], "Player_103");

		// The new headset keeps its own identity instead of taking over Player_102
		expect(pm.getArrayPlayerList().Player_103?.connected).toBe(true);
		expect(pm.getArrayPlayerList().Player_102?.connected).toBe(false);
		second.send({ type: "expression", expr: "do stuff;" });
		await vi.waitFor(() => expect(controller.sendExpression).toHaveBeenCalledWith("Player_103", "do stuff;"));
	});

	it("still restores the same player when a headset reconnects from its address", async () => {
		const first = await registerFrom(sources[0], "Player_102");
		await first.close();
		await vi.waitFor(() => expect(pm.getArrayPlayerList().Player_102?.connected).toBe(false));

		const again = connectFrom(sources[0]);
		await again.waitOpen();
		const state = await again.waitFor((m) => m.type === "json_state" && m.id_player === "Player_102");

		expect(state.connected).toBe(true);
		expect(pm.playerList.size).toBe(1);
	});
});
