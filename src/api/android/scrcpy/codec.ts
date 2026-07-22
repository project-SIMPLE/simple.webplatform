/**
 * Codec negotiation for the scrcpy video stream.
 *
 * The server starts optimistic (h265) and performs a ONE-WAY downgrade to h264
 * the moment any streaming client reports it cannot decode h265 (e.g. Safari —
 * issue #133). It never upgrades back to h265, since that would break
 * already-connected h264-only clients mid-session (issue #69).
 */
export interface ClientCodecSupport {
	h264: boolean;
	h265: boolean;
	av1?: boolean;
}

/**
 * Given the server's current codec choice and a client's advertised capabilities,
 * return the codec the server should use going forward.
 *
 * @param current  the server's current `useH265` value
 * @param caps     the codecs the reporting client can decode
 * @returns the new `useH265` value (true = h265, false = h264)
 */
export function nextUseH265(current: boolean, caps: ClientCodecSupport): boolean {
	// No compatible codec at all: keep the current choice (the caller logs fatal).
	if (!caps.h265 && !caps.h264) return current;
	// Client can't decode h265: downgrade permanently.
	if (!caps.h265) return false;
	// Client supports h265: never upgrade back from a prior downgrade.
	return current;
}
