import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Player } from "../core/Constants.ts";
import PlayerManager from "./PlayerManager.ts";

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
