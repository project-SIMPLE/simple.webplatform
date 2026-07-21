import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// node-hid is a native addon only used inside open()/listDevices(). Every test
// here bypasses open() (autoOpen: false) and injects a fake device, so mock the
// module out entirely to avoid loading the native binding.
vi.mock("node-hid", () => ({
	default: { devices: vi.fn(() => []), HID: class {} },
}));

import acPresent from "../../../../test/fixtures/ups/ac-present.json" with { type: "json" };
import onBattery from "../../../../test/fixtures/ups/on-battery.json" with { type: "json" };
import { ApcUpsHid } from "./apc-ups-hid.ts";

// All UPS fixtures live here. Snapshot fixtures (*.json) — hand-written or produced
// by `node scripts/capture-ups-reports.mjs <name>` — are auto-discovered by the
// decode suite; *.trace.json files are replayed by the trace suite. Drop a real
// capture in and it is tested automatically, no edit here needed.
const upsFixtureDir = path.join(process.cwd(), "test", "fixtures", "ups");

// Replays a fixture's raw feature reports and records writes, standing in for the
// node-hid device. getFeatureReport returns the bytes the real UPS would return.
class FakeHidDevice {
	reports = new Map<number, number[]>();
	sent: number[][] = [];
	closed = false;
	failReads = false;

	constructor(reports: Record<string, number[]>) {
		for (const [id, bytes] of Object.entries(reports)) this.reports.set(Number(id), bytes);
	}
	set(id: number, bytes: number[]) {
		this.reports.set(id, bytes);
	}
	getFeatureReport(id: number, _len: number): number[] {
		if (this.failReads) throw new Error("HID read failed");
		return this.reports.get(id) ?? [id, 0];
	}
	sendFeatureReport(data: number[]): number {
		this.sent.push(data);
		return data.length;
	}
	close() {
		this.closed = true;
	}
}

function upsWith(reports: Record<string, number[]>) {
	const ups = new ApcUpsHid({ autoOpen: false });
	const device = new FakeHidDevice(reports);
	(ups as unknown as { device: FakeHidDevice }).device = device;
	return { ups, device };
}

const REPORT_BATTERY = 0x0c;
const REPORT_AC = 0x13;
const REPORT_SHUTDOWN = 0x15;
const REPORT_BEEPER = 0x78;

afterEach(() => vi.clearAllMocks());

// Every snapshot fixture with a filled-in `expected` block, hand-written or captured.
const snapshotFixtures = readdirSync(upsFixtureDir)
	.filter((f) => f.endsWith(".json") && !f.endsWith(".trace.json"))
	.map((f) => JSON.parse(readFileSync(path.join(upsFixtureDir, f), "utf8")) as Snapshot)
	.filter((fx) => fx.expected && Object.keys(fx.expected).length > 0);

interface Snapshot {
	name: string;
	reports: Record<string, number[]>;
	expected: Record<string, unknown>;
}

describe("ApcUpsHid.getStatus decodes raw reports", () => {
	for (const fixture of snapshotFixtures) {
		it(`matches the '${fixture.name}' fixture`, () => {
			const { ups } = upsWith(fixture.reports);
			const status = ups.getStatus();
			expect(status).toMatchObject(fixture.expected);
			expect(typeof status.timestamp).toBe("number");
		});
	}

	it("reports an unknown beeper state for an unmapped raw value", () => {
		const { ups, device } = upsWith(acPresent.reports);
		device.set(REPORT_BEEPER, [REPORT_BEEPER, 9]);
		expect(ups.getStatus().beeperStatus).toBe("unknown");
	});
});

describe("ApcUpsHid signed shutdown timer", () => {
	it("decodes 0xFFFF as -1 (not armed)", () => {
		const { ups, device } = upsWith(acPresent.reports);
		device.set(REPORT_SHUTDOWN, [REPORT_SHUTDOWN, 0xff, 0xff]);
		expect(ups.getShutdownTimer()).toBe(-1);
	});

	it("decodes a positive armed delay", () => {
		const { ups, device } = upsWith(acPresent.reports);
		device.set(REPORT_SHUTDOWN, [REPORT_SHUTDOWN, 0x2c, 0x01]); // 300
		expect(ups.getShutdownTimer()).toBe(300);
	});
});

describe("ApcUpsHid write commands", () => {
	it("shutdown() bounds-checks the delay", () => {
		const { ups } = upsWith(acPresent.reports);
		expect(() => ups.shutdown(0)).toThrow();
		expect(() => ups.shutdown(32768)).toThrow();
	});

	it("shutdown() writes the delay as little-endian bytes", () => {
		const { ups, device } = upsWith(acPresent.reports);
		ups.shutdown(300);
		expect(device.sent.at(-1)).toEqual([REPORT_SHUTDOWN, 0x2c, 0x01]);
	});

	it("cancelShutdown() writes 0xFFFF (disarm)", () => {
		const { ups, device } = upsWith(acPresent.reports);
		ups.cancelShutdown();
		expect(device.sent.at(-1)).toEqual([REPORT_SHUTDOWN, 0xff, 0xff]);
	});

	it("setBeeper() maps states and rejects invalid ones", () => {
		const { ups, device } = upsWith(acPresent.reports);
		ups.setBeeper("muted");
		expect(device.sent.at(-1)).toEqual([REPORT_BEEPER, 3]);
		ups.setBeeper("disabled");
		expect(device.sent.at(-1)).toEqual([REPORT_BEEPER, 1]);
		// @ts-expect-error invalid state guarded at runtime
		expect(() => ups.setBeeper("loud")).toThrow();
	});
});

describe("ApcUpsHid.startPolling transitions", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	function batteryReports(charge: number, ac: boolean): Record<string, number[]> {
		return {
			...structuredClone(onBattery.reports),
			[String(REPORT_BATTERY)]: [REPORT_BATTERY, charge],
			[String(REPORT_AC)]: [REPORT_AC, ac ? 1 : 0],
		};
	}

	it("emits power-lost and power-restored on AC edges only", () => {
		const { ups, device } = upsWith(batteryReports(80, true));
		const lost = vi.fn();
		const restored = vi.fn();
		ups.on("power-lost", lost);
		ups.on("power-restored", restored);

		ups.startPolling(1000); // initial poll = baseline (AC present)
		expect(lost).not.toHaveBeenCalled();

		device.set(REPORT_AC, [REPORT_AC, 0]); // AC lost
		vi.advanceTimersByTime(1000);
		expect(lost).toHaveBeenCalledOnce();

		vi.advanceTimersByTime(1000); // still on battery, no repeat
		expect(lost).toHaveBeenCalledOnce();

		device.set(REPORT_AC, [REPORT_AC, 1]); // AC back
		vi.advanceTimersByTime(1000);
		expect(restored).toHaveBeenCalledOnce();

		ups.stopPolling();
	});

	it("fires battery-low once at the 20% crossing and not again while below", () => {
		const { ups, device } = upsWith(batteryReports(55, false));
		const low = vi.fn();
		ups.on("battery-low", low);

		ups.startPolling(1000); // baseline: on battery, 55% → no event
		expect(low).not.toHaveBeenCalled();

		device.set(REPORT_BATTERY, [REPORT_BATTERY, 18]); // cross below 20
		vi.advanceTimersByTime(1000);
		expect(low).toHaveBeenCalledWith(18);

		device.set(REPORT_BATTERY, [REPORT_BATTERY, 15]); // still below, no repeat
		vi.advanceTimersByTime(1000);
		expect(low).toHaveBeenCalledOnce();

		ups.stopPolling();
	});

	it("fires battery-critical (not low) when charge plunges past both thresholds in one tick", () => {
		const { ups, device } = upsWith(batteryReports(55, false));
		const critical = vi.fn();
		const low = vi.fn();
		ups.on("battery-critical", critical);
		ups.on("battery-low", low);

		ups.startPolling(1000); // baseline 55% on battery → no event
		device.set(REPORT_BATTERY, [REPORT_BATTERY, 8]); // straight from 55% to 8%
		vi.advanceTimersByTime(1000);

		expect(critical).toHaveBeenCalledWith(8);
		expect(low).not.toHaveBeenCalled(); // else-if: critical wins at this tick

		ups.stopPolling();
	});

	it("does not emit battery events while on AC power", () => {
		const { ups } = upsWith(batteryReports(5, true)); // 5% but on AC
		const low = vi.fn();
		const critical = vi.fn();
		ups.on("battery-low", low);
		ups.on("battery-critical", critical);

		ups.startPolling(1000);
		vi.advanceTimersByTime(3000);

		expect(low).not.toHaveBeenCalled();
		expect(critical).not.toHaveBeenCalled();
		ups.stopPolling();
	});

	it("emits 'error' (does not throw) when a read fails mid-poll", () => {
		const { ups, device } = upsWith(batteryReports(80, true));
		const onError = vi.fn();
		ups.on("error", onError);

		ups.startPolling(1000);
		device.failReads = true;
		expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
		expect(onError).toHaveBeenCalledOnce();
		expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
		ups.stopPolling();
	});
});

// Replays real captured traces (produced by `node scripts/capture-ups-reports.mjs
// <name> --trace N`) through the driver and checks its power events against an
// independent count of the AC transitions in the recorded data. Skips cleanly
// until a *.trace.json fixture is captured on real hardware.
const traceFiles = readdirSync(upsFixtureDir).filter((f) => f.endsWith(".trace.json"));

interface TraceSample {
	reports: Record<string, number[]>;
	decoded: { acPresent: boolean; batteryCharge: number };
}

describe.skipIf(traceFiles.length === 0)("ApcUpsHid trace replay (real captured data)", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	for (const file of traceFiles) {
		it(`emits power events matching the AC transitions in ${file}`, () => {
			const trace = JSON.parse(readFileSync(path.join(upsFixtureDir, file), "utf8"));
			const samples: TraceSample[] = trace.samples;
			expect(samples.length).toBeGreaterThan(1);

			// Independent expectation: count AC edges across the recorded samples
			// (the first sample is the driver's baseline poll — no event there).
			let expectedLost = 0;
			let expectedRestored = 0;
			for (let i = 1; i < samples.length; i++) {
				const prev = samples[i - 1].decoded.acPresent;
				const cur = samples[i].decoded.acPresent;
				if (prev && !cur) expectedLost++;
				else if (!prev && cur) expectedRestored++;
			}

			const { ups, device } = upsWith(samples[0].reports);
			const lost = vi.fn();
			const restored = vi.fn();
			ups.on("power-lost", lost);
			ups.on("power-restored", restored);

			ups.startPolling(1000); // initial poll = baseline
			for (let i = 1; i < samples.length; i++) {
				device.reports = new Map(Object.entries(samples[i].reports).map(([id, bytes]) => [Number(id), bytes]));
				vi.advanceTimersByTime(1000);
			}
			ups.stopPolling();

			expect(lost).toHaveBeenCalledTimes(expectedLost);
			expect(restored).toHaveBeenCalledTimes(expectedRestored);
		});
	}
});
