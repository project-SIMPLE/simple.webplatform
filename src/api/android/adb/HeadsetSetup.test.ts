import { describe, expect, it } from "vitest";
import { compareVersions, parseApkVersion } from "./HeadsetSetup.ts";

describe("parseApkVersion", () => {
	it("extracts a dotted version from an APK filename", () => {
		expect(parseApkVersion("MyApp-1.2.3.apk")).toBe("1.2.3");
		expect(parseApkVersion("some.long-name-10.0.apk")).toBe("10.0");
	});

	it("returns null when there is no version suffix", () => {
		expect(parseApkVersion("MyApp.apk")).toBeNull();
		expect(parseApkVersion("MyApp-beta.apk")).toBeNull();
	});
});

describe("compareVersions", () => {
	it("orders by numeric segments", () => {
		expect(compareVersions("1.0.0", "1.0.1")).toBeLessThan(0);
		expect(compareVersions("2.0", "1.9.9")).toBeGreaterThan(0);
	});

	it("treats missing trailing segments as zero", () => {
		expect(compareVersions("1.2", "1.2.0")).toBe(0);
		expect(compareVersions("1.2.0.0", "1.2")).toBe(0);
	});

	it("returns 0 for equal versions", () => {
		expect(compareVersions("3.4.5", "3.4.5")).toBe(0);
	});
});
