import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AdbManager } from "../../src/api/android/adb/AdbManager.ts";
import { ScrcpyServer } from "../../src/api/android/scrcpy/ScrcpyServer.ts";
import { freePort } from "../setup/free-port.ts";
import { openClient, type TestClient } from "../setup/ws-client.ts";

// Drives the REAL ScrcpyServer control socket (uWS) with real WebSocket viewers sending the
// codec report the stream page sends. The only stub is AdbManager.restartStreamingAll: each call
// is one codec switch restarting every headset stream, the observable effect checked here.
//
// Scenario from the owner (2026-11-19): a phone that only decodes H.264 joins for a while, every
// stream moves to H.264; once it leaves and every remaining viewer decodes H.265, the streams must
// go back to H.265 (previously they stayed on H.264 until the WebPlatform restarted).

type Internals = { useH265: boolean; codecUpgradeDelayMs: number };

const BOTH = { type: "codecVideo", h264: true, h265: true, av1: false };
const H264_ONLY = { type: "codecVideo", h264: true, h265: false, av1: false };
const UPGRADE_DELAY_MS = 400;

describe("ScrcpyServer codec negotiation (real control socket, real viewers)", () => {
	let server: ScrcpyServer;
	let internals: Internals;
	let url: string;
	const restartStreamingAll = vi.fn(async () => {});
	const viewers: TestClient[] = [];

	async function viewer(report: object): Promise<TestClient> {
		const client = openClient(url);
		viewers.push(client);
		await client.waitOpen();
		// The server greets every control client with the active streams
		await client.waitFor((m) => m.type === "stream_list");
		client.send(report);
		return client;
	}

	beforeAll(async () => {
		const port = await freePort();
		process.env.VIDEO_WS_PORT = String(port);
		process.env.WEB_APPLICATION_HOST = "127.0.0.1";
		url = `ws://127.0.0.1:${port}`;
		server = new ScrcpyServer({ restartStreamingAll } as unknown as AdbManager);
		internals = server as unknown as Internals;
		// Short wait before switching back, so the test doesn't take 15 s
		internals.codecUpgradeDelayMs = UPGRADE_DELAY_MS;
	});

	afterEach(async () => {
		await Promise.all(viewers.splice(0).map((client) => client.close()));
		// Let the server see the closes and settle back on H.265 before the next test
		await expect.poll(() => internals.useH265, { timeout: 3000 }).toBe(true);
		restartStreamingAll.mockClear();
	});

	afterAll(() => {
		vi.restoreAllMocks();
	});

	it("keeps H.265 while every viewer decodes it", async () => {
		await viewer(BOTH);
		await viewer(BOTH);
		await new Promise((resolve) => setTimeout(resolve, UPGRADE_DELAY_MS * 2));

		expect(internals.useH265).toBe(true);
		expect(restartStreamingAll).not.toHaveBeenCalled();
	});

	it("switches to H.264 at once when an H.264-only viewer joins, and back to H.265 after it leaves", async () => {
		await viewer(BOTH);
		const phone = await viewer(H264_ONLY);

		await expect.poll(() => restartStreamingAll.mock.calls.length).toBe(1);
		expect(internals.useH265).toBe(false);

		await phone.close();
		// Not straight away: a page reload looks exactly like this
		await new Promise((resolve) => setTimeout(resolve, UPGRADE_DELAY_MS / 2));
		expect(internals.useH265).toBe(false);
		expect(restartStreamingAll).toHaveBeenCalledTimes(1);

		await expect.poll(() => internals.useH265, { timeout: 3000 }).toBe(true);
		await expect.poll(() => restartStreamingAll.mock.calls.length).toBe(2);
	});

	it("doesn't switch back while an H.264-only viewer is still connected, whoever joins (issue #69)", async () => {
		await viewer(H264_ONLY);
		await expect.poll(() => restartStreamingAll.mock.calls.length).toBe(1);

		await viewer(BOTH);
		await viewer(BOTH);
		await new Promise((resolve) => setTimeout(resolve, UPGRADE_DELAY_MS * 2));

		expect(internals.useH265).toBe(false);
		expect(restartStreamingAll).toHaveBeenCalledTimes(1);
	});

	it("doesn't bounce when the H.264-only viewer reloads its page", async () => {
		await viewer(BOTH);
		const phone = await viewer(H264_ONLY);
		await expect.poll(() => restartStreamingAll.mock.calls.length).toBe(1);

		// Reload: the old control socket closes, the new page reports again before the wait ends
		await phone.close();
		await new Promise((resolve) => setTimeout(resolve, UPGRADE_DELAY_MS / 4));
		await viewer(H264_ONLY);
		await new Promise((resolve) => setTimeout(resolve, UPGRADE_DELAY_MS * 2));

		expect(internals.useH265).toBe(false);
		expect(restartStreamingAll).toHaveBeenCalledTimes(1);
	});

	it("switches back to H.265 when the last viewer, H.264-only, leaves", async () => {
		const phone = await viewer(H264_ONLY);
		await expect.poll(() => restartStreamingAll.mock.calls.length).toBe(1);

		await phone.close();

		await expect.poll(() => internals.useH265, { timeout: 3000 }).toBe(true);
		await expect.poll(() => restartStreamingAll.mock.calls.length).toBe(2);
	});
});
