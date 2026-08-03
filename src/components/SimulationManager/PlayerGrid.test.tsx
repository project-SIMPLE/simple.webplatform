import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// PlayerGrid renders SimulationManagerPlayer, which consumes the WebSocket context.
vi.mock("../WebSocketManager/WebSocketManager.tsx", () => ({ useWebSocket: () => ({ ws: null }) }));

import type { PlayerList } from "../../common/types.ts";
import PlayerGrid from "./PlayerGrid.tsx";

describe("PlayerGrid", () => {
	it("renders a tile per connected player plus placeholders up to maxPlayers", () => {
		const playerList: PlayerList = {
			headset_1: { connected: true, in_game: false, date_connection: "10:00" },
		};
		render(<PlayerGrid playerList={playerList} maxPlayers={3} />);

		// The one connected player shows the "connected" badge.
		expect(screen.getByAltText("headset connected")).toBeInTheDocument();
		// One player tile + two placeholder headsets = maxPlayers headset images.
		expect(screen.getAllByAltText("VR Headset")).toHaveLength(3);
	});

	it("renders only players when the count meets maxPlayers (no placeholders)", () => {
		const playerList: PlayerList = {
			headset_1: { connected: true, in_game: false, date_connection: "10:00" },
			headset_2: { connected: false, in_game: false, date_connection: "" },
		};
		render(<PlayerGrid playerList={playerList} maxPlayers={2} />);
		expect(screen.getAllByAltText("VR Headset")).toHaveLength(2);
	});
});
