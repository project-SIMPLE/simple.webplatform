import Evilscan from "evilscan";

import Controller from "../../core/Controller.ts";
import {HEADSETS_IP, ENV_EXTRA_VERBOSE, ENV_VERBOSE} from "../../index.ts";

class DeviceFinder {
    controller: Controller;
    ipToConnect: string[];
    isScanning: boolean = false;

    constructor(controller: Controller) {
        this.controller = controller;
        this.ipToConnect = HEADSETS_IP;

        // Filter out already connected IPs
        const clientStreaming = this.controller.adb_manager.clientCurrentlyStreaming;
        this.ipToConnect = this.ipToConnect.filter(ip => {
            return !clientStreaming.some(item => item.serial.startsWith(ip));
        });
        if (ENV_VERBOSE) console.log("[ADB FINDER] Loaded successfully, will start to scan for devices now...");
    }

    public async scanAndConnect() {
        if (this.ipToConnect.length === 0 || this.isScanning) {
            if(this.ipToConnect.length === 0)
                if (ENV_VERBOSE) console.log('[ADB FINDER] Every known IP already connected, stopping now...');
            else
                if (ENV_EXTRA_VERBOSE) console.log('[ADB FINDER] Already scanning for new IP, skipping this call...');

            return;
        }

        this.isScanning = true; // Set the flag before starting to connect, otherwise, multiple attempts will start concurrently before the flag will be set.

        try {
            if (ENV_VERBOSE) console.log('[ADB FINDER] Start looking to connect for those IP : ', this.ipToConnect);

            for (let i = 0; i < this.ipToConnect.length; i++) { // Directly use this.ipToConnect. No need to copy
                const ip = this.ipToConnect[i];
                if (ENV_VERBOSE) console.log('[ADB FINDER] Trying ', ip);

                try {
                    const output: boolean = await this.scanAndConnectIP(ip);

                    if (output) { //.includes('OK')
                        if (ENV_VERBOSE) console.log('[ADB FINDER] Successfully connected to ', ip);
                        this.ipToConnect.splice(i--, 1); // Remove the connected IP; adjust index
                    } else
                        if (ENV_VERBOSE) console.warn('[ADB FINDER] Failed to connect to ' + ip);

                } catch (innerError) {
                    console.error(`[ADB FINDER] Error connecting to ${ip}:`, innerError);
                }
            }
        } finally {
            if (this.ipToConnect.length > 0) {

                this.isScanning = false;  // Allow new thread to search for devices

                if (ENV_VERBOSE) console.log('[ADB FINDER] Those IP are left to be connected : ', this.ipToConnect);
                if (ENV_VERBOSE) console.log('[ADB FINDER] Retry in 5 seconds...');

                // Trigger new call
                setTimeout(async () => {
                    await this.scanAndConnect();
                }, 5000);

            } else {
                if (ENV_VERBOSE) console.log('[ADB FINDER] All devices connected.');
                if (ENV_VERBOSE) console.log('[ADB FINDER] Stopping now...');
            }
        }
    }


    public async scanAndConnectIP(ipAddress: string): Promise<boolean> {
        let alreadyConnected: boolean = false;
        let finishedScanning: boolean = false;

        const options = {
            target: ipAddress,
            port: '5555,30000-49999',   // your custom range
            // port: '1-65535',
            status: 'O',                // 'TROU' : Timeout, Refused, Open, Unreachable
            concurrency: 500,           // how many ports to test in parallel
            timeout: 250,               // maximum number of milliseconds before closing the connection
            banner:false
        };

        new Evilscan(options)
            .on('result', async (data:any) => {
                if (ENV_EXTRA_VERBOSE) console.log('[ADB FINDER - EvilScan] === Scan of ', ipAddress,' find this:', data);
                if (!alreadyConnected){
                    if (ENV_EXTRA_VERBOSE) console.log('[ADB FINDER - EvilScan] === Trying to ADB connect to', data.ip, ':', data.port);

                    try {
                        alreadyConnected = await this.controller.adbConnectNewDevice(data.ip, data.port);
                    } catch (e) {
                        if (ENV_EXTRA_VERBOSE) console.error("[ADB FINDER - EvilScan] === Couldn't connect with this error message", e)
                    }
                } else
                    if (ENV_EXTRA_VERBOSE) console.log('[ADB FINDER - EvilScan] === Already connected, skipping', data.ip, ':', data.port);
            })
            .on('done', () => {
                if (ENV_EXTRA_VERBOSE) console.log('[ADB FINDER - EvilScan] === Scan of ', ipAddress,' completed.');
                finishedScanning = true;
            })
            .run();

        // Dirty waiting for scan to finish
        while(!finishedScanning) {
            await new Promise(f => setTimeout(f, 1000));
        }

        return alreadyConnected;
    }
}

export default DeviceFinder;
