import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const { wsState } = vi.hoisted(() => ({ wsState: { ws: {} as WebSocket } }));
vi.mock("../WebSocketManager/WebSocketManager.tsx", () => ({ useWebSocket: () => wsState }));

import { wsApi } from "../../common/wsApi.ts";
import SimulationManagerPlayer from "./SimulationManagerPlayer.tsx";

const removeSpy = vi.spyOn(wsApi, "removePlayerHeadset").mockReturnValue(true);

describe("SimulationManagerPlayer", () => {
	it("opens the manage popup on click and removes the player through wsApi", async () => {
		render(
			<SimulationManagerPlayer
				Playerkey="headset_1"
				playerId="headset_1"
				selectedPlayer={{ connected: true, in_game: false, date_connection: "10:00" }}
			/>,
		);
		// Popup hidden until the tile is clicked.
		expect(screen.queryByText("Remove")).not.toBeInTheDocument();

		await userEvent.click(screen.getByAltText("VR Headset"));
		expect(screen.getByText("Remove")).toBeInTheDocument();

		await userEvent.click(screen.getByText("Remove"));
		expect(removeSpy).toHaveBeenCalledWith(wsState.ws, "headset_1");
	});
});
