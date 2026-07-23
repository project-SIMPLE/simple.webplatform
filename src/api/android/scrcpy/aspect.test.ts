import { describe, expect, it } from "vitest";
import { isInvertedAspectRatio } from "./aspect.ts";

// Regression: issue #78 ("VR Headsets stream's width and height are sometimes
// inverted"). Some Quest headsets report a portrait (width < height) stream — or
// no metadata — on first connect, rendering the view sideways. The server must
// detect that and retry with a flipped crop; non-Quest devices are never touched.
describe("isInvertedAspectRatio (issue #78)", () => {
	it("flags a Quest stream whose width is smaller than its height", () => {
		expect(isInvertedAspectRatio({ width: 1482, height: 1570 }, "Quest 3")).toBe(true);
	});

	it("treats a Quest stream with no metadata as inverted (retry needed)", () => {
		expect(isInvertedAspectRatio(undefined, "Quest 3")).toBe(true);
	});

	it("accepts a correctly-landscaped Quest stream", () => {
		expect(isInvertedAspectRatio({ width: 1570, height: 1482 }, "Quest 3")).toBe(false);
	});

	it("does not flip a square Quest stream", () => {
		expect(isInvertedAspectRatio({ width: 1500, height: 1500 }, "Quest 3")).toBe(false);
	});

	it("never corrects a non-Quest device, even when portrait or metadata-less", () => {
		expect(isInvertedAspectRatio({ width: 720, height: 1280 }, "Pixel")).toBe(false);
		expect(isInvertedAspectRatio(undefined, "emulator")).toBe(false);
	});
});
