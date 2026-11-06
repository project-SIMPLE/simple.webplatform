import { getLogger } from "@logtape/logtape";
import { decodeVideoFrame } from "../common/videoFrame.ts";

const logger = getLogger(["hooks", "useVideoStreams"]);

/**
 * Turns one binary frame received on a device socket (see common/videoFrame.ts) into a
 * decoder packet. The socket carries a single device, so the caller passes its stream id.
 * Returns null (logged) for anything that is not a binary frame, so the caller can skip it.
 */
export const deserializeData = (message: unknown, streamId: string) => {
	const frame = message instanceof ArrayBuffer ? decodeVideoFrame(message) : null;
	if (frame === null) {
		logger.warn("[Scrcpy-VideoStreamManager] Ignoring a message that is not a video frame on {streamId}", {
			streamId,
		});
		return null;
	}

	if (frame.type === "configuration") {
		return { streamId, useH265: frame.h265, packet: { type: frame.type, data: frame.data } };
	}
	return {
		streamId,
		useH265: frame.h265,
		packet: { type: frame.type, keyframe: frame.keyframe, pts: frame.pts, data: frame.data },
	};
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
