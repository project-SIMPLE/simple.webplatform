import type { Adb } from "@yume-chan/adb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HeadsetSetup } from "../../src/api/android/adb/HeadsetSetup.ts";
import {
	ON_DEVICE_ADB_GLOBAL_SETTINGS,
	ON_DEVICE_ADB_SECURE_SETTINGS,
	ON_DEVICE_ADB_SYSTEM_SETTINGS,
} from "../../src/api/core/Constants.ts";
import { type AdbConnection, connectFirstDevice } from "../setup/adb-connect.ts";
import { isAdbDeviceReady } from "../setup/adb-probe.ts";

// Exercises the generic Android provisioning HeadsetSetup applies to a headset,
// against a real device/emulator. The Quest-specific steps (OVR prefs, the
// Oculus APK installs) have no emulator equivalent and are out of scope — see
// the setupHeadset gate unit test in HeadsetSetup.test.ts.
const reachable = isAdbDeviceReady();
if (!reachable) {
	console.warn("[adb] No adb device/emulator attached — skipping HeadsetSetup integration tests.");
}

// The provisioning methods are private on the class; call them directly here to
// verify their real on-device effect without driving the Quest-gated setupHeadset.
type Provisioning = {
	applyGlobalSettings(adb: Adb, serial: string): Promise<void>;
	applySystemSettings(adb: Adb, serial: string): Promise<void>;
	applySecureSettings(adb: Adb, serial: string): Promise<void>;
};

describe.skipIf(!reachable)("HeadsetSetup provisioning (real device/emulator)", () => {
	let conn: AdbConnection;
	let setup: Provisioning;

	async function settingsGet(namespace: string, key: string): Promise<string> {
		const out = await conn.adb.subprocess.noneProtocol.spawnWaitText(["settings", "get", namespace, key]);
		return out.trim();
	}

	beforeAll(async () => {
		conn = await connectFirstDevice();
		setup = new HeadsetSetup(conn.server) as unknown as Provisioning;
	});

	afterAll(async () => {
		try {
			await conn?.adb?.close();
		} catch {
			/* ignore */
		}
	});

	it("applySystemSettings writes the configured system settings", async () => {
		await setup.applySystemSettings(conn.adb, conn.device.serial);
		for (const [key, value] of Object.entries(ON_DEVICE_ADB_SYSTEM_SETTINGS)) {
			expect(await settingsGet("system", key)).toBe(String(value));
		}
	});

	it("applySecureSettings writes the configured secure settings", async () => {
		await setup.applySecureSettings(conn.adb, conn.device.serial);
		for (const [key, value] of Object.entries(ON_DEVICE_ADB_SECURE_SETTINGS)) {
			expect(await settingsGet("secure", key)).toBe(String(value));
		}
	});

	it("applyGlobalSettings writes representative global settings", async () => {
		await setup.applyGlobalSettings(conn.adb, conn.device.serial);
		// Verify a couple of deterministic, emulator-supported keys from the table.
		expect(await settingsGet("global", "captive_portal_mode")).toBe(
			String(ON_DEVICE_ADB_GLOBAL_SETTINGS.captive_portal_mode),
		);
		expect(await settingsGet("global", "wifi_sleep_policy")).toBe(
			String(ON_DEVICE_ADB_GLOBAL_SETTINGS.wifi_sleep_policy),
		);
	}, 60_000);
});
