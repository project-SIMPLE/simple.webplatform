import { Adb } from "@yume-chan/adb";
import { AdbScrcpyClient, AdbScrcpyOptions2_1 } from "@yume-chan/adb-scrcpy";
import { BIN, VERSION } from "@yume-chan/fetch-scrcpy-server";
import { DEFAULT_SERVER_PATH, ScrcpyMediaStreamPacket, ScrcpyOptions2_3 } from "@yume-chan/scrcpy";
import { TinyH264Decoder } from "@yume-chan/scrcpy-decoder-tinyh264";
import { ReadableStream } from "@yume-chan/stream-extra";
import fs from "fs/promises";
import { WebSocket, WebSocketServer } from 'ws';

export class VideoStreamServer {
    private videoSocket: WebSocketServer;
    private videoSocketClients: WebSocket[] = [];
    private scrcpyClient: AdbScrcpyClient | null = null;

    private scrcpyStreamConfig!: string;
    private H264Capabilities;

    declare server: Buffer;

    constructor() {
        /*
            =======================
                ScrCpy
         */
        this.H264Capabilities = TinyH264Decoder.capabilities.h264;
        console.log(this.H264Capabilities);

        const host = process.env.WEB_APPLICATION_HOST || 'localhost';
        const port = parseInt(process.env.VIDEO_WS_PORT || '8082', 10);

        /*
            =======================
                Web Socket
         */
        this.videoSocket = new WebSocketServer({ host, port });
        console.log(`[VIDEO STREAM SERVER] Creating video stream server on: ws://${host}:${port}`);

        this.videoSocket.on('connection', async (socket: WebSocket) => {
            this.videoSocketClients.push(socket);
            console.log("[VIDEO STREAM SERVER] Client connected");

            socket.on('close', () => {
                this.videoSocketClients = this.videoSocketClients.filter(client => client !== socket);
                console.log("[VIDEO STREAM SERVER] Client disconnected");
            });

            if(this.scrcpyStreamConfig){
              socket.send(this.scrcpyStreamConfig);
            }
        });
    }

    async loadScrcpyServer(){
        this.server = await fs.readFile(BIN)
    }

    async startStreaming(scrcpyClient: Adb) {
        try {
            if (this.server == null){
                await this.loadScrcpyServer();
            }
            const adbConnection: Adb = scrcpyClient;

            const myself = this;

            console.log("Pushing scrcpy server to Android device ===");
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
                console.error("Error writing scrcpy server to device:", error);
                throw error;
            } finally {
                await sync.dispose();
            }

            console.log("Starting server");

            const option = new AdbScrcpyOptions2_1(
                new ScrcpyOptions2_3({
                    video: true,
                    audio: false,
                    control: false,
                    // videoCodecOptions: new CodecOptions({
                    //     profile: this.H264Capabilities.maxProfile,
                    //     level: this.H264Capabilities.maxLevel,
                    // })
                })
            )

            const client: AdbScrcpyClient = await AdbScrcpyClient.start(
                adbConnection,
                DEFAULT_SERVER_PATH,
                VERSION,
                option
            );

            console.log("AdbScrcpyClient started successfully");

            if (client.videoStream) {
                const { metadata, stream: videoPacketStream } = await client.videoStream;

                const myself = this;

                console.log(metadata);

                videoPacketStream
                    .pipeTo(
                        //@ts-ignore
                        new WritableStream({
                            write(packet: ScrcpyMediaStreamPacket) {
                                switch (packet.type) {
                                    case "configuration":
                                        // Handle configuration packet
                                        myself.scrcpyStreamConfig = JSON.stringify({
                                                type: "configuration",
                                                data: Buffer.from(packet.data).toString('base64'), // Convert Uint8Array to Base64 string
                                            });
                                        myself.broadcastConfig();
                                        break;
                                    case "data":
                                        // Handle data packet
                                        myself.broadcastToClients(
                                            JSON.stringify({
                                                type: "data",
                                                keyframe: packet.keyframe,
                                                pts: packet.pts.toString(), // Convert bigint to string
                                                data: Buffer.from(packet.data).toString('base64'), // Convert Uint8Array to Base64 string
                                            })
                                        );
                                        break;

                                }
                            },
                        }),
                    )
                    .catch((e) => {
                        console.error(e);
                    });
            }

        } catch (error) {
            console.error("Error in startStreaming:", error);

            throw error;
        }
    }

    broadcastConfig() {
        if(this.scrcpyStreamConfig != null){
            this.broadcastToClients(this.scrcpyStreamConfig);
        }
    }

    broadcastToClients(packet: any): void {
        this.videoSocketClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(packet);
            }
        });
    }

    stopStreaming() {
        if (this.scrcpyClient) {
            this.scrcpyClient.close();
            this.scrcpyClient = null;
        }
    }
}
