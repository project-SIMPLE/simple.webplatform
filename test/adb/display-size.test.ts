import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetDisplaySizeOverride } from "../../src/api/android/scrcpy/display.ts";
import { type AdbConnection, connectFirstDevice } from "../setup/adb-connect.ts";
import { isAdbDeviceReady } from "../setup/adb-probe.ts";

// The display size override that broke the Quest 3 video stream (issue #192),
// applied and removed on a real device/emulator: `wm size` works on both.
const reachable = isAdbDeviceReady();
if (!reachable) {
	console.warn("[adb] No adb device/emulator attached — skipping display size tests.");
}

describe.skipIf(!reachable)("resetDisplaySizeOverride (real device/emulator)", () => {
	let conn: AdbConnection;

	const wmSize = async (args = "") =>
		(await conn.adb.subprocess.noneProtocol.spawn(`wm size ${args}`.trim()).wait().toString()).trim();

	beforeAll(async () => {
		conn = await connectFirstDevice();
	});

	afterAll(async () => {
		try {
			// Never leave the device with the override set by this test
			await wmSize("reset");
			await conn?.adb?.close();
		} catch {
			/* ignore */
		}
	});

	it("removes a display size override", async () => {
		const physical = (await wmSize()).match(/Physical size:\s*(\d+)x(\d+)/);
		expect(physical, "wm size must report a physical size").not.toBeNull();

		// Same 3x-wide override as the headset of the issue
		const [, width, height] = physical as RegExpMatchArray;
		await wmSize(`${Number(width) * 3}x${height}`);
		expect(await wmSize()).toContain("Override size:");

		await resetDisplaySizeOverride(conn.adb, conn.device.serial);

		expect(await wmSize()).not.toContain("Override size:");
	}, 30_000);
});
