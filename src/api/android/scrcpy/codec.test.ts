import { describe, expect, it } from "vitest";
import { chooseUseH265, isCodecReport } from "./codec.ts";

const BOTH = { h264: true, h265: true };
const H264_ONLY = { h264: true, h265: false };
const H265_ONLY = { h264: false, h265: true };
const NONE = { h264: false, h265: false };

// Regression: issues #69 ("Front end selection of video codec does not work correctly") and
// #133 ("Streams are not rendered correctly on Safari"). One viewer that can't decode H.265
// (e.g. Safari) must move the streams to H.264, and the streams must not go back to H.265 while
// that viewer is still connected, or it breaks (#69). Once it has left, H.265 comes back.
describe("chooseUseH265 codec negotiation", () => {
	it("uses H.265 when every viewer decodes it", () => {
		expect(chooseUseH265([BOTH])).toBe(true);
		expect(chooseUseH265([BOTH, H265_ONLY, BOTH])).toBe(true);
	});

	it("uses H.264 as soon as one viewer can't decode H.265 (Safari, issue #133)", () => {
		expect(chooseUseH265([H264_ONLY])).toBe(false);
		expect(chooseUseH265([BOTH, BOTH, H264_ONLY])).toBe(false);
	});

	it("stays on H.264 while an H.264-only viewer is connected, whoever else joins (issue #69)", () => {
		expect(chooseUseH265([H264_ONLY, BOTH, BOTH, BOTH])).toBe(false);
	});

	it("goes back to H.265 once the H.264-only viewers are gone", () => {
		const viewers = new Map([
			["phone", H264_ONLY],
			["laptop", BOTH],
		]);
		expect(chooseUseH265(viewers.values())).toBe(false);
		viewers.delete("phone");
		expect(chooseUseH265(viewers.values())).toBe(true);
	});

	it("ignores a viewer that decodes neither codec", () => {
		expect(chooseUseH265([NONE])).toBe(true);
		expect(chooseUseH265([NONE, BOTH])).toBe(true);
		expect(chooseUseH265([NONE, H264_ONLY])).toBe(false);
	});

	it("defaults to H.265 with no viewer", () => {
		expect(chooseUseH265([])).toBe(true);
	});
});

describe("isCodecReport", () => {
	it("accepts the report the stream page sends", () => {
		expect(isCodecReport({ type: "codecVideo", h264: true, h265: false, av1: false })).toBe(true);
	});

	it("rejects anything else", () => {
		expect(isCodecReport({ type: "codecVideo", h264: "yes", h265: false })).toBe(false);
		expect(isCodecReport({ type: "other", h264: true, h265: true })).toBe(false);
		expect(isCodecReport(null)).toBe(false);
		expect(isCodecReport("codecVideo")).toBe(false);
	});
});
