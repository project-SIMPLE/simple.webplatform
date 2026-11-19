import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	containsKeyframe,
	HEVC_NALU_TYPE_AUD,
	HEVC_NALU_TYPE_PPS,
	HEVC_NALU_TYPE_SPS,
	HEVC_NALU_TYPE_VPS,
	NALU_TYPE_AUD,
	NALU_TYPE_PPS,
	NALU_TYPE_SPS,
	naluType,
	splitAnnexB,
	type VideoCodec,
} from "../../../src/hooks/mse/annexB.ts";

/**
 * Real H.264 and H.265 streams cut into the packets scrcpy sends: one configuration packet (the
 * parameter sets), then one data packet per frame with its keyframe flag and a pts in µs.
 *
 * Both are 320x180 (a height that needs cropping), 30 fps, 45 frames, keyframes at 0 and 30 with
 * the parameter sets repeated in front (as Android does), no B-frames like the Quest encoder, and
 * an access unit delimiter before each frame. Made with:
 *
 *   ffmpeg -f lavfi -i testsrc2=size=320x180:rate=30 -frames:v 45 -c:v libx264 -profile:v high \
 *     -pix_fmt yuv420p -x264-params "aud=1:keyint=30:min-keyint=30:scenecut=0:bframes=0:repeat-headers=1" \
 *     -b:v 300k -f h264 testsrc-320x180-high.h264
 *
 *   ffmpeg -f lavfi -i testsrc2=size=320x180:rate=30 -frames:v 45 -c:v libx265 -profile:v main \
 *     -pix_fmt yuv420p -x265-params "keyint=30:min-keyint=30:scenecut=0:bframes=0:open-gop=0:repeat-headers=1:aud=1" \
 *     -b:v 300k -f hevc testsrc-320x180-main.h265
 */
const COMMON = { width: 320, height: 180, frames: 45, keyframes: [0, 30], fps: 30 };

// Paths from the repo root (where vitest and playwright run): jsdom tests don't get a file: import.meta.url
export const FIXTURES = {
	h264: { ...COMMON, codec: "h264", path: resolve(process.cwd(), "test/fixtures/video/testsrc-320x180-high.h264") },
	h265: { ...COMMON, codec: "h265", path: resolve(process.cwd(), "test/fixtures/video/testsrc-320x180-main.h265") },
} as const;

/** The H.264 fixture (kept for the tests written before H.265 support) */
export const FIXTURE = FIXTURES.h264;

export type FixturePacket =
	| { type: "configuration"; data: Uint8Array }
	| { type: "data"; keyframe: boolean; pts: bigint; data: Uint8Array };

const START_CODE = Uint8Array.of(0, 0, 0, 1);

function toAnnexB(nalus: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(nalus.reduce((size, nalu) => size + START_CODE.length + nalu.length, 0));
	let offset = 0;
	for (const nalu of nalus) {
		out.set(START_CODE, offset);
		out.set(nalu, offset + START_CODE.length);
		offset += START_CODE.length + nalu.length;
	}
	return out;
}

export function loadFixturePackets(codec: VideoCodec = "h264"): FixturePacket[] {
	const nalus = splitAnnexB(new Uint8Array(readFileSync(FIXTURES[codec].path)));
	const aud = codec === "h265" ? HEVC_NALU_TYPE_AUD : NALU_TYPE_AUD;
	const parameterSetTypes =
		codec === "h265" ? [HEVC_NALU_TYPE_VPS, HEVC_NALU_TYPE_SPS, HEVC_NALU_TYPE_PPS] : [NALU_TYPE_SPS, NALU_TYPE_PPS];

	// Access units start at each delimiter
	const accessUnits: Uint8Array[][] = [];
	for (const nalu of nalus) {
		if (naluType(nalu, codec) === aud || accessUnits.length === 0) accessUnits.push([]);
		accessUnits[accessUnits.length - 1].push(nalu);
	}

	const parameterSets = parameterSetTypes.map((type) => {
		const nalu = nalus.find((candidate) => naluType(candidate, codec) === type);
		if (!nalu) throw new Error(`fixture has no NAL unit of type ${type}`);
		return nalu;
	});

	const frameUs = BigInt(Math.round(1_000_000 / FIXTURES[codec].fps));
	return [
		{ type: "configuration", data: toAnnexB(parameterSets) },
		...accessUnits.map((unit, index): FixturePacket => {
			const data = toAnnexB(unit);
			return { type: "data", keyframe: containsKeyframe(data, codec), pts: BigInt(index) * frameUs, data };
		}),
	];
}
