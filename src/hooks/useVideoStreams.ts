import { getLogger } from "@logtape/logtape";
import { type ScrcpyMediaStreamPacket, ScrcpyVideoCodecId } from "@yume-chan/scrcpy";
import { useEffect, useMemo, useRef, useState } from "react";

// `localhost` resolves to IPv6 ::1 first in most browsers, but the backend uWS video server
// binds IPv4 (0.0.0.0) only — a ::1 connection hangs. Force IPv4 loopback to match.
const host: string = window.location.hostname === "localhost" ? "127.0.0.1" : window.location.hostname;
const port: string = "8082";

const logger = getLogger(["hooks", "useVideoStreams"]);

// Deserialize the data into ScrcpyMediaStreamPacket
const deserializeData = (serializedData: string) => {
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
 * Owns the scrcpy video-streaming lifecycle: the control socket (codec negotiation +
 * stream announcements), the per-device data sockets, the decoder Web Workers, and the
 * canvas elements. Returns the live canvas map and a stable, numerically-sorted key list.
 *
 * The decoder Maps are intentionally render-local (not refs) and the lifecycle effect runs
 * once on mount, closing over the first render's Maps and newVideoStream (see the biome-ignore
 * below). Do not promote these Maps to refs — it changes teardown/reconnect timing.
 */
export const useVideoStreams = (selectedCanvas?: string) => {
	const [canvasList, setCanvasList] = useState<Record<string, HTMLCanvasElement>>({});
	const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());

	const sortedKeys = useMemo(() => {
		return Object.keys(canvasList).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
	}, [canvasList]);

	// Tables storing data for decoding scrcpy streams
	const readableControllers = new Map<string, ReadableStreamDefaultController | undefined>();
	const isDecoderHasConfig = new Map<string, boolean>();
	// Tracks the codec each decoder was created with — used to detect mid-stream codec changes
	const streamIsH265 = new Map<string, boolean>();
	// Map of worker instances for each stream
	const decoderWorkers = useRef<Map<string, Worker>>(new Map());

	async function newVideoStream(deviceId: string, useH265: boolean = false) {
		// Avoid having controller creation hell if connection is too fast
		readableControllers.set(deviceId, undefined);

		// Wait for HTML to be available

		if (document.getElementById(deviceId)) {
			logger.info(" Restarting new ReadableStream for {deviceId}", { deviceId });
			document.getElementById(deviceId)?.querySelector("canvas")?.remove();
		} else {
			// Create new stream
			logger.info(" Create new ReadableStream for {deviceId}", { deviceId });
		}
		// Prepare video stream =======================

		const canvas = document.createElement("canvas");

		// Catch cases with non IP devices (USB
		const canvasId: string =
			deviceId.split(":").length > 0 ? deviceId.split(":")[0].split(".")[deviceId.split(".").length - 1] : deviceId;

		canvasRefs.current.set(deviceId, canvas);

		if (selectedCanvas && selectedCanvas === canvasId) {
			setCanvasList({ [deviceId]: canvas });
		} else if (!selectedCanvas) {
			if (deviceId in canvasList) {
				logger.warn("tried adding an already existing canvas to the list, cancelling");
			} else {
				setCanvasList((prevCanvasList) => ({ ...prevCanvasList, [deviceId]: canvas }));
				logger.info("added canvas");
			}
		}

		const offscreenCanvas = canvas.transferControlToOffscreen();

		// Clean up any existing worker
		if (decoderWorkers.current.has(deviceId)) {
			decoderWorkers.current.get(deviceId)?.terminate();
			decoderWorkers.current.delete(deviceId);
		}

		// Create a new web worker to handle the stream
		const worker = new Worker(new URL("../workers/scrcpyDecoder.ts", import.meta.url), { type: "module" });
		decoderWorkers.current.set(deviceId, worker);

		worker.onerror = (err) => {
			logger.error("[Scrcpy-VideoStreamManager] Worker error for {deviceId}: {message}", {
				deviceId,
				message: err.message,
			});
		};
		worker.onmessage = (event) => {
			if (event.data?.type === "sizeChanged") {
				logger.debug("[Scrcpy-VideoStreamManager] Canvas resized for {deviceId}: {width}x{height}", {
					deviceId,
					width: event.data.width,
					height: event.data.height,
				});
			}
		};

		// Create the ReadableStream BEFORE the async codec check.
		// new ReadableStream() calls start() synchronously, so the real controller is placed
		// in readableControllers before this function ever suspends at the first await.
		// Without this, the first config packet arriving in onmessage would see controller=undefined
		// and be silently dropped, leaving the decoder permanently uninitialised.
		const stream = new ReadableStream<ScrcpyMediaStreamPacket>({
			start(controller) {
				readableControllers.set(deviceId, controller);

				// Create new entry for keyframe's initialisation
				isDecoderHasConfig.set(deviceId, false);
			},
			// Clean up when the stream is canceled
			cancel() {
				readableControllers.delete(deviceId);
				isDecoderHasConfig.delete(deviceId);

				// Terminate the worker
				if (decoderWorkers.current.has(deviceId)) {
					decoderWorkers.current.get(deviceId)?.terminate();
					decoderWorkers.current.delete(deviceId);
				}

				// Use the canvas already in scope — canvasList captures a stale closure
				// (React state at render time) so canvasList[deviceId] is always undefined here.
				canvas.remove();
				canvasRefs.current.delete(deviceId);
				// Remove from React state so a retry can add a fresh canvas entry.
				setCanvasList((prev) => {
					const next = { ...prev };
					delete next[deviceId];
					return next;
				});
				logger.info("deleted canvas", { deviceId });
			},
		});

		if (typeof VideoDecoder === "undefined") {
			logger.warn(
				"[Scrcpy-VideoStreamManager] WebCodecs API (VideoDecoder) is not available in this browser, aborting stream",
			);
			stream.cancel(); // closes the ReadableStream and triggers its cancel() cleanup callback
			worker.terminate();
			decoderWorkers.current.delete(deviceId);
			return;
		}

		await VideoDecoder.isConfigSupported({
			// Check if h265 is supported
			codec: "hev1.1.60.L153.B0.0.0.0.0.0",
		})
			.then((supported) => {
				if (useH265 && !supported.supported) {
					logger.warn(
						"[Scrcpy-VideoStreamManager] Should decode h265, but not compatible, waiting for new stream to start...",
					);
					stream.cancel(); // closes the ReadableStream and triggers its cancel() cleanup callback
					worker.terminate();
					decoderWorkers.current.delete(deviceId);
					return;
				}

				if (supported.supported || !useH265) {
					const codec = useH265 ? ScrcpyVideoCodecId.H265 : ScrcpyVideoCodecId.H264;

					// Check if browser supports transferring ReadableStream
					let canTransferStream = false;
					try {
						const { port1 } = new MessageChannel();
						const testStream = new ReadableStream();
						port1.postMessage(testStream, [testStream]);
						canTransferStream = true;
					} catch (_e) {
						canTransferStream = false;
					}

					if (canTransferStream) {
						// Pass objects and stream to worker directly
						worker.postMessage(
							{
								codec,
								canvas: offscreenCanvas,
								stream,
								useH265,
								type: "direct",
							},
							[offscreenCanvas, stream],
						);
					} else {
						// Fallback for browsers that don't support transferring ReadableStream (like Safari)
						logger.info(
							"[Scrcpy-VideoStreamManager] ReadableStream transfer not supported, using MessageChannel fallback",
						);
						const { port1, port2 } = new MessageChannel();
						worker.postMessage({ codec, canvas: offscreenCanvas, port: port2, useH265, type: "port" }, [
							offscreenCanvas,
							port2,
						]);

						const reader = stream.getReader();
						(async () => {
							try {
								while (true) {
									const { done, value } = await reader.read();
									if (done) {
										port1.postMessage({ done: true });
										break;
									}
									const transferables: Transferable[] = [];
									// Clone the buffer to avoid detaching it if it's needed elsewhere,
									// or just send the value. In Firefox, detaching was causing issues.
									// However, since we fallback to MessageChannel ONLY when ReadableStream transfer fails,
									// Firefox (which supports stream transfer) will use the direct path above.
									if (value?.data instanceof Uint8Array) {
										transferables.push(value.data.buffer);
									}
									port1.postMessage({ done: false, value }, transferables);
								}
							} catch {
								port1.postMessage({ done: true });
							} finally {
								port1.close();
							}
						})();
					}
				} else {
					logger.error("[Scrcpy] Error piping to decoder writable stream");
				}
			})
			.catch((error) => {
				logger.error("Error checking H.264 configuration support: {error}", { error });
			});
	}

	// -------------------------------------------------------------------------------------------------------------------

	// biome-ignore lint/correctness/useExhaustiveDependencies: effect manages the full WS lifecycle; Maps and newVideoStream are render-local by design — adding them would tear down the socket on every render
	useEffect(() => {
		let cleanedUp = false;
		const deviceSockets = new Map<string, WebSocket>();
		// Tracks pending reconnect timers so they can be cancelled if the component unmounts
		// before the delay fires — otherwise the callback would try to reconnect a dead component.
		const pendingReconnects = new Set<ReturnType<typeof setTimeout>>();

		// Opens a dedicated socket for a device at /stream/:deviceIp.
		// All packets (config then data) arrive here in order — no split-channel ordering issues.
		// Reconnects automatically after 1 s on unexpected close.
		function connectDeviceSocket(streamId: string) {
			if (cleanedUp) return;
			if (typeof VideoDecoder === "undefined") return;

			// Prevent the stale socket's onclose from firing a reconnect when we replace it
			const existing = deviceSockets.get(streamId);
			if (existing && existing.readyState < WebSocket.CLOSING) {
				existing.onmessage = null; // prevent queued messages from old socket being processed after replacement
				existing.onclose = null;
				existing.close();
				// Reset decoder state: the stream is restarting, possibly with a different codec.
				// Clearing these forces newVideoStream() to recreate the decoder on the next config packet.
				readableControllers.delete(streamId);
				isDecoderHasConfig.delete(streamId);

				// Terminate the worker
				if (decoderWorkers.current.has(streamId)) {
					decoderWorkers.current.get(streamId)?.terminate();
					decoderWorkers.current.delete(streamId);
				}
			}

			const ws = new WebSocket(`ws://${host}:${port}/stream/${streamId}`);
			deviceSockets.set(streamId, ws);

			ws.onmessage = (event) => {
				// Deserialize the message and enqueue the data into the readable stream
				const deserializedData = deserializeData(event.data);
				if (!deserializedData) return; // unknown packet type — already logged in deserializeData

				// Detect codec change on every configuration packet, regardless of channel ordering.
				// The server can switch codec (h265↔h264) and restart streams; the new config packet
				// may arrive on the old device socket before stream_available fires on the control
				// socket, so we can't rely on connectDeviceSocket having run first.
				if (deserializedData.packet.type === "configuration") {
					const knownCodec = streamIsH265.get(deserializedData.streamId);
					if (knownCodec !== undefined && knownCodec !== deserializedData.useH265) {
						readableControllers.delete(deserializedData.streamId);
						isDecoderHasConfig.delete(deserializedData.streamId);
					}
					streamIsH265.set(deserializedData.streamId, deserializedData.useH265);
				}

				// Create stream if new stream
				if (!readableControllers.has(deserializedData.streamId)) {
					newVideoStream(deserializedData.streamId, deserializedData.useH265);
				}

				const controller = readableControllers.get(deserializedData.streamId);

				// Since we set very early the entry before the controller exists,
				// this catches potential race conditions where the controller does not exist yet
				if (controller !== undefined) {
					// Enqueue data package to decoder stream
					if (deserializedData.packet) {
						if (isDecoderHasConfig.get(deserializedData.streamId) && deserializedData.packet.type === "data") {
							controller.enqueue(deserializedData.packet);
						} else if (deserializedData.packet.type === "configuration") {
							controller.enqueue(deserializedData.packet);
							isDecoderHasConfig.set(deserializedData.streamId, true);
						}
					} else {
						logger.warn("[Scrcpy] Error piping to decoder writable stream, closing controller...");
						controller.close();
					}
				}
			};

			ws.onclose = () => {
				if (!cleanedUp) {
					logger.info(`[Scrcpy-VideoStreamManager] Device socket for ${streamId} closed, reconnecting in 1s...`);
					const timerId = setTimeout(() => {
						pendingReconnects.delete(timerId);
						// Only reconnect if this socket is still the current one for this stream.
						// If stream_available already opened a replacement socket, skip — that socket
						// is healthy and reconnecting here would tear it down unnecessarily.
						if (!cleanedUp && deviceSockets.get(streamId) === ws) {
							connectDeviceSocket(streamId);
						}
					}, 1000);
					pendingReconnects.add(timerId);
				}
			};
		}

		function tearDownStream(streamId: string) {
			// Stop the device socket and suppress the auto-reconnect
			const ws = deviceSockets.get(streamId);
			if (ws) {
				ws.onclose = null;
				ws.close();
				deviceSockets.delete(streamId);
			}
			// Signal end-of-stream to the decoder pipeline
			readableControllers.get(streamId)?.close();
			readableControllers.delete(streamId);
			isDecoderHasConfig.delete(streamId);
			streamIsH265.delete(streamId);

			// Terminate the worker
			if (decoderWorkers.current.has(streamId)) {
				decoderWorkers.current.get(streamId)?.terminate();
				decoderWorkers.current.delete(streamId);
			}

			// Remove canvas from DOM and React state
			const canvas = canvasRefs.current.get(streamId);
			if (canvas) {
				canvas.remove();
				canvasRefs.current.delete(streamId);
				setCanvasList((prev) => {
					const next = { ...prev };
					delete next[streamId];
					return next;
				});
			}
		}

		// Control socket: codec negotiation (client→server) + stream announcements (server→client)
		let controlSocket: WebSocket | null = null;

		function connectControlSocket() {
			if (cleanedUp) return;

			const socket = new WebSocket(`ws://${host}:${port}`);
			controlSocket = socket;

			// Send browser's codecs compatibility
			socket.onopen = async () => {
				let supportH264 = false,
					supportH265 = false,
					supportAv1 = false;

				if (typeof VideoDecoder === "undefined") {
					logger.warn("[SCRCPY] WebCodecs API not available, reporting no codec support");
				} else {
					// Check if h264 is supported
					await VideoDecoder.isConfigSupported({ codec: "avc1.4D401E" }).then((r) => {
						supportH264 = r.supported!;
						logger.info("[SCRCPY] Supports h264: {supportH264}", { supportH264 });
					});

					// Check if h265 is supported
					await VideoDecoder.isConfigSupported({ codec: "hev1.1.60.L153.B0.0.0.0.0.0" }).then((r) => {
						supportH265 = r.supported!;
						logger.info("[SCRCPY] Supports h265 {supportH265}", { supportH265 });
					});

					// Check if AV1 is supported
					await VideoDecoder.isConfigSupported({ codec: "av01.0.05M.08" }).then((r) => {
						supportAv1 = r.supported!;
						logger.info("[SCRCPY] Supports AV1 {supportAv1}", { supportAv1 });
					});
				}

				socket.send(
					JSON.stringify({
						type: "codecVideo",
						h264: supportH264,
						h265: supportH265,
						av1: supportAv1,
					}),
				);
			};

			// Handle stream announcements — open/close dedicated sockets per device
			socket.onmessage = (event) => {
				const data = JSON.parse(event.data);
				if (data.type === "stream_available") {
					logger.info(`[Scrcpy-VideoStreamManager] Stream available: ${data.streamId}`);
					connectDeviceSocket(data.streamId);
				} else if (data.type === "stream_ended") {
					logger.info(`[Scrcpy-VideoStreamManager] Stream ended: ${data.streamId}`);
					tearDownStream(data.streamId);
				} else if (data.type === "stream_list") {
					logger.info(`[Scrcpy-VideoStreamManager] Stream list received: ${data.streamIds}`);
					const activeIds = new Set<string>(data.streamIds);
					// Reconnect device sockets for all live streams (idempotent — connectDeviceSocket skips healthy sockets)
					for (const id of activeIds) {
						connectDeviceSocket(id);
					}
					// Tear down any canvases for streams that are no longer active
					for (const id of canvasRefs.current.keys()) {
						if (!activeIds.has(id)) {
							tearDownStream(id);
						}
					}
				}
			};

			socket.onclose = () => {
				logger.info("[Scrcpy-VideoStreamManager] Control socket closed, reconnecting in 2s...");
				if (!cleanedUp) {
					const timerId = setTimeout(() => {
						pendingReconnects.delete(timerId);
						connectControlSocket();
					}, 2000);
					pendingReconnects.add(timerId);
				}
			};
		}

		connectControlSocket();

		return () => {
			cleanedUp = true;
			pendingReconnects.forEach((id) => {
				clearTimeout(id);
			});
			pendingReconnects.clear();
			controlSocket?.close();
			deviceSockets.forEach((ws) => {
				ws.close();
			});
			decoderWorkers.current.forEach((worker) => {
				worker.terminate();
			});
			decoderWorkers.current.clear();
		};
	}, []);

	return { canvasList, sortedKeys };
};
