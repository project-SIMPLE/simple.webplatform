import { spawn } from 'child_process';
import path from 'path';

import Controller from "../controller.ts";
import {HEADSETS_IP, useExtraVerbose, useVerbose} from "../index.ts";

class DeviceFinder {
    controller: Controller;
    private scriptPath: string;
    ipToConnect: string[];
    isScanning: boolean = false;

    constructor(controller: Controller) {
        this.controller = controller;
        this.scriptPath = path.join(process.cwd(), 'toolkit', 'scan_and_connect.zsh');
        this.ipToConnect = HEADSETS_IP;

        // Filter out already connected IPs
        const clientStreaming = this.controller.adb_manager.clientCurrentlyStreaming;
        this.ipToConnect = this.ipToConnect.filter(ip => {
            return !clientStreaming.some(item => item.startsWith(ip));
        });
        if (useVerbose) console.log("[ADB FINDER] Loaded successfully, will start to scan for devices now...");
    }

    public async scanAndConnect() {
        if (this.ipToConnect.length === 0 || this.isScanning) {
            if(this.ipToConnect.length === 0)
            {
                console.log('[ADB FINDER] Every known IP already connected, stopping now...');
            } else
                if (useExtraVerbose) console.log('[ADB FINDER] Already scanning for new IP, skipping this call...');

            return;
        }

        this.isScanning = true; // Set the flag before starting to connect, otherwise, multiple attempts will start concurrently before the flag will be set.

        try {
            console.log('[ADB FINDER] Start looking to connect for those IP : ', this.ipToConnect);

            for (let i = 0; i < this.ipToConnect.length; i++) { // Directly use this.ipToConnect. No need to copy
                const ip = this.ipToConnect[i];
                if (useVerbose) console.log('[ADB FINDER] Trying ', ip);

                try {
                    const output = await this.scanAndConnectIP(ip);

                    if (output.includes('OK')) {
                        console.log('[ADB FINDER] Successfully connected to ', ip);
                        await this.controller.adb_manager.startStreaming(ip);
                        this.ipToConnect.splice(i, 1); // Remove the connected IP; adjust index
                        i--;                     // Decrement i to account for removed element
                    } else if (output.includes('ERROR')) {
                        console.warn('[ADB FINDER] Failed to connect to ' + ip);
                        if (useVerbose) console.warn(output);
                    } else {
                        console.error('[ADB FINDER] Unknown message:', output);
                    }

                } catch (innerError) {
                    console.error(`[ADB FINDER] Error connecting to ${ip}:`, innerError);
                }
            }
        } finally {
            if (this.ipToConnect.length > 0) {

                this.isScanning = false;  // Allow new thread to search for devices

                console.log('[ADB FINDER] Those IP are left to be connected : ', this.ipToConnect);
                console.log('[ADB FINDER] Retry in 5 seconds...');

                // Trigger new call
                setTimeout(async () => {
                    await this.scanAndConnect();
                }, 5000);

            } else {
                console.log('[ADB FINDER] All devices connected.');
                console.log('[ADB FINDER] Stopping now...');
            }
        }
    }


    public async scanAndConnectIP(ipAddress: string): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const child = spawn('zsh', [this.scriptPath, ipAddress]);
            let outputLines: string[] = []; // Store output lines

            child.stdout.on('data', (data) => {
                const lines = data.toString().split('\n');
                outputLines.push(...lines);
            });

            child.stderr.on('data', (data) => {
                console.error('Script Error:', data.toString());
            });

            child.on('close', (code) => {
                if (code === 0) {
                    resolve(outputLines);
                } else {
                    reject(`Script failed with exit code ${code}`);
                }
            });
        });
    }
}

export default DeviceFinder;