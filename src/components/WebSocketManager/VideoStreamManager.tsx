import React, { useEffect } from "react";

import { TinyH264Decoder } from "@yume-chan/scrcpy-decoder-tinyh264";

import {
  VideoFrameRenderer,
  InsertableStreamVideoFrameRenderer,
  WebGLVideoFrameRenderer,
  BitmapVideoFrameRenderer,
  WebCodecsVideoDecoder,
} from "@yume-chan/scrcpy-decoder-webcodecs";
import { ScrcpyMediaStreamPacket, ScrcpyVideoCodecId } from "@yume-chan/scrcpy";

import {HEADSET_COLOR} from "../../api/constants.ts";
import {ScrcpyVideoStreamMetadata} from "@yume-chan/scrcpy/src/base/video.ts";

const host = window.location.hostname;
//const port = process.env.VIDEO_WS_PORT || '8082';
const port = "8082";

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

function createVideoFrameRenderer(): {
  renderer: VideoFrameRenderer;
  element: HTMLCanvasElement;
} {
  if (WebGLVideoFrameRenderer.isSupported) {
    console.log("[SCRCPY] Using WebGLVideoFrameRenderer");
    const renderer = new WebGLVideoFrameRenderer();
    return { renderer, element: renderer.canvas as HTMLCanvasElement };
  } else {
    console.warn("[SCRCPY] WebGL isn't supported... ");
  }

  console.log("[SCRCPY] Using fallback BitmapVideoFrameRenderer");
  const renderer = new BitmapVideoFrameRenderer();
  return { renderer, element: renderer.canvas as HTMLCanvasElement };
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
    console.log("[Scrcpy] Create new ReadableStream for ", deviceId);

    // Wait for HTML to be available
    while (!targetRef.current){
      await new Promise( resolve => setTimeout(resolve, 1) );
    }

    // Create new entry for keyframe's initialisation
    isDecoderHasConfig.set(deviceId, false);

    // Create new ReadableStream used for scrcpy decoding
    const stream = new ReadableStream({
      start(controller) {
        readableControllers.set(deviceId, controller);
      },
      cancel() {
        readableControllers.delete(deviceId); // Clean up when the stream is canceled
      },
    });

    // Create new decoder object
    const { renderer, element } = createVideoFrameRenderer();
    
    // Create HTML wrapper to stylize the video stream
    const wrapper = document.createElement('div');
    wrapper.classList.add(...["m-4", "p-2", "rounded-md"]);

    // Add background color
    const ipIdentifier: string = deviceId.split(":")[0].split(".")[deviceId.split(".").length -1];
    if (ipIdentifier in HEADSET_COLOR) {
      // @ts-ignore
      wrapper.classList.add(...[`bg-${HEADSET_COLOR[ipIdentifier]}-500`]);
    } else {
      wrapper.classList.add(...["bg-white-500", "border-4", "border-slate-300"]);
    }

    // @ts-ignore
    wrapper.appendChild(element); //d.renderer);
    // Add to final page
    targetRef.current.appendChild(wrapper);

    const result = await VideoDecoder.isConfigSupported({
      codec: "hev1.1.60.L153.B0.0.0.0.0.0",
    });
    if (result.supported === true) {

      const decoder = new WebCodecsVideoDecoder({
        codec:  ScrcpyVideoCodecId.H265,
        renderer: renderer,
      });
      decoder.sizeChanged(({ width, height }) => {
        console.log(width, height);
      });

      // Feed the scrcpy stream to the video decoder
      void stream.pipeTo(decoder.writable).catch((err) => {
        console.error("[Scrcpy] Error piping to decoder writable stream:", err);
      });

      return stream;
    }
  }

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
          !isDecoderHasConfig.get(deserializedData!.streamId) &&
          deserializedData!.packet.type == "configuration"
        ) {
          console.log(
            "[Scrcpy] WebSocket decoder loaded for ",
            deserializedData!.streamId,
          );
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
