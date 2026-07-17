import { describe, expect, it } from "vitest";
import DeviceFinder, { isOnHeadsetSubnet, isValidIpv4Literal, pickServerLocalIp } from "./DeviceFinder.ts";

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
