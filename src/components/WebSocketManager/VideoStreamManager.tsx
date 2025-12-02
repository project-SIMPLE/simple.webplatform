import { useEffect, useState } from "react";
import PlayerScreenCanvas from "./PlayerScreenCanvas.tsx";
import {
  VideoFrameRenderer,
  WebGLVideoFrameRenderer,
  BitmapVideoFrameRenderer,
  WebCodecsVideoDecoder,
} from "@yume-chan/scrcpy-decoder-webcodecs";
import { ScrcpyMediaStreamPacket, ScrcpyVideoCodecId } from "@yume-chan/scrcpy";

const host: string = window.location.hostname;
const port: string = '8082';

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
    console.log("[SCRCPY] Using WebGLVideoFrameRenderer");
    return new WebGLVideoFrameRenderer();
  } else {
    console.warn("[SCRCPY] WebGL isn't supported... ");
  }

  console.log("[SCRCPY] Using fallback BitmapVideoFrameRenderer");
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
  const [maxElements, setMaxElements] = useState<number>(4); //dictates the amount of placeholders and streams displayed on screen
  const placeholdersNeeded = maxElements - Object.keys(canvasList).length; //represents the actual amout of place holders needed to fill the display
  const placeholders = Array.from({ length: placeholdersNeeded });
  const minElementsForGrid = 3 // if there are more elements than this amount the display will be switched to a grid display instead of a row
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
      console.log("[Scrcpy-VideoStreamManager] Restarting new ReadableStream for", deviceId);
      document.getElementById(deviceId)?.querySelector('canvas')?.remove();
    } else {
      // Create new stream
      console.log("[Scrcpy-VideoStreamManager] Create new ReadableStream for", deviceId);
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
        console.warn("[Scrcpy-VideoStreamManager] Should decode h265, but not compatible, waiting for new stream to start...");
        readableControllers.delete(deviceId);
        return;
      }

      if (supported.supported || !useH265) {
        const decoder = new WebCodecsVideoDecoder({
          codec: useH265 ? ScrcpyVideoCodecId.H265 : ScrcpyVideoCodecId.H264,
          renderer: renderer,
        });
        console.log("[Scrcpy-VideoStreamManager] Decoder for", useH265 ? "h265" : "h264", "loaded");
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
              console.error("Can't delete canvas", canvasList, e);
            }
          },
        });

        // Feed the scrcpy stream to the video decoder
        void stream.pipeTo(decoder.writable).catch((err) => {
          console.error("[Scrcpy] Error piping to decoder writable stream:", err);
        });

        return stream;
      } else {
        console.error("[Scrcpy] Error piping to decoder writable stream");
      }
    }).catch((error) => {
      console.error('Error checking H.264 configuration support:', error);
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
        console.log("[SCRCPY] Supports h264", supportH264);
      })

      // Check if h265 is supported
      await VideoDecoder.isConfigSupported({ codec: "hev1.1.60.L153.B0.0.0.0.0.0" }).then((r) => {
        supportH265 = r.supported!;
        console.log("[SCRCPY] Supports h265", supportH265);
      })

      // Check if AV1 is supported
      await VideoDecoder.isConfigSupported({ codec: "av01.0.05M.08" }).then((r) => {
        supportAv1 = r.supported!;
        console.log("[SCRCPY] Supports AV1", supportAv1);
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
          console.warn("[Scrcpy] Error piping to decoder writable stream, closing controller...");
          controller!.close();
        }
      }
    };

    socket.onclose = () => {
      console.log("[Scrcpy-VideoStreamManager] Closing readable");
    };
  }, []);

  return (

    selectedCanvas ?
      <div className="h">
        {Object.entries(canvasList).map(([key, canvas]) =>
          <PlayerScreenCanvas key={key} id={key} canvas={canvas} needsInteractivity={needsInteractivity} hideInfos />

        )}
      </div>


      :

      <div className="w-full h-full flex flex-col items-center">
        {/*↓ if there is at least one canvas, and it has been selected, show the popup */}
        {/* {activeCanvas !== null && showPopup == true ?
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-black bg-opacity-50 z-10" onClick={() => setShowPopup(false)}>
          <p className="bg-red-500"> {`canvas actif:${activeCanvas.canvas}`}</p>
          <PlayerScreenCanvas id="0" canvas={activeCanvas.canvas}></PlayerScreenCanvas>


          </div>
        : null} */}




        {/*                          this is the main container containing the canvases: if there are at least 4 elements, they are displayed in a 2 row grid, else they are displayed side by side. grow is used to ensure that the div takes as much space as possible without overflowing   */}
        <div className={`${Object.keys(canvasList).length + placeholders.length > minElementsForGrid ? "grid grid-rows-[1fr_1fr] grid-cols-[1fr_1fr] grid-flow-col h-full w-full" : "flex flex-row"} place-items-center gap-4 p-4`}>
          {Object.entries(canvasList).map(([key, canvas]) =>
            <>
              <PlayerScreenCanvas key={key} id={key} canvas={canvas} needsInteractivity={needsInteractivity} hideInfos />
            </>

          )}
          {/* {placeholders.map((_, index) => (
            <PlayerScreenCanvas isPlaceholder id={index.toString()} needsInteractivity={needsInteractivity} hideInfos /> //TODO retirer l'intéractivité et le mode plein écran des placeholder, check dans le playerscreencanvas
          ))} */}

        </div>
      </div>
  );
};

export default VideoStreamManager