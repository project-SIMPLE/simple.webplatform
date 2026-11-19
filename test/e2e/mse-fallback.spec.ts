import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { build } from "esbuild";
import type { VideoCodec } from "../../src/hooks/mse/annexB.ts";
import { FIXTURES, loadFixturePackets } from "../fixtures/video/scrcpyPackets.ts";
import type { PlaybackResult, WirePacket } from "./helpers/msePlayback.ts";

// Opening the WebPlatform by LAN IP over plain HTTP (e.g. from an iPad) is not a secure context,
// so WebCodecs' VideoDecoder doesn't exist there and the stream page plays video through Media
// Source Extensions instead (src/hooks/mse/). This drives the real MsePlayer in a real browser on
// such a page, with real H.264 / H.265 streams cut into scrcpy packets, and checks that frames decode.

// Routed below, never reaches the network: a non-loopback http:// origin, like the reported issue
const INSECURE_ORIGIN = "http://192.168.68.50:8000";

interface MseWindow {
	MseFallback: typeof import("./helpers/msePlayback.ts");
}

async function bundleHarness(): Promise<string> {
	const result = await build({
		entryPoints: [resolve(process.cwd(), "test/e2e/helpers/msePlayback.ts")],
		bundle: true,
		format: "iife",
		globalName: "MseFallback",
		platform: "browser",
		target: "es2022",
		write: false,
	});
	return result.outputFiles[0].text;
}

async function openInsecurePage(page: Page, pageErrors: Error[]): Promise<void> {
	page.on("pageerror", (err) => pageErrors.push(err));
	await page.route(`${INSECURE_ORIGIN}/**`, (route) =>
		route.fulfill({ contentType: "text/html", body: "<!doctype html><div id=tile></div><div id=popup></div>" }),
	);
	await page.goto(`${INSECURE_ORIGIN}/streamPlayerScreen`);
	await page.addScriptTag({ content: await bundleHarness() });

	// The situation the fallback exists for
	expect(await page.evaluate(() => ({ secure: isSecureContext, webCodecs: typeof VideoDecoder }))).toEqual({
		secure: false,
		webCodecs: "undefined",
	});
}

function wirePackets(codec: VideoCodec): WirePacket[] {
	return loadFixturePackets(codec).map((packet) => ({
		type: packet.type,
		keyframe: packet.type === "data" ? packet.keyframe : undefined,
		pts: packet.type === "data" ? packet.pts.toString() : undefined,
		data: Buffer.from(packet.data).toString("base64"),
	}));
}

function isSupported(page: Page, codec: VideoCodec): Promise<boolean> {
	return page.evaluate((codec) => (window as unknown as MseWindow).MseFallback.isMseSupported(codec), codec);
}

async function play(page: Page, codec: VideoCodec): Promise<PlaybackResult> {
	return page.evaluate(
		({ codec, packets, fps }) => (window as unknown as MseWindow).MseFallback.playPackets(codec, packets, fps),
		{ codec, packets: wirePackets(codec), fps: FIXTURES[codec].fps },
	);
}

function expectLivePlayback(result: PlaybackResult, codec: VideoCodec, pageErrors: Error[]): void {
	const fixture = FIXTURES[codec];
	expect(result.error).toBeNull();
	expect(pageErrors).toEqual([]);
	expect({ width: result.width, height: result.height }).toEqual({ width: fixture.width, height: fixture.height });
	// Every frame went through the decoder (a few may be skipped while the detached video was paused)
	expect(result.decodedFrames).toBeGreaterThanOrEqual(fixture.frames - 5);
	// Live playback: playing again after the pause, near the end of what was received
	expect(result.paused).toBe(false);
	expect(result.lag).toBeLessThan(0.5);
	expect(result.removedOnDispose).toBe(true);
}

test("plays a scrcpy H.264 stream through MSE where WebCodecs is unavailable", async ({ page }) => {
	const pageErrors: Error[] = [];
	await openInsecurePage(page, pageErrors);
	expect(await isSupported(page, "h264")).toBe(true);

	expectLivePlayback(await play(page, "h264"), "h264", pageErrors);
});

test("plays a scrcpy H.265 stream through MSE where the browser has HEVC", async ({ page }) => {
	const pageErrors: Error[] = [];
	await openInsecurePage(page, pageErrors);

	if (!(await isSupported(page, "h265"))) {
		// Chromium on Linux has no HEVC through MSE. The page then reports `h265: false` and the
		// server streams H.264, which the test above plays. Recorded in the report, not skipped.
		test.info().annotations.push({
			type: "no HEVC",
			description: "this browser can't play H.265 through MSE: only the H.264 fallback was exercised",
		});
		return;
	}

	expectLivePlayback(await play(page, "h265"), "h265", pageErrors);
});
