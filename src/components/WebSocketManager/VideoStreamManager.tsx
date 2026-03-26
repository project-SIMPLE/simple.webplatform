import { useEffect, useState, useMemo, useRef } from "react";
import PlayerScreenCanvas from "./PlayerScreenCanvas.tsx";
import { getLogger } from "@logtape/logtape";
import { ScrcpyMediaStreamPacket, ScrcpyVideoCodecId } from "@yume-chan/scrcpy";
const host: string = window.location.hostname;
const port: string = '8082';

const logger = getLogger(["components", "VideoStreamManager"]);

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
  }
};

interface VideoStreamManagerProps {
  needsInteractivity?: boolean;
  selectedCanvas?: string;
  hideInfos?: boolean; // boolean to be passed down as a prop to player screen canvas

}

// The React component
const VideoStreamManager = ({ needsInteractivity, selectedCanvas, hideInfos }: VideoStreamManagerProps) => {
  const [canvasList, setCanvasList] = useState<Record<string, HTMLCanvasElement>>({});
  const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const maxElements: number = 1 //! dictates the amount of placeholders and streams displayed on screen
  const placeholdersNeeded = maxElements - Object.keys(canvasList).length; //represents the actual amout of place holders needed to fill the display
  const placeholders = Array.from({ length: placeholdersNeeded });
  const [islimitingDimWidth, setIslimitingDimWidth] = useState<boolean>(false);
  const [isPortrait, setIsPortrait] = useState<boolean>(false)
  const [viewport, setViewport] = useState(() => ({ //used to determine optimal display type (ie portrait or landscape mode)
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [tailwindCanvasDim, setTailwindCanvasDim] = useState<[string, string]>(["", ""]);
  const [gridDisplay, setGriDisplay] = useState<boolean>(false);

  const sortedKeys = useMemo(() => {
    return Object.keys(canvasList).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );
  }, [canvasList]);


  // Tables storing data for decoding scrcpy streams
  const readableControllers = new Map<
    string,
    ReadableStreamDefaultController | undefined
  >();
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
      logger.info(" Restarting new ReadableStream for {deviceId}", { deviceId })
      document.getElementById(deviceId)?.querySelector('canvas')?.remove();
    } else {
      // Create new stream
      logger.info(" Create new ReadableStream for {deviceId}", { deviceId })
    }
    // Prepare video stream =======================

    const canvas = document.createElement("canvas");

    // Catch cases with non IP devices (USB
    const canvasId: string =
      deviceId.split(":").length > 0 ?
        deviceId.split(":")[0].split(".")[deviceId.split(".").length - 1]
        : deviceId;

    canvasRefs.current.set(deviceId, canvas);

    if (selectedCanvas && selectedCanvas === canvasId) {
      setCanvasList({ [deviceId]: canvas })
    } else if (!selectedCanvas) {
      if (deviceId in canvasList) {
        logger.warn("tried adding an already existing canvas to the list, cancelling")
      } else {
        setCanvasList(prevCanvasList => ({ ...prevCanvasList, [deviceId]: canvas }));
        logger.info("added canvas")

      }
    }

    const offscreenCanvas = canvas.transferControlToOffscreen();

    // Clean up any existing worker
    if (decoderWorkers.current.has(deviceId)) {
      decoderWorkers.current.get(deviceId)?.terminate();
      decoderWorkers.current.delete(deviceId);
    }

    // Create a new web worker to handle the stream
    const worker = new Worker(new URL("../../workers/scrcpyDecoder.ts", import.meta.url), { type: "module" });
    decoderWorkers.current.set(deviceId, worker);

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
        setCanvasList(prev => {
          const next = { ...prev };
          delete next[deviceId];
          return next;
        });
        logger.info("deleted canvas", { deviceId });
      },
    });

    if (typeof VideoDecoder === 'undefined') {
      logger.warn("[Scrcpy-VideoStreamManager] WebCodecs API (VideoDecoder) is not available in this browser, aborting stream");
      readableControllers.delete(deviceId);
      worker.terminate();
      decoderWorkers.current.delete(deviceId);
      return;
    }

    await VideoDecoder.isConfigSupported({
      // Check if h265 is supported
      codec: "hev1.1.60.L153.B0.0.0.0.0.0",
    }).then((supported) => {
      if (useH265 && !supported.supported) {
        logger.warn("[Scrcpy-VideoStreamManager] Should decode h265, but not compatible, waiting for new stream to start...");
        readableControllers.delete(deviceId);
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
        } catch (e) {
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
              type: 'direct'
            },
            [offscreenCanvas, stream]
          );
        } else {
          // Fallback for browsers that don't support transferring ReadableStream (like Safari)
          logger.info("[Scrcpy-VideoStreamManager] ReadableStream transfer not supported, using MessageChannel fallback");
          const { port1, port2 } = new MessageChannel();
          worker.postMessage(
            { codec, canvas: offscreenCanvas, port: port2, useH265, type: 'port' },
            [offscreenCanvas, port2]
          );

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
    }).catch((error) => {
      logger.error('Error checking H.264 configuration support: {error}', { error });
    });
  }



  // -------------------------------------------------------------------------------------------------------------------

  useEffect(() => {
    let cleanedUp = false;
    const deviceSockets = new Map<string, WebSocket>();

    // Opens a dedicated socket for a device at /stream/:deviceIp.
    // All packets (config then data) arrive here in order — no split-channel ordering issues.
    // Reconnects automatically after 1 s on unexpected close.
    function connectDeviceSocket(streamId: string) {
      if (cleanedUp) return;
      if (typeof VideoDecoder === 'undefined') return;

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

        // Detect codec change on every configuration packet, regardless of channel ordering.
        // The server can switch codec (h265↔h264) and restart streams; the new config packet
        // may arrive on the old device socket before stream_available fires on the control
        // socket, so we can't rely on connectDeviceSocket having run first.
        if (deserializedData!.packet.type === "configuration") {
          const knownCodec = streamIsH265.get(deserializedData!.streamId);
          if (knownCodec !== undefined && knownCodec !== deserializedData!.useH265) {
            readableControllers.delete(deserializedData!.streamId);
            isDecoderHasConfig.delete(deserializedData!.streamId);
          }
          streamIsH265.set(deserializedData!.streamId, deserializedData!.useH265);
        }

        // Create stream if new stream
        if (!readableControllers.has(deserializedData!.streamId)) {
          newVideoStream(deserializedData!.streamId, deserializedData!.useH265);
        }

        const controller = readableControllers.get(deserializedData!.streamId);

        // Since we set very early the entry before the controller exists,
        // this catch potential race conditions where controller do not exists
        if (controller != undefined) {
          // Enqueue data package to decoder stream
          if (deserializedData!.packet) {
            if (
              isDecoderHasConfig.get(deserializedData!.streamId) &&
              deserializedData!.packet.type == "data"
            ) {
              controller!.enqueue(deserializedData!.packet);
            } else if (
              deserializedData!.packet.type == "configuration"
            ) {
              controller!.enqueue(deserializedData!.packet);
              isDecoderHasConfig.set(deserializedData!.streamId, true);
            }
          } else {
            logger.warn("[Scrcpy] Error piping to decoder writable stream, closing controller...");
            controller!.close();
          }
        }
      };

      ws.onclose = () => {
        if (!cleanedUp) {
          logger.info(`[Scrcpy-VideoStreamManager] Device socket for ${streamId} closed, reconnecting in 1s...`);
          setTimeout(() => {
            // Only reconnect if this socket is still the current one for this stream.
            // If stream_available already opened a replacement socket, skip — that socket
            // is healthy and reconnecting here would tear it down unnecessarily.
            if (!cleanedUp && deviceSockets.get(streamId) === ws) {
              connectDeviceSocket(streamId);
            }
          }, 1000);
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
        setCanvasList(prev => {
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

      const socket = new WebSocket("ws://" + host + ":" + port);
      controlSocket = socket;

      // Send browser's codecs compatibility
      socket.onopen = async () => {
        let supportH264 = false, supportH265 = false, supportAv1 = false;

        if (typeof VideoDecoder === 'undefined') {
          logger.warn("[SCRCPY] WebCodecs API not available, reporting no codec support");
        } else {
          // Check if h264 is supported
          await VideoDecoder.isConfigSupported({ codec: "avc1.4D401E" }).then((r) => {
            supportH264 = r.supported!;
            logger.info("[SCRCPY] Supports h264: {supportH264}", { supportH264 });
          })

          // Check if h265 is supported
          await VideoDecoder.isConfigSupported({ codec: "hev1.1.60.L153.B0.0.0.0.0.0" }).then((r) => {
            supportH265 = r.supported!;
            logger.info("[SCRCPY] Supports h265 {supportH265}", { supportH265 });
          })

          // Check if AV1 is supported
          await VideoDecoder.isConfigSupported({ codec: "av01.0.05M.08" }).then((r) => {
            supportAv1 = r.supported!;
            logger.info("[SCRCPY] Supports AV1 {supportAv1}", { supportAv1 });
          })
        }

        socket.send(JSON.stringify({
          "type": "codecVideo",
          "h264": supportH264,
          "h265": supportH265,
          "av1": supportAv1,
        }));
      }

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
          setTimeout(connectControlSocket, 2000);
        }
      };
    }

    connectControlSocket();

    return () => {
      cleanedUp = true;
      controlSocket?.close();
      deviceSockets.forEach(ws => ws.close());
      decoderWorkers.current.forEach(worker => worker.terminate());
      decoderWorkers.current.clear();
    };
  }, []);

  useEffect(() => {
    const update = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    update(); // initial sync
    window.addEventListener("resize", update);

    return () => window.removeEventListener("resize", update);
  }, []);


  //apply style to the container, so that 1 element is displayed in fullscreen, 2 are displayed side by side, and more than that are displayed in a grid
  const amountElements = Math.max(
    maxElements,
    Object.keys(canvasList).length
  );

  const canvasContainerStyle =
    amountElements <= 3
      ? isPortrait ?
        "flex flex-col items-center justify-around"
        :
        "flex flex-row items-center justify-around"
      : isPortrait
        ? "grid grid-cols-2 auto-rows-fr grid-flow-row gap-2 place-items-center"
        : "grid grid-rows-2 auto-cols-fr grid-flow-col gap-2 place-items-center";



  useEffect(() => {
    const { width, height } = viewport;
    const portrait = height > width;
    setIsPortrait(portrait);
    let limitingWidth = portrait;
    let isGrid = false;
    const amountElements = Math.max(
      maxElements,
      Object.keys(canvasList).length
    );

    if (portrait) {
      switch (amountElements) {
        case 1:
          setTailwindCanvasDim(["w-[95dvw]", "h-[95dvw]"])
          limitingWidth = false;

          break;

        case 2:
          if (width * amountElements > height) {
            limitingWidth = true
            setTailwindCanvasDim(["w-[45dvh]", "h-[47dvh]"])
          } else {
            limitingWidth = false
            setTailwindCanvasDim(["w-[45dvw]", "h-[47dvw]"])
          }
          break;

        case 3:
          if (width * amountElements > height) {
            setTailwindCanvasDim(["w-[33dvw]", "h-[33dvw]"])
            limitingWidth = false
          } else {
            setTailwindCanvasDim(["w-[33dvh]", "h-[33dvh]"])
            limitingWidth = true
          }
          break;

        case 4:
          setTailwindCanvasDim(["w-[45dvw]", "h-[45dvw]"])
          limitingWidth = false;
          isGrid = true

          break;

        case 5:
          isGrid = true
          if (width / 2 * 3 > height) {
            limitingWidth = true;
            setTailwindCanvasDim(["w-[29dvh]", "h-[29dvh]"])
          } else {
            setTailwindCanvasDim(["w-[30dvh]", "h-[27dvh]"])
            limitingWidth = false;
          }
          break;

        case 6:
          isGrid = true
          if (width / 2 * 3 > height) {
            limitingWidth = true;
            setTailwindCanvasDim(["w-[29dvh]", "h-[29dvh]"])
          } else {
            setTailwindCanvasDim(["w-[30dvh]", "h-[27dvh]"])
            limitingWidth = false;
          }
          break;

        default:
          break;
      }

    }

    else if (!portrait) { //mode paysage
      switch (amountElements) {
        case 1:
          limitingWidth = true
          setTailwindCanvasDim(["w-[95dvh]", "h-[95dvh]"])
          break;
        case 2:
          if (height * 2 > width) {
            setTailwindCanvasDim(["w-[45dvw]", "h-[45dvw]"])
            limitingWidth = false
          } else {
            setTailwindCanvasDim(["w-[92dvh]", "h-[90dvh]"])
            limitingWidth = true

          }
          break;
        case 3:
          if (height * 3 > width) {
            setTailwindCanvasDim(["w-[35dvw]", "h-[30dvw]"])
            limitingWidth = false
          } else {
            setTailwindCanvasDim(["w-[90dvh]", "h-[90dvh]"])
            limitingWidth = true
          }
          break;
        case 4:
          isGrid = true
          limitingWidth = true
          setTailwindCanvasDim(["w-[43dvh]", "h-[46dvh]"])

          break;
        case 5:
          isGrid = true
          if (height / 2 * 3 > width) {
            limitingWidth = false
            setTailwindCanvasDim(["w-[27dvw]", "h-[27dvw]"])

          } else {
            limitingWidth = true
            setTailwindCanvasDim(["w-[43dvh]", "h-[43dvh]"])
          }
          break;
        case 6:
          isGrid = true
          if (height / 2 * 3 > width) {
            limitingWidth = false
            setTailwindCanvasDim(["w-[27dvw]", "h-[29dvw]"])
          } else {
            limitingWidth = true
            setTailwindCanvasDim(["w-[43dvh]", "h-[46dvh]"])
          }
          break;

        default:
          break;
      }


    }

    setIslimitingDimWidth(limitingWidth);
    setGriDisplay(isGrid);
  }, [viewport, canvasList, maxElements]);


  return (

    selectedCanvas ?
      <div className="w-fit">
        <p>amount of streams: {Object.keys(canvasList).length}</p>
        {Object.entries(canvasList).map(([key, canvas]) =>
          <PlayerScreenCanvas key={key} id={key} canvas={canvas} needsInteractivity={needsInteractivity} hideInfos />

        )}
      </div>

      :

      <div className="w-full h-full flex flex-col items-center">
        <div className={`${canvasContainerStyle} w-full h-full`} id="canvascontainer">
          {sortedKeys.map((key) =>

            <PlayerScreenCanvas key={key} id={key} canvas={canvasList[key]} needsInteractivity={true} hideInfos={hideInfos} isLimitingWidth={islimitingDimWidth} tailwindCanvasDim={tailwindCanvasDim} gridDisplay={gridDisplay} />

          )}
          {placeholders.map((_, index) => (
            <PlayerScreenCanvas isPlaceholder id={index.toString()} key={index} needsInteractivity={needsInteractivity} hideInfos={hideInfos} isLimitingWidth={islimitingDimWidth} tailwindCanvasDim={tailwindCanvasDim} /> //TODO retirer l'intéractivité et le mode plein écran des placeholder, check dans le playerscreencanvas
          ))}

        </div>
      </div>
  );
};

export default VideoStreamManager