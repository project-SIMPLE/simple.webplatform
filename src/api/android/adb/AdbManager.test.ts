import { describe, expect, it, vi } from "vitest";
import { AdbManager } from "./AdbManager.ts";

// isDeviceReady is a small classifier with one side effect (disconnecting a stale
// "offline" entry). The emulator suite (test/adb/adb-integration.test.ts) checks
// the real "device"/mDNS cases; these cover the remaining branches offline.
type Device = Parameters<AdbManager["isDeviceReady"]>[0];

function device(serial: string, state: string): Device {
	return { serial, state } as unknown as Device;
}

function bareManager() {
	const manager = Object.create(AdbManager.prototype) as AdbManager;
	const disconnectDevice = vi.fn().mockResolvedValue(undefined);
	(manager as unknown as { disconnectDevice: typeof disconnectDevice }).disconnectDevice = disconnectDevice;
	return { manager, disconnectDevice };
}

describe("AdbManager.isDeviceReady", () => {
	it("accepts a device in the 'device' state", () => {
		const { manager } = bareManager();
		expect(manager.isDeviceReady(device("emulator-5554", "device"))).toBe(true);
	});

	it("rejects the phantom mDNS TLS-connect serial even when 'device'", () => {
		const { manager } = bareManager();
		expect(manager.isDeviceReady(device("192.168.1.5:5555._adb-tls-connect._tcp", "device"))).toBe(false);
	});

	it("rejects an offline device and disconnects the stale entry", () => {
		const { manager, disconnectDevice } = bareManager();
		expect(manager.isDeviceReady(device("192.168.1.5:5555", "offline"))).toBe(false);
		expect(disconnectDevice).toHaveBeenCalledWith("192.168.1.5:5555");
	});

	it("rejects an unauthorized device without disconnecting", () => {
		const { manager, disconnectDevice } = bareManager();
		expect(manager.isDeviceReady(device("emulator-5554", "unauthorized"))).toBe(false);
		expect(disconnectDevice).not.toHaveBeenCalled();
	});

	it("rejects a device in an unknown state", () => {
		const { manager } = bareManager();
		expect(manager.isDeviceReady(device("emulator-5554", "bootloader"))).toBe(false);
	});
});
