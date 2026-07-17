import { describe, expect, it } from "vitest";
import { _extractIPv4 } from "./index.ts";

describe("_extractIPv4", () => {
	it("extracts a bare IPv4 address", () => {
		expect(_extractIPv4("192.168.68.101")).toBe("192.168.68.101");
	});

	it("pulls the address out of surrounding noise (stray quotes, whitespace)", () => {
		expect(_extractIPv4('"192.168.0.5"')).toBe("192.168.0.5");
		expect(_extractIPv4("  10.0.0.1  ")).toBe("10.0.0.1");
	});

	it("returns null when no IPv4 is present", () => {
		expect(_extractIPv4("not-an-ip")).toBeNull();
		expect(_extractIPv4("")).toBeNull();
	});

	it("rejects addresses with an out-of-range octet", () => {
		expect(_extractIPv4("300.1.1.1")).toBeNull();
		expect(_extractIPv4("1.2.3.999")).toBeNull();
	});
});
