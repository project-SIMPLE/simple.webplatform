/**
 * AdbDaemonDirectSocketsDevice.ts
 * ===========
 *
 * Description:
 * The following code implements an AdbDaemonDevice using a TCPSocket:
 *
 * This allows to open TCP connections to Android devices
 *
 * Source: https://docs.tangoapp.dev/tango/daemon/tcp/create-connection/#adbdaemondirectsocketsdevice
 */

import type { AdbDaemonDevice } from "@yume-chan/adb";
import { AdbPacket, AdbPacketSerializeStream } from "@yume-chan/adb";
import {
    StructDeserializeStream,
    MaybeConsumable,
    WrapReadableStream,
    WrapWritableStream,
} from "@yume-chan/stream-extra";
import { TCPSocket } from "./TCPSocket"

export interface AdbDaemonDirectSocketDeviceOptions {
    host: string;
    port?: number;
    name?: string;
    unref?: boolean;
}

export class AdbDaemonDirectSocketsDevice implements AdbDaemonDevice {
    #options: AdbDaemonDirectSocketDeviceOptions;

    readonly serial: string;

    get host(): string {
        return this.#options.host;
    }

    readonly port: number;

    get name(): string | undefined {
        return this.#options.name;
    }

    constructor(options: AdbDaemonDirectSocketDeviceOptions) {
        this.#options = options;
        this.port = options.port ?? 5555;
        this.serial = `${this.host}:${this.port}`;
    }

    async connect() {
        const socket = new TCPSocket(this.host, this.port, {
            noDelay: true,
            unref: this.#options.unref,
        });

        const { readable, writable } = await socket.opened;

        return {
            readable: new WrapReadableStream(readable).pipeThrough(
                new StructDeserializeStream(AdbPacket),
            ),
            writable: new WrapWritableStream(writable)
                .bePipedThroughFrom(new MaybeConsumable.UnwrapStream())
                .bePipedThroughFrom(new AdbPacketSerializeStream()),
        };
    }
}