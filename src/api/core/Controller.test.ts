import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Controllable module doubles ──────────────────────────────────────────────
// ENV_GAMALESS is an `export let` in index.ts (default false, flipped only by
// loadConfiguration). Expose it as a getter over a mutable flag so a single test
// file can exercise both normal and GAMALESS branches without re-importing.
const state = vi.hoisted(() => ({ gamaless: false, macMini: true }));

vi.mock("../index.ts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../index.ts")>();
	return {
		...actual,
		get ENV_GAMALESS() {
			return state.gamaless;
		},
	};
});

vi.mock("../infra/DeviceDetector.ts", () => ({
	isMacMini: () => state.macMini,
}));

vi.mock("node:child_process", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:child_process")>();
	return { ...actual, spawnSync: vi.fn() };
});

import { spawnSync } from "node:child_process";
import { Controller } from "./Controller.ts";

// ── Fakes injected into a prototype-built Controller (no servers started) ──────
type Fakes = ReturnType<typeof makeFakes>;

function makeFakes(experimentState = "NONE") {
	return {
		gama_connector: {
			jsonGamaState: { experiment_state: experimentState },
			launchExperiment: vi.fn(),
			stopExperiment: vi.fn(),
			pauseExperiment: vi.fn(),
			resumeExperiment: vi.fn(),
		},
		player_manager: {
			addEveryPlayer: vi.fn(),
			removeAllPlayer: vi.fn(),
		},
		monitor_server: {
			sendMonitorGamaState: vi.fn(),
		},
		adb_manager: {
			shutdownAllHeadsets: vi.fn().mockResolvedValue(undefined),
		},
		ups_service: {
			isConnected: vi.fn(() => true),
			isOnAC: vi.fn(() => true),
			armShutdown: vi.fn(),
		},
	};
}

// Build off the prototype so the real constructor (which starts uWS servers,
// adb, UPS probes and a 3h timer) never runs. Mirrors MonitorServer.test.ts.
function bareController(fakes: Fakes): Controller {
	const c = Object.create(Controller.prototype) as Controller;
	Object.assign(c, fakes);
	(c as unknown as { launchInterval: null }).launchInterval = null;
	return c;
}

beforeEach(() => {
	state.gamaless = false;
	state.macMini = true;
	vi.useFakeTimers();
});

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.clearAllMocks();
});

describe("Controller.launchExperiment", () => {
	it("polls until GAMA leaves NONE/NOTREADY, then adds every player exactly once", () => {
		const fakes = makeFakes("NOTREADY");
		const c = bareController(fakes);

		c.launchExperiment();
		expect(fakes.gama_connector.launchExperiment).toHaveBeenCalledOnce();

		// Still not ready: keeps polling, no players added yet.
		vi.advanceTimersByTime(300);
		expect(fakes.player_manager.addEveryPlayer).not.toHaveBeenCalled();

		// GAMA becomes ready → next tick clears the interval and adds players once.
		fakes.gama_connector.jsonGamaState.experiment_state = "RUNNING";
		vi.advanceTimersByTime(100);
		expect(fakes.player_manager.addEveryPlayer).toHaveBeenCalledOnce();

		// Interval is cleared: no further additions even as time marches on.
		vi.advanceTimersByTime(1000);
		expect(fakes.player_manager.addEveryPlayer).toHaveBeenCalledOnce();
	});

	it("notifies the monitor on every poll tick", () => {
		const fakes = makeFakes("NONE");
		const c = bareController(fakes);

		c.launchExperiment();
		vi.advanceTimersByTime(300); // 3 ticks
		expect(fakes.monitor_server.sendMonitorGamaState.mock.calls.length).toBeGreaterThanOrEqual(3);
	});

	it("clears a stale interval before starting a new one (no double add)", () => {
		const fakes = makeFakes("NOTREADY");
		const c = bareController(fakes);

		c.launchExperiment();
		c.launchExperiment(); // second attempt must cancel the first interval

		fakes.gama_connector.jsonGamaState.experiment_state = "RUNNING";
		vi.advanceTimersByTime(100);

		// Only the surviving interval fires → players added exactly once.
		expect(fakes.player_manager.addEveryPlayer).toHaveBeenCalledOnce();
	});

	it("is a no-op in GAMALESS mode", () => {
		state.gamaless = true;
		const fakes = makeFakes("NONE");
		const c = bareController(fakes);

		c.launchExperiment();
		vi.advanceTimersByTime(500);
		expect(fakes.gama_connector.launchExperiment).not.toHaveBeenCalled();
		expect(fakes.player_manager.addEveryPlayer).not.toHaveBeenCalled();
	});
});

describe("Controller.cancelLaunchInterval", () => {
	it("is idempotent and stops a running poll loop", () => {
		const fakes = makeFakes("NOTREADY");
		const c = bareController(fakes);

		c.launchExperiment();
		c.cancelLaunchInterval();
		c.cancelLaunchInterval(); // second call must not throw

		fakes.gama_connector.jsonGamaState.experiment_state = "RUNNING";
		vi.advanceTimersByTime(500);
		expect(fakes.player_manager.addEveryPlayer).not.toHaveBeenCalled();
	});
});

describe("Controller.stopExperiment", () => {
	it("cancels the launch loop, stops GAMA and removes players", () => {
		const fakes = makeFakes("RUNNING");
		const c = bareController(fakes);

		c.launchExperiment();
		c.stopExperiment();

		expect(fakes.gama_connector.stopExperiment).toHaveBeenCalledOnce();
		expect(fakes.player_manager.removeAllPlayer).toHaveBeenCalledOnce();

		// Launch loop was cancelled: a late "ready" never adds players.
		fakes.gama_connector.jsonGamaState.experiment_state = "RUNNING";
		vi.advanceTimersByTime(500);
		expect(fakes.player_manager.addEveryPlayer).not.toHaveBeenCalled();
	});

	it("is a no-op in GAMALESS mode", () => {
		state.gamaless = true;
		const fakes = makeFakes("RUNNING");
		const c = bareController(fakes);

		c.stopExperiment();
		expect(fakes.gama_connector.stopExperiment).not.toHaveBeenCalled();
		expect(fakes.player_manager.removeAllPlayer).not.toHaveBeenCalled();
	});
});

describe("Controller.handleSessionTimeout", () => {
	// handleSessionTimeout is private; reach it through the prototype.
	function fire(c: Controller): Promise<void> {
		return (c as unknown as { handleSessionTimeout(): Promise<void> }).handleSessionTimeout();
	}

	it("does nothing off M2L2 hardware", async () => {
		state.macMini = false;
		const fakes = makeFakes();
		const c = bareController(fakes);

		await fire(c);
		expect(fakes.adb_manager.shutdownAllHeadsets).not.toHaveBeenCalled();
		expect(fakes.ups_service.armShutdown).not.toHaveBeenCalled();
		expect(spawnSync).not.toHaveBeenCalled();
	});

	it("skips shutdown when the UPS is on AC power", async () => {
		const fakes = makeFakes();
		fakes.ups_service.isConnected.mockReturnValue(true);
		fakes.ups_service.isOnAC.mockReturnValue(true);
		const c = bareController(fakes);

		await fire(c);
		expect(fakes.adb_manager.shutdownAllHeadsets).not.toHaveBeenCalled();
		expect(fakes.ups_service.armShutdown).not.toHaveBeenCalled();
		expect(spawnSync).not.toHaveBeenCalled();
	});

	it("runs the shutdown sequence when on battery: headsets → UPS arm → host shutdown", async () => {
		const fakes = makeFakes();
		fakes.ups_service.isConnected.mockReturnValue(true);
		fakes.ups_service.isOnAC.mockReturnValue(false);
		const c = bareController(fakes);

		await fire(c);

		expect(fakes.adb_manager.shutdownAllHeadsets).toHaveBeenCalledOnce();
		expect(fakes.ups_service.armShutdown).toHaveBeenCalledWith(120);

		// Host shutdown is deferred 30s to let headsets/UPS process.
		expect(spawnSync).not.toHaveBeenCalled();
		vi.advanceTimersByTime(30_000);
		expect(spawnSync).toHaveBeenCalledWith("shutdown", ["-h", "now"]);
	});

	it("treats a disconnected UPS as on-battery and shuts down", async () => {
		const fakes = makeFakes();
		fakes.ups_service.isConnected.mockReturnValue(false);
		const c = bareController(fakes);

		await fire(c);
		expect(fakes.adb_manager.shutdownAllHeadsets).toHaveBeenCalledOnce();
		expect(fakes.ups_service.armShutdown).toHaveBeenCalledWith(120);
	});
});
