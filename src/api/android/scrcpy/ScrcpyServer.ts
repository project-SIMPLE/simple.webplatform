import fs from "fs/promises";

import { ReadableStream } from "@yume-chan/stream-extra";
import { Adb } from "@yume-chan/adb";
import { AdbScrcpyClient, AdbScrcpyOptions3_3_1 } from "@yume-chan/adb-scrcpy";
import { DefaultServerPath, ScrcpyMediaStreamPacket, ScrcpyCodecOptions } from "@yume-chan/scrcpy";
import {useExtraVerbose, useVerbose} from "../../index.ts";
import { TinyH264Decoder } from "@yume-chan/scrcpy-decoder-tinyh264";
import uWS, { TemplatedApp } from "uWebSockets.js";

// Override the log function
const log = (...args: any[]) => {
    console.log("\x1b[34m[ScrcpyServer]\x1b[0m", ...args);
};
const logWarn = (...args: any[]) => {
    console.warn("\x1b[34m[ScrcpyServer]\x1b[0m", "\x1b[43m", ...args, "\x1b[0m");
};
const logError = (...args: any[]) => {
    console.error("\x1b[34m[ScrcpyServer]\x1b[0m", "\x1b[41m", ...args, "\x1b[0m");
};

const H264Capabilities = TinyH264Decoder.capabilities.h264;
export class ScrcpyServer {
    // =======================
    // WebSocket
    private wsServer!: TemplatedApp;
    private wsClients: Set<uWS.WebSocket<any>>;
    private maxBackpressure: number = 1 * 1024 * 1024; // 1MB

    private scrcpyClients: AdbScrcpyClient<AdbScrcpyOptions3_3_1<true>>[] = [];

    // =======================
    // Scrcpy server
    declare server: Buffer; //ArrayBuffer;

    // =======================
    // Scrcpy stream
    private scrcpyStreamConfig!: string;

    constructor() {
        this.wsClients = new Set<uWS.WebSocket<any>>();

        const host = process.env.WEB_APPLICATION_HOST || 'localhost';
        const port = parseInt(process.env.VIDEO_WS_PORT || '8082', 10);

        try {
            this.wsServer = uWS.App(); //new WebSocketServer({ host, port });
            log(`Creating video stream server on: ws://${host}:${port}`);
        } catch (e) {
            logError('Failed to create a new websocket', e);
        }

        this.wsServer.listen(host, port, (token) => {
            if (token) {
                log(`Creating monitor server on: ws://${host}:${port}`);
            } else {
                logError('Failed to listen on the specified port and host');
            }
        });

        this.wsServer.ws('/*', {
            compression: uWS.SHARED_COMPRESSOR, // Enable compression
            maxPayloadLength: 20 * 1024, // 20 KB: Adjust based on expected video bitrate
            // Experimental max < 10KB
            maxBackpressure: this.maxBackpressure,
            idleTimeout: 30, // 30 seconds timeout

            open: (ws) => {
                this.wsClients.add(ws);
                log("Web view connected");

                // Send configuration message if scrcpy is already started
                if (this.scrcpyStreamConfig) {
                    ws.send(this.scrcpyStreamConfig, false, true);
                }

                for (const client of this.scrcpyClients) {
                    // Add small delay to let the client finish to load webpage
                    setTimeout(() => { client.controller!.resetVideo() }, 500);
                }
            },

            drain: (ws) => {
                // Reset stream to prevent having too much artefacts on stream
                if (ws.getBufferedAmount() < this.maxBackpressure) {
                    if (useVerbose) log("Backpressure drained, restart stream to prevent visual glitch")
                    for (const client of this.scrcpyClients) {
                        client.controller!.resetVideo();
                    }
                }
            },

            close: (ws, code: number, message) => {
                try {
                    this.wsClients.delete(ws)
                    log(`Connection closed. Code: ${code}, Reason: ${Buffer.from(message).toString()}`);

                    // Handle specific close codes
                    switch (code) {
                        case 1003:
                            logError('Unsupported data sent by the client.');
                            break;

                        case 1006:
                        case 1009:
                            logError('Message too big!');
                            logError('Message size:', message.byteLength, 'bytes');
                            logError('Message :', message);
                            break;

                        default:
                            if (code !== 1000) // 1000 = Normal Closure
                                logError('Unexpected closure');
                            else
                                if (useVerbose) log(`Connection normally`);
                    }
                } catch (err) {
                    logError('Error during close handling:', err);
                }
            }
        });

        //if (useVerbose) log("Using scrcpy version", VERSION);
    }

    async loadScrcpyServer() {
        //this.server = await fs.readFile(BIN)

        // Use custom hotfix from joranmarcy
        // This fix 'simply' drop all the black frames to avoid seeing glitches on fw > 72
        // https://github.com/Genymobile/scrcpy/compare/master...joranmarcy:scrcpy:fix/opengl-discard-blackframes
        //this.server = await fs.readFile( path.join(process.cwd(), 'toolkit', 'scrcpyServer-fixBlackClip') );
        //const url = new URL(path.join(process.cwd(), 'toolkit', 'scrcpyServer-fixBlackClip'), import.meta.url);
        const url = new URL(process.cwd() + '/toolkit/scrcpyServer-fixBlackClip', import.meta.url);
        this.server = await fs.readFile(url);
    }

    async startStreaming(adbConnection: Adb, deviceModel: string) {
        let scrcpyOptions = new AdbScrcpyOptions3_3_1({
            // scrcpy options
            videoCodec: "h265",
            videoCodecOptions: new ScrcpyCodecOptions({ // Ensure Meta Quest compatibility
                profile: H264Capabilities.maxProfile,
                level: H264Capabilities.maxLevel,
            }),
            // Video settings
            video: true,
            maxSize: 1570,
            maxFps: 30,
            videoBitRate: 200,
            // Android soft settings
            stayAwake: true,
            // Clean feed
            audio: false,
            control: true,
        }, {version: "3.3.1"})

        try {
            if (this.server == null) {
                await this.loadScrcpyServer();
            }

            log(`Starting scrcpy for ${adbConnection.serial} ===`)

            const myself = this;

            if (useVerbose) log(`Sync adb with ${adbConnection.serial} ===`);
            const sync = await adbConnection.sync();
            try {
                await sync.write({
                    filename: DefaultServerPath,
                    file: new ReadableStream({
                        start: (controller) => {
                            controller.enqueue(new Uint8Array(myself.server));
                            controller.close();
                        },
                    }),
                });
            } catch (error) {
                logError(`Error writing scrcpy server to  ${adbConnection.serial}: ${error}`);
            }
            finally {
                await sync.dispose();
            }

            // Apply different crop values to work with every devices
            if (deviceModel == "Quest_3S"){
                scrcpyOptions.value.crop = "1482:1570:170:150";
            } else if (deviceModel == "Quest_3"){
                scrcpyOptions.value.angle = 23;
                scrcpyOptions.value.crop = "1482:1570:300:250";
            } else {
                logWarn("Device", deviceModel, "is unknown, so no cropping is applied");
            }

            if (useVerbose) log(`Prepare scrcpy server from ${adbConnection.serial} ===`);
            const client : AdbScrcpyClient<AdbScrcpyOptions3_3_1<true>> = await AdbScrcpyClient.start(
                adbConnection,
                DefaultServerPath,
                scrcpyOptions
            );

            // Store the controller of new client
            if (useVerbose) log(`Pushing scrcpy server to ${adbConnection.serial} ===`);
            this.scrcpyClients.push(client);

            // log("coco");

            // Print output of Scrcpy server
            if (useVerbose) void client.output.pipeTo(
                // @ts-ignore
                new WritableStream<string>({
                    write(chunk: string): void {
                        if(useExtraVerbose) console.debug("\x1b[41m[DEBUG]\x1b[0m", chunk);
                    },
                }),
            );

            if (client.videoStream) {
                const { metadata, stream: videoPacketStream } = await client.videoStream;
                log(metadata);

                const myself = this;

                // Enforce sending config package
                setTimeout(() => { client.controller!.resetVideo() }, 500);

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
                                        logWarn("Unkown packet from video pipe: ", packet);
                                }
                            },
                        }),
                    )
                    .catch((e) => {
                        logError(`Error while piping video stream of ${adbConnection.serial} ===`)
                        logError(e);
                    });
            } else {
                logError(`Couldn't find a video stream from ${adbConnection.serial}'s scrcpy server ===`)
            }

        } catch (error) {
            logError("Error in startStreaming:", error);
            logError("=== This error probably comes from the cropping value out-of-bound on a classical Android device; but by default set for Meta Quest 3 value ===");
        }
    }

    broadcastToClients(packetJson: string): void {
        this.wsClients.forEach((client) => {
            client.send(packetJson, false, true);
        });
    }
}
