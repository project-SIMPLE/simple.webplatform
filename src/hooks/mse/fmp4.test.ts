import { describe, expect, it } from "vitest";
import { loadFixturePackets } from "../../../test/fixtures/video/scrcpyPackets.ts";
import { NALU_TYPE_PPS, NALU_TYPE_SPS, naluType, splitAnnexB } from "./annexB.ts";
import { avcCodecString, buildInitSegment, buildMediaSegment, hevcCodecString, TIMESCALE } from "./fmp4.ts";
import { parseTrackConfig } from "./trackConfig.ts";

interface Box {
	type: string;
	start: number;
	size: number;
	body: Uint8Array;
}

/** Lists the boxes laid out in `bytes`, checking that their sizes tile it exactly. */
function readBoxes(bytes: Uint8Array): Box[] {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const boxes: Box[] = [];
	let offset = 0;
	while (offset < bytes.length) {
		const size = view.getUint32(offset);
		expect(size).toBeGreaterThanOrEqual(8);
		const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
		boxes.push({ type, start: offset, size, body: bytes.subarray(offset + 8, offset + size) });
		offset += size;
	}
	expect(offset).toBe(bytes.length);
	return boxes;
}

function child(parent: Uint8Array, path: string[], skip = 0): Box {
	let body = parent.subarray(skip);
	let found: Box | undefined;
	for (const type of path) {
		found = readBoxes(body).find((box) => box.type === type);
		expect(found, `missing ${type} box`).toBeDefined();
		body = found?.body ?? new Uint8Array(0);
	}
	return found as Box;
}

function u32(bytes: Uint8Array, offset: number): number {
	return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
}

const packets = loadFixturePackets();
const configuration = packets[0].data;
const sps = splitAnnexB(configuration).find((nalu) => naluType(nalu) === NALU_TYPE_SPS) ?? new Uint8Array(0);
const pps = splitAnnexB(configuration).find((nalu) => naluType(nalu) === NALU_TYPE_PPS) ?? new Uint8Array(0);

describe("avcCodecString", () => {
	it("reads profile, constraints and level from the SPS", () => {
		// High profile (0x64), no constraint flags; x264 picks level 1.3 (0x0d) for 320x180@30
		expect(avcCodecString(sps)).toMatch(/^avc1\.6400[0-9a-f]{2}$/);
		expect(avcCodecString(Uint8Array.of(0x67, 0x4d, 0x40, 0x1e))).toBe("avc1.4d401e");
	});
});

describe("buildInitSegment", () => {
	const init = buildInitSegment({ codec: "h264", sps, pps, width: 320, height: 180 });

	it("is an ftyp followed by a moov with one fragmented video track", () => {
		expect(readBoxes(init).map((box) => box.type)).toEqual(["ftyp", "moov"]);
		expect(readBoxes(child(init, ["moov"]).body).map((box) => box.type)).toEqual(["mvhd", "trak", "mvex"]);
		expect(child(init, ["moov", "trak", "mdia", "hdlr"]).body.subarray(8, 12)).toEqual(
			Uint8Array.from("vide", (c) => c.charCodeAt(0)),
		);
		// mdhd timescale (version 0: after version/flags and two 32-bit times)
		expect(u32(child(init, ["moov", "trak", "mdia", "mdhd"]).body, 12)).toBe(TIMESCALE);
	});

	it("carries the size and the SPS/PPS in avc1/avcC", () => {
		const stsd = child(init, ["moov", "trak", "mdia", "minf", "stbl", "stsd"]);
		// stsd: version/flags (4) + entry_count (4), then the avc1 sample entry
		const avc1 = readBoxes(stsd.body.subarray(8))[0];
		expect(avc1.type).toBe("avc1");
		const view = new DataView(avc1.body.buffer, avc1.body.byteOffset);
		expect(view.getUint16(24)).toBe(320);
		expect(view.getUint16(26)).toBe(180);

		// The avc1 fixed fields take 78 bytes before the avcC box
		const avcC = readBoxes(avc1.body.subarray(78))[0];
		expect(avcC.type).toBe("avcC");
		const body = avcC.body;
		expect([...body.subarray(0, 4)]).toEqual([1, sps[1], sps[2], sps[3]]);
		expect(body[4] & 0x03).toBe(3); // 4-byte NAL lengths
		expect(body[5] & 0x1f).toBe(1);
		const spsLength = (body[6] << 8) | body[7];
		expect([...body.subarray(8, 8 + spsLength)]).toEqual([...sps]);
		expect(body[8 + spsLength]).toBe(1);
		const ppsLength = (body[9 + spsLength] << 8) | body[10 + spsLength];
		expect([...body.subarray(11 + spsLength, 11 + spsLength + ppsLength)]).toEqual([...pps]);
	});
});

describe("hevcCodecString", () => {
	const ptl = (bytes: number[]) => Uint8Array.from(bytes);

	it("follows the ISO/IEC 14496-15 annex E examples", () => {
		// Main profile, compatibility flags 1 and 2, level 3.1, progressive + frame-only source
		expect(hevcCodecString(ptl([0x01, 0x60, 0, 0, 0, 0xb0, 0, 0, 0, 0, 0, 93]))).toBe("hvc1.1.6.L93.B0");
		// Main 10, compatibility flag 2, level 4
		expect(hevcCodecString(ptl([0x02, 0x20, 0, 0, 0, 0xb0, 0, 0, 0, 0, 0, 120]))).toBe("hvc1.2.4.L120.B0");
	});

	it("writes the high tier, a profile space letter and every non-zero constraint byte", () => {
		// profile_space 1 (A), high tier, profile 1; constraint bytes 90 00 01 trimmed after the 01
		expect(hevcCodecString(ptl([0x61, 0x60, 0, 0, 0, 0x90, 0, 0x01, 0, 0, 0, 153]))).toBe("hvc1.A1.6.H153.90.0.1");
	});

	it("keeps one constraint byte when they are all zero", () => {
		expect(hevcCodecString(ptl([0x01, 0x60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 60]))).toBe("hvc1.1.6.L60.0");
	});
});

describe("buildInitSegment (H.265)", () => {
	const hevcPackets = loadFixturePackets("h265");
	const config = parseTrackConfig("h265", hevcPackets[0].data);
	if (config?.codec !== "h265") throw new Error("the H.265 fixture has no usable configuration");
	const init = buildInitSegment(config);

	it("describes an hvc1 track with the VPS, SPS and PPS in hvcC", () => {
		const stsd = child(init, ["moov", "trak", "mdia", "minf", "stbl", "stsd"]);
		const hvc1 = readBoxes(stsd.body.subarray(8))[0];
		expect(hvc1.type).toBe("hvc1");
		const view = new DataView(hvc1.body.buffer, hvc1.body.byteOffset);
		expect([view.getUint16(24), view.getUint16(26)]).toEqual([320, 180]);

		const hvcC = readBoxes(hvc1.body.subarray(78))[0];
		expect(hvcC.type).toBe("hvcC");
		const body = hvcC.body;
		expect(body[0]).toBe(1); // configurationVersion
		expect([...body.subarray(1, 13)]).toEqual([...config.generalProfileTierLevel]);
		expect(body[16] & 0x03).toBe(1); // chroma 4:2:0
		expect([body[17] & 0x07, body[18] & 0x07]).toEqual([0, 0]); // 8-bit
		expect(body[21] & 0x03).toBe(3); // 4-byte NAL lengths
		expect(body[22]).toBe(3); // numOfArrays

		// Each array: completeness + type, one NAL unit, its length, its bytes
		let offset = 23;
		for (const [type, nalu] of [
			[32, config.vps],
			[33, config.sps],
			[34, config.pps],
		] as const) {
			expect(body[offset]).toBe(0x80 | type);
			expect((body[offset + 1] << 8) | body[offset + 2]).toBe(1);
			const length = (body[offset + 3] << 8) | body[offset + 4];
			expect([...body.subarray(offset + 5, offset + 5 + length)]).toEqual([...nalu]);
			offset += 5 + length;
		}
		expect(offset).toBe(body.length);
	});

	it("brands the file hvc1", () => {
		expect(String.fromCharCode(...child(init, ["ftyp"]).body.subarray(16, 20))).toBe("hvc1");
	});
});

describe("buildMediaSegment", () => {
	const samples = [
		{ data: Uint8Array.of(0, 0, 0, 2, 0x65, 0xaa), duration: 3000, keyframe: true },
		{ data: Uint8Array.of(0, 0, 0, 3, 0x41, 0xbb, 0xcc), duration: 3003, keyframe: false },
	];
	const segment = buildMediaSegment(7, 123_456_789_012, samples);

	it("is a moof followed by an mdat holding the samples back to back", () => {
		const boxes = readBoxes(segment);
		expect(boxes.map((box) => box.type)).toEqual(["moof", "mdat"]);
		expect([...boxes[1].body]).toEqual([...samples[0].data, ...samples[1].data]);
		expect(u32(child(segment, ["moof", "mfhd"]).body, 4)).toBe(7);
	});

	it("writes a 64-bit decode time and a data offset that points at the first sample", () => {
		const tfdt = child(segment, ["moof", "traf", "tfdt"]).body;
		expect(tfdt[0]).toBe(1); // version 1: 64-bit
		expect(new DataView(tfdt.buffer, tfdt.byteOffset).getBigUint64(4)).toBe(123_456_789_012n);

		const trun = child(segment, ["moof", "traf", "trun"]).body;
		expect(u32(trun, 4)).toBe(2); // sample_count
		const dataOffset = u32(trun, 8);
		expect([...segment.subarray(dataOffset, dataOffset + samples[0].data.length)]).toEqual([...samples[0].data]);

		// Per sample: duration, size, flags (sync sample vs. non-sync dependent sample)
		expect([u32(trun, 12), u32(trun, 16), u32(trun, 20)]).toEqual([3000, 6, 0x02000000]);
		expect([u32(trun, 24), u32(trun, 28), u32(trun, 32)]).toEqual([3003, 7, 0x01010000]);
	});
});
