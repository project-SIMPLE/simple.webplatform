import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VU_CATALOG_SETTING_JSON, VU_MODEL_SETTING_JSON } from "../common/types.ts";

const { wsState, navigate } = vi.hoisted(() => ({
	wsState: {
		ws: {} as WebSocket | null,
		isWsConnected: true,
		simulationList: [] as unknown[],
	},
	navigate: vi.fn(),
}));

vi.mock("react-router-dom", async (orig) => ({
	...(await orig<typeof import("react-router-dom")>()),
	useNavigate: () => navigate,
}));
vi.mock("../components/WebSocketManager/WebSocketManager.tsx", () => ({
	useWebSocket: () => wsState,
}));

import { wsApi } from "../common/wsApi.ts";
import { useSimulationNav } from "./useSimulationNav.ts";

const sendSimulation = vi.spyOn(wsApi, "sendSimulation").mockReturnValue(true);

const model: VU_MODEL_SETTING_JSON = {
	type: "json_settings",
	name: "M",
	splashscreen: "m.png",
	model_file_path: "./M.gaml",
	experiment_name: "vr_xp",
	minimal_players: "0",
	maximal_players: "4",
};
const catalog: VU_CATALOG_SETTING_JSON = {
	type: "catalog",
	name: "C",
	splashscreen: "c.png",
	entries: [model],
};

beforeEach(() => {
	vi.clearAllMocks();
	wsState.ws = {} as WebSocket;
	wsState.isWsConnected = true;
	wsState.simulationList = [catalog, model];
});

describe("useSimulationNav navigation path", () => {
	it("addToPath and back walk the folder path", () => {
		const { result } = renderHook(() => useSimulationNav());

		act(() => result.current.addToPath(0));
		expect(result.current.path).toEqual([0]);

		act(() => result.current.addToPath(1));
		expect(result.current.path).toEqual([0, 1]);

		act(() => result.current.back());
		expect(result.current.path).toEqual([0]);

		act(() => result.current.back());
		expect(result.current.path).toEqual([]);
	});

	it("reset returns to the catalog root", () => {
		const { result } = renderHook(() => useSimulationNav());
		act(() => result.current.addToPath(0));
		act(() => result.current.reset());
		expect(result.current.path).toEqual([]);
	});
});

describe("useSimulationNav handleSimulation", () => {
	it("descends into a catalog entry", () => {
		const { result } = renderHook(() => useSimulationNav());
		act(() => result.current.handleSimulation(0)); // index 0 == catalog
		expect(result.current.path).toEqual([0]);
		expect(result.current.subProjectsList).toEqual(catalog.entries);
		expect(sendSimulation).not.toHaveBeenCalled();
	});

	it("sends a model to GAMA and navigates to the simulation manager", () => {
		vi.useFakeTimers();
		try {
			const { result } = renderHook(() => useSimulationNav());
			act(() => result.current.handleSimulation(1)); // index 1 == model
			expect(sendSimulation).toHaveBeenCalledWith(wsState.ws, model);
			act(() => vi.advanceTimersByTime(100));
			expect(navigate).toHaveBeenCalledWith("/simulationManager");
		} finally {
			vi.useRealTimers();
		}
	});

	it("is a no-op when the websocket is not connected", () => {
		wsState.isWsConnected = false;
		const { result } = renderHook(() => useSimulationNav());
		act(() => result.current.handleSimulation(1));
		expect(sendSimulation).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
	});
});

describe("useSimulationNav chaos — bad inputs", () => {
	it("collapses subProjectsList to [] when the list is not an array", () => {
		wsState.simulationList = "not an array" as unknown as unknown[];
		const { result } = renderHook(() => useSimulationNav());
		expect(result.current.subProjectsList).toEqual([]);
	});

	it("throws on an out-of-range selection index (see chaos-findings.md)", () => {
		wsState.simulationList = [catalog, model];
		const { result } = renderHook(() => useSimulationNav());
		// subProjectsList[999] is undefined; handleSimulation reads item.type unguarded.
		expect(() => act(() => result.current.handleSimulation(999))).toThrow();
	});
});
