import { describe, expect, it } from "vitest";
import { loadFixturePackets } from "../../../test/fixtures/video/scrcpyPackets.ts";
import { codecString } from "./fmp4.ts";
import { parseTrackConfig, sameParameterSets } from "./trackConfig.ts";

describe("parseTrackConfig", () => {
	it("reads the H.264 parameter sets and the cropped picture size", () => {
		const config = parseTrackConfig("h264", loadFixturePackets("h264")[0].data);
		expect(config).toMatchObject({ codec: "h264", width: 320, height: 180 });
		// High profile, level 1.3 (x264's pick for 320x180@30)
		expect(config && codecString(config)).toBe("avc1.64000d");
	});

	it("reads the H.265 parameter sets, profile/tier/level, format and cropped picture size", () => {
		const config = parseTrackConfig("h265", loadFixturePackets("h265")[0].data);
		expect(config).toMatchObject({
			codec: "h265",
			width: 320,
			height: 180,
			chromaFormatIdc: 1,
			bitDepthLumaMinus8: 0,
			bitDepthChromaMinus8: 0,
			numTemporalLayers: 1,
			temporalIdNested: true,
		});
		// Main profile, compatible with Main and Main 10, level 2, progressive + frame-only source.
		// The profile/tier/level bytes match the hvcC ffmpeg's own MP4 muxer writes for this stream.
		expect(config && codecString(config)).toBe("hvc1.1.6.L60.90");
	});

	it("returns null without the parameter sets", () => {
		expect(parseTrackConfig("h264", Uint8Array.of(0, 0, 1, 0x65, 1))).toBeNull();
		expect(parseTrackConfig("h265", Uint8Array.of(0, 0, 1, 0x42, 0x01, 1))).toBeNull();
	});
});

describe("sameParameterSets", () => {
	it("matches a resent configuration and tells a different one apart", () => {
		const h264 = parseTrackConfig("h264", loadFixturePackets("h264")[0].data);
		const h265 = parseTrackConfig("h265", loadFixturePackets("h265")[0].data);
		const h265Again = parseTrackConfig("h265", loadFixturePackets("h265")[0].data);
		if (!h264 || !h265 || !h265Again || h265.codec !== "h265") throw new Error("fixtures not parsed");

		expect(sameParameterSets(h265, h265Again)).toBe(true);
		expect(sameParameterSets(h264, h265)).toBe(false);
		const changed = { ...h265, pps: Uint8Array.from([...h265.pps.subarray(0, -1), h265.pps[h265.pps.length - 1] ^ 1]) };
		expect(sameParameterSets(h265, changed)).toBe(false);
	});
});
