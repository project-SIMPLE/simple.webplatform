import { describe, expect, it } from "vitest";
import { asBool, parseHeadsetsIp } from "./index.ts";

describe("asBool", () => {
	it("is true for the accepted truthy tokens (case-insensitive)", () => {
		for (const v of ["true", "TRUE", "1", "yes", "Yes"]) {
			expect(asBool(v)).toBe(true);
		}
	});

	it("is false for anything else, including undefined", () => {
		for (const v of ["false", "0", "no", "", "maybe"]) {
			expect(asBool(v)).toBe(false);
		}
		expect(asBool(undefined)).toBe(false);
	});
});

describe("parseHeadsetsIp", () => {
	it("returns [] for empty/undefined input", () => {
		expect(parseHeadsetsIp(undefined).ips).toEqual([]);
		expect(parseHeadsetsIp("").ips).toEqual([]);
	});

	it("splits on ';' and keeps valid IPs", () => {
		const { ips, warnings } = parseHeadsetsIp("192.168.68.101;192.168.68.102");
		expect(ips).toEqual(["192.168.68.101", "192.168.68.102"]);
		expect(warnings).toEqual([]);
	});

	it("sanitizes stray characters and warns about the fix", () => {
		const { ips, warnings } = parseHeadsetsIp('192.168.0.5"');
		expect(ips).toEqual(["192.168.0.5"]);
		expect(warnings.join(" ")).toMatch(/Sanitized/);
	});

	it("drops unparseable tokens with a warning", () => {
		const { ips, warnings } = parseHeadsetsIp("192.168.0.5;not-an-ip");
		expect(ips).toEqual(["192.168.0.5"]);
		expect(warnings.join(" ")).toMatch(/Could not extract/);
	});
});

describe("env helpers — adversarial inputs", () => {
	it("strips a shell-injection suffix down to the bare IP", () => {
		const { ips } = parseHeadsetsIp("1.2.3.4; rm -rf /");
		expect(ips).toEqual(["1.2.3.4"]); // injection payload discarded
	});

	it("drops out-of-range octets and non-ASCII digits", () => {
		expect(parseHeadsetsIp("999.999.999.999").ips).toEqual([]);
		expect(parseHeadsetsIp("１２７.0.0.1").ips).toEqual([]); // full-width digits
	});

	it("extracts an IP embedded in surrounding noise", () => {
		expect(parseHeadsetsIp("headset at 192.168.1.5 now").ips).toEqual(["192.168.1.5"]);
	});

	it("asBool is whitespace- and format-sensitive (documents current behavior)", () => {
		expect(asBool(" true")).toBe(false); // not trimmed
		expect(asBool("TRUE ")).toBe(false);
		expect(asBool("1.0")).toBe(false);
		expect(asBool("👍")).toBe(false);
	});
});
