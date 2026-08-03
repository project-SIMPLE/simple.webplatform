import { describe, expect, it } from "vitest";
import { deserializeData, sortStreamKeys } from "./videoPackets.ts";

// atob("AAECAw==") -> bytes 0,1,2,3
const B64 = "AAECAw==";
const BYTES = [0, 1, 2, 3];

describe("deserializeData", () => {
	it("parses a configuration packet, decoding the base64 payload", () => {
		const out = deserializeData(
			JSON.stringify({ type: "configuration", streamId: "192.168.0.10", h265: true, data: B64 }),
		);
		expect(out).not.toBeNull();
		expect(out?.streamId).toBe("192.168.0.10");
		expect(out?.useH265).toBe(true);
		expect(out?.packet.type).toBe("configuration");
		expect(Array.from(out?.packet.data as Uint8Array)).toEqual(BYTES);
	});

	it("parses a data packet with keyframe flag and BigInt pts", () => {
		const out = deserializeData(
			JSON.stringify({ type: "data", streamId: "10.0.0.5", h265: false, keyframe: true, pts: "123456789", data: B64 }),
		);
		expect(out).not.toBeNull();
		if (out === null) return;
		expect(out.useH265).toBe(false);
		const packet = out.packet as { type: string; keyframe: boolean; pts: bigint; data: Uint8Array };
		expect(packet.type).toBe("data");
		// pts is decoded as a BigInt so large timestamps don't lose precision.
		expect(packet.pts).toBe(123456789n);
		expect(packet.keyframe).toBe(true);
		expect(Array.from(packet.data)).toEqual(BYTES);
	});

	it("returns null for an unknown packet type", () => {
		expect(deserializeData(JSON.stringify({ type: "mystery", streamId: "x" }))).toBeNull();
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
