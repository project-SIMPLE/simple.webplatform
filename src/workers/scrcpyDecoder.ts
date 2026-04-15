import { ScrcpyVideoCodecId, type ScrcpyMediaStreamPacket } from "@yume-chan/scrcpy";
import {
  WebGLVideoFrameRenderer,
  BitmapVideoFrameRenderer,
  WebCodecsVideoDecoder,
} from "@yume-chan/scrcpy-decoder-webcodecs";

self.addEventListener("message", (e) => {
  const { codec, canvas, stream, port, useH265, type } = e.data as {
    codec: ScrcpyVideoCodecId;
    canvas: OffscreenCanvas;
    stream?: ReadableStream<ScrcpyMediaStreamPacket>;
    port?: MessagePort;
    useH265: boolean;
    type: 'direct' | 'port';
  };

  let renderer;
  if (WebGLVideoFrameRenderer.isSupported) {
    renderer = new WebGLVideoFrameRenderer(canvas);
  } else {
    renderer = new BitmapVideoFrameRenderer(canvas);
  }

  const decoder = new WebCodecsVideoDecoder({
    codec: codec,
    renderer: renderer,
    hardwareAcceleration: useH265 ? "no-preference" : "prefer-software",
  });

  decoder.sizeChanged(({ width, height }) => {
    postMessage({ type: 'sizeChanged', width, height });
  });

  let activeStream: ReadableStream<ScrcpyMediaStreamPacket>;

  if (type === 'direct' && stream) {
    activeStream = stream;
  } else if (type === 'port' && port) {
    // Reconstruct a ReadableStream from the MessagePort (Safari doesn't support
    // transferring ReadableStream directly via postMessage).
    activeStream = new ReadableStream<ScrcpyMediaStreamPacket>({
      start(controller) {
        port.onmessage = ({ data }) => {
          if (data.done) {
            controller.close();
            port.close();
          } else {
            controller.enqueue(data.value as ScrcpyMediaStreamPacket);
          }
        };
        port.start();
      },
      cancel() {
        port.close();
      },
    });
  } else {
    console.error("[Worker] Invalid stream transfer type or missing stream/port.");
    return;
  }

  void activeStream.pipeTo(decoder.writable).catch((err) => {
    console.error("[Worker] Error piping to decoder writable stream:", err);
  });
});
