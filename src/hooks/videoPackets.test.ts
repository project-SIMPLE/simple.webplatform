import { describe, expect, it } from "vitest";
import { encodeVideoFrame, type VideoFrame } from "../common/videoFrame.ts";
import { deserializeData, sortStreamKeys } from "./videoPackets.ts";

const BYTES = [0, 1, 2, 3];

// What the browser receives with binaryType = "arraybuffer"
function wire(frame: VideoFrame): ArrayBuffer {
	const encoded = encodeVideoFrame(frame);
	return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
}

describe("deserializeData", () => {
	it("parses a configuration packet, tagging it with the socket's stream id", () => {
		const out = deserializeData(
			wire({ type: "configuration", h265: true, data: new Uint8Array(BYTES) }),
			"192.168.0.10",
		);
		expect(out).not.toBeNull();
		expect(out?.streamId).toBe("192.168.0.10");
		expect(out?.useH265).toBe(true);
		expect(out?.packet.type).toBe("configuration");
		expect(Array.from(out?.packet.data as Uint8Array)).toEqual(BYTES);
	});

	it("parses a data packet with keyframe flag and BigInt pts", () => {
		const out = deserializeData(
			wire({ type: "data", h265: false, keyframe: true, pts: 123456789n, data: new Uint8Array(BYTES) }),
			"10.0.0.5",
		);
		expect(out).not.toBeNull();
		if (out === null) return;
		expect(out.useH265).toBe(false);
		const packet = out.packet as { type: string; keyframe: boolean; pts: bigint; data: Uint8Array };
		expect(packet.type).toBe("data");
		// pts stays a BigInt so large timestamps don't lose precision.
		expect(packet.pts).toBe(123456789n);
		expect(packet.keyframe).toBe(true);
		expect(Array.from(packet.data)).toEqual(BYTES);
	});

	// pts is optional in the scrcpy protocol. BigInt(undefined) used to throw, killing the stream.
	it("parses a data packet that carries no pts", () => {
		const out = deserializeData(
			wire({ type: "data", h265: true, keyframe: false, data: new Uint8Array(BYTES) }),
			"10.0.0.5",
		);
		const packet = out?.packet as { type: string; pts?: bigint; data: Uint8Array };
		expect(packet.type).toBe("data");
		expect(packet.pts).toBeUndefined();
		expect(Array.from(packet.data)).toEqual(BYTES);
	});

	it("returns null for a text message (e.g. the former JSON format)", () => {
		expect(deserializeData(JSON.stringify({ type: "data", data: "AAECAw==" }), "x")).toBeNull();
	});

	it("returns null for a buffer too short to be a frame", () => {
		expect(deserializeData(new ArrayBuffer(3), "x")).toBeNull();
	});
});

// Regression: issue #102 ("VR stream displays are randomized each time the page
// is reloaded"). The display order must be a deterministic numeric sort of the
// device keys, not insertion order.
describe("sortStreamKeys (issue #102)", () => {
	it("orders keys numerically, not lexicographically ('10' after '2')", () => {
		expect(sortStreamKeys(["10", "2", "1"])).toEqual(["1", "2", "10"]);
	});

	it("produces the same order regardless of input order (stable across reloads)", () => {
		const a = sortStreamKeys(["192.168.0.11", "192.168.0.2", "192.168.0.100"]);
		const b = sortStreamKeys(["192.168.0.100", "192.168.0.11", "192.168.0.2"]);
		expect(a).toEqual(b);
		expect(a).toEqual(["192.168.0.2", "192.168.0.11", "192.168.0.100"]);
	});

	it("does not mutate the input array", () => {
		const input = ["3", "1", "2"];
		sortStreamKeys(input);
		expect(input).toEqual(["3", "1", "2"]);
	});
});
