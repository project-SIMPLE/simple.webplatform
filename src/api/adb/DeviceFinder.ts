import { spawn } from 'child_process';
import path from 'path';

import Controller from "../controller.ts";
import {HEADSETS_IP, useVerbose} from "../index.ts";

class DeviceFinder {
    controller: Controller;
    private scriptPath: string;
    ipToConnect: string[];

    constructor(controller: Controller) {
        this.controller = controller;
        this.scriptPath = path.join(process.cwd(), 'toolkit', 'scan_and_connect.zsh');
        this.ipToConnect = HEADSETS_IP;

        // Filter out already connected IPs
        const clientStreaming = this.controller.adb_manager.clientCurrentlyStreaming;
        this.ipToConnect = this.ipToConnect.filter(ip => {
            return !clientStreaming.some(item => item.startsWith(ip));
        });
    }

    public async scanAndConnect() {
        if (this.ipToConnect.length == 0){
            console.log('[ADB FINDER] Every known IP already connected, skipping now...');
            return;
        }
        console.log(
            '[ADB FINDER] Start looking to connect for those IP : ',
            this.ipToConnect
        );

        // Create a copy of the IP array to avoid modification issues
        const ipToTry = [...this.ipToConnect];

        for (let i = 0; i < ipToTry.length; i++) {
            console.log('Trying ', ipToTry[i]);
            try {
                // @ts-ignore
                const output = await this.scanAndConnectIP(ipToTry[i]);

                if (output.includes('OK')) {
                    console.log('[ADB FINDER] Successfully connected to ', ipToTry[i]);

                    // Start casting for newly connected device
                    await this.controller.adb_manager.startStreaming(ipToTry[i]);

                    // Remove the IP from the original array
                    this.ipToConnect.splice(this.ipToConnect.indexOf(ipToTry[i]), 1);
                } else if (output.includes('ERROR')) {
                    console.warn('[ADB FINDER] Failed to connect to ' + ipToTry[i]);
                    if (useVerbose) console.warn(output);
                } else {
                    console.error('[ADB FINDER] Unknown message... ');
                    console.error(output);
                }
            } catch (error) {
                console.error('[ADB FINDER] Error connecting:', error);
            }
        }

        if (this.ipToConnect.length > 0) {
            console.log('[ADB FINDER] Those IP are left to be connected : ', this.ipToConnect);
            console.log('[ADB FINDER] Retry in 10 seconds...');

            await new Promise((resolve) => {
                setTimeout(async () => {
                    await this.scanAndConnect(); // Await the recursive call!
                    resolve(undefined); // Resolve the promise to continue
                }, 10000);
            });
        } else {
            console.log("[ADB FINDER] All devices connected.");
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