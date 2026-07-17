import { readFile } from "node:fs/promises";
import { AdbScrcpyClient, AdbScrcpyOptions3_3_3 } from "@yume-chan/adb-scrcpy";
import { DefaultServerPath, type ScrcpyMediaStreamPacket } from "@yume-chan/scrcpy";
import { ReadableStream } from "@yume-chan/stream-extra";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveToolkitAsset } from "../../src/api/infra/ToolkitAssets.ts";
import { type AdbConnection, connectFirstDevice } from "../setup/adb-connect.ts";
import { isAdbDeviceReady } from "../setup/adb-probe.ts";

// Streams the device screen with scrcpy the way the platform does: it pushes the
// SAME toolkit scrcpy server binary (via resolveToolkitAsset) and starts it with
// the SAME @yume-chan client/options as ScrcpyServer.runSession, then asserts a
// real video frame arrives from the emulator. The Wi-Fi IP-serial gate and the
// uWS fan-out in startStreaming are platform plumbing, not scrcpy, and are out of
// scope here (runSession blocks on client.exited, so it isn't directly awaitable).
const reachable = isAdbDeviceReady();
if (!reachable) {
	console.warn("[adb] No adb device/emulator attached — skipping scrcpy streaming tests.");
}

describe.skipIf(!reachable)("scrcpy streaming (real device/emulator)", () => {
	let conn: AdbConnection;

	beforeAll(async () => {
		conn = await connectFirstDevice();
	});

	afterAll(async () => {
		try {
			await conn?.adb?.close();
		} catch {
			/* ignore */
		}
	});

	it("loads the bundled scrcpy server and streams a video frame", async () => {
		// 1. The platform's toolkit resolution + the exact server binary it ships.
		const serverBytes = new Uint8Array(await readFile(resolveToolkitAsset("scrcpyServer-v3.3.4-rom1v")));
		expect(serverBytes.byteLength).toBeGreaterThan(0);

		// 2. Push the server to the device (mirrors runSession's sync.write).
		const sync = await conn.adb.sync();
		try {
			await sync.write({
				filename: DefaultServerPath,
				file: new ReadableStream({
					start: (controller) => {
						controller.enqueue(serverBytes);
						controller.close();
					},
				}),
			});
		} finally {
			await sync.dispose();
		}

		// 3. Start scrcpy (h264 — universally supported by the emulator encoder).
		const options = new AdbScrcpyOptions3_3_3(
			{
				videoCodec: "h264",
				video: true,
				audio: false,
				control: false,
				maxSize: 800,
				maxFps: 15,
				videoBitRate: 2_000_000,
				stayAwake: true,
			},
			{ version: "3.3.4" },
		);

		const client = await AdbScrcpyClient.start(conn.adb, DefaultServerPath, options);
		try {
			const { metadata, stream } = await client.videoStream;

			// 4. Real display metadata from the device.
			expect(metadata.width ?? 0).toBeGreaterThan(0);
			expect(metadata.height ?? 0).toBeGreaterThan(0);

			// 5. A real encoded frame flows (config header or a data packet).
			const reader = stream.getReader();
			try {
				const { value, done } = await reader.read();
				expect(done).toBe(false);
				const packet = value as ScrcpyMediaStreamPacket;
				expect(["configuration", "data"]).toContain(packet.type);
				expect(packet.data.byteLength).toBeGreaterThan(0);
			} finally {
				await reader.cancel().catch(() => {});
			}
		} finally {
			await client.close().catch(() => {});
			await client.exited.catch(() => {});
		}
	}, 60_000);
});
