import { beforeEach, describe, expect, it, vi } from "vitest";

// Each component the Controller builds records when it was constructed. The uWS servers
// (MonitorServer, PlayerManager) must come AFTER AdbManager, which spawns the long-lived adb
// daemon: on Windows that daemon would otherwise inherit their listening sockets and keep them
// open once the backend exits, so the next run's frontend hangs forever.
const { state, recorder } = vi.hoisted(() => {
	const state = { order: [] as string[], gamaless: false };
	const recorder = (name: string) =>
		class {
			constructor() {
				state.order.push(name);
			}
		};
	return { state, recorder };
});

vi.mock("../index.ts", () => ({
	get ENV_GAMALESS() {
		return state.gamaless;
	},
}));
vi.mock("../android/adb/AdbManager.ts", () => ({ AdbManager: recorder("AdbManager") }));
vi.mock("../monitoring/MonitorServer.ts", () => ({ MonitorServer: recorder("MonitorServer") }));
vi.mock("../multiplayer/PlayerManager.ts", () => ({ default: recorder("PlayerManager") }));
vi.mock("../simulation/ModelManager.ts", () => ({ default: recorder("ModelManager") }));
vi.mock("../simulation/GamaConnector.ts", () => ({ default: recorder("GamaConnector") }));
vi.mock("../infra/ups/UpsManager.ts", () => ({ UpsManager: recorder("UpsManager") }));

import { Controller } from "./Controller.ts";

beforeEach(() => {
	state.order = [];
	state.gamaless = false;
});

describe("Controller construction order", () => {
	it("builds AdbManager before any uWS server", () => {
		new Controller(true);
		expect(state.order[0]).toBe("AdbManager");
		expect(state.order).toContain("MonitorServer");
		expect(state.order).toContain("PlayerManager");
	});

	it("builds AdbManager first in GAMALESS mode too", () => {
		state.gamaless = true;
		new Controller(true);
		expect(state.order).toEqual(["AdbManager", "MonitorServer", "PlayerManager", "UpsManager"]);
	});

	it("skips AdbManager entirely when adb is unavailable", () => {
		const c = new Controller(false);
		expect(state.order).not.toContain("AdbManager");
		expect(c.adb_manager).toBeUndefined();
	});
});
