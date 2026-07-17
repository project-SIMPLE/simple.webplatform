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
// the SAME @yume-chan client/options as ScrcpyServer.runSession, then asserts real
// video frames arrive from the emulator. The Wi-Fi IP-serial gate and the uWS
// fan-out in startStreaming are platform plumbing, not scrcpy, and are out of
// scope here (runSession blocks on client.exited, so it isn't directly awaitable).
const reachable = isAdbDeviceReady();
if (!reachable) {
	console.warn("[adb] No adb device/emulator attached — skipping scrcpy streaming tests.");
}

// Mirrors the video-only subset of ScrcpyServer.runSession's options.
function scrcpyOptions() {
	return new AdbScrcpyOptions3_3_3(
		{
			videoCodec: "h264", // universally supported by the emulator encoder
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
}

describe.skipIf(!reachable)("scrcpy streaming (real device/emulator)", () => {
	let conn: AdbConnection;

	beforeAll(async () => {
		conn = await connectFirstDevice();
		// Push the toolkit scrcpy server once (mirrors runSession's sync.write).
		const serverBytes = new Uint8Array(await readFile(resolveToolkitAsset("scrcpyServer-v3.3.4-rom1v")));
		expect(serverBytes.byteLength).toBeGreaterThan(0);
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
	});

	afterAll(async () => {
		try {
			await conn?.adb?.close();
		} catch {
			/* ignore */
		}
	});

	it("negotiates display metadata and a first frame", async () => {
		const client = await AdbScrcpyClient.start(conn.adb, DefaultServerPath, scrcpyOptions());
		try {
			const { metadata, stream } = await client.videoStream;
			expect(metadata.width ?? 0).toBeGreaterThan(0);
			expect(metadata.height ?? 0).toBeGreaterThan(0);

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

	it("delivers a configuration header, a keyframe, and multiple data packets", async () => {
		const client = await AdbScrcpyClient.start(conn.adb, DefaultServerPath, scrcpyOptions());
		const types: string[] = [];
		let dataPackets = 0;
		let sawKeyframe = false;
		try {
			const { stream } = await client.videoStream;
			const reader = stream.getReader();
			try {
				for (let i = 0; i < 40 && dataPackets < 3; i++) {
					const { value, done } = await reader.read();
					if (done) break;
					const packet = value as ScrcpyMediaStreamPacket;
					types.push(packet.type);
					if (packet.type === "data") {
						dataPackets++;
						if (packet.keyframe) sawKeyframe = true;
					}
				}
			} finally {
				await reader.cancel().catch(() => {});
			}
		} finally {
			await client.close().catch(() => {});
			await client.exited.catch(() => {});
		}

		expect(types).toContain("configuration");
		expect(dataPackets).toBeGreaterThanOrEqual(1);
		expect(sawKeyframe).toBe(true);
	}, 60_000);
});
