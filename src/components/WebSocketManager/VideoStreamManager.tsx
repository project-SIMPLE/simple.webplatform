import React, { useEffect, useRef, useState } from 'react';
import { TinyH264Decoder } from '@yume-chan/scrcpy-decoder-tinyh264';
import { WebCodecsVideoDecoder } from '@yume-chan/scrcpy-decoder-webcodecs';

// Deserialize the data into ScrcpyMediaStreamPacket
const deserializeData = (serializedData: string) => {
    const parsed = JSON.parse(serializedData);

    switch (parsed.type) {
        case 'configuration':
            return {
                type: parsed.type,
                data: Uint8Array.from(atob(parsed.data), (c) => c.charCodeAt(0)), // Convert base64 to Uint8Array
            };
        case "data":
            return {
                type: parsed.type,
                keyframe: parsed.keyframe,
                pts: BigInt(parsed.pts),
                data: Uint8Array.from(atob(parsed.data), (c) => c.charCodeAt(0)), // Convert base64 to Uint8Array
            };
    }
};

// The React component
const VideoStreamManager: React.FC = () => {
    const videoContainerRef = useRef<HTMLDivElement>(null);
    const [decoder] = useState(() => new TinyH264Decoder()); // Initialize the decoder once
    //const [decoder] = useState(() => new WebCodecsVideoDecoder("hev1.1.60.L153.B0.0.0.0.0.0", false));

    let isDecoderHasConfig = false;

    useEffect(() => {
        console.log("Hello");
        // Append the decoder's renderer (canvas) to the video container
        if (videoContainerRef.current) {
            videoContainerRef.current.appendChild(decoder.renderer); // Append renderer to the div
        }

        // Open the WebSocket connection
        const socket = new WebSocket('ws://localhost:8082');

        // Create a single ReadableStream instance
        const readableStream = new ReadableStream({
            start(controller) {

                // Handle incoming WebSocket messages
                socket.onmessage = (event) => {
                    const serializedMessage = event.data;

                    // Deserialize the message and enqueue the data into the readable stream
                    const deserializedData = deserializeData(serializedMessage);

                    if(isDecoderHasConfig && deserializedData!.type == "data"){
                        controller.enqueue(deserializedData);
                    }else
                    if (!isDecoderHasConfig && deserializedData!.type == "configuration"){
                        console.log('[WebSocketManager] WebSocket decoder loaded');
                        controller.enqueue(deserializedData);
                        isDecoderHasConfig = true;
                    }
                    //controller.close(); // Close the stream once done
                };

                socket.onclose = () => {
                    console.log("Closing readable");
                    controller.close();
                };
            },
        });

        // Pipe the readable stream to the decoder's writable stream
        readableStream
            .pipeTo(decoder.writable)
            .catch((e) => {
                console.error('Error piping to decoder writable stream:', e);
            });

        // Cleanup on component unmount
        return () => {
            socket.close();
        };
    }, [decoder]);

    return (
        <div>
            <h2>Video Stream Manager</h2>
            {/* This div will hold the decoder's renderer (e.g., a canvas) */}
            <div ref={videoContainerRef}></div>
        </div>
    );
};

export default VideoStreamManager;
