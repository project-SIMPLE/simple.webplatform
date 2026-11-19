/**
 * H.264 / H.265 Annex B helpers for the Media Source Extensions (MSE) fallback.
 *
 * scrcpy sends video in Annex B form (NAL units behind `00 00 01` / `00 00 00 01` start codes).
 * MP4 wants each NAL unit behind its 4-byte big-endian length instead, with the parameter sets
 * (H.264 SPS/PPS, H.265 VPS/SPS/PPS) moved out of the samples into the init segment's `avcC` /
 * `hvcC` box.
 */

export type VideoCodec = "h264" | "h265";

// H.264 NAL unit types (ITU-T H.264 table 7-1)
export const NALU_TYPE_IDR = 5;
export const NALU_TYPE_SPS = 7;
export const NALU_TYPE_PPS = 8;
export const NALU_TYPE_AUD = 9;

// H.265 NAL unit types (ITU-T H.265 table 7-1)
export const HEVC_NALU_TYPE_IRAP_FIRST = 16; // BLA_W_LP
export const HEVC_NALU_TYPE_IRAP_LAST = 23; // RSV_IRAP_VCL23
export const HEVC_NALU_TYPE_VPS = 32;
export const HEVC_NALU_TYPE_SPS = 33;
export const HEVC_NALU_TYPE_PPS = 34;
export const HEVC_NALU_TYPE_AUD = 35;

/**
 * Splits an Annex B buffer into its NAL units (views into the input, start codes removed).
 *
 * Unlike `annexBSplitNalu` from @yume-chan/media-codec, this only looks for start codes and never
 * throws: one malformed packet must not end a live stream. Trailing zero bytes before a start code
 * (the leading zero of a 4-byte start code, or `trailing_zero_8bits`) are not part of the NAL unit.
 */
export function splitAnnexB(buffer: Uint8Array): Uint8Array[] {
	const nalus: Uint8Array[] = [];
	const length = buffer.length;
	let start = -1;
	let i = 0;

	while (i + 2 < length) {
		if (buffer[i + 2] > 1) {
			// Fast path: no start code can end before i + 3
			i += 3;
		} else if (buffer[i] === 0 && buffer[i + 1] === 0 && buffer[i + 2] === 1) {
			if (start !== -1) {
				let end = i;
				while (end > start && buffer[end - 1] === 0) end -= 1;
				if (end > start) nalus.push(buffer.subarray(start, end));
			}
			i += 3;
			start = i;
		} else {
			i += 1;
		}
	}

	if (start !== -1 && start < length) {
		nalus.push(buffer.subarray(start));
	}
	return nalus;
}

/** The NAL unit type: 5 bits in H.264's 1-byte header, 6 bits in H.265's 2-byte header. */
export function naluType(nalu: Uint8Array, codec: VideoCodec = "h264"): number {
	return codec === "h265" ? (nalu[0] >> 1) & 0x3f : nalu[0] & 0x1f;
}

/** Parameter sets and access unit delimiters: they belong to the init segment, not the samples. */
function isOutOfBand(type: number, codec: VideoCodec): boolean {
	if (codec === "h265") return type >= HEVC_NALU_TYPE_VPS && type <= HEVC_NALU_TYPE_AUD;
	return type === NALU_TYPE_SPS || type === NALU_TYPE_PPS || type === NALU_TYPE_AUD;
}

/**
 * Converts one Annex B access unit into an MP4 sample (NAL units behind 4-byte lengths).
 * Parameter sets and access unit delimiters are dropped. Returns null when nothing remains,
 * for example a packet that only carried parameter sets.
 */
export function annexBToMp4Sample(buffer: Uint8Array, codec: VideoCodec = "h264"): Uint8Array | null {
	const nalus = splitAnnexB(buffer).filter((nalu) => !isOutOfBand(naluType(nalu, codec), codec));
	if (nalus.length === 0) return null;

	let size = 0;
	for (const nalu of nalus) size += 4 + nalu.length;

	const out = new Uint8Array(size);
	const view = new DataView(out.buffer);
	let offset = 0;
	for (const nalu of nalus) {
		view.setUint32(offset, nalu.length);
		out.set(nalu, offset + 4);
		offset += 4 + nalu.length;
	}
	return out;
}

/** True when the access unit holds a picture decoding can start from (H.264 IDR, H.265 IRAP). */
export function containsKeyframe(buffer: Uint8Array, codec: VideoCodec = "h264"): boolean {
	return splitAnnexB(buffer).some((nalu) => {
		const type = naluType(nalu, codec);
		if (codec === "h265") return type >= HEVC_NALU_TYPE_IRAP_FIRST && type <= HEVC_NALU_TYPE_IRAP_LAST;
		return type === NALU_TYPE_IDR;
	});
}

/**
 * Removes the emulation prevention bytes (`00 00 03` → `00 00`) from the start of a NAL unit,
 * giving the raw bytes of its fixed-position fields. Stops once `length` raw bytes are read.
 */
export function unescapeNalu(nalu: Uint8Array, length = nalu.length): Uint8Array {
	const out: number[] = [];
	let zeros = 0;
	for (let i = 0; i < nalu.length && out.length < length; i += 1) {
		const byte = nalu[i];
		if (zeros >= 2 && byte === 0x03) {
			zeros = 0;
			continue;
		}
		zeros = byte === 0 ? zeros + 1 : 0;
		out.push(byte);
	}
	return Uint8Array.from(out);
}
