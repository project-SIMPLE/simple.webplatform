import { existsSync } from "node:fs";
import path from "node:path";
import type { Adb } from "@yume-chan/adb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getInstalledVersion, HeadsetSetup, isPackageInstalled } from "../../src/api/android/adb/HeadsetSetup.ts";
import { type AdbConnection, connectFirstDevice } from "../setup/adb-connect.ts";
import { isAdbDeviceReady } from "../setup/adb-probe.ts";

// A tiny debug APK is required to exercise the install → version → permission →
// uninstall cycle. It is not checked in yet (tracking issue #166), so this
// suite skips until test/fixtures/adb/test-app.apk exists AND declares:
//   package  = APK_PACKAGE
//   uses-permission = APK_PERMISSION (a pm-grantable permission)
const APK = path.resolve(process.cwd(), "test/fixtures/adb/test-app.apk");
const APK_PACKAGE = "com.example.testapp";
const APK_PERMISSION = "android.permission.WRITE_SECURE_SETTINGS";

const hasApk = existsSync(APK);
const ready = isAdbDeviceReady() && hasApk;
if (isAdbDeviceReady() && !hasApk) {
	console.warn(`[adb] ${APK} missing — skipping package-lifecycle test (provide a test APK to enable).`);
}

// installApk/ensurePermission/uninstallPackage are private; reached via a typed cast.
type Provisioning = {
	installApk(adb: Adb, serial: string, apkPath: string): Promise<boolean>;
	ensurePermission(adb: Adb, serial: string, packageName: string, permission: string): Promise<void>;
	uninstallPackage(adb: Adb, serial: string, packageName: string): Promise<void>;
};

describe.skipIf(!ready)("HeadsetSetup package lifecycle (real device/emulator)", () => {
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

	it("installs the APK", async () => {
		expect(await hs.installApk(conn.adb, conn.device.serial, APK)).toBe(true);
		expect(await isPackageInstalled(conn.adb, APK_PACKAGE)).toBe(true);
	});

	it("reads the installed version", async () => {
		expect(await getInstalledVersion(conn.adb, APK_PACKAGE)).toBeTruthy();
	});

	it("grants a declared permission", async () => {
		await hs.ensurePermission(conn.adb, conn.device.serial, APK_PACKAGE, APK_PERMISSION);
		const dump = await conn.adb.subprocess.noneProtocol.spawnWaitText(["dumpsys", "package", APK_PACKAGE]);
		expect(dump).toContain(APK_PERMISSION);
	});

	it("uninstalls the APK", async () => {
		await hs.uninstallPackage(conn.adb, conn.device.serial, APK_PACKAGE);
		expect(await isPackageInstalled(conn.adb, APK_PACKAGE)).toBe(false);
	});
});
