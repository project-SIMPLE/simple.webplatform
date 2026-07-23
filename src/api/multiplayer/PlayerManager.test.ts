import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Player } from "../core/Constants.ts";
import type Controller from "../core/Controller.ts";
import PlayerManager from "./PlayerManager.ts";

// Minimal Controller stub for addPlayerConnection, which only touches
// `controller.gama_connector.jsonGamaState.experiment_state` and
// `controller.addInGamePlayer`.
function stubController(
	experimentState: string | null,
	addInGamePlayer = vi.fn(),
): { controller: Controller; addInGamePlayer: ReturnType<typeof vi.fn> } {
	const controller = {
		// `null` models "no GAMA connector attached" (the issue #34 crash condition).
		gama_connector: experimentState === null ? undefined : { jsonGamaState: { experiment_state: experimentState } },
		addInGamePlayer,
	} as unknown as Controller;
	return { controller, addInGamePlayer };
}

// PlayerManager's constructor starts a uWS server; we only want the pure
// list logic, so build an instance off the prototype and inject a playerList.
function buildManager(entries: Array<[string, Partial<Player>]>) {
	const pm = Object.create(PlayerManager.prototype) as PlayerManager;
	pm.playerList = new Map();
	for (const [key, player] of entries) {
		pm.playerList.set(key, {
			id: key,
			ws: { send: vi.fn(), end: vi.fn() } as unknown as Player["ws"],
			ping_interval: 5000,
			is_alive: true,
			connected: true,
			in_game: false,
			date_connection: "10:00",
			...player,
		});
	}
	// togglePlayerInGame fans out to notifyPlayerChange (socket I/O) — stub it.
	(pm as unknown as { notifyPlayerChange: () => void }).notifyPlayerChange = vi.fn();
	return pm;
}

describe("PlayerManager list logic", () => {
	let pm: PlayerManager;

	beforeEach(() => {
		pm = buildManager([
			["192.168.0.10", { id: "alice", in_game: true }],
			["192.168.0.11", { id: "bob", in_game: false }],
		]);
	});

	it("getIndexByPlayerId resolves the map key (IP) from a player id", () => {
		expect(pm.getIndexByPlayerId("bob")).toBe("192.168.0.11");
		expect(pm.getIndexByPlayerId("nobody")).toBeUndefined();
	});

	it("getPlayerId resolves the in-game id from the map key", () => {
		expect(pm.getPlayerId("192.168.0.10")).toBe("alice");
		expect(pm.getPlayerId("unknown")).toBeUndefined();
	});

	it("getPlayerState returns only the public state fields", () => {
		expect(pm.getPlayerState("192.168.0.10")).toEqual({
			connected: true,
			in_game: true,
			date_connection: "10:00",
		});
		expect(pm.getPlayerState("unknown")).toBeUndefined();
	});

	it("getArrayPlayerList keys by player id and strips ws/timeout", () => {
		const arr = pm.getArrayPlayerList();
		expect(Object.keys(arr).sort()).toEqual(["alice", "bob"]);
		expect(arr.alice.ws).toBeUndefined();
		expect(arr.alice.timeout).toBeUndefined();
		expect(arr.alice.id).toBe("alice");
	});

	it("togglePlayerInGame accepts either the IP key or the player id", () => {
		pm.togglePlayerInGame("bob", true); // by id
		expect(pm.playerList.get("192.168.0.11")?.in_game).toBe(true);

		pm.togglePlayerInGame("192.168.0.10", false); // by IP key
		expect(pm.playerList.get("192.168.0.10")?.in_game).toBe(false);
	});

	it("disableAllPlayerInGame clears in_game for everyone", () => {
		pm.disableAllPlayerInGame();
		for (const player of pm.playerList.values()) {
			expect(player.in_game).toBe(false);
		}
	});
});

// Regression: issue #34 — "The player cannot get authenticated after restarting the game".
// A player reconnecting after a disconnect ran addPlayerConnection while
// controller.gama_connector was still undefined (no experiment running), which
// crashed with `Cannot read properties of undefined (reading 'jsonGamaState')`
// and left the reconnecting player permanently unauthenticated.
describe("addPlayerConnection — issue #34 (re-auth after restart)", () => {
	let pm: PlayerManager;

	beforeEach(() => {
		pm = buildManager([
			["192.168.0.10", { id: "alice", in_game: true }],
			["192.168.0.11", { id: "bob", in_game: false }],
		]);
	});

	it("does not throw when no GAMA connector is attached", () => {
		const { controller } = stubController(null);
		pm.controller = controller;

		expect(() => pm.addPlayerConnection("192.168.0.11", true)).not.toThrow();
		// The player is still marked connected/authenticated with a fresh timestamp.
		expect(pm.playerList.get("192.168.0.11")?.connected).toBe(true);
		expect(pm.playerList.get("192.168.0.11")?.date_connection).toMatch(/^\d{2}:\d{2}$/);
	});

	it("does not add the player to a GAMA experiment that is NONE or NOTREADY", () => {
		for (const state of ["NONE", "NOTREADY"]) {
			const local = buildManager([["192.168.0.11", { id: "bob", in_game: false }]]);
			const { controller, addInGamePlayer } = stubController(state);
			local.controller = controller;

			local.addPlayerConnection("192.168.0.11", true);

			expect(addInGamePlayer).not.toHaveBeenCalled();
			expect(local.playerList.get("192.168.0.11")?.in_game).toBe(false);
			expect(local.playerList.get("192.168.0.11")?.connected).toBe(true);
		}
	});

	it("adds the player in-game when a GAMA experiment is live", () => {
		const { controller, addInGamePlayer } = stubController("RUNNING");
		pm.controller = controller;

		pm.addPlayerConnection("192.168.0.11", true);

		expect(addInGamePlayer).toHaveBeenCalledWith("192.168.0.11");
		expect(pm.playerList.get("192.168.0.11")?.in_game).toBe(true);
	});
});

// Regression: issues #57/#59 ("aggressive disconnect does not work").
// removePlayer always closes the socket; only when AGGRESSIVE_DISCONNECT is on
// does it also drop the entry from the list. This file runs with the default
// (off) — the entry must survive so the player can reconnect. The ON branch is
// covered in PlayerManager.aggressive.test.ts.
describe("removePlayer — aggressive disconnect OFF (issue #57/#59)", () => {
	let pm: PlayerManager;

	beforeEach(() => {
		pm = buildManager([["192.168.0.10", { id: "alice" }]]);
	});

	it("closes the socket but keeps the player in the list (resolved by id)", () => {
		const endSpy = pm.playerList.get("192.168.0.10")!.ws.end as unknown as ReturnType<typeof vi.fn>;
		pm.removePlayer("alice"); // by in-game id
		expect(endSpy).toHaveBeenCalledWith(1000, "192.168.0.10");
		expect(pm.playerList.has("192.168.0.10")).toBe(true);
	});

	it("warns and no-ops for an unknown player", () => {
		expect(() => pm.removePlayer("ghost")).not.toThrow();
		expect(pm.playerList.size).toBe(1);
	});
});
