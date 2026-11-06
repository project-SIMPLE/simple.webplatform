/**
 * Binary wire format of one scrcpy video packet on the per-device `/stream/:id` socket.
 *
 * It replaces JSON with a base64 payload: base64 made every frame a third bigger, cost three
 * copies on the server, and the browser rebuilt the bytes one JS callback per byte on its main
 * thread. Here the codec bytes travel as-is behind a fixed 9-byte header:
 *
 *   byte 0      flags  bit 0: configuration packet (unset: data packet)
 *                      bit 1: keyframe
 *                      bit 2: H.265 (unset: H.264)
 *                      bit 3: the packet has a pts
 *   bytes 1-8   pts, signed 64-bit big-endian (0 when the packet has none)
 *   bytes 9-    codec bytes, untouched
 *
 * The stream id is not repeated in each frame: every socket carries a single device's stream.
 */

export const VIDEO_FRAME_HEADER_BYTES = 9;

const FLAG_CONFIGURATION = 0b0001;
const FLAG_KEYFRAME = 0b0010;
const FLAG_H265 = 0b0100;
const FLAG_HAS_PTS = 0b1000;

export type VideoFrame =
	| { type: "configuration"; h265: boolean; data: Uint8Array }
	| { type: "data"; h265: boolean; keyframe: boolean; pts?: bigint; data: Uint8Array };

/** Packs a frame into one buffer: a single allocation and a single copy of the codec bytes. */
export function encodeVideoFrame(frame: VideoFrame): Uint8Array {
	const out = new Uint8Array(VIDEO_FRAME_HEADER_BYTES + frame.data.byteLength);
	const view = new DataView(out.buffer);

	let flags = frame.h265 ? FLAG_H265 : 0;
	if (frame.type === "configuration") {
		flags |= FLAG_CONFIGURATION;
	} else {
		if (frame.keyframe) flags |= FLAG_KEYFRAME;
		if (frame.pts !== undefined) {
			flags |= FLAG_HAS_PTS;
			view.setBigInt64(1, frame.pts);
		}
	}
	view.setUint8(0, flags);
	out.set(frame.data, VIDEO_FRAME_HEADER_BYTES);

	return out;
}

/**
 * Reads a frame back. Returns null for a buffer too short to hold the header.
 * The codec bytes are copied into their own buffer: the decoder side may transfer
 * `data.buffer` to a worker, and must not carry the header (or detach the socket's buffer).
 */
export function decodeVideoFrame(buffer: ArrayBuffer): VideoFrame | null {
	if (buffer.byteLength < VIDEO_FRAME_HEADER_BYTES) return null;

	const view = new DataView(buffer);
	const flags = view.getUint8(0);
	const h265 = (flags & FLAG_H265) !== 0;
	const data = new Uint8Array(buffer.slice(VIDEO_FRAME_HEADER_BYTES));

	if (flags & FLAG_CONFIGURATION) return { type: "configuration", h265, data };

	return {
		type: "data",
		h265,
		keyframe: (flags & FLAG_KEYFRAME) !== 0,
		pts: flags & FLAG_HAS_PTS ? view.getBigInt64(1) : undefined,
		data,
	};
}
