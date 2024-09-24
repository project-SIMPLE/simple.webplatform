/**
 * AdbManager.ts
 * ===========
 *
 * Description:
 * It manages Adb sockets :)
 */

import {Adb, AdbDaemonTransport, AdbPacketData, AdbPacketInit} from "@yume-chan/adb";
import {Consumable, ReadableWritablePair} from "@yume-chan/stream-extra";

import {CREDENTIAL} from "./CredentialStore.ts";
import {AdbDaemonDirectSocketsDevice} from "./AdbDaemonDirectSocketsDevice.ts";

export class AdbManager {
    adbConnections: Map<string, Adb> = new Map();

    constructor() {
    }

    getAdbConnections(): Map<string, Adb> {
        return this.adbConnections;
    }

    async addDevice(ip: string, port = 5555, deviceId = ""): Promise<void> {
        if (deviceId == ""){
            deviceId = ip;
        }

        const newDevice: AdbDaemonDirectSocketsDevice = new AdbDaemonDirectSocketsDevice({
            host: ip,
            port: port,
        });

        const adbConnection: ReadableWritablePair<
            AdbPacketData,
            Consumable<AdbPacketInit>
        > = await newDevice.connect();

        const transport: AdbDaemonTransport = await AdbDaemonTransport.authenticate({
            serial: deviceId,
            connection: adbConnection,
            credentialStore: CREDENTIAL,
        });

        this.adbConnections.set(deviceId, new Adb(transport));
    }

}