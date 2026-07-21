import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fake ApcUpsHid: a minimal event emitter that records the calls UpsManager makes
// and lets tests drive driver events (connected/disconnected/error/...). open()
// flips isConnected; override per-test to simulate a missing device.
const { FakeUps } = vi.hoisted(() => {
	class FakeUps {
		static instances: FakeUps[] = [];
		private listeners = new Map<string, ((...a: unknown[]) => void)[]>();
		isConnected = false;
		info = { product: "Back-UPS BX2200MI", serialNumber: "SN1", manufacturer: "APC", path: "/dev/x" };

		open = vi.fn(() => {
			this.isConnected = true;
		});
		close = vi.fn(() => {
			this.isConnected = false;
			this.emit("disconnected");
		});
		setBeeper = vi.fn();
		startPolling = vi.fn();
		stopPolling = vi.fn();
		getStatus = vi.fn(() => ({ batteryCharge: 100, runtimeMinutes: 30, acPresent: true, inputVoltage: 230 }));
		isOnAC = vi.fn(() => true);
		shutdown = vi.fn();

		constructor() {
			FakeUps.instances.push(this);
		}
		on(event: string, cb: (...a: unknown[]) => void): this {
			const list = this.listeners.get(event) ?? [];
			list.push(cb);
			this.listeners.set(event, list);
			return this;
		}
		emit(event: string, ...args: unknown[]): void {
			for (const cb of this.listeners.get(event) ?? []) cb(...args);
		}
	}
	return { FakeUps };
});

vi.mock("./apc-ups-hid.ts", () => ({ ApcUpsHid: FakeUps, default: FakeUps }));

import { UpsManager } from "./UpsManager.ts";

function newManager() {
	const mgr = new UpsManager();
	const ups = FakeUps.instances[FakeUps.instances.length - 1];
	return { mgr, ups };
}

beforeEach(() => {
	FakeUps.instances = [];
	vi.useFakeTimers();
});
afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.clearAllMocks();
});

describe("UpsManager.connect", () => {
	it("opens, silences the beeper, and starts polling on success", async () => {
		const { mgr, ups } = newManager();
		const ok = await mgr.connect();
		expect(ok).toBe(true);
		expect(ups.open).toHaveBeenCalledOnce();
		expect(ups.setBeeper).toHaveBeenCalledWith("disabled");
		expect(ups.startPolling).toHaveBeenCalledWith(5000);
	});

	it("retries then gives up after 4 failed attempts", async () => {
		const { mgr, ups } = newManager();
		ups.open.mockImplementation(() => {
			throw new Error("no device");
		});

		const p = mgr.connect();
		await vi.runAllTimersAsync(); // flush the 3 inter-attempt delays
		expect(await p).toBe(false);
		expect(ups.open).toHaveBeenCalledTimes(4);
		expect(ups.startPolling).not.toHaveBeenCalled();
	});

	it("succeeds on a later attempt after a transient failure", async () => {
		const { mgr, ups } = newManager();
		ups.open.mockImplementationOnce(() => {
			throw new Error("busy");
		});

		const p = mgr.connect();
		await vi.runAllTimersAsync();
		expect(await p).toBe(true);
		expect(ups.open).toHaveBeenCalledTimes(2);
	});
});

describe("UpsManager reconnect scheduling", () => {
	it("schedules a single reconnect even if 'disconnected' fires twice", () => {
		const { ups } = newManager();
		ups.open.mockClear(); // ignore anything from construction

		ups.emit("disconnected");
		ups.emit("disconnected"); // guarded: reconnectTimer already set

		vi.advanceTimersByTime(5000);
		expect(ups.open).toHaveBeenCalledOnce(); // only one reconnect ran
	});

	it("reschedules when a reconnect attempt fails", () => {
		const { ups } = newManager();
		ups.open.mockImplementation(() => {
			throw new Error("still gone");
		});

		ups.emit("disconnected");
		vi.advanceTimersByTime(5000); // first reconnect fails → reschedules
		expect(ups.open).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(5000); // second reconnect fires
		expect(ups.open).toHaveBeenCalledTimes(2);
	});

	it("closes the device on a HID error so a reconnect can follow", () => {
		const { ups } = newManager();
		ups.emit("error", new Error("cable pulled"));
		expect(ups.close).toHaveBeenCalledOnce();
	});
});

describe("UpsManager queries and shutdown", () => {
	it("isOnAC returns false when not connected without touching the device", () => {
		const { mgr, ups } = newManager();
		ups.isConnected = false;
		expect(mgr.isOnAC()).toBe(false);
		expect(ups.isOnAC).not.toHaveBeenCalled();
	});

	it("isOnAC delegates when connected and swallows read errors", () => {
		const { mgr, ups } = newManager();
		ups.isConnected = true;
		expect(mgr.isOnAC()).toBe(true);

		ups.isOnAC.mockImplementation(() => {
			throw new Error("read fail");
		});
		expect(mgr.isOnAC()).toBe(false);
	});

	it("armShutdown is a no-op when the UPS is not connected", () => {
		const { mgr, ups } = newManager();
		ups.isConnected = false;
		mgr.armShutdown(120);
		expect(ups.shutdown).not.toHaveBeenCalled();
	});

	it("armShutdown forwards the delay when connected", () => {
		const { mgr, ups } = newManager();
		ups.isConnected = true;
		mgr.armShutdown(120);
		expect(ups.shutdown).toHaveBeenCalledWith(120);
	});
});

describe("UpsManager.close", () => {
	it("cancels a pending reconnect and blocks further reconnects", () => {
		const { mgr, ups } = newManager();
		ups.emit("disconnected"); // schedules a reconnect
		mgr.close();
		ups.open.mockClear();

		ups.emit("disconnected"); // must not schedule after close
		vi.advanceTimersByTime(10_000);
		expect(ups.open).not.toHaveBeenCalled();
		expect(ups.close).toHaveBeenCalled();
	});
});
