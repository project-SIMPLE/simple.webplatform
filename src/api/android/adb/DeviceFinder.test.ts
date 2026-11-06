import { beforeEach, describe, expect, it, vi } from "vitest";

// Records each port scan instead of opening thousands of sockets; a scan finishes at once, empty.
const { scans } = vi.hoisted(() => ({ scans: [] as string[] }));
vi.mock("evilscan", () => ({
	default: class {
		private handlers: Record<string, () => void> = {};
		constructor(options: { target: string }) {
			scans.push(options.target);
		}
		on(event: string, handler: () => void) {
			this.handlers[event] = handler;
			return this;
		}
		run() {
			this.handlers.done?.();
		}
		abort() {}
	},
}));

import DeviceFinder, {
	isOnHeadsetSubnet,
	isValidIpv4Literal,
	PORT_SCAN_INTERVAL_MS,
	pickServerLocalIp,
} from "./DeviceFinder.ts";

describe("isValidIpv4Literal", () => {
	it("accepts four-octet literals", () => {
		expect(isValidIpv4Literal("192.168.68.101")).toBe(true);
		expect(isValidIpv4Literal("0.0.0.0")).toBe(true);
	});

	it("rejects anything that could smuggle a shell command or isn't dotted-quad", () => {
		expect(isValidIpv4Literal("192.168.68.1; rm -rf /")).toBe(false);
		expect(isValidIpv4Literal("$(reboot)")).toBe(false);
		expect(isValidIpv4Literal("1.2.3")).toBe(false);
		expect(isValidIpv4Literal("localhost")).toBe(false);
	});
});

describe("isOnHeadsetSubnet", () => {
	it("gates auto-scan to the 192.168.68 subnet", () => {
		expect(isOnHeadsetSubnet("192.168.68.5")).toBe(true);
		expect(isOnHeadsetSubnet("192.168.1.5")).toBe(false);
		expect(isOnHeadsetSubnet("")).toBe(false);
	});
});

describe("pickServerLocalIp", () => {
	it("returns the first non-loopback IPv4, skipping lo/tailscale and IPv6", () => {
		const ip = pickServerLocalIp({
			lo: [{ family: "IPv4", address: "127.0.0.1" }] as never,
			tailscale0: [{ family: "IPv4", address: "100.64.0.1" }] as never,
			eth0: [
				{ family: "IPv6", address: "fe80::1" },
				{ family: "IPv4", address: "192.168.68.20" },
			] as never,
		});
		expect(ip).toBe("192.168.68.20");
	});

	it("returns empty string when no suitable interface exists", () => {
		expect(pickServerLocalIp({ lo: [{ family: "IPv4", address: "127.0.0.1" }] as never })).toBe("");
	});
});

describe("DeviceFinder.removeConnectedIp", () => {
	it("drops IPs already present in the streaming list (matched by serial prefix)", () => {
		// Constructor calls removeConnectedIp against the (data-only) adbManager.
		const adbManager = {
			clientCurrentlyStreaming: [{ serial: "192.168.68.10:5555" }],
		} as unknown as ConstructorParameters<typeof DeviceFinder>[0];

		const finder = new DeviceFinder(adbManager);
		finder.ipToConnect = ["192.168.68.10", "192.168.68.11"];
		// @ts-expect-error private method, exercised directly for the pure filter
		finder.removeConnectedIp();

		expect(finder.ipToConnect).toEqual(["192.168.68.11"]);
	});
});

// A headset that answers ping but has wireless adb off used to be port-scanned on every 5 s retry:
// 20,000 ports, 500 connections at a time, on the WiFi the other headsets play on.
describe("DeviceFinder port scan rate", () => {
	function finderWithReachableDevice() {
		const adbManager = {
			clientCurrentlyStreaming: [],
			connectNewDevice: vi.fn(async () => false),
		} as unknown as ConstructorParameters<typeof DeviceFinder>[0];
		const finder = new DeviceFinder(adbManager);
		vi.spyOn(finder as unknown as { isDeviceReachable(ip: string): Promise<boolean> }, "isDeviceReachable") //
			.mockResolvedValue(true);
		return finder;
	}

	beforeEach(() => {
		scans.length = 0;
	});

	it("port-scans a reachable headset at most once per interval", async () => {
		vi.useFakeTimers();
		try {
			const finder = finderWithReachableDevice();
			for (let retry = 0; retry < 5; retry++) await finder.scanAndConnectIP("192.168.68.30");
			expect(scans).toEqual(["192.168.68.30"]);

			vi.advanceTimersByTime(PORT_SCAN_INTERVAL_MS);
			await finder.scanAndConnectIP("192.168.68.30");
			expect(scans).toEqual(["192.168.68.30", "192.168.68.30"]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("rate-limits each headset on its own", async () => {
		const finder = finderWithReachableDevice();
		await finder.scanAndConnectIP("192.168.68.30");
		await finder.scanAndConnectIP("192.168.68.31");
		expect(scans).toEqual(["192.168.68.30", "192.168.68.31"]);
	});
});

describe("isValidIpv4Literal — adversarial (injection guard, not a range validator)", () => {
	it("rejects anything with shell metacharacters or wrong shape", () => {
		for (const bad of ["1.2.3.4 ", "1.2.3.4;x", "1.2.3.4|nc", "1.2.3.4\n", "1.2.3.4.5", "1.2.3.", "1.2.3", "١.٢.٣.٤"]) {
			expect(isValidIpv4Literal(bad)).toBe(false);
		}
	});

	it("accepts any dotted-quad shape — its contract is injection prevention, not range validation", () => {
		// Range checking (0–255) belongs to _extractIPv4; this guard's sole job is to
		// ensure `ping` receives a bare dotted-quad with no shell metacharacters.
		expect(isValidIpv4Literal("999.999.999.999")).toBe(true);
		expect(isValidIpv4Literal("256.0.0.1")).toBe(true);
	});
});
