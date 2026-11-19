/**
 * Codec negotiation for the scrcpy video stream.
 *
 * Every headset streams in one codec, chosen for all the viewers at once (the browser pages that
 * report what they can decode). H.265 is used while every viewer can decode it; one viewer that
 * can't (e.g. Safari, issue #133) moves every stream to H.264, and once no such viewer is left the
 * streams go back to H.265. Upgrading never happens while an H.264-only viewer is still
 * connected, which is what issue #69 broke.
 */
export interface ClientCodecSupport {
	h264: boolean;
	h265: boolean;
	av1?: boolean;
}

/**
 * The codec the streams should use for these viewer reports: true (H.265) unless a viewer that
 * can decode something can't decode H.265. A viewer that supports neither codec can't be served
 * whatever the choice, so it doesn't count. No reports at all: H.265, the optimistic default.
 */
export function chooseUseH265(reports: Iterable<ClientCodecSupport>): boolean {
	for (const report of reports) {
		if ((report.h264 || report.h265) && !report.h265) return false;
	}
	return true;
}

/** True when a decoded control message is a viewer's codec report. */
export function isCodecReport(message: unknown): message is ClientCodecSupport & { type: "codecVideo" } {
	if (typeof message !== "object" || message === null) return false;
	const { type, h264, h265 } = message as Record<string, unknown>;
	return type === "codecVideo" && typeof h264 === "boolean" && typeof h265 === "boolean";
}
