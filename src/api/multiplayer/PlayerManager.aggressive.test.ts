import { describe, expect, it, vi } from "vitest";

// Force AGGRESSIVE_DISCONNECT on for this whole file (the default is off).
// PlayerManager reads ENV_AGGRESSIVE_DISCONNECT from index.ts at call time, so a
// module mock is the cleanest way to exercise the enabled branch in isolation.
vi.mock("../index.ts", () => ({ ENV_AGGRESSIVE_DISCONNECT: true, ENV_EXTRA_VERBOSE: false }));

import type { Player } from "../core/Constants.ts";
import PlayerManager from "./PlayerManager.ts";

// Build a PlayerManager without its uWS-server constructor, with one player.
function bareManager() {
	const pm = Object.create(PlayerManager.prototype) as PlayerManager;
	pm.playerList = new Map();
	pm.playerList.set("192.168.0.10", {
		id: "alice",
		ws: { send: vi.fn(), end: vi.fn() } as unknown as Player["ws"],
		ping_interval: 5000,
		is_alive: true,
		connected: true,
		in_game: false,
		date_connection: "10:00",
	});
	return pm;
}

// Regression: issues #57/#59 ("aggressive disconnect does not work"). With
// AGGRESSIVE_DISCONNECT enabled, removePlayer must actually drop the player from
// the list (not merely close its socket) so no stale entry lingers.
describe("removePlayer — aggressive disconnect ON (issue #57/#59)", () => {
	it("closes the socket AND removes the player from the list", () => {
		const pm = bareManager();
		const endSpy = pm.playerList.get("192.168.0.10")!.ws.end as unknown as ReturnType<typeof vi.fn>;

		pm.removePlayer("alice");

		expect(endSpy).toHaveBeenCalledWith(1000, "192.168.0.10");
		expect(pm.playerList.has("192.168.0.10")).toBe(false);
		expect(pm.playerList.size).toBe(0);
	});

	it("still removes the entry when the socket is already closed (end throws)", () => {
		const pm = bareManager();
		(pm.playerList.get("192.168.0.10")!.ws.end as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
			throw new Error("already closed");
		});

		expect(() => pm.removePlayer("192.168.0.10")).not.toThrow(); // resolved by IP key
		expect(pm.playerList.has("192.168.0.10")).toBe(false);
	});
});
