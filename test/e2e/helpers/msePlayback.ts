/**
 * Browser-side half of the MSE fallback test: bundled into the page with the real MsePlayer
 * (see mse-fallback.spec.ts), it plays scrcpy packets the way useVideoStreams feeds them, then
 * reports what the <video> element decoded.
 */
import type { VideoCodec } from "../../../src/hooks/mse/annexB.ts";
import { isMseSupported, MsePlayer } from "../../../src/hooks/mse/MsePlayer.ts";

export { isMseSupported };

/** A fixture packet made JSON-safe: base64 data, pts as a decimal string. */
export interface WirePacket {
	type: "configuration" | "data";
	keyframe?: boolean;
	pts?: string;
	data: string;
}

export interface PlaybackResult {
	width: number;
	height: number;
	decodedFrames: number;
	paused: boolean;
	/** Seconds between the playhead and the end of the buffered video */
	lag: number;
	error: string | null;
	removedOnDispose: boolean;
}

const decode = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Expects a page holding `<div id=tile>` and `<div id=popup>`. */
export async function playPackets(codec: VideoCodec, packets: WirePacket[], fps: number): Promise<PlaybackResult> {
	const tile = document.getElementById("tile");
	const popup = document.getElementById("popup");
	if (!tile || !popup) throw new Error("the page needs #tile and #popup");

	const player = new MsePlayer(codec);
	const video = player.video;
	tile.appendChild(video);

	let frame = 0;
	for (const packet of packets) {
		if (packet.type === "configuration") {
			player.write({ type: "configuration", data: decode(packet.data) });
			continue;
		}
		// The server resends the configuration for each new viewer: must not restart decoding
		if (frame === 15) player.write({ type: "configuration", data: decode(packets[0].data) });
		// Opening the popup moves the <video> in one step (no pause)
		if (frame === 10) popup.appendChild(video);
		// Closing it unmounts the popup with the <video> inside, and the tile takes the video
		// back from an effect later on: out of the document in between, so the browser pauses it
		if (frame === 20) {
			video.remove();
			await sleep(100);
			tile.appendChild(video);
		}

		player.write({
			type: "data",
			keyframe: packet.keyframe === true,
			pts: packet.pts === undefined ? undefined : BigInt(packet.pts),
			data: decode(packet.data),
		});
		frame += 1;
		await sleep(1000 / fps);
	}
	// Let the last frames play out
	await sleep(1000);

	const result = {
		width: video.videoWidth,
		height: video.videoHeight,
		decodedFrames: video.getVideoPlaybackQuality().totalVideoFrames,
		paused: video.paused,
		lag: video.buffered.length ? video.buffered.end(video.buffered.length - 1) - video.currentTime : Number.NaN,
		error: video.error?.message ?? null,
	};
	player.dispose();
	return { ...result, removedOnDispose: !video.isConnected };
}
