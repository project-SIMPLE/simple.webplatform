import fs from "fs/promises";
import path from "path";

import { ReadableStream } from "@yume-chan/stream-extra";
import { Adb } from "@yume-chan/adb";
import { DefaultServerPath, ScrcpyMediaStreamPacket } from "@yume-chan/scrcpy";
import { AdbScrcpyClient, AdbScrcpyExitedError, AdbScrcpyOptions3_3_3 } from "@yume-chan/adb-scrcpy";
import uWS, { TemplatedApp } from "uWebSockets.js";
import {getLogger, Logger} from "@logtape/logtape";

import { AdbManager } from "../adb/AdbManager.ts";

// Override the log function
const logger = getLogger(["android", "ScrcpyServer"]);

export class ScrcpyServer {
    // =======================
    // WebSocket
    private readonly wsServer!: TemplatedApp;
    private readonly wsClients: Set<uWS.WebSocket<any>>; // control channel: codec negotiation + stream_available announcements
    private readonly streamClients: Map<string, Set<uWS.WebSocket<{ streamId: string }>>>; // per-device data sockets, keyed by device IP
    private readonly activeStreams: Set<string>; // device IPs with a live scrcpy session (used to validate /stream/:id upgrades)
    private readonly scrcpyClientsByIp: Map<string, AdbScrcpyClient<AdbScrcpyOptions3_3_3<true>>>; // for triggering config reset on new device socket

    private readonly maxBackpressure: number = 8 * 1024 * 1024; // 8 MB

    // Starts optimistic (h265); permanently downgraded to h264 if any client can't decode h265
    private useH265: boolean = true;

    private scrcpyClients: AdbScrcpyClient<AdbScrcpyOptions3_3_3<true>>[] = [];
    // IPs that currently have an active startStreaming supervisor loop running.
    private readonly activeStartStreaming = new Set<string>();
    // Latest pending startStreaming call per IP, queued while a session is still running.
    // Only the most recent call is kept — older ones are overwritten.
    // When the running session exits, the pending call is executed automatically.
    private readonly pendingStartStreaming = new Map<string, () => void>();

    // =======================
    // Scrcpy server
    declare server: Buffer;

    private readonly adbManager!: AdbManager;

    constructor(adbManager: AdbManager) {
        // Set global variables
        logger.info(`Using codec ${this.useH265 ? "h265" : "h264"}`)

        // Set local variables
        this.adbManager = adbManager;

        this.wsClients = new Set<uWS.WebSocket<any>>();
        this.streamClients = new Map();
        this.activeStreams = new Set();
        this.scrcpyClientsByIp = new Map();

        const host = process.env.WEB_APPLICATION_HOST || '0.0.0.0';
        const port = parseInt(process.env.VIDEO_WS_PORT || '8082', 10);

        try {
            this.wsServer = uWS.App();
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
            maxPayloadLength: 256 * 1024, // 256 KB: Adjust based on expected video bitrate & 6 video streams
            // When backpressure exceeds this, uWS *drops the connection*
            maxBackpressure: this.maxBackpressure,
            idleTimeout: 100, // 100 seconds (<2min) timeout
            // Send pings to uphold a stable connection
            sendPingsAutomatically: true,

            open: (ws) => {
                this.wsClients.add(ws);
                logger.debug("Control client connected");

                // Announce all currently active streams so the client can open their per-device data sockets
                for (const ip of this.activeStreams) {
                    ws.send(JSON.stringify({ type: "stream_available", streamId: ip }), false, false);
                }
            },

            drain: (ws) => {
                logger
                    .getChild("Drain")
                    .info(`Backpressure drained, streaming should be back to normal, buffered: ${ws.getBufferedAmount()}`);
            },

            message: async (_ws, message) => {
                try {
                    const jsonMessage: { type: string, h264: boolean, h265: boolean, av1: boolean }
                        = JSON.parse(Buffer.from(message).toString());

                    logger.debug("Received message from streaming client:\n{jsonMessage}", { jsonMessage });

                    const previousCodec = this.useH265;
                    // Codec selection is a one-way downgrade: start optimistic (h265),
                    // switch to h264 permanently if any client can't decode h265.
                    // We never upgrade back — that would break already-connected h264-only clients.
                    if (!jsonMessage.h265 && !jsonMessage.h264) {
                        logger.fatal("Client doesn't support any compatible codec!");
                    } else if (!jsonMessage.h265) {
                        this.useH265 = false;
                    }

                    // Reset video streams if codec changed !
                    if (previousCodec != this.useH265) {
                        logger.warn(`Restarting streams with new codec (${this.useH265 ? "h265" : "h264"})`);
                        // Clear active streams immediately so control clients that reconnect
                        // during the transition don't receive stale stream_available announcements.
                        // The exited handlers on old clients will now find no matching entry to delete.
                        this.activeStreams.clear();
                        this.scrcpyClientsByIp.clear();
                        for (const client of this.scrcpyClients) {
                            await client.controller!.close();
                            await client.close();
                        }
                        this.scrcpyClients = [];
                        await this.adbManager.restartStreamingAll()
                            .then(async () => {
                                logger.debug("All streams restarted")
                                // Ensure video stream are well init after long restart
                                await this.resentAllConfigPackage(true, 500)
                                    .then(() => logger.trace("Config resent after stream restart"));
                            });

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

        // Per-device data sockets: all packets (config + data) for a device flow here in order.
        // Clients open this after receiving a stream_available announcement on the control socket above.
        this.wsServer.ws<{ streamId: string }>('/stream/:id', {
            compression: uWS.DISABLED,
            maxPayloadLength: 256 * 1024,
            maxBackpressure: this.maxBackpressure, // 8 MB per stream
            idleTimeout: 100,
            sendPingsAutomatically: true,

            upgrade: (res, req, context) => {
                const ip = req.getParameter(0);
                if (!ip || !this.activeStreams.has(ip)) {
                    res.writeStatus('404 Not Found').end('Stream not found');
                    return;
                }
                res.upgrade<{ streamId: string }>(
                    { streamId: ip },
                    req.getHeader('sec-websocket-key'),
                    req.getHeader('sec-websocket-protocol'),
                    req.getHeader('sec-websocket-extensions'),
                    context
                );
            },

            open: (ws) => {
                const { streamId } = ws.getUserData();
                if (!this.streamClients.has(streamId)) {
                    this.streamClients.set(streamId, new Set());
                }
                this.streamClients.get(streamId)!.add(ws);
                logger.debug(`[${streamId}] Device socket connected`);

                // Trigger a config reset so this client receives a fresh config + keyframe
                const scrcpyClient = this.scrcpyClientsByIp.get(streamId);
                if (scrcpyClient) {
                    this.resentConfigPackage(scrcpyClient)
                        .then(() => logger.debug(`[${streamId}] Config resent for new device socket client`));
                }
            },

            drain: (ws) => {
                const { streamId } = ws.getUserData();
                logger
                    .getChild("Drain")
                    .info(`[${streamId}] Backpressure drained, streaming should be back to normal, buffered: ${ws.getBufferedAmount()}`);
            },

            close: (ws, code, message) => {
                const { streamId } = ws.getUserData();
                this.streamClients.get(streamId)?.delete(ws);
                logger.info(`[${streamId}] Device socket closed. Code: ${code}, Reason: ${Buffer.from(message).toString()}`);
            },
        });
    }

    async loadScrcpyServer() {
        // To keep for when walking away from custom server
        //this.server = await fs.readFile(BIN)

        // Use custom hotfix from rom1v (official scrcpy's dev)
        // This fix 'simply' better manage fallback video API weirdly working on MQ headsets
        // https://github.com/Genymobile/scrcpy/issues/5913#issuecomment-3677889916
        const scrcpyServerFullPath: string = path.join(process.cwd(), 'toolkit', 'scrcpyServer-v3.3.4-rom1v');
        this.server = await fs.readFile(scrcpyServerFullPath);
        logger.trace(`Loading scrcpy server from '${scrcpyServerFullPath}'`);
    }

    // Entry point: validate the device IP, then keep the stream alive forever.
    // Each session is delegated to runSession(); the loop restarts it automatically
    // after a 1 s cooldown unless the session was stopped intentionally (codec switch).
    async startStreaming(adbConnection: Adb, deviceModel: string, flipWidth: boolean = false): Promise<void> {
        const streamIp: string | undefined = (() => {
            try {
                return adbConnection.serial.split(':')[0];
            } catch {
                return undefined;
            }
        })();

        // Stop streaming if not an IP address
        if (streamIp == undefined || streamIp.split('.').length <= 1) {
            logger.error(`Couldn't get stream IP from adb connection, stop streaming for ${adbConnection.serial}`);
            return;
        }

        while (true) {
            const shouldRestart = await this.runSession(adbConnection, streamIp, deviceModel, flipWidth);
            if (!shouldRestart) break;
            logger.info(`[${streamIp}] Restarting stream in 1s...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    // Runs one scrcpy session from start to finish.
    // Returns true  → caller should restart (unexpected crash or natural exit).
    // Returns false → caller should stop (intentional abort, e.g. codec switch).
    private async runSession(adbConnection: Adb, streamIp: string, deviceModel: string, flipWidth: boolean): Promise<boolean> {
        // Build fresh options each session so a codec switch is picked up correctly.
        const scrcpyOptions = new AdbScrcpyOptions3_3_3({
            // scrcpy options
            // No videoCodecOptions: let the Android encoder choose its own profile/level.
            // Decoding is done by WebCodecs in the browser, which supports any H264/H265 profile.
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
            { version: "3.3.4" });
        logger.debug(`[${streamIp}] Starting scrcpy stream with ${useH265 ? "h265" : "h264"} codec`);

        let client: AdbScrcpyClient<AdbScrcpyOptions3_3_3<true>> | undefined;

        try {
            if (this.server == null) {
                await this.loadScrcpyServer();
            }

            logger.info(`[${streamIp}] Starting scrcpy for ${adbConnection.serial}`);

            logger.debug(`[${streamIp}] Sync adb with ${adbConnection.serial}`);
            const sync = await adbConnection.sync();
            try {
                await sync.write({
                    filename: DefaultServerPath,
                    file: new ReadableStream({
                        start: (controller) => {
                            controller.enqueue(new Uint8Array(this.server));
                            controller.close();
                        },
                    }),
                });
            } catch (error) {
                logger.fatal(`[${streamIp}] Error writing scrcpy server to  ${adbConnection.serial}: {error}`, { error });
            } finally {
                await sync.dispose();
            }

            // Apply different crop values to work with every devices
            if (deviceModel == "Quest_3S") {
                scrcpyOptions.value.crop = flipWidth ? "1570:1482:170:150" : "1482:1570:170:150";
            } else if (deviceModel == "Quest_3") {
                scrcpyOptions.value.angle = 23;
                scrcpyOptions.value.crop = flipWidth ? "1570:1482:300:250" : "1482:1570:300:250";
            } else {
                logger.warn(`[${streamIp}] Device ${deviceModel} is unknown, so no cropping is applied`);
            }

            logger.debug(`[${streamIp}] Pushing & start scrcpy server from ${adbConnection.serial}`);
            client = await AdbScrcpyClient.start(adbConnection, DefaultServerPath, scrcpyOptions);

            const { metadata, stream: videoPacketStream } = await client.videoStream;
            logger.debug(`[${streamIp}] {metadata}`, { metadata });
            // Prevent having stream ratio inverted, happened on some weird device...
            // https://github.com/project-SIMPLE/simple.webplatform/issues/78
            if ((metadata == undefined || metadata.width! < metadata.height!) && deviceModel.startsWith("Quest")) {
                logger.warn(`[${streamIp}] Something's weird here, headset's stream isn't in the good size ratio, restarting... metadata: {metadata}`, { metadata: metadata ? metadata : "the metadata is undefined" });
                // Make it crash voluntarily to restart stream
                client = await AdbScrcpyClient.start(adbConnection, DefaultServerPath, scrcpyOptions);
            }

            // Register stream as active and store the controller
            logger.debug(`[${streamIp}] Saving new scrcpy client ${adbConnection.serial}`);
            this.activeStreams.add(streamIp);
            this.scrcpyClientsByIp.set(streamIp, client);
            this.scrcpyClients.push(client);
            // Announce to all connected control clients so they open /stream/:streamIp
            this.broadcastToClients(JSON.stringify({ type: "stream_available", streamId: streamIp }));

            // Print output of Scrcpy server
            client.output.pipeTo(
                // @ts-expect-error
                new WritableStream<string>({
                    write(chunk: string): void {
                        logger.trace(`[${streamIp}] {chunk}`, { chunk });
                    },
                }),
            ).catch(err => {
                logger.debug(`[${streamIp}] Scrcpy output stream closed: {err}`, { err });
            });

            if (videoPacketStream != null) {
                const myself = this;

                videoPacketStream
                    .pipeTo(
                        // @ts-expect-error
                        new WritableStream({
                            write(packet: ScrcpyMediaStreamPacket) {
                                switch (packet.type) {
                                    case "configuration":
                                        { // Handle configuration packet
                                            const newStreamConfig = JSON.stringify({
                                                streamId: streamIp,
                                                h265: useH265,
                                                type: "configuration",
                                                data: Buffer.from(packet.data).toString('base64'), // Convert Uint8Array to Base64 string
                                            });
                                            // Send to all clients on this device's data socket
                                            myself.broadcastToStream(streamIp, newStreamConfig);
                                            logger.trace(`[${streamIp}] Sending configuration frame {newStreamConfig}`, { newStreamConfig });
                                        }
                                        break;

                                    case "data":
                                        // Handle data packet — sent on the dedicated per-device socket
                                        myself.broadcastToStream(
                                            streamIp,
                                            JSON.stringify({
                                                streamId: streamIp,
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
                                        logger.warn(`[${streamIp}] Unkown packet from video pipe: {packet}`, { packet });
                                }
                            },
                        }),
                    ).catch((e) => {
                        logger.error(`[${streamIp}] Error while piping video stream of ${adbConnection.serial}\n{e}`, { e });
                    });
            } else {
                logger.error(`[${streamIp}] Couldn't find a video stream from ${adbConnection.serial}'s scrcpy server`);
            }

            // Supervisor: block until this session ends, then let the caller decide whether to restart.
            await client.exited;

            // If the maps were cleared by a codec switch (activeStreams.clear() runs before
            // client.close()), restartStreamingAll will start a fresh session — don't restart here.
            if (this.scrcpyClientsByIp.get(streamIp) !== client) {
                logger.debug(`[${streamIp}] Session ended due to codec switch, no automatic restart`);
                return false;
            }
            logger.info(`[${streamIp}] Scrcpy session ended for ${adbConnection.serial}`);
            return true;

        } catch (error) {
            // Same codec-switch guard for the error path: client.close() can cause exited to
            // reject with various errors depending on how ADB tears down the connection.
            if (client && this.scrcpyClientsByIp.get(streamIp) !== client) {
                logger.debug(`[${streamIp}] Stream stopped for codec switch, no automatic restart`);
                return false;
            }
            if (error instanceof AdbScrcpyExitedError) {
                if (error.output[0]?.startsWith("Aborted")) {
                    // Secondary check: explicit "Aborted" from scrcpy also signals intentional stop.
                    logger.debug(`[${streamIp}] Scrcpy stopped intentionally for ${adbConnection.serial}`);
                    return false;
                }
                logger.error(`[${streamIp}] Scrcpy exited with error for ${adbConnection.serial}: {error}`, { error });
            } else {
                logger.fatal(`[${streamIp}] Unexpected error in stream session for ${adbConnection.serial}: {error}`, { error });
            }
            return true; // restart on any unexpected error

        } finally {
            // Always clean up, but guard against wiping a newer session's registration.
            // During a codec switch a new client may have already taken over this IP.
            if (client) {
                if (this.scrcpyClientsByIp.get(streamIp) === client) {
                    this.activeStreams.delete(streamIp);
                    this.scrcpyClientsByIp.delete(streamIp);
                }
                // Removing from the flat list is always safe (indexOf returns -1 if already cleared).
                const index = this.scrcpyClients.indexOf(client);
                if (index > -1) this.scrcpyClients.splice(index, 1);
            }
        }
    }

    async resentAllConfigPackage(retry: boolean = false, timeoutDelay: number = 500) {
        logger.debug("Force reset video");
        let anyFailed = false;

        for (const c of this.scrcpyClients) {
            // Check if client has already exited (non-blocking check)
            const hasExited = await Promise.race([
                c.exited.then(() => true),
                Promise.resolve(false)
            ]);

            if (hasExited) {
                logger.warn("Client already exited, skipping reset");
                continue;
            }

            setTimeout(() => {
                this.resentConfigPackage(c).then(failed => {
                    anyFailed = anyFailed || failed;
                });
            }, timeoutDelay);
        }

        if (anyFailed && retry) {
            logger.debug("Some failed, restarting now...");
            await new Promise(resolve => setTimeout(resolve, timeoutDelay + 100));
            this.resentAllConfigPackage();
        }
    }

    async resentConfigPackage(client: AdbScrcpyClient<any>): Promise<boolean> {
        logger.trace("Reset video for client {client}", { client });

        let gotError: boolean = true;

        try {
            const promiseResult = client.controller?.resetVideo();

            if (promiseResult){
                promiseResult
                    .then((res) => {
                        logger.trace("Properly reset video stream {res}", { res });

                        // No problem happened
                        gotError = false;
                    })
                    .catch(err => {
                        const textError = err && (typeof err === 'string' ? err : err.message || String(err));

                        // Hide from non verbose since it's an _expected_ error
                        if (textError.includes("WritableStream is closed"))
                            logger.error("ResetVideo failed, probably leftover timeout from previous video stream { err }", { err });
                        else
                            logger.error("Error while reseting video stream { err }", { err });
                    });
            }
        } catch (e) {
            logger.error("Something horrible !! {e}", {e});
        }

        return gotError;
    }

    private safeSend(ws: uWS.WebSocket<{ streamId: string }>, packetJson: string): void {
        const customLogger = logger.getChild("Drain");
        const { streamId } = ws.getUserData();

        if (ws.getBufferedAmount() > 6 * 1024 * 1024) { // 6 MB threshold → 2 MB room before maxBackpressure
            customLogger.warn(`[${streamId}] Dropping frame — client too slow`);
            return;
        }

        /*  Possible returned values:
            0 : OK
            1 : Backpressure built up (but still queued)
            2 : Message dropped — backpressure limit exceeded
                - The last one is the only interesting one
         */
        if (ws.send(packetJson, false, true) === 2) {
            customLogger.error(`[${streamId}] Video stream frame dropped...`);
        }
    }

    broadcastToStream(ip: string, packetJson: string): void {
        this.streamClients.get(ip)?.forEach((client) => {
            this.safeSend(client, packetJson);
        });
    }

    broadcastToClients(packetJson: string): void {
        const customLogger: Logger = logger.getChild("Drain");
        this.wsClients.forEach((client) => {

            if (client.getBufferedAmount() > 6 * 1024 * 1024) { // 6 MB threshold -> 2MB room
                customLogger.warn('Dropping frame — client too slow');
                return false;
            }

            /*  Possible returned values:
                0 : OK
                1 : Backpressure built up (but still queued)
                2 : Message dropped — backpressure limit exceeded
                    - The last one is the only interesting one
             */
            if (client.send(packetJson, false, true) == 2) {
                customLogger.error('Video stream frame dropped...');
            }
        });
    }
}
