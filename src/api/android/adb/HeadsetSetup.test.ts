import type { AdbServerClient } from "@yume-chan/adb";
import { describe, expect, it, vi } from "vitest";
import { compareVersions, HeadsetSetup, parseApkVersion } from "./HeadsetSetup.ts";

type Device = Parameters<HeadsetSetup["setupHeadset"]>[0];

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

describe("HeadsetSetup.setupHeadset device gate", () => {
	function device(model: string): Device {
		return { serial: "emulator-5554", state: "device", transportId: 1n, model } as unknown as Device;
	}

	it("only provisions Quest headsets — non-Quest devices never open a transport", async () => {
		const createTransport = vi.fn();
		const setup = new HeadsetSetup({ createTransport } as unknown as AdbServerClient);

		await setup.setupHeadset(device("sdk_gphone64_x86_64"));
		await setup.setupHeadset(device("Pixel_7"));

		expect(createTransport).not.toHaveBeenCalled();
	});
});
