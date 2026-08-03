import type { Adb } from "@yume-chan/adb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	getInstalledVersion,
	HeadsetSetup,
	isPackageInstalled,
	parseApkVersion,
} from "../../src/api/android/adb/HeadsetSetup.ts";
import { resolveToolkitAsset } from "../../src/api/infra/ToolkitAssets.ts";
import { type AdbConnection, connectFirstDevice } from "../setup/adb-connect.ts";
import { isAdbDeviceReady } from "../setup/adb-probe.ts";

// Uses the committed dummy APK (the no-loft loft-blocker): a small, arch-independent
// app with a fixed versionName of 999.9.9.9.99, so the install → version → uninstall
// cycle is deterministic. Gated on a real device/emulator only.
const APK_FILE = "eu.project_simple.no-loft.apk";
const APK = resolveToolkitAsset(APK_FILE);
const APK_PACKAGE = "com.meta.shell.env.footprint.haven2025";
const APK_VERSION = "999.9.9.9.99";

const reachable = isAdbDeviceReady();
if (!reachable) {
	console.warn("[adb] No adb device/emulator attached — skipping package-lifecycle test.");
}

// installApk/uninstallPackage are private; reached via a typed cast.
type Provisioning = {
	installApk(adb: Adb, serial: string, apkPath: string): Promise<boolean>;
	uninstallPackage(adb: Adb, serial: string, packageName: string): Promise<void>;
};

describe.skipIf(!reachable)("HeadsetSetup package lifecycle (real device/emulator)", () => {
	let conn: AdbConnection;
	let hs: Provisioning;

	beforeAll(async () => {
		conn = await connectFirstDevice();
		hs = new HeadsetSetup(conn.server) as unknown as Provisioning;
		// Clean slate.
		if (await isPackageInstalled(conn.adb, APK_PACKAGE)) {
			await hs.uninstallPackage(conn.adb, conn.device.serial, APK_PACKAGE);
		}
	});

	afterAll(async () => {
		try {
			await hs.uninstallPackage(conn.adb, conn.device.serial, APK_PACKAGE);
		} catch {
			/* ignore */
		}
		try {
			await conn?.adb?.close();
		} catch {
			/* ignore */
		}
	});

	it("installs the dummy APK", async () => {
		expect(await hs.installApk(conn.adb, conn.device.serial, APK)).toBe(true);
		expect(await isPackageInstalled(conn.adb, APK_PACKAGE)).toBe(true);
	});

	it("reports version 999.9.9.9.99 on-device, matching the APK manifest", async () => {
		const onDevice = await getInstalledVersion(conn.adb, APK_PACKAGE);
		expect(onDevice).toBe(APK_VERSION);
		// The manifest-read version (used by HeadsetSetup's update check) matches the device.
		expect(await parseApkVersion(APK_FILE)).toBe(onDevice);
	});

	it("uninstalls the dummy APK", async () => {
		await hs.uninstallPackage(conn.adb, conn.device.serial, APK_PACKAGE);
		expect(await isPackageInstalled(conn.adb, APK_PACKAGE)).toBe(false);
	});
});
