import { describe, expect, it } from "vitest";
import { decodeVideoFrame, encodeVideoFrame, VIDEO_FRAME_HEADER_BYTES, type VideoFrame } from "./videoFrame.ts";

const BYTES = new Uint8Array([0, 1, 2, 3, 254, 255]);

// What the socket hands over: an ArrayBuffer holding exactly the frame.
function overTheWire(frame: VideoFrame): ArrayBuffer {
	const encoded = encodeVideoFrame(frame);
	return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
}

describe("video frame binary format", () => {
	it("round-trips a configuration packet", () => {
		const out = decodeVideoFrame(overTheWire({ type: "configuration", h265: true, data: BYTES }));
		expect(out).toEqual({ type: "configuration", h265: true, data: BYTES });
	});

	it("round-trips a data packet with keyframe and pts", () => {
		const frame: VideoFrame = { type: "data", h265: false, keyframe: true, pts: 123456789n, data: BYTES };
		expect(decodeVideoFrame(overTheWire(frame))).toEqual(frame);
	});

	// pts is optional in the scrcpy protocol; BigInt(undefined) used to kill the stream in the browser.
	it("keeps a missing pts missing, not 0", () => {
		const out = decodeVideoFrame(overTheWire({ type: "data", h265: true, keyframe: false, data: BYTES }));
		expect(out).toEqual({ type: "data", h265: true, keyframe: false, pts: undefined, data: BYTES });
	});

	it("keeps a pts larger than Number.MAX_SAFE_INTEGER exact", () => {
		const pts = 2n ** 62n + 7n;
		const out = decodeVideoFrame(overTheWire({ type: "data", h265: true, keyframe: false, pts, data: BYTES }));
		expect(out?.type === "data" && out.pts).toBe(pts);
	});

	it("adds only the fixed header to the codec bytes (base64 JSON added more than a third)", () => {
		const data = new Uint8Array(33_000);
		const binary = encodeVideoFrame({ type: "data", h265: true, keyframe: false, pts: 1n, data });
		expect(binary.byteLength).toBe(data.byteLength + VIDEO_FRAME_HEADER_BYTES);

		const json = JSON.stringify({
			streamId: "192.168.68.101",
			h265: true,
			type: "data",
			keyframe: false,
			pts: "1",
			data: Buffer.from(data).toString("base64"),
		});
		expect(json.length).toBeGreaterThan(data.byteLength * 1.33);
	});

	// The decoder side transfers data.buffer to a worker: it must be the codec bytes alone.
	it("gives the codec bytes their own buffer, without the header", () => {
		const out = decodeVideoFrame(overTheWire({ type: "configuration", h265: false, data: BYTES }));
		expect(out?.data.byteOffset).toBe(0);
		expect(out?.data.buffer.byteLength).toBe(BYTES.byteLength);
	});

	it("rejects a buffer shorter than the header", () => {
		expect(decodeVideoFrame(new ArrayBuffer(VIDEO_FRAME_HEADER_BYTES - 1))).toBeNull();
	});

	it("accepts an empty payload", () => {
		const out = decodeVideoFrame(overTheWire({ type: "configuration", h265: false, data: new Uint8Array(0) }));
		expect(out?.data.byteLength).toBe(0);
	});
});
