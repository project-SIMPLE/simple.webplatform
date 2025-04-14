import { useEffect, useState } from "react";
import PlayerScreenCanvas from "./PlayerScreenCanvas.tsx";
import {
  VideoFrameRenderer,
  WebGLVideoFrameRenderer,
  BitmapVideoFrameRenderer,
  WebCodecsVideoDecoder,
} from "@yume-chan/scrcpy-decoder-webcodecs";
import { ScrcpyMediaStreamPacket, ScrcpyVideoCodecId } from "@yume-chan/scrcpy";

import { HEADSET_COLOR } from "../../api/constants.ts";

const host: string = window.location.hostname;
//const port: string = process.env.VIDEO_WS_PORT || '8082';
const port: string = '8082';



// Deserialize the data into ScrcpyMediaStreamPacket
const deserializeData = (serializedData: string) => {
  const parsed = JSON.parse(serializedData);

  switch (parsed.type) {
    case "configuration":
      return {
        streamId: parsed.streamId,
        packet: {
          type: parsed.type,
          data: Uint8Array.from(atob(parsed.data), (c) => c.charCodeAt(0)),
        },
      };
    case "data":
      return {
        streamId: parsed.streamId,
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

}

// The React component
const VideoStreamManager = ({needsInteractivity}: VideoStreamManagerProps) => {
  const [canvasList, setCanvasList] = useState<Record<string, HTMLCanvasElement>>({});
  const [maxElements, setMaxElements] = useState<number>(4);
  const placeholdersNeeded = maxElements - Object.keys(canvasList).length;
  const placeholders = Array.from({ length: placeholdersNeeded });
  const [activeCanvas, setActiveCanvas] = useState<[string, HTMLCanvasElement | undefined ]>(["",undefined])
  const [showPopup, setShowPopup] = useState<boolean>(false);
  // Tables storing data for decoding scrcpy streams
  const readableControllers = new Map<
    string,
    ReadableStreamDefaultController
  >();
  const isDecoderHasConfig = new Map<string, boolean>();


  const handleActiveCanvas = (headsetIp: string, canvas: HTMLCanvasElement) => {
    setActiveCanvas([headsetIp,canvas])
  }

  /**
   * Creates a new ReadableStream for receiving and decoding H.264 video data associated with a specific device.
   *
   * This function initializes a ReadableStream that serves as the entry point for raw H.264 video data from a given device.
   * It also sets up a TinyH264Decoder instance and pipes the ReadableStream's output to the decoder's writable stream.
   * The decoded video frames are then rendered to an element referenced by `videoContainerRef`.
   *
   * @returns A ReadableStream that can be enqueued with data stream
   */
  async function newVideoStream(deviceId: string) {

    // Wait for HTML to be available

    if (document.getElementById(deviceId)) {
      console.log("[Scrcpy-VideoStreamManager] Restarting new ReadableStream for", deviceId);
      document.getElementById(deviceId)!.remove();
    } else {
      // Create new stream
      console.log("[Scrcpy-VideoStreamManager] Create new ReadableStream for", deviceId);
    }

    // Prepare video stream =======================

    const renderer: VideoFrameRenderer = createVideoFrameRenderer();

    // get the canvas from the renderer (renderer as any is used to ensure ts knows that canvas is a property of the renderer)
    const canvas = (renderer as any ).canvas as HTMLCanvasElement
    setCanvasList(prevCanvasList => ({ ...prevCanvasList, [deviceId]: canvas }));
    console.log("canvasList:", canvasList);

    await VideoDecoder.isConfigSupported({
      // Check if h264 is supported
      codec: "avc1.4D401E",
    }).then((supported) => {
      console.log("supported", supported)
      if (supported.supported) {
        const decoder = new WebCodecsVideoDecoder({
          codec: ScrcpyVideoCodecId.H264,
          renderer: renderer,
        });
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
            canvasList[deviceId].remove();

            // Remove canvas
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

    // Handle incoming WebSocket messages
    socket.onmessage = (event) => {
      // Deserialize the message and enqueue the data into the readable stream
      const deserializedData = deserializeData(event.data);

      // Create stream if new stream
      if (!readableControllers.has(deserializedData!.streamId)) {
        newVideoStream(deserializedData!.streamId);
      }

      const controller = readableControllers.get(deserializedData!.streamId);

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
          console.log("[Scrcpy] WebSocket decoder loaded for ", deserializedData!.streamId);
          controller!.enqueue(deserializedData!.packet);
          isDecoderHasConfig.set(deserializedData!.streamId, true);
        }
      } else {
        controller!.close();
      }
    };

    socket.onclose = () => {
      console.log("[Scrcpy-VideoStreamManager] Closing readable");
    };
  }, []);

  return (
    <div className="w-full h-full flex flex-col items-center"> {/*↓ if there is at least one canvas, and it has been selected, show the popup */}
     {activeCanvas[0] !== "" && showPopup== true ?
<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10" onClick={() => setShowPopup(false)}>
 <p className="bg-red-500"> {`canvas actif:${activeCanvas[0]}`}</p>
      <PlayerScreenCanvas canvasSize="size-60"/>
    </div>
    : null} 
{/*                          this is the main container containing the canvases: if there are at least 4 elements, they are displayed in a 2 row grid, else they are displayed side by side. grow is used to ensure that the div takes as much space as possible without overflowing   */}
      <div className={`${  Object.keys(canvasList).length +placeholders.length > 4 ? "grid grid-rows-2 grid-flow-col" : "flex flex-row"} items-center justify-evenly gap-4 grow p-4`}>
        {Object.entries(canvasList).map(([key, canvas]) =>
          <PlayerScreenCanvas key={key} id={key} canvas={canvas} needsInteractivity={needsInteractivity} setActiveCanvas={handleActiveCanvas}/>
        )}
        {placeholders.map((_, index) => (
          <PlayerScreenCanvas isPlaceholder id={index.toString()} needsInteractivity={needsInteractivity} setActiveCanvas={handleActiveCanvas}/> //TODO retirer l'intéractivité et le mode plein écran des placeholder, check dans le playerscreencanvas
        ))} 

      </div>
      <div>  
        {/*//TODO remove layout test buttons*/}
       <button className="bg-green-300 w-fit" onClick={() => setMaxElements(maxElements.valueOf()+1)}>add</button>
      <button className="bg-red-300 w-fit" onClick={() => setMaxElements(maxElements.valueOf()-1)}>remove</button></div>
     </div> 
      
  );
};

export default VideoStreamManager