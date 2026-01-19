import { useEffect, useState } from "react";
import PlayerScreenCanvas from "./PlayerScreenCanvas.tsx";
import {
  VideoFrameRenderer,
  WebGLVideoFrameRenderer,
  BitmapVideoFrameRenderer,
  WebCodecsVideoDecoder,
} from "@yume-chan/scrcpy-decoder-webcodecs";
import { configure, getConsoleSink, getLogger } from "@logtape/logtape";
import { ScrcpyMediaStreamPacket, ScrcpyVideoCodecId } from "@yume-chan/scrcpy";
const host: string = window.location.hostname;
const port: string = '8082';

await configure({
  sinks: {
    console: getConsoleSink(),
  },
  loggers: [
    { category: ["components", "VideoStreamManager"], sinks: ["console"] }
  ],
});
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

function createVideoFrameRenderer(): VideoFrameRenderer {

  if (WebGLVideoFrameRenderer.isSupported) {
    logger.debug("[SCRCPY] Using WebGLVideoFrameRenderer");
    return new WebGLVideoFrameRenderer();
  } else {
    logger.warn("[SCRCPY] WebGL isn't supported... ");
  }

  logger.debug("[SCRCPY] Using fallback BitmapVideoFrameRenderer");
  return new BitmapVideoFrameRenderer();
}

interface VideoStreamManagerProps {
  needsInteractivity?: boolean;
  selectedCanvas?: string;
  hideInfos?: boolean; // boolean to be passed down as a prop to player screen canvas

}

// The React component
const VideoStreamManager = ({ needsInteractivity, selectedCanvas, hideInfos }: VideoStreamManagerProps) => {
  const [canvasList, setCanvasList] = useState<Record<string, HTMLCanvasElement>>({});
  const maxElements: int = 6 //! dictates the amount of placeholders and streams displayed on screen
  const placeholdersNeeded = maxElements - Object.keys(canvasList).length; //represents the actual amout of place holders needed to fill the display
  const placeholders = Array.from({ length: placeholdersNeeded });
  // const [canvasContainerStyle, setCanvasContainerStyle] = useState<string>("");
  const [islimitingDimWidth, setIslimitingDimWidth] = useState<boolean>(false);
  const [isPortrait, setIsPortrait] = useState<boolean>(false)
  const [viewport, setViewport] = useState(() => ({ //used to determine optimal display type (ie portrait or landscape mode)
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [tailwindCanvasDim, setTailwindCanvasDim] = useState<[string, string]>(["", ""]);
  const [gridDisplay, setGriDisplay] = useState<boolean>(false);

  // Tables storing data for decoding scrcpy streams
  const readableControllers = new Map<
    string,
    ReadableStreamDefaultController | undefined
  >();
  const isDecoderHasConfig = new Map<string, boolean>();



  /**
   * Creates a new ReadableStream for receiving and decoding H.264 video data associated with a specific device.
   *
   * This function initializes a ReadableStream that serves as the entry point for raw H.264 video data from a given device.
   * It also sets up a TinyH264Decoder instance and pipes the ReadableStream's output to the decoder's writable stream.
   * The decoded video frames are then rendered to an element referenced by `videoContainerRef`.
   *
   * @returns A ReadableStream that can be enqueued with data stream
   */
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

    const renderer: VideoFrameRenderer = createVideoFrameRenderer();

    // get the canvas from the renderer (renderer as any is used to ensure ts knows that canvas is a property of the renderer)
    const canvas = (renderer as any).canvas as HTMLCanvasElement

    // Catch cases with non IP devices (USB
    const canvasId: string =
      deviceId.split(":").length > 0 ?
        deviceId.split(":")[0].split(".")[deviceId.split(".").length - 1]
        : deviceId;

    if (selectedCanvas && selectedCanvas === canvasId) {
      setCanvasList({ [deviceId]: canvas })
    } else if (!selectedCanvas) {
      setCanvasList(prevCanvasList => ({ ...prevCanvasList, [deviceId]: canvas }));
    }

    await VideoDecoder.isConfigSupported({
      // Check if h265 is supported
      codec: "hev1.1.60.L153.B0.0.0.0.0.0",
    }).then((supported) => {
      if (useH265 && !supported.supported) {
        // logger.warn("[Scrcpy-VideoStreamManager] Should decode h265, but not compatible, waiting for new stream to start...");
        readableControllers.delete(deviceId);
        return;
      }

      if (supported.supported || !useH265) {
        const decoder = new WebCodecsVideoDecoder({
          codec: useH265 ? ScrcpyVideoCodecId.H265 : ScrcpyVideoCodecId.H264,
          renderer: renderer,
        });
        // logger.log("[Scrcpy-VideoStreamManager] Decoder for {useH265} ? \"h265\" : \"h264\", loaded", { useH265: "h265" });
        // Create new ReadableStream used for scrcpy decoding
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
            try {
              canvasList[deviceId].remove();
            } catch (e) {
              logger.error("Can't delete canvas {canvasList}, {e}", { canvasList, e });
            }
          },
        });

        // Feed the scrcpy stream to the video decoder
        void stream.pipeTo(decoder.writable).catch((err) => {
          logger.error("[Scrcpy] Error piping to decoder writable stream: {err}", { err });
        });

        return stream;
      } else {
        logger.error("[Scrcpy] Error piping to decoder writable stream");
      }
    }).catch((error) => {
      logger.error('Error checking H.264 configuration support: {error}', { error });
    });
  }



  // -------------------------------------------------------------------------------------------------------------------

  useEffect(() => {
    // Open the WebSocket connection
    const socket = new WebSocket("ws://" + host + ":" + port);

    // Send browser's codecs compatibility
    socket.onopen = async () => {
      let supportH264: boolean, supportH265: boolean, supportAv1: boolean;

      // Check if h264 is supported
      await VideoDecoder.isConfigSupported({ codec: "avc1.4D401E" }).then((r) => {
        supportH264 = r.supported!;
        logger.info("[SCRCPY] Supports h264", supportH264);
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

      socket.send(JSON.stringify({
        "type": "codecVideo",
        // @ts-expect-error 
        "h264": supportH264,
        // @ts-expect-error 
        "h265": supportH265,
        // @ts-expect-error 
        "av1": supportAv1,
      }));
    }

    // Handle incoming WebSocket messages
    socket.onmessage = (event) => {
      // Deserialize the message and enqueue the data into the readable stream
      const deserializedData = deserializeData(event.data);

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
            // Ensure starting stream with a configuration package holding keyframe
          } else if (
            //!isDecoderHasConfig.get(deserializedData!.streamId) &&
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

    socket.onclose = () => {
      logger.info("[Scrcpy-VideoStreamManager] Closing readable");
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
          setTailwindCanvasDim(["w-[95dvh]", "h-[95dvh]"])
          limitingWidth = true;
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
        {/* <div className={`${Object.keys(canvasList).length + placeholders.length > minElementsForGrid ? "grid grid-flow-col grid-rows-2 gap-2" : "flex"} h-full w-full items-center justify-center`}> */}
        <div className={`${canvasContainerStyle} w-full h-full`} id="canvascontainer">
          {Object.entries(canvasList).map(([key, canvas]) =>  //si on est en mode portrait (donc hauteur plus grande) on affiche les éléments en colonne, sinon on les affiche en ligne

            <PlayerScreenCanvas key={key} id={key} canvas={canvas} needsInteractivity={true} hideInfos isLimitingWidth={islimitingDimWidth} tailwindCanvasDim={tailwindCanvasDim} gridDisplay={gridDisplay} />

          )}
          {placeholders.map((_, index) => (
            <PlayerScreenCanvas isPlaceholder id={index.toString()} needsInteractivity={needsInteractivity} hideInfos isLimitingWidth={islimitingDimWidth} tailwindCanvasDim={tailwindCanvasDim} /> //TODO retirer l'intéractivité et le mode plein écran des placeholder, check dans le playerscreencanvas
          ))}

        </div>
      </div>
  );
};

export default VideoStreamManager