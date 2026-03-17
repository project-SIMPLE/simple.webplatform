import { ScrcpyVideoCodecId, type ScrcpyMediaStreamPacket } from "@yume-chan/scrcpy";
import {
  WebGLVideoFrameRenderer,
  BitmapVideoFrameRenderer,
  WebCodecsVideoDecoder,
} from "@yume-chan/scrcpy-decoder-webcodecs";

self.addEventListener("message", (e) => {
  const { codec, canvas, stream, useH265 } = e.data as {
    codec: ScrcpyVideoCodecId;
    canvas: OffscreenCanvas;
    stream: ReadableStream<ScrcpyMediaStreamPacket>;
    useH265: boolean;
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

  void stream.pipeTo(decoder.writable).catch((err) => {
    console.error("[Worker] Error piping to decoder writable stream:", err);
  });
});
