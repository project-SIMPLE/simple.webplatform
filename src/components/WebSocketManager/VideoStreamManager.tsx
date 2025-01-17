import React, { useEffect } from "react";

import {
  VideoFrameRenderer,
  WebGLVideoFrameRenderer,
  BitmapVideoFrameRenderer,
  WebCodecsVideoDecoder,
} from "@yume-chan/scrcpy-decoder-webcodecs";
import { ScrcpyMediaStreamPacket, ScrcpyVideoCodecId } from "@yume-chan/scrcpy";

import {HEADSET_COLOR} from "../../api/constants.ts";

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

interface VideoStreamManagerProps {
  targetRef: React.RefObject<HTMLDivElement>;
}

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

// The React component
const VideoStreamManager: React.FC<VideoStreamManagerProps> = ({targetRef}) => {

  // Tables storing data for decoding scrcpy streams
  const readableControllers = new Map<
    string,
    ReadableStreamDefaultController
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
  async function newVideoStream(deviceId: string) {

    // Wait for HTML to be available
    while (!targetRef.current){
      await new Promise( resolve => setTimeout(resolve, 1) );
    }

    if (document.getElementById(deviceId)){
      console.log("[Scrcpy] Restarting new RedableStream for", deviceId);
      document.getElementById(deviceId)!.remove();
    } else {
      // Create new stream
      console.log("[Scrcpy] Create new ReadableStream for", deviceId);
    }

    // Prepare video stream =======================

    const renderer: VideoFrameRenderer = createVideoFrameRenderer();

    // Create HTML wrapper to stylize the video stream
    const wrapper: HTMLDivElement = document.createElement('div');
    wrapper.classList.add(...["m-4", "p-2", "rounded-md"]);
    wrapper.id = deviceId;

    // Add background color
    const ipIdentifier: string = deviceId.split(":")[0].split(".")[deviceId.split(".").length -1];
    if (ipIdentifier in HEADSET_COLOR) {
      // @ts-ignore
      wrapper.classList.add(...[`bg-${HEADSET_COLOR[ipIdentifier]}-500`]);
    } else {
      wrapper.classList.add(...["bg-white-500", "border-4", "border-slate-300"]);
    }

    // @ts-ignore
    wrapper.appendChild(renderer.canvas as HTMLCanvasElement);

    // Add to final page
    targetRef.current.appendChild(wrapper);

    await VideoDecoder.isConfigSupported({
      // Check if h264 is supported
      codec: "avc1.4D401E",
    }).then((supported) => {
      if (supported.supported) {
        const decoder = new WebCodecsVideoDecoder({
          codec:  ScrcpyVideoCodecId.H264,
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

            // Remove canvas
            wrapper.parentNode!.removeChild(wrapper);
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
      const deserializedData = deserializeData( event.data );

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
          console.log("[Scrcpy] WebSocket decoder loaded for ", deserializedData!.streamId );
          controller!.enqueue(deserializedData!.packet);
          isDecoderHasConfig.set(deserializedData!.streamId, true);
        }
      } else {
        controller!.close();
      }
    };

    socket.onclose = () => {
      console.log("[Scrcpy] Closing readable");
    };
  }, []);

  return null;
};

export default VideoStreamManager;
