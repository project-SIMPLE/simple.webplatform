import { describe, expect, it } from "vitest";
import { _extractIPv4, computeIsPlatformPackaged } from "./index.ts";

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
