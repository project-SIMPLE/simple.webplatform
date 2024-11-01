import fs from "fs/promises";
import { WebSocket, WebSocketServer } from 'ws';

import { ReadableStream } from "@yume-chan/stream-extra";
import { Adb } from "@yume-chan/adb";
import { AdbScrcpyClient, AdbScrcpyOptions2_1 } from "@yume-chan/adb-scrcpy";
import { BIN, VERSION } from "@yume-chan/fetch-scrcpy-server";
import { DEFAULT_SERVER_PATH, ScrcpyMediaStreamPacket, ScrcpyOptions2_3 } from "@yume-chan/scrcpy";
import {useVerbose} from "../index.ts";

export class ScrcpyServer {
    // =======================
    // WebSocket
    private wsServer!: WebSocketServer;
    private wsClients: WebSocket[] = [];

    // =======================
    // Scrcpy server
    declare server: Buffer;

    readonly scrcpyOptions = new AdbScrcpyOptions2_1(
        new ScrcpyOptions2_3({
            // Video settings
            video: true,
            maxSize: 600,
            maxFps: 20,
            videoBitRate: 200,
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
        const host = process.env.WEB_APPLICATION_HOST || 'localhost';
        const port = parseInt(process.env.VIDEO_WS_PORT || '8082', 10);

        try {
            this.wsServer = new WebSocketServer({ host, port });
            console.log(`[ScrcpyServer WS] Creating video stream server on: ws://${host}:${port}`);
        } catch (e) {
            console.error('[ScrcpyServer WS] Failed to create a new websocket', e);
        }

        this.wsServer.on('connection', async (socket: WebSocket) => {

            this.wsClients.push(socket);
            console.log("[ScrcpyServer WS] Web view connected");

            // Send configuration message if scrcpy is already started
            if(this.scrcpyStreamConfig){
                socket.send(this.scrcpyStreamConfig);
            }

            socket.on('close', () => {
                this.wsClients = this.wsClients.filter(client => client !== socket);
                console.log("[ScrcpyServer WS] Client disconnected");
            });
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
            if (client.readyState === WebSocket.OPEN) {
                client.send(packetJson);
            }
        });
    }
}
