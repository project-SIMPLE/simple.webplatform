import { describe, expect, it } from "vitest";
import { _extractIPv4, asBool, computeIsPlatformPackaged, LOG_ROTATION, parseHeadsetsIp } from "./index.ts";

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

// Regression: issue #118 — "On windows, isPackaged is incorrectly set to true
// when the application is not packaged". The old check was
// `!process.argv[0].endsWith("node")`; on Windows argv[0] ends with `node.exe`,
// so it read as packaged and the app ignored the real .env, using placeholder
// defaults. The fix inspects the basename with `.includes("node")`.
describe("computeIsPlatformPackaged (issue #118)", () => {
	const base = { pkg: undefined, pkgExecPath: undefined, isSea: false, argv1: undefined };

	it("is NOT packaged on Windows when launched via node.exe", () => {
		// The exact #118 regression: argv[0] = node.exe.
		expect(computeIsPlatformPackaged({ ...base, argv0: "C:\\Program Files\\nodejs\\node.exe" })).toBe(false);
		expect(computeIsPlatformPackaged({ ...base, argv0: "node.exe" })).toBe(false);
	});

	it("is NOT packaged on Unix when launched via the node runner", () => {
		expect(computeIsPlatformPackaged({ ...base, argv0: "/usr/bin/node" })).toBe(false);
		expect(computeIsPlatformPackaged({ ...base, argv0: "node" })).toBe(false);
	});

	it("is packaged when process.pkg or PKG_EXECPATH is set", () => {
		expect(computeIsPlatformPackaged({ ...base, argv0: "/usr/bin/node", pkg: true })).toBe(true);
		expect(computeIsPlatformPackaged({ ...base, argv0: "node.exe", pkgExecPath: "/snapshot/app" })).toBe(true);
	});

	it("is packaged when running as a Node SEA binary", () => {
		expect(computeIsPlatformPackaged({ ...base, argv0: "node", isSea: true })).toBe(true);
	});

	it("is packaged when the runner is a renamed binary (not node)", () => {
		expect(computeIsPlatformPackaged({ ...base, argv0: "/opt/simple/webplatform" })).toBe(true);
		expect(computeIsPlatformPackaged({ ...base, argv0: "C:\\simple\\webplatform.exe" })).toBe(true);
	});

	it("is NOT packaged for a pkg snapshot launched under a node runner", () => {
		// argv0 is node-like but the entry file lives in /snapshot — the trailing
		// clause keeps this from being misclassified via the runner heuristic.
		expect(computeIsPlatformPackaged({ ...base, argv0: "node", argv1: "/snapshot/app/index.js" })).toBe(false);
	});
});

// Related to issue #25 ("Dotenv file isn't read anymore"): the values dotenv puts
// in process.env are strings, so the runtime options derived from them must be
// coerced correctly. These pin the two pure coercers that turn raw .env strings
// into the booleans and IP lists the platform runs on.
describe("asBool", () => {
	it("is true for the accepted truthy tokens, case-insensitively", () => {
		for (const v of ["true", "TRUE", "True", "1", "yes", "YES"]) {
			expect(asBool(v)).toBe(true);
		}
	});

	it("is false for falsy tokens, empty and undefined", () => {
		for (const v of ["false", "0", "no", "off", "", "anything"]) {
			expect(asBool(v)).toBe(false);
		}
		expect(asBool(undefined)).toBe(false);
	});
});

describe("parseHeadsetsIp", () => {
	it("parses a ';'-separated list into clean IPv4s", () => {
		const { ips, warnings } = parseHeadsetsIp("192.168.0.10;192.168.0.11");
		expect(ips).toEqual(["192.168.0.10", "192.168.0.11"]);
		expect(warnings).toEqual([]);
	});

	it("returns no IPs (and no warnings) for undefined or an empty string", () => {
		expect(parseHeadsetsIp(undefined)).toEqual({ ips: [], warnings: [] });
		expect(parseHeadsetsIp("")).toEqual({ ips: [], warnings: [] });
	});

	it("sanitizes tokens with stray characters and warns about the fix", () => {
		const { ips, warnings } = parseHeadsetsIp('"192.168.0.10"');
		expect(ips).toEqual(["192.168.0.10"]);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("Sanitized");
	});

	it("drops a token with no extractable IP and warns", () => {
		const { ips, warnings } = parseHeadsetsIp("192.168.0.10;not-an-ip");
		expect(ips).toEqual(["192.168.0.10"]);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("Could not extract");
	});

	it("skips blank tokens between separators without warning", () => {
		const { ips, warnings } = parseHeadsetsIp("192.168.0.10;;192.168.0.11;");
		expect(ips).toEqual(["192.168.0.10", "192.168.0.11"]);
		expect(warnings).toEqual([]);
	});
});

// Regression: issue #66 ("errorLog.log file can enlarge forever"). The rotating
// file sink must be configured with a bounded size and file count so the log
// can never grow without limit.
describe("LOG_ROTATION (issue #66)", () => {
	it("bounds errorLog.log with a finite, positive size and file count", () => {
		expect(LOG_ROTATION.maxSize).toBeGreaterThan(0);
		expect(Number.isFinite(LOG_ROTATION.maxSize)).toBe(true);
		expect(LOG_ROTATION.maxFiles).toBeGreaterThan(0);
		expect(Number.isFinite(LOG_ROTATION.maxFiles)).toBe(true);
	});

	it("keeps the total capped footprint well under 1 GiB", () => {
		expect(LOG_ROTATION.maxSize * LOG_ROTATION.maxFiles).toBeLessThan(0x400 * 0x400 * 1024);
	});
});
