import { beforeEach, describe, expect, it, vi } from "vitest";
import { wsApi } from "./wsApi.ts";

// Minimal stand-in for the browser WebSocket: only `send` is exercised.
function fakeWs() {
	return { send: vi.fn() } as unknown as WebSocket;
}

// Parse the single argument the code passed to ws.send back into an object.
function sentPayload(ws: WebSocket) {
	const send = (ws as unknown as { send: ReturnType<typeof vi.fn> }).send;
	return JSON.parse(send.mock.calls[0][0] as string);
}

describe("wsApi", () => {
	let ws: WebSocket;

	beforeEach(() => {
		ws = fakeWs();
	});

	it("returns false and never sends when the socket is null", () => {
		expect(wsApi.launchExperiment(null)).toBe(false);
		expect(wsApi.tryConnection(null)).toBe(false);
		expect(wsApi.removePlayerHeadset(null, "abc")).toBe(false);
	});

	it("returns true and sends for a live socket", () => {
		expect(wsApi.launchExperiment(ws)).toBe(true);
		expect((ws as unknown as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledTimes(1);
	});

	it.each([
		["getSimulationInformations", "get_simulation_informations"],
		["tryConnection", "try_connection"],
		["launchExperiment", "launch_experiment"],
		["resumeExperiment", "resume_experiment"],
		["pauseExperiment", "pause_experiment"],
		["stopExperiment", "stop_experiment"],
	] as const)("%s emits a %s message", (method, type) => {
		(wsApi[method] as (w: WebSocket | null) => boolean)(ws);
		expect(sentPayload(ws)).toEqual({ type });
	});

	it("sendSimulation carries the simulation payload", () => {
		const simulation = { type: "json_settings", name: "Demo" } as unknown as Parameters<typeof wsApi.sendSimulation>[1];
		wsApi.sendSimulation(ws, simulation);
		expect(sentPayload(ws)).toEqual({ type: "send_simulation", simulation });
	});

	it("removePlayerHeadset includes the player id", () => {
		wsApi.removePlayerHeadset(ws, "player-7");
		expect(sentPayload(ws)).toEqual({ type: "remove_player_headset", id: "player-7" });
	});
});
