import fs from "fs/promises";
import path from "path";

import { ReadableStream } from "@yume-chan/stream-extra";
import { Adb } from "@yume-chan/adb";
import { DefaultServerPath, ScrcpyMediaStreamPacket, ScrcpyCodecOptions } from "@yume-chan/scrcpy";
import { AdbScrcpyClient, AdbScrcpyExitedError, AdbScrcpyOptions3_3_3 } from "@yume-chan/adb-scrcpy";
import { TinyH264Decoder } from "@yume-chan/scrcpy-decoder-tinyh264";
import uWS, { TemplatedApp } from "uWebSockets.js";
import { getLogger } from "@logtape/logtape";

import { ENV_VERBOSE } from "../../index.ts";
import { AdbManager } from "../adb/AdbManager.ts";

// Override the log function
const logger = getLogger(["android", "ScrcpyServer"]);

const H264Capabilities = TinyH264Decoder.capabilities.h264;

// Starts with optimistic settings
let useH265: boolean = true;
// Switch to true if at least 1 client doesn't h265
let scrcpyCodecLock: boolean = false;

export class ScrcpyServer {
    // =======================
    // WebSocket
    private wsServer!: TemplatedApp;
    private wsClients: Set<uWS.WebSocket<any>>;
    private maxBackpressure: number = 1 * 1024 * 1024; // 1MB

    private scrcpyClients: AdbScrcpyClient<AdbScrcpyOptions3_3_3<true>>[] = [];

    // =======================
    // Scrcpy server
    declare server: Buffer; //ArrayBuffer;

    // =======================
    // Scrcpy stream
    private scrcpyStreamConfig!: string;

    private adbManager!: AdbManager;

    constructor(adbManager: AdbManager) {
        // Set global variables
        logger.info(`Using codec ${useH265 ? "h265" : "h264"}`)

        // Set local variables
        this.adbManager = adbManager;

        this.wsClients = new Set<uWS.WebSocket<any>>();

        const host = process.env.WEB_APPLICATION_HOST || 'localhost';
        const port = parseInt(process.env.VIDEO_WS_PORT || '8082', 10);

        try {
            this.wsServer = uWS.App(); //new WebSocketServer({ host, port });
            logger.info(`Creating video stream server on: ws://${host}:${port}`);
        } catch (e) {
            logger.error('Failed to create a new websocket {e}', { e });
        }

        this.wsServer.listen(host, port, (token) => {
            if (token) {
                logger.info(`Creating monitor server on: ws://${host}:${port}`);
            } else {
                logger.error('Failed to listen on the specified port and host');
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
                logger.debug("Web view connected");

                // Send configuration message if scrcpy is already started
                if (this.scrcpyStreamConfig) {
                    ws.send(this.scrcpyStreamConfig, false, true);
                }

                this.resentAllConfigPackage(true);
            },

            drain: (ws) => {
                // Reset stream to prevent having too much artefacts on stream
                if (ws.getBufferedAmount() < this.maxBackpressure) {
                    logger.debug("Backpressure drained, restart stream to prevent visual glitch")

                    this.resentAllConfigPackage();
                }
            },
            message: async (_ws, message) => {
                try {
                    const jsonMessage: { type: string, h264: boolean, h265: boolean, av1: boolean }
                        = JSON.parse(Buffer.from(message).toString());

                    logger.debug("Received message from streaming client:\n{jsonMessage}", { jsonMessage });

                    const previousCodec = useH265;
                    if (!scrcpyCodecLock && jsonMessage.h265) {
                        useH265 = true;
                    } else if (jsonMessage.h264 && !jsonMessage.h265) {
                        useH265 = false;
                        scrcpyCodecLock = true;
                    } else if (!jsonMessage.h265 && !jsonMessage.h264) {
                        logger.fatal("Client doesn't supports any compatible codec!");
                    }

                    // Reset video streams if codec changed !
                    if (previousCodec != useH265) {
                        logger.warn(`Restarting streams with new codec (${useH265 ? "h265" : "h264"})`);
                        for (const client of this.scrcpyClients) {
                            await client.controller!.close();
                            await client.close();
                        }
                        this.scrcpyClients = [];
                        await this.adbManager.restartStreamingAll();

                        // Ensure video stream are well init after long restart
                        this.resentAllConfigPackage(true, 500);
                    }
                } catch (e) {
                    logger.error("Something went wrong on message received...\n{e}", { e });
                }
            },

            close: (ws, code: number, message) => {
                try {
                    this.wsClients.delete(ws)
                    logger.info(`Connection closed. Code: ${code}, Reason: ${Buffer.from(message).toString()}`);

                    // Handle specific close codes
                    switch (code) {
                        case 1003:
                            logger.error(`[Err ${code}] Unsupported data sent by the client.`);
                            break;

                        case 1006:
                        case 1009:
                            logger.error(`[Err ${code}] Message too big!\nMessage size: ${message.byteLength}bytes\nMessage:${message}`);
                            break;

                        default:
                            if (code !== 1000) // 1000 = Normal Closure
                                logger.error(`[Err ${code}] Unexpected closure`);
                            else
                                logger.debug(`Closing connection normally`);
                    }
                } catch (err) {
                    logger.fatal('Error during close handling: {err}', { err });
                }
            }
        });
    }

    async loadScrcpyServer() {
        // To keep for when walking away from custom server
        //this.server = await fs.readFile(BIN)

        // Use custom hotfix from rom1v (official scrcpy's dev)
        // This fix 'simply' better manage fallback video API weirdly working on MQ headsets
        // https://github.com/Genymobile/scrcpy/issues/5913#issuecomment-3677889916
        this.server = await fs.readFile(path.join(process.cwd(), 'toolkit', 'scrcpyServer-v3.3.4-rom1v'));
    }

    async startStreaming(adbConnection: Adb, deviceModel: string, flipWidth: boolean = false): Promise<boolean | undefined> {
        const scrcpyOptions = new AdbScrcpyOptions3_3_3({
            // scrcpy options
            videoCodecOptions: new ScrcpyCodecOptions({ // Ensure Meta Quest compatibility
                profile: H264Capabilities.maxProfile,
                level: H264Capabilities.maxLevel,
            }),
            videoCodec: (useH265 ? "h265" : "h264"),
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
        },
            // Spoofing version, there's only bug-fixing between .3 and .4 so should be safe
            { version: "3.3.4" })
        logger.debug(`Starting scrcpy stream with ${useH265 ? "h265" : "h264"} codec`)

        try {
            if (this.server == null) {
                await this.loadScrcpyServer();
            }

            logger.info(`Starting scrcpy for ${adbConnection.serial}`)

            logger.debug(`Sync adb with ${adbConnection.serial}`);
            const sync = await adbConnection.sync();
            try {
                const myself = this;

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
                logger.fatal(`Error writing scrcpy server to  ${adbConnection.serial}: {error}`, { error });
            }
            finally {
                await sync.dispose();
            }

            // Apply different crop values to work with every devices
            if (deviceModel == "Quest_3S") {
                scrcpyOptions.value.crop = flipWidth ? "1570:1482:170:150" : "1482:1570:170:150";
            } else if (deviceModel == "Quest_3") {
                scrcpyOptions.value.angle = 23;
                scrcpyOptions.value.crop = flipWidth ? "1000:1482:300:250" : "1482:1000:300:250";
            } else {
                logger.warn(`Device ${deviceModel} is unknown, so no cropping is applied`);
            }

            logger.debug(`Pushing & start scrcpy server from ${adbConnection.serial}`);
            let client: AdbScrcpyClient<AdbScrcpyOptions3_3_3<true>> = await AdbScrcpyClient.start(
                adbConnection,
                DefaultServerPath,
                scrcpyOptions
            );

            const { metadata, stream: videoPacketStream } = await client.videoStream;
            logger.debug({ metadata });
            // Prevent having stream ratio inverted, happpened on some weird device..
            // https://github.com/project-SIMPLE/simple.webplatform/issues/78
            if ((metadata == undefined || metadata.width! < metadata.height!) && deviceModel.startsWith("Quest")) {
                logger.warn("Something's weird here, headset's stream isn't in the good size ratio, restarting...");
                // Make it crash voluntarily to restart stream
                client = await AdbScrcpyClient.start(
                    adbConnection,
                    DefaultServerPath,
                    scrcpyOptions
                );
            }

            // Store the controller of new client
            logger.debug(`Saving new scrcpy client ${adbConnection.serial}`);
            this.scrcpyClients.push(client);

            // Print output of Scrcpy server
            void client.output.pipeTo(
                // @ts-expect-error
                new WritableStream<string>({
                    write(chunk: string): void {
                        logger.trace({ chunk });
                    },
                }),
            );

            if (videoPacketStream != null) {
                const myself = this;

                // Enforce sending config package
                this.resentConfigPackage(client);

                videoPacketStream
                    .pipeTo(
                        // @ts-expect-error
                        new WritableStream({
                            write(packet: ScrcpyMediaStreamPacket) {
                                switch (packet.type) {
                                    case "configuration":
                                        // Handle configuration packet
                                        const newStreamConfig = JSON.stringify({
                                            streamId: adbConnection.serial,
                                            h265: useH265,
                                            type: "configuration",
                                            data: Buffer.from(packet.data).toString('base64'), // Convert Uint8Array to Base64 string
                                        });
                                        // Save packet for clients after this first packet emission
                                        myself.broadcastToClients(newStreamConfig);
                                        logger.trace("Sending configuration frame {newStreamConfig}", { newStreamConfig })

                                        // It is sent only once while opening the video stream and set the renderer
                                        myself.scrcpyStreamConfig = newStreamConfig;
                                        break;

                                    case "data":
                                        // Handle data packet
                                        myself.broadcastToClients(
                                            JSON.stringify({
                                                streamId: adbConnection.serial,
                                                h265: useH265,
                                                type: "data",
                                                keyframe: packet.keyframe,
                                                // @ts-expect-error
                                                pts: packet.pts.toString(), // Convert bigint to string
                                                data: Buffer.from(packet.data).toString('base64'), // Convert Uint8Array to Base64 string
                                            })
                                        );
                                        break;
                                    default:
                                        logger.warn("Unkown packet from video pipe: {packet}", { packet });
                                }
                            },
                        }),
                    ).catch((e) => {
                        logger.error(`Error while piping video stream of ${adbConnection.serial}\n{e}`, { e });
                    });
            } else {
                logger.error(`Couldn't find a video stream from ${adbConnection.serial}'s scrcpy server`)
            }

        } catch (error) {
            if (error instanceof AdbScrcpyExitedError) {
                // Do not raise an error if the stream been properly closed while switching codec
                if (!error.output[0].startsWith("Aborted"))
                    logger.fatal("Error in startStreaming: {error}", { error });
                else if (!flipWidth)
                    return false;
            } else {
                logger.fatal("Error in startStreaming: {error}", { error });
            }
        }
    }

    resentAllConfigPackage(retry: boolean = false, timeoutDelay: number = 500) {
        logger.debug("Force reset video")
        let anyFailed = false;
        for (const c of this.scrcpyClients) {
            setTimeout(() => {
                anyFailed = anyFailed || this.resentConfigPackage(c);
            }, timeoutDelay);
        }

        if (anyFailed && retry) {
            logger.debug("Some failed, restarting now...");
            this.resentAllConfigPackage();
        }
    }


    resentConfigPackage(client: AdbScrcpyClient<any>): boolean {
        let gotError: boolean = false;
        const promiseResult = client.controller?.resetVideo();
        if (promiseResult)
            promiseResult
                .then((res) => {
                    logger.trace("Properly reset video stream {res}", { res });
                })
                .catch(err => {
                    const textError = err && (typeof err === 'string' ? err : err.message || String(err));

                    // Hide from non verbose since it's an _expected_ error
                    if (textError.includes("WritableStream is closed") && !ENV_VERBOSE)
                        logger.error("ResetVideo failed, probably leftover timeout from previous video stream { err }", { err });
                    else if (!textError.includes("WritableStream is closed"))
                        logger.error("Error while reseting video stream { err }", { err });

                    gotError = true;
                });
        return gotError;
    }

    broadcastToClients(packetJson: string): void {
        this.wsClients.forEach((client) => {
            client.send(packetJson, false, true);
        });
    }
}
