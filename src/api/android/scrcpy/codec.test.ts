import { describe, expect, it } from "vitest";
import { nextUseH265 } from "./codec.ts";

// Regression: issues #69 ("Front end selection of video codec does not work
// correctly") and #133 ("Streams are not rendered correctly on Safari").
// The server starts optimistic (h265) and must downgrade — one way only — to
// h264 as soon as a client (e.g. Safari) reports it cannot decode h265, and must
// never upgrade back once downgraded, or already-connected h264-only clients break.
describe("nextUseH265 codec negotiation", () => {
	it("stays on h265 when a client supports h265", () => {
		expect(nextUseH265(true, { h264: true, h265: true })).toBe(true);
		expect(nextUseH265(true, { h264: false, h265: true })).toBe(true);
	});

	it("downgrades to h264 when a client cannot decode h265 (Safari — issue #133)", () => {
		expect(nextUseH265(true, { h264: true, h265: false })).toBe(false);
	});

	it("never upgrades back to h265 after a downgrade (issue #69)", () => {
		// Already downgraded; a later h265-capable client must not flip it back.
		expect(nextUseH265(false, { h264: true, h265: true })).toBe(false);
		// Nor does another h264-only client change anything.
		expect(nextUseH265(false, { h264: true, h265: false })).toBe(false);
	});

	it("keeps the current codec when a client supports no compatible codec", () => {
		// The caller logs fatal; the negotiated codec is left untouched either way.
		expect(nextUseH265(true, { h264: false, h265: false })).toBe(true);
		expect(nextUseH265(false, { h264: false, h265: false })).toBe(false);
	});
});
