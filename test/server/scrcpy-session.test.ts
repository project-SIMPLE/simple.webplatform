import type { Adb, AdbNoneProtocolProcess } from "@yume-chan/adb";
import { AdbScrcpyClient } from "@yume-chan/adb-scrcpy";
import { type Consumable, ReadableStream, WritableStream } from "@yume-chan/stream-extra";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AdbManager } from "../../src/api/android/adb/AdbManager.ts";
import { ScrcpyServer } from "../../src/api/android/scrcpy/ScrcpyServer.ts";
import { freePort } from "../setup/free-port.ts";
import { openClient } from "../setup/ws-client.ts";

// A version no options class defaults to, so the test proves the announced client
// version really comes from the downloaded server binary's package.
const SERVER_VERSION = "0.0.0-test";
vi.mock("@yume-chan/fetch-scrcpy-server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@yume-chan/fetch-scrcpy-server")>()),
	VERSION: "0.0.0-test",
}));

// Drives the REAL ScrcpyServer.runSession and the REAL @yume-chan/adb-scrcpy client
// (stream parsing, size tracking, control writer) over real uWS sockets. The only
// fake is the device itself: instead of a headset running the scrcpy server, the
// test feeds the bytes that server would send. That reaches what the device suite
// (test/adb/scrcpy-stream.test.ts) cannot: an inverted first frame, a server dying
// before its first packet, and the exact options handed to the library.

type Session = { close(): Promise<void>; exited: Promise<unknown> };
type Internals = {
	useH265: boolean;
	runSession(adb: Adb, streamIp: string, deviceModel: string, flipWidth: boolean): Promise<boolean>;
	scrcpyClientsByIp: Map<string, Session>;
	flipWidthForIp: Map<string, boolean>;
	activeStreams: Set<string>;
};

const CODEC_H264 = 0x68323634;

// ---- scrcpy wire format (>= 4.0): 64-byte device name + u32 codec id, then frames
// with a 12-byte header (flags+pts on 8 bytes, payload size on 4).
function metadata(deviceName: string): Uint8Array {
	const out = new Uint8Array(68);
	out.set(new TextEncoder().encode(deviceName));
	new DataView(out.buffer).setUint32(64, CODEC_H264);
	return out;
}

function sessionPacket(width: number, height: number): Uint8Array {
	const out = new Uint8Array(12);
	out[0] = 0x80;
	const view = new DataView(out.buffer);
	view.setUint32(4, width);
	view.setUint32(8, height);
	return out;
}

function framePacket(payload: Uint8Array, opts: { config?: boolean; keyframe?: boolean; pts?: bigint }): Uint8Array {
	const out = new Uint8Array(12 + payload.length);
	const view = new DataView(out.buffer);
	view.setBigUint64(0, opts.pts ?? 0n);
	if (opts.config) out[0] |= 0x40;
	if (opts.keyframe) out[0] |= 0x20;
	view.setUint32(8, payload.length);
	out.set(payload, 12);
	return out;
}

/** A scrcpy server process the test scripts by hand. */
function fakeDevice() {
	let video!: ReadableStreamDefaultController<Uint8Array>;
	let endProcess!: () => void;
	const exited = new Promise<void>((resolve) => {
		endProcess = resolve;
	});
	const controlMessages: Uint8Array[] = [];
	const kill = vi.fn(async () => endProcess());

	const process: AdbNoneProtocolProcess = {
		stdin: new WritableStream(),
		output: new ReadableStream<Uint8Array>(),
		exited,
		kill,
	};

	return {
		process,
		kill,
		controlMessages,
		/** Send raw bytes on the video socket, as the device would. */
		send: (...chunks: Uint8Array[]) => {
			for (const chunk of chunks) video.enqueue(chunk);
		},
		/** The scrcpy server process ends (device unplugged, server crash…). */
		die: () => endProcess(),
		videoStream: new ReadableStream<Uint8Array>({
			start(controller) {
				video = controller;
			},
		}),
		controlStream: {
			readable: new ReadableStream<Uint8Array>(),
			writable: new WritableStream<Consumable<Uint8Array>>({
				write(chunk) {
					controlMessages.push(chunk.value.slice());
					chunk.consume();
				},
			}),
		},
	};
}

describe("ScrcpyServer.runSession (real session logic, scripted device)", () => {
	let server: ScrcpyServer;
	let internals: Internals;
	let port: number;
	let device: ReturnType<typeof fakeDevice>;
	let startOptions: { version: string; value: Record<string, unknown> } | undefined;
	const pushed: Uint8Array[] = [];

	const adb = {
		serial: "192.168.68.10:5555",
		sync: {
			// Receives the scrcpy server binary pushed to the headset.
			write: async ({ readable }: { readable: ReadableStream<Uint8Array> }) => {
				for await (const chunk of readable) pushed.push(chunk);
			},
		},
	} as unknown as Adb;

	beforeAll(async () => {
		port = await freePort();
		process.env.VIDEO_WS_PORT = String(port);
		process.env.WEB_APPLICATION_HOST = "127.0.0.1";
		server = new ScrcpyServer({ disconnectDevice: async () => {} } as unknown as AdbManager);
		internals = server as unknown as Internals;
		internals.useH265 = false;

		// Boundary: starting the scrcpy server on a headset. Everything after it —
		// the library's own client — is real, built on the scripted device's streams.
		vi.spyOn(AdbScrcpyClient, "start").mockImplementation((async (_adb: Adb, _path: string, options: never) => {
			startOptions = options;
			return new AdbScrcpyClient({
				options,
				process: device.process,
				output: new ReadableStream<string>(),
				videoStream: device.videoStream,
				audioStream: undefined,
				controlStream: device.controlStream,
			});
		}) as never);
	});

	afterEach(() => {
		pushed.length = 0;
		startOptions = undefined;
	});

	afterAll(() => {
		vi.restoreAllMocks();
	});

	it("pushes the scrcpy server and announces the client version of that same binary", async () => {
		device = fakeDevice();
		device.send(metadata("Quest 3"), sessionPacket(1570, 1482));

		const session = internals.runSession(adb, "10.0.0.1", "Quest_3", true);
		await vi.waitFor(() => expect(internals.activeStreams.has("10.0.0.1")).toBe(true));

		// The server refuses a client announcing another version than its own.
		expect(startOptions?.version).toBe(SERVER_VERSION);
		expect(Buffer.concat(pushed).length).toBeGreaterThan(100_000);

		device.die();
		await session;
	});

	it("streams a landscape Quest session: announced, frames fanned out, size packets kept server-side", async () => {
		device = fakeDevice();
		const ip = "10.0.0.2";
		const control = openClient(`ws://127.0.0.1:${port}`);
		await control.waitOpen();

		device.send(metadata("Quest 3"), sessionPacket(1570, 1482));
		const session = internals.runSession(adb, ip, "Quest_3", true);

		const available = await control.waitFor((m) => m.type === "stream_available" && m.streamId === ip);
		expect(available.streamId).toBe(ip);

		const data = openClient(`ws://127.0.0.1:${port}/stream/${ip}`);
		await data.waitOpen();
		// A new viewer asks the device for a fresh config + keyframe (ResetVideo = 17).
		await vi.waitFor(() => expect(device.controlMessages.map((m) => m[0])).toContain(17));

		const config = Uint8Array.from([1, 2, 3, 4]);
		const frame = Uint8Array.from([9, 8, 7]);
		device.send(
			sessionPacket(1570, 1482), // sent again on every capture reset
			framePacket(config, { config: true }),
			framePacket(frame, { keyframe: true, pts: 123_456_789_012n }),
		);

		const gotConfig = await data.waitFor((m) => m.type === "configuration");
		expect(gotConfig).toMatchObject({ streamId: ip, h265: false });
		expect(Buffer.from(gotConfig.data as string, "base64")).toEqual(Buffer.from(config));

		const gotFrame = await data.waitFor((m) => m.type === "data");
		// pts travels as a string: a 64-bit timestamp does not survive JSON as a number.
		expect(gotFrame).toMatchObject({ streamId: ip, h265: false, keyframe: true, pts: "123456789012" });
		expect(Buffer.from(gotFrame.data as string, "base64")).toEqual(Buffer.from(frame));

		// The browser decoder reads the size from the codec configuration: "session"
		// packets must never reach it (it would not know the type).
		await expect(data.waitFor((m) => m.type === "session", 300)).rejects.toThrow("timed out");

		// The scrcpy process ending is reported, and the supervisor is asked to restart.
		device.die();
		expect(await session).toBe(true);
		await control.waitFor((m) => m.type === "stream_ended" && m.streamId === ip);
		expect(internals.activeStreams.has(ip)).toBe(false);

		await data.close();
		await control.close();
	});

	// Issue #78. Since scrcpy 4.0 the frame size is in the first stream packet, not
	// in the metadata: a check on the metadata alone silently never fires.
	it("closes an inverted (portrait) Quest session without announcing it and asks for a flipped retry", async () => {
		device = fakeDevice();
		const ip = "10.0.0.3";
		const control = openClient(`ws://127.0.0.1:${port}`);
		await control.waitOpen();

		device.send(metadata("Quest 3"), sessionPacket(1482, 1570));

		expect(await internals.runSession(adb, ip, "Quest_3", false)).toBe(true);

		expect(device.kill).toHaveBeenCalled();
		expect(internals.flipWidthForIp.get(ip)).toBe(true);
		expect(internals.activeStreams.has(ip)).toBe(false);
		await expect(control.waitFor((m) => m.type === "stream_available", 300)).rejects.toThrow("timed out");

		await control.close();
	});

	it("crops per headset model and swaps the crop when flipped", async () => {
		const cropFor = async (model: string, flip: boolean, size: [number, number]) => {
			device = fakeDevice();
			device.send(metadata(model), sessionPacket(...size));
			const session = internals.runSession(adb, "10.0.0.4", model, flip);
			await vi.waitFor(() => expect(startOptions).toBeDefined());
			const value = startOptions?.value;
			device.die();
			await session;
			startOptions = undefined;
			return value;
		};

		expect(await cropFor("Quest_3", false, [1570, 1482])).toMatchObject({ angle: 23 });
		expect(String((await cropFor("Quest_3", false, [1570, 1482]))?.crop)).toBe("1482:1570:300:250");
		expect(String((await cropFor("Quest_3", true, [1570, 1482]))?.crop)).toBe("1570:1482:300:250");
		expect(String((await cropFor("Quest_3S", true, [1570, 1482]))?.crop)).toBe("1570:1482:170:150");
		// Unknown devices are streamed untouched.
		expect((await cropFor("Pixel_7", false, [720, 1280]))?.crop).toBeUndefined();
	});

	it("does not hang when the scrcpy server dies before sending a single packet", async () => {
		device = fakeDevice();
		device.send(metadata("Quest 3"));

		const session = internals.runSession(adb, "10.0.0.5", "Quest_3", true);
		await vi.waitFor(() => expect(startOptions).toBeDefined());
		device.die();

		// Resolves (restart requested) instead of waiting forever for a first frame.
		expect(await session).toBe(true);
	});
});
