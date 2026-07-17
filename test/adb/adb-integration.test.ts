import { Adb, AdbServerClient } from "@yume-chan/adb";
import { AdbServerNodeTcpConnector } from "@yume-chan/adb-server-node-tcp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AdbManager } from "../../src/api/android/adb/AdbManager.ts";
import { getInstalledVersion, isPackageInstalled } from "../../src/api/android/adb/HeadsetSetup.ts";
import { firstReadyDevice, isAdbDeviceReady } from "../setup/adb-probe.ts";

// Requires a real adb device/emulator on localhost:5037 (CI provides one via the
// Android emulator runner). When none is attached the whole suite is skipped, so
// the offline lanes are unaffected. Covers the generic adb-server + shell paths;
// Quest/Oculus-specific provisioning is intentionally out of scope.
const reachable = isAdbDeviceReady();
const serial = firstReadyDevice();
if (!reachable) {
	console.warn("[adb] No adb device/emulator attached — skipping ADB integration tests.");
}

type Device = Awaited<ReturnType<AdbServerClient["getDevices"]>>[number];

describe.skipIf(!reachable)("ADB integration (real device/emulator)", () => {
	let server: AdbServerClient;
	let device: Device;
	let adb: Adb;

	async function findTargetDevice(): Promise<Device> {
		const devices = await server.getDevices(["device", "unauthorized", "offline"]);
		const dev = devices.find((d) => d.serial === serial);
		if (!dev) throw new Error(`Device ${serial} not found on the adb server`);
		return dev;
	}

	beforeAll(async () => {
		server = new AdbServerClient(new AdbServerNodeTcpConnector({ host: "localhost", port: 5037 }));
		device = await findTargetDevice();
		const transport = await server.createTransport(device);
		adb = new Adb(transport);
	});

	afterAll(async () => {
		try {
			await adb?.close();
		} catch {
			/* ignore */
		}
	});

	it("lists the device on the adb server in the ready state", () => {
		expect(device).toBeDefined();
		expect(device.state).toBe("device");
	});

	it("AdbManager.isDeviceReady accepts a real device and rejects the fake mDNS serial", () => {
		// Build a bare AdbManager off the prototype so no scrcpy/uWS servers start.
		const manager = Object.create(AdbManager.prototype) as AdbManager;

		expect(manager.isDeviceReady(device)).toBe(true);

		// The Unity/TCP stack exposes phantom "*._adb-tls-connect._tcp" entries that
		// must be ignored (see commit 49d55d6).
		const fake = { ...device, serial: `${device.serial}._adb-tls-connect._tcp` } as Device;
		expect(manager.isDeviceReady(fake)).toBe(false);
	});

	it("runs a shell command over an Adb transport (createTransport path)", async () => {
		const sdk = await adb.subprocess.noneProtocol.spawnWaitText(["getprop", "ro.build.version.sdk"]);
		expect(Number(sdk.trim())).toBeGreaterThan(0);
	});

	it("detects installed packages via isPackageInstalled", async () => {
		// com.android.settings ships on every Android system image.
		expect(await isPackageInstalled(adb, "com.android.settings")).toBe(true);
		expect(await isPackageInstalled(adb, "com.example.definitely.not.installed")).toBe(false);
	});

	it("reads an installed package version via getInstalledVersion", async () => {
		const version = await getInstalledVersion(adb, "com.android.settings");
		expect(version).toBeTruthy();
		expect(await getInstalledVersion(adb, "com.example.definitely.not.installed")).toBeNull();
	});
});
