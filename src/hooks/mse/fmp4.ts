/**
 * Minimal fragmented MP4 (ISO BMFF) writer for one H.264 or H.265 video track, used by the Media
 * Source Extensions fallback. It only remuxes: the codec bytes are copied as-is, nothing is
 * re-encoded.
 *
 * - `buildInitSegment` writes `ftyp` + `moov`: the track description, with the parameter sets in
 *   `avc1`/`avcC` (H.264) or `hvc1`/`hvcC` (H.265).
 * - `buildMediaSegment` writes one `moof` + `mdat` fragment holding length-prefixed samples.
 *
 * Box layouts follow ISO/IEC 14496-12 (ISO BMFF) and 14496-15 (`avcC`, `hvcC`, codec strings).
 */

/** Ticks per second of the track timeline (the usual MPEG 90 kHz clock). */
export const TIMESCALE = 90_000;

const TRACK_ID = 1;

export interface AvcTrackConfig {
	codec: "h264";
	/** SPS NAL unit, without start code */
	sps: Uint8Array;
	/** PPS NAL unit, without start code */
	pps: Uint8Array;
	width: number;
	height: number;
}

export interface HevcTrackConfig {
	codec: "h265";
	/** VPS, SPS and PPS NAL units, without start codes */
	vps: Uint8Array;
	sps: Uint8Array;
	pps: Uint8Array;
	width: number;
	height: number;
	/**
	 * The 12 bytes of the SPS general profile_tier_level, emulation prevention removed: profile
	 * space/tier/profile, 32 compatibility flags, 48 constraint flags, level.
	 */
	generalProfileTierLevel: Uint8Array;
	chromaFormatIdc: number;
	bitDepthLumaMinus8: number;
	bitDepthChromaMinus8: number;
	/** sps_max_sub_layers_minus1 + 1 */
	numTemporalLayers: number;
	temporalIdNested: boolean;
}

export type TrackConfig = AvcTrackConfig | HevcTrackConfig;

export interface Fmp4Sample {
	/** NAL units each behind a 4-byte big-endian length */
	data: Uint8Array;
	/** In TIMESCALE ticks */
	duration: number;
	keyframe: boolean;
}

// --- Byte helpers -------------------------------------------------------------------------------

function u8(value: number): Uint8Array {
	return Uint8Array.of(value & 0xff);
}

function u16(value: number): Uint8Array {
	return Uint8Array.of((value >>> 8) & 0xff, value & 0xff);
}

function u32(value: number): Uint8Array {
	const out = new Uint8Array(4);
	new DataView(out.buffer).setUint32(0, value >>> 0);
	return out;
}

function u64(value: number): Uint8Array {
	const out = new Uint8Array(8);
	new DataView(out.buffer).setBigUint64(0, BigInt(Math.max(0, Math.floor(value))));
	return out;
}

function zeros(length: number): Uint8Array {
	return new Uint8Array(length);
}

function ascii(text: string): Uint8Array {
	return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

function concat(parts: Uint8Array[]): Uint8Array {
	let size = 0;
	for (const part of parts) size += part.length;
	const out = new Uint8Array(size);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

function box(type: string, ...payload: Uint8Array[]): Uint8Array {
	const body = concat(payload);
	return concat([u32(8 + body.length), ascii(type), body]);
}

function fullBox(type: string, version: number, flags: number, ...payload: Uint8Array[]): Uint8Array {
	return box(type, u8(version), u8(flags >>> 16), u16(flags & 0xffff), ...payload);
}

// Identity transformation matrix (16.16 and 2.30 fixed point)
const MATRIX = concat([
	u32(0x00010000),
	u32(0),
	u32(0),
	u32(0),
	u32(0x00010000),
	u32(0),
	u32(0),
	u32(0),
	u32(0x40000000),
]);

// --- Init segment -------------------------------------------------------------------------------

/** RFC 6381 codec string (`avc1.PPCCLL`) read from the SPS profile, constraint and level bytes. */
export function avcCodecString(sps: Uint8Array): string {
	const hex = (value: number) => value.toString(16).padStart(2, "0");
	return `avc1.${hex(sps[1])}${hex(sps[2])}${hex(sps[3])}`;
}

/**
 * ISO/IEC 14496-15 annex E codec string for an `hvc1` track, e.g. `hvc1.1.6.L93.B0`:
 * profile space letter + profile, the compatibility flags bit-reversed in hex, tier + level, then
 * the constraint bytes in hex with the trailing zero bytes left out (at least one is kept).
 */
export function hevcCodecString(generalProfileTierLevel: Uint8Array): string {
	const ptl = generalProfileTierLevel;
	const profileSpace = ["", "A", "B", "C"][ptl[0] >> 6];
	const tier = ptl[0] & 0x20 ? "H" : "L";
	const profile = ptl[0] & 0x1f;

	let compatibility = new DataView(ptl.buffer, ptl.byteOffset, ptl.byteLength).getUint32(1);
	let reversed = 0;
	for (let bit = 0; bit < 32; bit += 1) {
		reversed = (reversed << 1) | (compatibility & 1);
		compatibility >>>= 1;
	}

	const constraints = [...ptl.subarray(5, 11)];
	while (constraints.length > 1 && constraints[constraints.length - 1] === 0) constraints.pop();

	const hex = (value: number) => value.toString(16).toUpperCase();
	return ["hvc1", `${profileSpace}${profile}`, hex(reversed >>> 0), `${tier}${ptl[11]}`, ...constraints.map(hex)].join(
		".",
	);
}

export function codecString(config: TrackConfig): string {
	return config.codec === "h265" ? hevcCodecString(config.generalProfileTierLevel) : avcCodecString(config.sps);
}

function avcC(sps: Uint8Array, pps: Uint8Array): Uint8Array {
	return box(
		"avcC",
		u8(1), // configurationVersion
		u8(sps[1]), // AVCProfileIndication
		u8(sps[2]), // profile_compatibility
		u8(sps[3]), // AVCLevelIndication
		u8(0xfc | 3), // reserved + lengthSizeMinusOne = 3 (4-byte NAL lengths)
		u8(0xe0 | 1), // reserved + numOfSequenceParameterSets
		u16(sps.length),
		sps,
		u8(1), // numOfPictureParameterSets
		u16(pps.length),
		pps,
	);
}

function hvcC(config: HevcTrackConfig): Uint8Array {
	const array = (type: number, nalu: Uint8Array) =>
		concat([
			u8(0x80 | type), // array_completeness = 1 (no parameter set of this type in the samples) + type
			u16(1), // numNalus
			u16(nalu.length),
			nalu,
		]);

	return box(
		"hvcC",
		u8(1), // configurationVersion
		config.generalProfileTierLevel.subarray(0, 12), // profile space/tier/profile, compatibility, constraints, level
		u16(0xf000), // reserved + min_spatial_segmentation_idc = 0
		u8(0xfc), // reserved + parallelismType = 0 (unknown)
		u8(0xfc | (config.chromaFormatIdc & 0x03)),
		u8(0xf8 | (config.bitDepthLumaMinus8 & 0x07)),
		u8(0xf8 | (config.bitDepthChromaMinus8 & 0x07)),
		u16(0), // avgFrameRate: unknown
		// constantFrameRate = 0, numTemporalLayers, temporalIdNested, lengthSizeMinusOne = 3
		u8(((config.numTemporalLayers & 0x07) << 3) | (config.temporalIdNested ? 0x04 : 0) | 3),
		u8(3), // numOfArrays
		array(32, config.vps),
		array(33, config.sps),
		array(34, config.pps),
	);
}

function visualSampleEntry(config: TrackConfig): Uint8Array {
	const compressorName = zeros(32);
	return box(
		// hvc1 rather than hev1: the parameter sets only travel in hvcC, which Apple players expect
		config.codec === "h265" ? "hvc1" : "avc1",
		zeros(6), // reserved
		u16(1), // data_reference_index
		zeros(16), // pre_defined + reserved
		u16(config.width),
		u16(config.height),
		u32(0x00480000), // horizresolution, 72 dpi
		u32(0x00480000), // vertresolution, 72 dpi
		u32(0), // reserved
		u16(1), // frame_count
		compressorName,
		u16(0x0018), // depth
		u16(0xffff), // pre_defined = -1
		config.codec === "h265" ? hvcC(config) : avcC(config.sps, config.pps),
	);
}

export function buildInitSegment(config: TrackConfig): Uint8Array {
	const ftyp = box(
		"ftyp",
		ascii("isom"),
		u32(0x200),
		ascii("isom"),
		ascii("iso6"),
		ascii(config.codec === "h265" ? "hvc1" : "avc1"),
		ascii("mp41"),
	);

	const mvhd = fullBox(
		"mvhd",
		0,
		0,
		u32(0), // creation_time
		u32(0), // modification_time
		u32(TIMESCALE),
		u32(0), // duration: unknown (live)
		u32(0x00010000), // rate 1.0
		u16(0x0100), // volume 1.0
		zeros(10), // reserved
		MATRIX,
		zeros(24), // pre_defined
		u32(TRACK_ID + 1), // next_track_ID
	);

	const tkhd = fullBox(
		"tkhd",
		0,
		0x000003, // track_enabled | track_in_movie
		u32(0), // creation_time
		u32(0), // modification_time
		u32(TRACK_ID),
		u32(0), // reserved
		u32(0), // duration
		zeros(8), // reserved
		u16(0), // layer
		u16(0), // alternate_group
		u16(0), // volume (video track)
		u16(0), // reserved
		MATRIX,
		u32(config.width * 0x10000), // width, 16.16
		u32(config.height * 0x10000), // height, 16.16
	);

	const mdhd = fullBox(
		"mdhd",
		0,
		0,
		u32(0), // creation_time
		u32(0), // modification_time
		u32(TIMESCALE),
		u32(0), // duration
		u16(0x55c4), // language "und"
		u16(0), // pre_defined
	);

	const hdlr = fullBox("hdlr", 0, 0, u32(0), ascii("vide"), zeros(12), ascii("VideoHandler\0"));

	const vmhd = fullBox("vmhd", 0, 1, u16(0), zeros(6));
	const dinf = box("dinf", fullBox("dref", 0, 0, u32(1), fullBox("url ", 0, 1)));
	const stbl = box(
		"stbl",
		fullBox("stsd", 0, 0, u32(1), visualSampleEntry(config)),
		fullBox("stts", 0, 0, u32(0)),
		fullBox("stsc", 0, 0, u32(0)),
		fullBox("stsz", 0, 0, u32(0), u32(0)),
		fullBox("stco", 0, 0, u32(0)),
	);

	const trak = box("trak", tkhd, box("mdia", mdhd, hdlr, box("minf", vmhd, dinf, stbl)));

	const trex = fullBox(
		"trex",
		0,
		0,
		u32(TRACK_ID),
		u32(1), // default_sample_description_index
		u32(0), // default_sample_duration
		u32(0), // default_sample_size
		u32(0), // default_sample_flags
	);

	return concat([ftyp, box("moov", mvhd, trak, box("mvex", trex))]);
}

// --- Media segment ------------------------------------------------------------------------------

// sample_flags (ISO BMFF 8.8.3.1): sample_depends_on = 2 (sync) or 1 + sample_is_non_sync_sample
const SAMPLE_FLAGS_KEYFRAME = 0x02000000;
const SAMPLE_FLAGS_DELTA = 0x01010000;

// trun flags: data-offset-present | sample-duration-present | sample-size-present | sample-flags-present
const TRUN_FLAGS = 0x000001 | 0x000100 | 0x000200 | 0x000400;

/**
 * One `moof` + `mdat` fragment. `baseMediaDecodeTime` is the decode time of the first sample,
 * in TIMESCALE ticks; samples follow each other without gaps.
 */
export function buildMediaSegment(
	sequenceNumber: number,
	baseMediaDecodeTime: number,
	samples: Fmp4Sample[],
): Uint8Array {
	const buildMoof = (dataOffset: number) => {
		const entries: Uint8Array[] = [];
		for (const sample of samples) {
			entries.push(
				u32(sample.duration),
				u32(sample.data.length),
				u32(sample.keyframe ? SAMPLE_FLAGS_KEYFRAME : SAMPLE_FLAGS_DELTA),
			);
		}
		return box(
			"moof",
			fullBox("mfhd", 0, 0, u32(sequenceNumber)),
			box(
				"traf",
				fullBox("tfhd", 0, 0x020000, u32(TRACK_ID)), // default-base-is-moof
				fullBox("tfdt", 1, 0, u64(baseMediaDecodeTime)),
				fullBox("trun", 0, TRUN_FLAGS, u32(samples.length), u32(dataOffset), ...entries),
			),
		);
	};

	// data_offset counts from the start of moof to the first sample byte (after the mdat header).
	// The moof size does not depend on the offset value, so measure it once and rebuild.
	const moofSize = buildMoof(0).length;
	const moof = buildMoof(moofSize + 8);
	const mdat = box("mdat", ...samples.map((sample) => sample.data));

	return concat([moof, mdat]);
}
