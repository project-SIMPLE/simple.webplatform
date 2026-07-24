import { getLogger } from "@logtape/logtape";

const logger = getLogger(["hooks", "useVideoStreams"]);

/**
 * Deserialize a scrcpy stream frame (a JSON string received over the device
 * socket) into a decoder packet. Base64 payloads are decoded to Uint8Array and
 * the presentation timestamp is parsed to BigInt. Returns null for unknown
 * packet types (logged) so the caller can safely skip them.
 */
export const deserializeData = (serializedData: string) => {
	const parsed = JSON.parse(serializedData);

	switch (parsed.type) {
		case "configuration":
			return {
				streamId: parsed.streamId,
				useH265: parsed.h265,
				packet: {
					type: parsed.type,
					data: Uint8Array.from(atob(parsed.data), (c) => c.charCodeAt(0)),
				},
			};
		case "data":
			return {
				streamId: parsed.streamId,
				useH265: parsed.h265,
				packet: {
					type: parsed.type,
					keyframe: parsed.keyframe,
					pts: BigInt(parsed.pts),
					data: Uint8Array.from(atob(parsed.data), (c) => c.charCodeAt(0)),
				},
			};
		default:
			logger.warn("[Scrcpy-VideoStreamManager] Unknown packet type received: {type}", { type: parsed.type });
			return null;
	}
};

/**
 * Stable, numeric ordering of stream/canvas keys.
 *
 * Issue #102: VR stream displays were randomized on each reload because they
 * followed insertion order. Sorting by the device key with numeric collation
 * gives a deterministic order that survives reloads (and orders "10" after "2").
 */
export function sortStreamKeys(keys: string[]): string[] {
	return [...keys].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
