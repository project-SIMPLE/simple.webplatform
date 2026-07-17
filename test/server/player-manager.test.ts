import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Controller from "../../src/api/core/Controller.ts";
import PlayerManager from "../../src/api/multiplayer/PlayerManager.ts";
import { freePort } from "../setup/free-port.ts";
import { openClient, type TestClient } from "../setup/ws-client.ts";

// Recording Controller at PlayerManager's output boundary. experiment_state="NONE"
// so addPlayerConnection does not try to add the player into a running GAMA sim.
function recordingController() {
	return {
		notifyMonitor: vi.fn(),
		addInGamePlayer: vi.fn(),
		gama_connector: { jsonGamaState: { experiment_state: "NONE" } },
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
});
