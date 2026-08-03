import { describe, expect, it, vi } from "vitest";
import type { Controller } from "../core/Controller.ts";
import { MonitorServer } from "./MonitorServer.ts";

type FakeClient = { send: ReturnType<typeof vi.fn>; getRemoteAddressAsText: () => Uint8Array };

function fakeClient(): FakeClient {
	return { send: vi.fn(() => 1), getRemoteAddressAsText: () => new Uint8Array() };
}

// Build a MonitorServer off the prototype so no uWS server is started.
function bareServer(clients: FakeClient[], controller?: Partial<Controller>) {
	const server = Object.create(MonitorServer.prototype) as MonitorServer;
	(server as unknown as { wsClients: Set<unknown> }).wsClients = new Set(clients);
	(server as unknown as { controller: unknown }).controller = controller;
	return server;
}

describe("MonitorServer.sendMessageByWs", () => {
	it("broadcasts to every connected client", () => {
		const a = fakeClient();
		const b = fakeClient();
		const server = bareServer([a, b]);

		server.sendMessageByWs({ type: "json_state" });

		expect(a.send).toHaveBeenCalledOnce();
		expect(b.send).toHaveBeenCalledOnce();
		expect(JSON.parse(a.send.mock.calls[0][0] as string)).toEqual({ type: "json_state" });
	});

	it("targets a single client when one is specified", () => {
		const a = fakeClient();
		const b = fakeClient();
		const server = bareServer([a, b]);

		server.sendMessageByWs({ type: "ping" }, b as never);

		expect(a.send).not.toHaveBeenCalled();
		expect(b.send).toHaveBeenCalledOnce();
	});
});

describe("MonitorServer.sendMonitorJsonSettings", () => {
	it("sends the active model settings", () => {
		const client = fakeClient();
		const settings = { type: "json_settings", name: "Demo" };
		const controller = {
			model_manager: {
				getActiveModel: () => ({ getJsonSettings: () => settings }),
			},
		} as unknown as Controller;

		const server = bareServer([client], controller);
		server.sendMonitorJsonSettings();

		expect(JSON.parse(client.send.mock.calls[0][0] as string)).toEqual(settings);
	});

	it("does nothing when there is no active model", () => {
		const client = fakeClient();
		const controller = {
			model_manager: { getActiveModel: () => undefined },
		} as unknown as Controller;

		bareServer([client], controller).sendMonitorJsonSettings();
		expect(client.send).not.toHaveBeenCalled();
	});
});

describe("MonitorServer.sendMonitorGamaState", () => {
	it("assembles a json_state with gama state and player list (normal mode)", () => {
		const client = fakeClient();
		const gama = { connected: true, experiment_state: "RUNNING" };
		const players = { alice: { id: "alice" } };
		const controller = {
			model_manager: { getActiveModel: () => ({}) },
			gama_connector: { getJsonGama: () => gama },
			player_manager: { getArrayPlayerList: () => players },
		} as unknown as Controller;

		bareServer([client], controller).sendMonitorGamaState();

		const payload = JSON.parse(client.send.mock.calls[0][0] as string);
		expect(payload).toEqual({ type: "json_state", gama, player: players });
	});
});
