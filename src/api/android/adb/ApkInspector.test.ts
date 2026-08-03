import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readApkVersionName } from "./ApkInspector.ts";

// Reads the real APKs bundled in toolkit/ — no device or external tooling needed.
function apk(name: string): Buffer {
	return readFileSync(path.resolve(process.cwd(), "toolkit", name));
}

describe("readApkVersionName", () => {
	it("reads the fixed version from the dummy no-loft APK", () => {
		expect(readApkVersionName(apk("eu.project_simple.no-loft.apk"))).toBe("999.9.9.9.99");
	});

	it("reads android:versionName from the other toolkit APKs", () => {
		expect(readApkVersionName(apk("eu.project_simple.adbautoenable.apk"))).toBe("1.0.0");
		expect(readApkVersionName(apk("tdg.oculuswirelessadb.apk"))).toBe("1.3");
	});

	it("returns null for a buffer that isn't a valid APK/ZIP (no crash)", () => {
		expect(readApkVersionName(Buffer.from("not a zip archive"))).toBeNull();
		expect(readApkVersionName(Buffer.alloc(0))).toBeNull();
	});
});
