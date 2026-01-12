// @ts-expect-error
import Evilscan from "evilscan";
import {networkInterfaces} from "os";

import {HEADSETS_IP, ENV_EXTRA_VERBOSE, ENV_VERBOSE} from "../../index.ts";
import {getLogger} from "@logtape/logtape";
import {AdbManager} from "./AdbManager.ts";

// Override the log function
const logger= getLogger(["android", "DeviceFinder"]);
const loggerES= getLogger(["android", "DeviceFinder", "EvilScan"]);

class DeviceFinder {
    adbManager: AdbManager;
    ipToConnect: string[];
    isScanning: boolean = false;

    constructor(adbm: AdbManager) {
        this.adbManager = adbm;
        this.ipToConnect = HEADSETS_IP;

        // Filter out already connected IPs
        this.removeConnectedIp();

        logger.debug("Loaded successfully, will start to scan for devices now...");
    }

    private removeConnectedIp(){
        const clientStreaming = this.adbManager.clientCurrentlyStreaming;
        this.ipToConnect = this.ipToConnect.filter(ip => {
            return !clientStreaming.some(item => item.serial.startsWith(ip));
        });
    }

    public async scanAndConnect(firstRun: boolean = false) {
        if(firstRun && HEADSETS_IP.length == 0) {
            // Auto-detect headsets if none listed
            await this.autoDetectDevices();
            this.removeConnectedIp();
        }

        if (this.ipToConnect.length === 0 || this.isScanning) {
            if(this.ipToConnect.length === 0)
                logger.debug('Every known IP already connected, stopping now...');
            else
                logger.trace('Already scanning for new IP, skipping this call...');

            return;
        }

        this.isScanning = true; // Set the flag before starting to connect, otherwise, multiple attempts will start concurrently before the flag will be set.

        try {
            logger.debug('Start looking to connect for those IP: {list}', {list: this.ipToConnect});

            for (let i = 0; i < this.ipToConnect.length; i++) { // Directly use this.ipToConnect. No need to copy
                const ip = this.ipToConnect[i];
                logger.debug(`Trying ${ip}`);

                try {
                    const output: boolean = await this.scanAndConnectIP(ip);

                    if (output) { //.includes('OK')
                        logger.debug(`Successfully connected to ${ip}`);
                        this.ipToConnect.splice(i--, 1); // Remove the connected IP; adjust index
                    } else
                        if (ENV_VERBOSE) logger.warn(`Failed to connect to ${ip}`);

                } catch (innerError) {
                    logger.error(`Error connecting to ${ip}: {e}`, {e: innerError});
                }
            }
        } finally {
            if (this.ipToConnect.length > 0) {

                this.isScanning = false;  // Allow new thread to search for devices

                logger.debug('Those IP are left to be connected: {list}\nRetry in 5 seconds...', {list: this.ipToConnect});

                // Trigger new call
                setTimeout(async () => {
                    await this.scanAndConnect();
                }, 5000);

            } else {
                logger.debug('All devices connected.\nStopping now...');
            }
        }
    }

    public async scanAndConnectIP(ipAddress: string): Promise<boolean> {
        let alreadyConnected: boolean = false;
        let finishedScanning: boolean = false;

        new Evilscan({
                target: ipAddress,
                port: '5555,30000-49999',   // your custom range
                status: 'O',                // 'TROU' : Timeout, Refused, Open, Unreachable
                concurrency: 500,           // how many ports to test in parallel
                timeout: 250,               // maximum number of milliseconds before closing the connection
                banner:false
            })
            .on('result', async (data:any) => {
                loggerES.trace(`Scan of ${ipAddress} find this: {data}`, {data});
                if (!alreadyConnected){
                    loggerES.trace(`Trying to ADB connect to ${data.ip}:${data.port}`);

                    try {
                        alreadyConnected = await this.adbManager.connectNewDevice(data.ip, data.port);
                    } catch (e) {
                        if (ENV_EXTRA_VERBOSE) loggerES.error("Couldn't connect with this error message: {e}", {e})
                    }
                } else
                    loggerES.trace(`Already connected, skipping ${data.ip}:${data.port}`);
            })
            .on('done', () => {
                loggerES.trace(`Scan of ${ipAddress} completed.`);
                finishedScanning = true;
            })
            .run();

        // Dirty waiting for scan to finish
        while(!finishedScanning) {
            await new Promise(f => setTimeout(f, 1000));
        }

        return alreadyConnected;
    }

    public async autoDetectDevices() {
        let serverLocalIp:string = "";
        let finishedScanning: boolean = false;

        try {
            for (let [interfaceName, interfaceInfo] of Object.entries(networkInterfaces())) {
                // Skip localhost/vpn interfaces
                if (interfaceName.startsWith('lo') || interfaceName.startsWith('tail'))
                    continue;

                for (const i of interfaceInfo!){
                    if (
                        i.family === "IPv6"
                        || i.address.startsWith("127.0.0")
                    )
                        continue;
                    else
                        serverLocalIp = i.address;
                }
            }
        } catch (e) {
            loggerES.error("Can't find the ip address for your device...\n{e}", {e});
        } finally {
            loggerES.debug(`Scanning over IP subnet: ${serverLocalIp}/24`);
        }

        if (!serverLocalIp.startsWith("192.168.68")) {
            loggerES.warn("Disable device auto-scan because server is not in the default IP range");
            return;
        }

        new Evilscan({
                target: serverLocalIp + "/24",  //ip address subnet,
                port: '5555',                     // your custom range
                status: 'RO',                   // 'TROU' : Timeout, Refused, Open, Unreachable
                concurrency: 255,               // how many ports to test in parallel
                timeout: 1000                    // maximum number of milliseconds before closing the connection
            })
            .on('result', async (data:any) => {
                if (data.ip != serverLocalIp) {
                    loggerES.trace(`Scan find this: ${data.ip}`);
                    this.ipToConnect.push(data.ip);
                }
            })
            .on('done', () => {
                loggerES.trace('=== Scan completed.');
                finishedScanning = true;
            })
            .run();

        // Dirty waiting for scan to finish
        while(!finishedScanning) {
            await new Promise(f => setTimeout(f, 1000));
        }
    }
}

export default DeviceFinder;
