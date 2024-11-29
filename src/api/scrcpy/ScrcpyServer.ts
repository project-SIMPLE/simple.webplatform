import fs from "fs/promises";
import { WebSocket, WebSocketServer } from 'ws';

import { ReadableStream } from "@yume-chan/stream-extra";
import { Adb } from "@yume-chan/adb";
import { AdbScrcpyClient, AdbScrcpyOptions2_1 } from "@yume-chan/adb-scrcpy";
import { BIN, VERSION } from "@yume-chan/fetch-scrcpy-server";
import { DEFAULT_SERVER_PATH, ScrcpyMediaStreamPacket, ScrcpyOptions2_3, CodecOptions } from "@yume-chan/scrcpy";
import {useVerbose} from "../index.ts";
import { TinyH264Decoder } from "@yume-chan/scrcpy-decoder-tinyh264";
import uWS, {TemplatedApp} from "uWebSockets.js";

const H264Capabilities = TinyH264Decoder.capabilities.h264;

export class ScrcpyServer {
    // =======================
    // WebSocket
    private wsServer!: TemplatedApp;
    private wsClients: Set<uWS.WebSocket<any>>;

    // =======================
    // Scrcpy server
    declare server: Buffer;

    readonly scrcpyOptions = new AdbScrcpyOptions2_1(
        new ScrcpyOptions2_3({
            // scrcpy options
            videoCodec: "h264",
            videoCodecOptions: new CodecOptions({ // Ensure Meta Quest compatibility
                profile: H264Capabilities.maxProfile,
                level: H264Capabilities.maxLevel,
            }),
            // Video settings
            video: true,
            maxSize: 700,
            maxFps: 20,
            videoBitRate: 200,
            crop: "2064:2200:2064:0",
            // Android soft settings
            stayAwake: true,
            // Clean feed
            audio: false,
            control: false,
        })
    )

    // =======================
    // Scrcpy stream
    private scrcpyStreamConfig!: string;

    constructor() {
        this.wsClients = new Set<uWS.WebSocket<any>>();

        const host = process.env.WEB_APPLICATION_HOST || 'localhost';
        const port = parseInt(process.env.VIDEO_WS_PORT || '8082', 10);

        try {
            this.wsServer = uWS.App(); //new WebSocketServer({ host, port });
            console.log(`[ScrcpyServer WS] Creating video stream server on: ws://${host}:${port}`);
        } catch (e) {
            console.error('[ScrcpyServer WS] Failed to create a new websocket', e);
        }

        this.wsServer.listen(host, port, (token) => {
            if (token) {
                console.log(`[ScrcpyServer WS] Creating monitor server on: ws://${host}:${port}`);
            } else {
                console.error('[ScrcpyServer WS] Failed to listen on the specified port and host');
            }
        });

        this.wsServer.ws('/*', {
            compression: uWS.SHARED_COMPRESSOR, // Enable compression
            maxPayloadLength: 3 * 1024 * 1024,  // 2 MB: Adjust based on expected video bitrate
            idleTimeout: 30, // 30 seconds timeout

            open: (ws) => {
                this.wsClients.add(ws);
                console.log("[ScrcpyServer WS] Web view connected");

                // Send configuration message if scrcpy is already started
                if(this.scrcpyStreamConfig){
                    ws.send(this.scrcpyStreamConfig, false, true);
                }
            },

            close: (ws, code: number, message) => {
                try {
                    this.wsClients.delete(ws)
                    console.log(`[ScrcpyServer WS] Connection closed. Code: ${code}, Reason: ${Buffer.from(message).toString()}`);

                    // Handle specific close codes
                    switch (code) {
                        case 1003:
                            console.error('[ScrcpyServer WS] Unsupported data sent by the client.');
                            break;

                        case 1006:
                        case 1009:
                            console.error('[ScrcpyServer WS] Message too big!');
                            console.error('[ScrcpyServer WS] Message size:', message.byteLength, 'bytes');
                            console.error('[ScrcpyServer WS] Message :', message);
                            break;

                        default:
                            if (code !== 1000) // 1000 = Normal Closure
                                console.error('[ScrcpyServer WS] Unexpected closure');
                            else
                            if (useVerbose) console.log(`[ScrcpyServer WS] Connection normally`);
                    }
                } catch (err) {
                    console.error('[ScrcpyServer WS] Error during close handling:', err);
                }
            }
        });

        if (useVerbose) console.log("[ScrcpyServer] Using scrcpy version", VERSION);
    }

    async loadScrcpyServer(){
        this.server = await fs.readFile(BIN)
    }

    async startStreaming(adbConnection: Adb) {
        try {
            if (this.server == null){
                await this.loadScrcpyServer();
            }

            console.log(`[ScrcpyServer] Starting scrcpy for ${adbConnection.serial} ===`)

            const myself = this;

            if (useVerbose) console.log(`[ScrcpyServer] Pushing scrcpy server to ${adbConnection.serial} ===`);
            const sync = await adbConnection.sync();
            try {
                await sync.write({
                    filename: DEFAULT_SERVER_PATH,
                    file: new ReadableStream({
                        start: (controller) => {
                            controller.enqueue(myself.server);
                            controller.close();
                        },
                    }),
                });
            } catch (error) {
                console.error(`[ScrcpyServer] Error writing scrcpy server to  ${adbConnection.serial}: ${error}`);
            } finally {
                await sync.dispose();
            }

            if (useVerbose) console.log(`[ScrcpyServer] Starting scrcpy server from ${adbConnection.serial} ===`);
            const client: AdbScrcpyClient = await AdbScrcpyClient.start(
                adbConnection,
                DEFAULT_SERVER_PATH,
                VERSION,
                this.scrcpyOptions
            );


            // Print output of Scrcpy server
            if (useVerbose) void client.stdout.pipeTo(
                // @ts-ignore
                new WritableStream<string>({
                    write(chunk: string): void {
                        console.debug("\x1b[41m[ScrcpyServer DEBUG]\x1b[0m", chunk);
                    },
                }),
            );

            if (client.videoStream) {
                const { metadata, stream: videoPacketStream } = await client.videoStream;
                console.log(metadata);

                const myself = this;

                videoPacketStream
                    .pipeTo(
                        //@ts-ignore
                        new WritableStream({
                            write(packet: ScrcpyMediaStreamPacket) {
                                switch (packet.type) {
                                    case "configuration":
                                        // Handle configuration packet
                                        const newStreamConfig = JSON.stringify({
                                                streamId: adbConnection.serial,
                                                type: "configuration",
                                                data: Buffer.from(packet.data).toString('base64'), // Convert Uint8Array to Base64 string
                                            });
                                        myself.broadcastToClients(newStreamConfig);

                                        // Save packet for clients after this first packet emission
                                        // It is sent only once while opening the video stream and set the renderer
                                        myself.scrcpyStreamConfig = newStreamConfig;
                                        break;

                                    case "data":
                                        // Handle data packet
                                        myself.broadcastToClients(
                                            JSON.stringify({
                                                streamId: adbConnection.serial,
                                                type: "data",
                                                keyframe: packet.keyframe,
                                                // @ts-ignore
                                                pts: packet.pts.toString(), // Convert bigint to string
                                                data: Buffer.from(packet.data).toString('base64'), // Convert Uint8Array to Base64 string
                                            })
                                        );
                                        break;
                                    default:
                                        console.warn("[ScrcpyServer] Unkown packet from video pipe: ", packet);
                                }
                            },
                        }),
                    )
                    .catch((e) => {
                        console.error(`[ScrcpyServer] Error while piping video stream of ${adbConnection.serial} ===`)
                        console.error(e);
                    });
            } else {
                console.error(`[ScrcpyServer] Couldn't find a video stream from ${adbConnection.serial}'s scrcpy server ===`)
            }

        } catch (error) {
            console.error("Error in startStreaming:", error);

            throw error;
        }
    }

    broadcastToClients(packetJson: string): void {
        this.wsClients.forEach((client) => {
            client.send(packetJson, false, true);
        });
    }
}
