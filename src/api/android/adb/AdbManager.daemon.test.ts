import type { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The adb daemon must be spawned before the ScrcpyServer (a uWS server) listens: on Windows a
// daemon spawned later inherits the uWS listening sockets and keeps them open after the backend
// exits, so the next run's clients connect to the orphaned sockets and hang.
const state = vi.hoisted(() => ({
	order: [] as string[],
	spawned: [] as { command: string; args: string[]; proc: EventEmitter }[],
	trackDevices: vi.fn(),
}));

vi.mock("node:child_process", async () => {
	const { EventEmitter } = await import("node:events");
	return {
		spawn: vi.fn((command: string, args: string[]) => {
			const proc = new EventEmitter();
			state.order.push(`spawn ${command} ${args.join(" ")}`);
			state.spawned.push({ command, args, proc });
			return proc;
		}),
	};
});
vi.mock("../../index.ts", () => ({ ENV_VERBOSE: false, ENV_EXTRA_VERBOSE: false }));
vi.mock("../scrcpy/ScrcpyServer.ts", () => ({
	ScrcpyServer: class {
		constructor() {
			state.order.push("ScrcpyServer");
		}
	},
}));
vi.mock("./HeadsetSetup.ts", () => ({ HeadsetSetup: class {} }));
vi.mock("./DeviceFinder.ts", () => ({
	default: class {
		scanAndConnect = vi.fn().mockResolvedValue(undefined);
	},
}));
vi.mock("@yume-chan/adb-server-node-tcp", () => ({
	AdbServerNodeJsClient: class {
		trackDevices = state.trackDevices;
		getDevices = vi.fn().mockResolvedValue([]);
	},
}));

import type Controller from "../../core/Controller.ts";
import { AdbManager } from "./AdbManager.ts";

beforeEach(() => {
	state.order = [];
	state.spawned = [];
	state.trackDevices.mockReset().mockResolvedValue({ onDeviceAdd: vi.fn(), onListChange: vi.fn() });
});

describe("AdbManager adb daemon start", () => {
	it("spawns `adb start-server` in the constructor, before the ScrcpyServer listens", () => {
		new AdbManager({} as Controller);
		expect(state.order).toEqual(["spawn adb start-server", "ScrcpyServer"]);
	});

	it("init() waits for that same spawn to finish instead of spawning again", async () => {
		const manager = new AdbManager({} as Controller);
		const initDone = manager.init();

		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(state.trackDevices).not.toHaveBeenCalled(); // still waiting on the daemon

		state.spawned[0].proc.emit("close", 0);
		await initDone;
		expect(state.trackDevices).toHaveBeenCalledOnce();
		expect(state.spawned).toHaveLength(1);
	});

	it("init() still proceeds when adb fails to spawn", async () => {
		const manager = new AdbManager({} as Controller);
		state.spawned[0].proc.emit("error", new Error("spawn adb ENOENT"));
		await manager.init();
		expect(state.trackDevices).toHaveBeenCalledOnce();
	});
});
