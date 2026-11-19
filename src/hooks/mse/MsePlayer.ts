import { getLogger } from "@logtape/logtape";
import type { ScrcpyVideoStreamPacket } from "@yume-chan/scrcpy";
import { annexBToMp4Sample, type VideoCodec } from "./annexB.ts";
import { buildInitSegment, buildMediaSegment, codecString, TIMESCALE, type TrackConfig } from "./fmp4.ts";
import { parseTrackConfig, sameParameterSets } from "./trackConfig.ts";

/**
 * Plays a scrcpy H.264 or H.265 stream in a `<video>` element through Media Source Extensions (MSE).
 *
 * This is the fallback for pages that are not a secure context (opened by LAN IP over plain
 * HTTP, e.g. from an iPad): WebCodecs (`VideoDecoder`) only exists in secure contexts, MSE does
 * not have that restriction. Each scrcpy packet is remuxed into one fragmented MP4 segment
 * (no re-encoding) and appended to the SourceBuffer; the browser decodes it in hardware.
 *
 * Live playback: segments are laid on a continuous synthetic timeline (each frame lasts as long
 * as the gap since the previous one), so there are no holes to stall on. A periodic check keeps
 * the playhead close to the live edge, restarts playback the browser paused (a `<video>` taken
 * out of the document is paused, e.g. when the stream popup closes) and evicts played data.
 *
 * H.265 goes in an `hvc1` track (parameter sets only in `hvcC`). The page reports which codecs
 * MSE can play, and the server falls back to H.264 when any viewer can't play H.265.
 */

const logger = getLogger(["hooks", "mse", "MsePlayer"]);

/**
 * Types probed to report codec support: H.264 Main level 3.0, and H.265 Main level 5.1, which
 * covers the ~1570x1482 Quest stream (level 5 territory).
 */
const PROBE_TYPES: Record<VideoCodec, string> = {
	h264: 'video/mp4; codecs="avc1.4D401E"',
	h265: 'video/mp4; codecs="hvc1.1.6.L153.B0"',
};

// Frame duration bounds, in TIMESCALE ticks
const DEFAULT_FRAME_DURATION = TIMESCALE / 30;
const MIN_FRAME_DURATION = TIMESCALE / 240;
const MAX_FRAME_DURATION = TIMESCALE / 10;

const TICK_INTERVAL_MS = 250;
// Lag (s) behind the live edge before speeding up, and before jumping straight to it
const CATCH_UP_LAG_S = 0.3;
const JUMP_LAG_S = 1.0;
const JUMP_TARGET_LAG_S = 0.05;
// Played data kept in the SourceBuffer (s)
const KEEP_BEHIND_S = 5;
const EVICT_AFTER_S = 15;
// Segments waiting for the SourceBuffer before the backlog is dropped (about 4 s at 30 fps)
const MAX_PENDING_SEGMENTS = 120;

interface MediaSourceConstructor {
	new (): MediaSource;
	isTypeSupported(type: string): boolean;
}

/** Classic MediaSource first; ManagedMediaSource is the only one exposed on iPhone (iOS 17.1+). */
function getMediaSource(): { ctor: MediaSourceConstructor; managed: boolean } | undefined {
	if (typeof window === "undefined") return undefined;
	const w = window as unknown as { MediaSource?: MediaSourceConstructor; ManagedMediaSource?: MediaSourceConstructor };
	if (w.MediaSource) return { ctor: w.MediaSource, managed: false };
	if (w.ManagedMediaSource) return { ctor: w.ManagedMediaSource, managed: true };
	return undefined;
}

/** True when this browser can play this codec through MSE. */
export function isMseSupported(codec: VideoCodec): boolean {
	const mediaSource = getMediaSource();
	if (!mediaSource) return false;
	try {
		return mediaSource.ctor.isTypeSupported(PROBE_TYPES[codec]);
	} catch {
		return false;
	}
}

interface PendingSegment {
	init: boolean;
	data: Uint8Array;
	/** Init segments only: the codec string they describe */
	codec?: string;
}

export class MsePlayer {
	readonly video: HTMLVideoElement;
	readonly codec: VideoCodec;

	readonly #mediaSource: MediaSource;
	readonly #objectUrl: string;
	readonly #timer: ReturnType<typeof setInterval>;
	#sourceBuffer: SourceBuffer | undefined;
	// Codec the SourceBuffer currently expects
	#bufferCodec: string | undefined;
	#disposed = false;

	#config: TrackConfig | undefined;
	#pending: PendingSegment[] = [];
	#waitingForKeyframe = true;

	#sequenceNumber = 1;
	#decodeTime = 0;
	#lastPts: bigint | undefined;
	#frameDuration = DEFAULT_FRAME_DURATION;

	/** The codec is fixed: the stream is recreated when the server switches codec. */
	constructor(codec: VideoCodec) {
		const mediaSource = getMediaSource();
		if (!mediaSource) throw new Error("Media Source Extensions are not available");
		this.codec = codec;

		const video = document.createElement("video");
		// iOS only autoplays muted inline video
		video.muted = true;
		video.defaultMuted = true;
		video.playsInline = true;
		video.autoplay = true;
		video.setAttribute("muted", "");
		video.setAttribute("playsinline", "");
		// Required by ManagedMediaSource (no AirPlay alternative source), harmless otherwise
		video.disableRemotePlayback = true;
		// Let clicks reach the tile button around the video
		video.style.pointerEvents = "none";
		this.video = video;

		this.#mediaSource = new mediaSource.ctor();
		this.#mediaSource.addEventListener("sourceopen", this.#onSourceOpen);
		this.#objectUrl = URL.createObjectURL(this.#mediaSource);
		video.src = this.#objectUrl;

		this.#timer = setInterval(this.#tick, TICK_INTERVAL_MS);
	}

	/** Feeds one scrcpy packet. Never throws: a bad packet is logged and skipped. */
	write(packet: ScrcpyVideoStreamPacket): void {
		if (this.#disposed) return;
		try {
			if (packet.type === "configuration") {
				this.#configure(packet.data);
			} else if (packet.type === "data") {
				this.#pushFrame(packet.data, packet.keyframe === true, packet.pts);
			}
		} catch (error) {
			logger.warn("Skipping a video packet that could not be remuxed: {error}", { error });
		}
	}

	dispose(): void {
		if (this.#disposed) return;
		this.#disposed = true;
		clearInterval(this.#timer);
		this.#pending = [];
		this.#mediaSource.removeEventListener("sourceopen", this.#onSourceOpen);
		this.#sourceBuffer?.removeEventListener("updateend", this.#pump);
		this.video.pause();
		this.video.removeAttribute("src");
		this.video.load();
		this.video.remove();
		URL.revokeObjectURL(this.#objectUrl);
	}

	// --- Packets --------------------------------------------------------------------------------

	#configure(annexB: Uint8Array): void {
		const config = parseTrackConfig(this.codec, annexB);
		if (!config) {
			logger.warn("Configuration packet without its {codec} parameter sets, ignoring it", { codec: this.codec });
			return;
		}

		// The server resends the same configuration for every new viewer and keyframe request
		if (this.#config && sameParameterSets(this.#config, config)) return;

		this.#config = config;
		const codec = codecString(config);
		logger.info("Configured {codec} {width}x{height}", { codec, width: config.width, height: config.height });

		// Decoding restarts at the next keyframe with the new parameters
		this.#waitingForKeyframe = true;
		this.#pending = this.#pending.filter((segment) => !segment.init);
		this.#pending.push({ init: true, data: buildInitSegment(config), codec });
		this.#ensureSourceBuffer();
		this.#pump();
	}

	#pushFrame(annexB: Uint8Array, keyframe: boolean, pts: bigint | undefined): void {
		if (!this.#config) return;
		if (this.#waitingForKeyframe && !keyframe) return;

		const sample = annexBToMp4Sample(annexB, this.codec);
		if (!sample) return;

		// Estimate this frame's duration from the gap since the previous frame (scrcpy pts are in µs)
		if (pts !== undefined && this.#lastPts !== undefined) {
			const gap = (Number(pts - this.#lastPts) * TIMESCALE) / 1_000_000;
			if (Number.isFinite(gap) && gap > 0) {
				this.#frameDuration = Math.round(Math.min(MAX_FRAME_DURATION, Math.max(MIN_FRAME_DURATION, gap)));
			}
		}
		this.#lastPts = pts;

		if (this.#pending.length >= MAX_PENDING_SEGMENTS) {
			// The SourceBuffer can't keep up: drop the backlog and restart from a keyframe
			logger.warn("Video backlog too long, dropping it until the next keyframe");
			this.#pending = this.#pending.filter((segment) => segment.init);
			this.#waitingForKeyframe = true;
			if (!keyframe) return;
		}
		this.#waitingForKeyframe = false;

		const segment = buildMediaSegment(this.#sequenceNumber, this.#decodeTime, [
			{ data: sample, duration: this.#frameDuration, keyframe },
		]);
		this.#sequenceNumber += 1;
		this.#decodeTime += this.#frameDuration;

		this.#pending.push({ init: false, data: segment });
		this.#pump();
	}

	// --- SourceBuffer ---------------------------------------------------------------------------

	readonly #onSourceOpen = () => {
		this.#ensureSourceBuffer();
		this.#pump();
	};

	#ensureSourceBuffer(): void {
		if (this.#sourceBuffer || this.#disposed || !this.#config) return;
		if (this.#mediaSource.readyState !== "open") return;

		const codec = codecString(this.#config);
		const type = `video/mp4; codecs="${codec}"`;
		try {
			this.#sourceBuffer = this.#mediaSource.addSourceBuffer(type);
		} catch (error) {
			logger.error("This browser can't play {type} through MSE: {error}", { type, error });
			return;
		}
		this.#bufferCodec = codec;
		this.#sourceBuffer.addEventListener("updateend", this.#pump);
	}

	readonly #pump = () => {
		const sourceBuffer = this.#sourceBuffer;
		if (this.#disposed || !sourceBuffer || sourceBuffer.updating || this.#pending.length === 0) return;
		if (this.#mediaSource.readyState !== "open") return;

		// Append everything queued in one call: an init segment always goes on its own
		let count = 0;
		if (this.#pending[0].init) {
			count = 1;
		} else {
			while (count < this.#pending.length && !this.#pending[count].init) count += 1;
		}
		const batch = this.#pending.splice(0, count);
		const data = batch.length === 1 ? batch[0].data : concatSegments(batch);

		try {
			// A new profile/level mid-stream: tell the SourceBuffer before its init segment
			const codec = batch[0].codec;
			if (codec && codec !== this.#bufferCodec && typeof sourceBuffer.changeType === "function") {
				sourceBuffer.changeType(`video/mp4; codecs="${codec}"`);
				this.#bufferCodec = codec;
			}

			// Cast: TypeScript's lib types reject a Uint8Array backed by an ArrayBufferLike
			sourceBuffer.appendBuffer(data as Uint8Array<ArrayBuffer>);
		} catch (error) {
			if (error instanceof DOMException && error.name === "QuotaExceededError") {
				// Buffer full: drop what was played and restart from the next keyframe
				logger.warn("SourceBuffer full, evicting played video");
				this.#evictAll();
				this.#pending = this.#pending.filter((segment) => segment.init);
				if (batch[0].init) this.#pending.unshift(batch[0]);
				this.#waitingForKeyframe = true;
			} else {
				logger.error("Could not append video to the SourceBuffer: {error}", { error });
			}
		}
	};

	// --- Live playback --------------------------------------------------------------------------

	readonly #tick = () => {
		const sourceBuffer = this.#sourceBuffer;
		if (this.#disposed || !sourceBuffer) return;

		let buffered: TimeRanges;
		try {
			buffered = sourceBuffer.buffered;
		} catch {
			return; // the SourceBuffer was removed from its MediaSource
		}
		if (buffered.length === 0) return;

		const video = this.video;
		const start = buffered.start(buffered.length - 1);
		const end = buffered.end(buffered.length - 1);
		const lag = end - video.currentTime;

		if (video.currentTime < start || lag > JUMP_LAG_S) {
			// Before the buffered range (first frames, or after a gap) or far behind: jump to the edge
			video.currentTime = Math.max(start, end - JUMP_TARGET_LAG_S);
			video.playbackRate = 1;
		} else {
			video.playbackRate = lag > CATCH_UP_LAG_S ? 1.1 : 1;
		}

		if (video.paused && video.isConnected) {
			video.play().catch(() => {
				// Autoplay refused, or interrupted by the element leaving the document: the next tick retries
			});
		}

		if (video.currentTime - buffered.start(0) > EVICT_AFTER_S) {
			this.#evict(video.currentTime - KEEP_BEHIND_S);
		}
	};

	/** Removes buffered video before `until` (seconds). */
	#evict(until: number): void {
		const sourceBuffer = this.#sourceBuffer;
		if (!sourceBuffer || sourceBuffer.updating || until <= 0) return;
		try {
			sourceBuffer.remove(0, until);
		} catch (error) {
			logger.debug("Could not evict buffered video: {error}", { error });
		}
	}

	#evictAll(): void {
		try {
			const buffered = this.#sourceBuffer?.buffered;
			if (buffered && buffered.length > 0) this.#evict(buffered.end(buffered.length - 1));
		} catch {
			// the SourceBuffer was removed from its MediaSource
		}
	}
}

function concatSegments(segments: PendingSegment[]): Uint8Array {
	let size = 0;
	for (const segment of segments) size += segment.data.length;
	const out = new Uint8Array(size);
	let offset = 0;
	for (const segment of segments) {
		out.set(segment.data, offset);
		offset += segment.data.length;
	}
	return out;
}
