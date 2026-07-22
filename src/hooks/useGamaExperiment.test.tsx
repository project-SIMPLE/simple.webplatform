import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Shared, mutable WebSocket-context stand-in and a navigate spy. Defined via
// vi.hoisted so the (hoisted) vi.mock factories below can reference them.
const { wsState, navigate } = vi.hoisted(() => ({
	wsState: {
		ws: {} as WebSocket | null,
		gamaless: false,
		gama: { experiment_state: "NONE" } as { experiment_state: string },
		playerList: {} as Record<string, unknown>,
		selectedSimulation: { maximal_players: "2", minimal_players: "1" } as
			| { maximal_players: string; minimal_players: string }
			| undefined,
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
import { useGamaExperiment } from "./useGamaExperiment.ts";

const launch = vi.spyOn(wsApi, "launchExperiment").mockReturnValue(true);
const pause = vi.spyOn(wsApi, "pauseExperiment").mockReturnValue(true);
const resume = vi.spyOn(wsApi, "resumeExperiment").mockReturnValue(true);
const stop = vi.spyOn(wsApi, "stopExperiment").mockReturnValue(true);

beforeEach(() => {
	vi.clearAllMocks();
	wsState.ws = {} as WebSocket;
	wsState.gamaless = false;
	wsState.gama = { experiment_state: "NONE" };
	wsState.playerList = {};
	wsState.selectedSimulation = { maximal_players: "2", minimal_players: "1" };
});

describe("useGamaExperiment auto-start", () => {
	it("launches once the detected player count reaches the maximum", () => {
		wsState.playerList = { a: {}, b: {} };
		const { result } = renderHook(() => useGamaExperiment());
		expect(launch).toHaveBeenCalledTimes(1);
		expect(result.current.simulationStarted).toBe(true);
	});

	it("does not auto-launch below the maximum", () => {
		wsState.playerList = { a: {} };
		renderHook(() => useGamaExperiment());
		expect(launch).not.toHaveBeenCalled();
	});

	it("never auto-launches in GAMALESS mode", () => {
		wsState.gamaless = true;
		wsState.playerList = { a: {}, b: {} };
		renderHook(() => useGamaExperiment());
		expect(launch).not.toHaveBeenCalled();
	});

	// Regression: issue #113 — "Experiments are loaded twice".
	// The auto-start effect re-runs on every render (new players joining, state
	// broadcasts). Because GAMA does not leave the "NONE" state until it finishes
	// loading, without the `simulationStarted` one-shot latch every re-render in
	// that window fired a second `launch`, loading the experiment twice.
	it("auto-launches only once across re-renders while GAMA is still NONE", () => {
		wsState.playerList = { a: {}, b: {} }; // reaches max -> auto-start
		const { rerender } = renderHook(() => useGamaExperiment());
		expect(launch).toHaveBeenCalledTimes(1);

		// A third headset connects before GAMA has left NONE (the loading window).
		wsState.playerList = { a: {}, b: {}, c: {} };
		rerender();
		// A state broadcast arrives, still NONE.
		wsState.gama = { experiment_state: "NONE" };
		rerender();

		expect(launch).toHaveBeenCalledTimes(1);
	});
});

describe("useGamaExperiment handlePlayPause", () => {
	it("launches from the NONE state", () => {
		const { result } = renderHook(() => useGamaExperiment());
		act(() => result.current.handlePlayPause());
		expect(launch).toHaveBeenCalledTimes(1);
	});

	it("pauses while RUNNING", () => {
		wsState.gama = { experiment_state: "RUNNING" };
		const { result } = renderHook(() => useGamaExperiment());
		act(() => result.current.handlePlayPause());
		expect(pause).toHaveBeenCalledTimes(1);
		expect(resume).not.toHaveBeenCalled();
	});

	it("resumes while PAUSED", () => {
		wsState.gama = { experiment_state: "PAUSED" };
		const { result } = renderHook(() => useGamaExperiment());
		act(() => result.current.handlePlayPause());
		expect(resume).toHaveBeenCalledTimes(1);
		expect(pause).not.toHaveBeenCalled();
	});
});

describe("useGamaExperiment handleEnd", () => {
	it("stops the experiment and navigates home", () => {
		const { result } = renderHook(() => useGamaExperiment());
		act(() => result.current.handleEnd());
		expect(stop).toHaveBeenCalledTimes(1);
		expect(navigate).toHaveBeenCalledWith("/");
	});
});

describe("useGamaExperiment navigation guards", () => {
	it("redirects home when no simulation is selected (non-GAMALESS)", () => {
		wsState.selectedSimulation = undefined;
		renderHook(() => useGamaExperiment());
		expect(navigate).toHaveBeenCalledWith("/");
	});

	it("redirects home when GAMA ends a running experiment", () => {
		wsState.playerList = { a: {}, b: {} }; // triggers auto-start -> simulationStarted
		const { rerender } = renderHook(() => useGamaExperiment());

		wsState.gama = { experiment_state: "RUNNING" };
		rerender();
		wsState.gama = { experiment_state: "NONE" };
		rerender();

		expect(navigate).toHaveBeenCalledWith("/");
	});
});

describe("useGamaExperiment chaos — degenerate player counts", () => {
	it("never auto-launches when maxPlayers is 0", () => {
		wsState.selectedSimulation = { maximal_players: "0", minimal_players: "0" };
		wsState.playerList = { a: {}, b: {} };
		renderHook(() => useGamaExperiment());
		expect(launch).not.toHaveBeenCalled();
	});

	it("never auto-launches when the simulation has no maxPlayers", () => {
		wsState.selectedSimulation = { maximal_players: undefined as unknown as string, minimal_players: "0" };
		wsState.playerList = { a: {}, b: {} };
		renderHook(() => useGamaExperiment());
		expect(launch).not.toHaveBeenCalled();
	});

	it("auto-launches exactly once even when players exceed the maximum", () => {
		wsState.playerList = { a: {}, b: {}, c: {}, d: {} }; // 4 > max 2
		renderHook(() => useGamaExperiment());
		expect(launch).toHaveBeenCalledTimes(1);
	});
});
