import { describe, expect, it } from "vitest";
import { FIXTURES, loadFixturePackets } from "../../../test/fixtures/video/scrcpyPackets.ts";
import { annexBToMp4Sample, containsKeyframe, naluType, splitAnnexB, unescapeNalu, type VideoCodec } from "./annexB.ts";

/** Reads a length-prefixed MP4 sample back into its NAL units. */
function readSample(sample: Uint8Array): Uint8Array[] {
	const view = new DataView(sample.buffer, sample.byteOffset, sample.byteLength);
	const nalus: Uint8Array[] = [];
	let offset = 0;
	while (offset < sample.length) {
		const length = view.getUint32(offset);
		nalus.push(sample.subarray(offset + 4, offset + 4 + length));
		offset += 4 + length;
	}
	expect(offset).toBe(sample.length);
	return nalus;
}

describe("splitAnnexB", () => {
	it("splits on 3- and 4-byte start codes and drops the zeros before a start code", () => {
		const buffer = Uint8Array.of(0, 0, 0, 1, 0x67, 1, 2, 0, 0, 1, 0x68, 3, 0, 0, 0, 0, 1, 0x65, 4, 5);
		expect(splitAnnexB(buffer).map((nalu) => [...nalu])).toEqual([
			[0x67, 1, 2],
			[0x68, 3],
			[0x65, 4, 5],
		]);
	});

	it("keeps emulation prevention bytes inside a NAL unit", () => {
		const buffer = Uint8Array.of(0, 0, 1, 0x41, 0, 0, 3, 1, 9);
		expect(splitAnnexB(buffer).map((nalu) => [...nalu])).toEqual([[0x41, 0, 0, 3, 1, 9]]);
	});

	it("returns nothing for a buffer without a start code instead of throwing", () => {
		expect(splitAnnexB(Uint8Array.of(1, 2, 3, 4))).toEqual([]);
		expect(splitAnnexB(new Uint8Array(0))).toEqual([]);
	});
});

describe("naluType", () => {
	it("reads the 5-bit H.264 type and the 6-bit H.265 type", () => {
		expect(naluType(Uint8Array.of(0x67), "h264")).toBe(7); // SPS
		expect(naluType(Uint8Array.of(0x65), "h264")).toBe(5); // IDR
		expect(naluType(Uint8Array.of(0x40, 0x01), "h265")).toBe(32); // VPS
		expect(naluType(Uint8Array.of(0x26, 0x01), "h265")).toBe(19); // IDR_W_RADL
		expect(naluType(Uint8Array.of(0x02, 0x01), "h265")).toBe(1); // TRAIL_R
	});
});

describe("annexBToMp4Sample", () => {
	it("length-prefixes H.264 slices and drops SPS, PPS and access unit delimiters", () => {
		const buffer = Uint8Array.of(0, 0, 0, 1, 0x09, 0xf0, 0, 0, 1, 0x67, 1, 0, 0, 1, 0x68, 2, 0, 0, 1, 0x65, 7, 8, 9);
		expect([...(annexBToMp4Sample(buffer, "h264") ?? [])]).toEqual([0, 0, 0, 4, 0x65, 7, 8, 9]);
	});

	it("length-prefixes H.265 slices and drops VPS, SPS, PPS and access unit delimiters", () => {
		const buffer = Uint8Array.of(
			...[0, 0, 0, 1, 0x46, 0x01, 0x50], // AUD (35)
			...[0, 0, 1, 0x40, 0x01, 0xa], // VPS (32)
			...[0, 0, 1, 0x42, 0x01, 0xb], // SPS (33)
			...[0, 0, 1, 0x44, 0x01, 0xc], // PPS (34)
			...[0, 0, 1, 0x4e, 0x01, 0xd], // prefix SEI (39): kept
			...[0, 0, 1, 0x26, 0x01, 0xe, 0xf], // IDR_W_RADL (19)
		);
		expect([...(annexBToMp4Sample(buffer, "h265") ?? [])]).toEqual([
			...[0, 0, 0, 3, 0x4e, 0x01, 0xd],
			...[0, 0, 0, 4, 0x26, 0x01, 0xe, 0xf],
		]);
	});

	it("returns null when only parameter sets remain", () => {
		expect(annexBToMp4Sample(Uint8Array.of(0, 0, 1, 0x67, 1, 0, 0, 1, 0x68, 2), "h264")).toBeNull();
		expect(annexBToMp4Sample(Uint8Array.of(0, 0, 1, 0x40, 1, 0, 0, 1, 0x42, 1), "h265")).toBeNull();
	});

	it.each<VideoCodec>(["h264", "h265"])("converts every frame of a real %s stream without losing a slice", (codec) => {
		const fixture = FIXTURES[codec];
		const frames = loadFixturePackets(codec).filter((packet) => packet.type === "data");
		expect(frames).toHaveLength(fixture.frames);
		// The keyframes ffprobe reports for the fixture
		expect(frames.flatMap((frame, index) => (frame.keyframe ? [index] : []))).toEqual(fixture.keyframes);

		const outOfBand = codec === "h265" ? [32, 33, 34, 35] : [7, 8, 9];
		for (const frame of frames) {
			const sample = annexBToMp4Sample(frame.data, codec);
			expect(sample).not.toBeNull();
			const expected = splitAnnexB(frame.data).filter((nalu) => !outOfBand.includes(naluType(nalu, codec)));
			expect(readSample(sample ?? new Uint8Array(0)).map((nalu) => [...nalu])).toEqual(
				expected.map((nalu) => [...nalu]),
			);
		}
	});
});

describe("containsKeyframe", () => {
	it("recognises H.264 IDR and H.265 IRAP pictures only", () => {
		expect(containsKeyframe(Uint8Array.of(0, 0, 1, 0x65, 1), "h264")).toBe(true);
		expect(containsKeyframe(Uint8Array.of(0, 0, 1, 0x41, 1), "h264")).toBe(false);
		expect(containsKeyframe(Uint8Array.of(0, 0, 1, 0x26, 0x01, 1), "h265")).toBe(true); // IDR_W_RADL (19)
		expect(containsKeyframe(Uint8Array.of(0, 0, 1, 0x2a, 0x01, 1), "h265")).toBe(true); // CRA (21)
		expect(containsKeyframe(Uint8Array.of(0, 0, 1, 0x02, 0x01, 1), "h265")).toBe(false); // TRAIL_R (1)
	});
});

describe("unescapeNalu", () => {
	it("removes emulation prevention bytes and stops at the requested length", () => {
		expect([...unescapeNalu(Uint8Array.of(0x42, 0, 0, 3, 0, 0, 0, 3, 1, 7))]).toEqual([0x42, 0, 0, 0, 0, 0, 1, 7]);
		expect([...unescapeNalu(Uint8Array.of(0x42, 0, 0, 3, 0, 9, 9), 4)]).toEqual([0x42, 0, 0, 0]);
	});
});
