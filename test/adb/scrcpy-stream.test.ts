import type { Adb } from "@yume-chan/adb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AdbManager } from "../../src/api/android/adb/AdbManager.ts";
import { ScrcpyServer } from "../../src/api/android/scrcpy/ScrcpyServer.ts";
import { type AdbConnection, connectFirstDevice } from "../setup/adb-connect.ts";
import { isAdbDeviceReady } from "../setup/adb-probe.ts";
import { freePort } from "../setup/free-port.ts";
import { openClient } from "../setup/ws-client.ts";

// Drives the REAL platform streaming path: ScrcpyServer.runSession pushes the
// toolkit scrcpy server, starts it, registers the stream and fans video frames
// out over its uWS control (`/`) and per-device data (`/stream/:ip`) sockets. We
// connect real ws clients and assert the real announcements + encoded frames.
//
// runSession is private and takes an explicit streamIp (the Wi-Fi IP-serial gate
// lives in startStreaming, not here), so we call it via a typed cast with a
// synthetic "127.0.0.1" key — the same value a real headset serial would yield.
const reachable = isAdbDeviceReady();
if (!reachable) {
	console.warn("[adb] No adb device/emulator attached — skipping scrcpy streaming tests.");
}

const STREAM_IP = "127.0.0.1";

// The private members runSession-driven tests need to reach on the real instance.
type ScrcpySession = { close(): Promise<void>; exited: Promise<unknown> };
type ScrcpyInternals = {
	useH265: boolean;
	runSession(adb: Adb, streamIp: string, deviceModel: string, flipWidth: boolean): Promise<boolean>;
	scrcpyClientsByIp: Map<string, ScrcpySession>;
};

describe.skipIf(!reachable)("ScrcpyServer streaming (real device/emulator)", () => {
	let conn: AdbConnection;
	let server: ScrcpyServer;
	let internals: ScrcpyInternals;
	let port: number;
	let sessionPromise: Promise<boolean> | undefined;

	beforeAll(async () => {
		conn = await connectFirstDevice();
		port = await freePort();
		process.env.VIDEO_WS_PORT = String(port);
		process.env.WEB_APPLICATION_HOST = "127.0.0.1";

		// Real ScrcpyServer. The AdbManager is only touched on error/reconnect paths.
		server = new ScrcpyServer({ disconnectDevice: async () => {} } as unknown as AdbManager);
		internals = server as unknown as ScrcpyInternals;
		// Force h264 (universally supported by the emulator encoder); the platform
		// starts optimistic h265 and downgrades on client capability — same field.
		internals.useH265 = false;
	});

	afterAll(async () => {
		// Gracefully end the live session so runSession unblocks, then release adb.
		try {
			const client = internals?.scrcpyClientsByIp.get(STREAM_IP);
			await client?.close().catch(() => {});
			await client?.exited.catch(() => {});
			await sessionPromise?.catch(() => {});
		} catch {
			/* ignore */
		}
		try {
			await conn?.adb?.close();
		} catch {
			/* ignore */
		}
	});

	it("announces the stream and fans real video frames to a data-socket client", async () => {
		// 1. A control client connects before the session starts.
		const control = openClient(`ws://127.0.0.1:${port}`);
		await control.waitOpen();

		// 2. Fire the real supervisor session (blocks on client.exited; don't await).
		sessionPromise = internals.runSession(conn.adb, STREAM_IP, "emulator", false);

		// 3. The control socket is told the stream is available.
		const available = await control.waitFor((m) => m.type === "stream_available" && m.streamId === STREAM_IP, 25_000);
		expect(available.streamId).toBe(STREAM_IP);

		// 4. Open the per-device data socket and expect a real config header + frame.
		const data = openClient(`ws://127.0.0.1:${port}/stream/${STREAM_IP}`);
		await data.waitOpen();

		const config = await data.waitFor((m) => m.type === "configuration", 25_000);
		expect(config.streamId).toBe(STREAM_IP);
		expect(typeof config.data).toBe("string");

		const frame = await data.waitFor((m) => m.type === "data", 25_000);
		expect(frame.streamId).toBe(STREAM_IP);
		expect(typeof frame.data).toBe("string"); // base64 payload
		expect((frame.data as string).length).toBeGreaterThan(0);

		await data.close();
		await control.close();
	}, 40_000);
});
