import { getLogger } from "@logtape/logtape";
import { H264, H265 } from "@yume-chan/media-codec";
import {
	HEVC_NALU_TYPE_PPS,
	HEVC_NALU_TYPE_SPS,
	HEVC_NALU_TYPE_VPS,
	NALU_TYPE_PPS,
	NALU_TYPE_SPS,
	naluType,
	splitAnnexB,
	unescapeNalu,
	type VideoCodec,
} from "./annexB.ts";
import type { TrackConfig } from "./fmp4.ts";

const logger = getLogger(["hooks", "mse", "trackConfig"]);

// H.265 SPS: 2-byte NAL header, then sps_video_parameter_set_id (4 bits),
// sps_max_sub_layers_minus1 (3 bits), sps_temporal_id_nesting_flag (1 bit), then the
// 12-byte general profile_tier_level
const HEVC_SPS_PTL_OFFSET = 3;
const HEVC_PTL_BYTES = 12;

function firstOfType(nalus: Uint8Array[], codec: VideoCodec, type: number): Uint8Array | undefined {
	// Copy: the NAL units are views into the socket packet
	return nalus.find((nalu) => naluType(nalu, codec) === type)?.slice();
}

/**
 * Reads the track description out of a scrcpy configuration packet (Annex B parameter sets).
 * Returns null when the packet lacks a parameter set. The picture size and the H.265 chroma
 * format/bit depth come from @yume-chan/media-codec's SPS parser; if it fails, defaults are used
 * (8-bit 4:2:0, size 0): decoders read the real values from the SPS itself.
 */
export function parseTrackConfig(codec: VideoCodec, annexB: Uint8Array): TrackConfig | null {
	const nalus = splitAnnexB(annexB);

	if (codec === "h264") {
		const sps = firstOfType(nalus, codec, NALU_TYPE_SPS);
		const pps = firstOfType(nalus, codec, NALU_TYPE_PPS);
		if (!sps || !pps || sps.length < 4) return null;

		let width = 0;
		let height = 0;
		try {
			const parsed = H264.parseConfiguration(annexB);
			width = parsed.croppedWidth;
			height = parsed.croppedHeight;
		} catch (error) {
			logger.debug("Could not read the H.264 picture size: {error}", { error });
		}
		return { codec, sps, pps, width, height };
	}

	const vps = firstOfType(nalus, codec, HEVC_NALU_TYPE_VPS);
	const sps = firstOfType(nalus, codec, HEVC_NALU_TYPE_SPS);
	const pps = firstOfType(nalus, codec, HEVC_NALU_TYPE_PPS);
	if (!vps || !sps || !pps) return null;

	const head = unescapeNalu(sps, HEVC_SPS_PTL_OFFSET + HEVC_PTL_BYTES);
	if (head.length < HEVC_SPS_PTL_OFFSET + HEVC_PTL_BYTES) return null;
	const maxSubLayersMinus1 = (head[2] >> 1) & 0x07;

	const config: TrackConfig = {
		codec,
		vps,
		sps,
		pps,
		width: 0,
		height: 0,
		generalProfileTierLevel: head.slice(HEVC_SPS_PTL_OFFSET),
		chromaFormatIdc: 1,
		bitDepthLumaMinus8: 0,
		bitDepthChromaMinus8: 0,
		numTemporalLayers: maxSubLayersMinus1 + 1,
		temporalIdNested: (head[2] & 0x01) === 1,
	};
	try {
		const parsed = H265.parseSequenceParameterSet(sps.subarray(2));
		config.chromaFormatIdc = parsed.chroma_format_idc;
		config.bitDepthLumaMinus8 = parsed.bit_depth_luma_minus8;
		config.bitDepthChromaMinus8 = parsed.bit_depth_chroma_minus8;
		const size = H265.parseConfiguration(annexB);
		config.width = size.croppedWidth;
		config.height = size.croppedHeight;
	} catch (error) {
		logger.debug("Could not parse the H.265 SPS: {error}", { error });
	}
	return config;
}

/** True when both configurations carry byte-identical parameter sets. */
export function sameParameterSets(a: TrackConfig, b: TrackConfig): boolean {
	const sets = (config: TrackConfig) =>
		config.codec === "h265" ? [config.vps, config.sps, config.pps] : [config.sps, config.pps];
	if (a.codec !== b.codec) return false;
	const left = sets(a);
	const right = sets(b);
	return left.every((set, index) => {
		const other = right[index];
		return set.length === other.length && set.every((byte, i) => byte === other[i]);
	});
}
