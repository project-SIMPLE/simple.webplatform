import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VU_MODEL_SETTING_JSON } from "../../common/types.ts";

// Mutable stand-ins for the two hooks SelectorSimulations composes. useSimulationNav
// is covered by its own suite, so mock it here and focus on this component's own
// logic: connection polling and arrow-key navigation.
const { wsState, navState } = vi.hoisted(() => ({
	wsState: {
		ws: null as unknown,
		isWsConnected: false,
		gamaless: false,
		gama: { connected: false } as { connected: boolean },
		simulationList: [] as unknown[],
	},
	navState: {
		subProjectsList: [] as unknown[],
		path: [] as unknown[],
		back: vi.fn(),
		reset: vi.fn(),
		handleSimulation: vi.fn(),
	},
}));

vi.mock("../WebSocketManager/WebSocketManager.tsx", () => ({ useWebSocket: () => wsState }));
vi.mock("../../hooks/useSimulationNav.ts", () => ({ useSimulationNav: () => navState }));

import { MemoryRouter } from "react-router-dom";
import { wsApi } from "../../common/wsApi.ts";
import SelectorSimulations from "./SelectorSimulations.tsx";

const getSimInfo = vi.spyOn(wsApi, "getSimulationInformations").mockReturnValue(true);
const tryConnection = vi.spyOn(wsApi, "tryConnection").mockReturnValue(true);

function model(name: string): VU_MODEL_SETTING_JSON {
	return {
		type: "json_settings",
		name,
		splashscreen: "",
		model_file_path: "",
		experiment_name: "vr_xp",
		minimal_players: "0",
		maximal_players: "4",
	};
}

function renderPage() {
	return render(
		<MemoryRouter>
			<SelectorSimulations />
		</MemoryRouter>,
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	wsState.ws = null;
	wsState.isWsConnected = false;
	wsState.gamaless = false;
	wsState.gama = { connected: false };
	wsState.simulationList = [];
	navState.subProjectsList = [];
	navState.path = [];
});

describe("SelectorSimulations connection handling", () => {
	it("requests the simulation list once the WebSocket is connected", () => {
		wsState.ws = { readyState: WebSocket.OPEN, send: vi.fn() };
		wsState.isWsConnected = true;

		renderPage();
		expect(getSimInfo).toHaveBeenCalledWith(wsState.ws);
	});

	it("polls GAMA every 3s while disconnected (non-GAMALESS)", () => {
		vi.useFakeTimers();
		try {
			wsState.ws = { readyState: WebSocket.OPEN, send: vi.fn() };
			wsState.isWsConnected = true;
			wsState.gama = { connected: false };

			renderPage();
			expect(tryConnection).not.toHaveBeenCalled();

			vi.advanceTimersByTime(3000);
			expect(tryConnection).toHaveBeenCalledWith(wsState.ws);
		} finally {
			vi.useRealTimers();
		}
	});

	it("does not poll GAMA in GAMALESS mode", () => {
		vi.useFakeTimers();
		try {
			wsState.ws = { readyState: WebSocket.OPEN, send: vi.fn() };
			wsState.isWsConnected = true;
			wsState.gamaless = true;

			renderPage();
			vi.advanceTimersByTime(9000);
			expect(tryConnection).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("SelectorSimulations keyboard navigation", () => {
	beforeEach(() => {
		wsState.ws = { readyState: WebSocket.OPEN, send: vi.fn() };
		wsState.isWsConnected = true;
		wsState.gama = { connected: true };
		wsState.simulationList = [model("Alpha"), model("Beta")]; // length > 0 → not loading
		navState.subProjectsList = [model("Alpha"), model("Beta")];
	});

	it("auto-focuses the first tile and moves focus with the arrow keys", () => {
		renderPage();

		const tiles = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-nav-item="tile"]'));
		expect(tiles).toHaveLength(2);
		expect(document.activeElement).toBe(tiles[0]);

		fireEvent.keyDown(tiles[0], { key: "ArrowRight" });
		expect(document.activeElement).toBe(tiles[1]);

		fireEvent.keyDown(tiles[1], { key: "ArrowLeft" });
		expect(document.activeElement).toBe(tiles[0]);
	});
});
