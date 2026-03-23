import { NUTClient, Monitor } from 'nut-client';
import { getLogger } from '@logtape/logtape';
import { isCommandAvailable } from '../../index.ts';

const logger = getLogger(["infra", "nut", "NutManager"]);

export class NutManager {
    private client: NUTClient;
    private monitor: Monitor | null = null;
    private upsName: string;
    private host: string;
    private port: number;

    constructor() {
        this.host = process.env.NUT_HOST || 'localhost';
        this.port = parseInt(process.env.NUT_PORT || '3493', 10);
        this.upsName = process.env.NUT_UPS_NAME || 'myUps';

        logger.info(`Initializing NUT Manager for UPS '${this.upsName}' at ${this.host}:${this.port}`);

        this.client = new NUTClient(this.host, this.port);
    }

    public async init(): Promise<void> {
        try {
            // If connecting to localhost, check if NUT tools are installed
            if (this.host === 'localhost' || this.host === '127.0.0.1') {
                if (!isCommandAvailable('upsd') && !isCommandAvailable('upsc')) {
                    logger.warn('NUT (Network UPS Tools) does not appear to be installed on this machine.');
                    logger.warn('To use this feature on macOS, please install it via homebrew: `brew install nut`');
                    logger.warn('Disabling NUT integration and cleaning up.');
                    this.close();
                    return;
                }
            }

            // First check if UPS is available
            const upses = await this.client.listUPS();
            logger.debug(`Available UPSes: {upses}`, {upses});

            if (!upses || Object.keys(upses).length === 0) {
                logger.warn('No UPS available or listed. Disabling NUT integration and cleaning up.');
                this.close();
                return;
            }

            // Check if our configured UPS is in the list
            if (!upses[this.upsName]) {
                logger.warn(`Configured UPS '${this.upsName}' not found in the available list. Disabling NUT integration and cleaning up.`);
                this.close();
                return;
            }

            // Valid UPS found. Setup Monitor
            logger.info(`UPS '${this.upsName}' found, setting up monitor...`);
            this.monitor = new Monitor(this.client, this.upsName);

            // Setup UPS Events

            // Fired when UPS switches to battery power (e.g. unplugged)
            this.monitor.on('ONBATT', () => {
                logger.warn(`UPS '${this.upsName}' is ON BATTERY. Power has been lost!`);
                this.handlePowerLoss();
            });

            // Fired when UPS is back on utility power (e.g. plugged back in)
            this.monitor.on('ONLINE', () => {
                logger.info(`UPS '${this.upsName}' is ONLINE. Utility power has been restored!`);
                this.handlePowerRestored();
            });

            // Fired when UPS battery is low
            this.monitor.on('LOWBATT', () => {
                logger.warn(`UPS '${this.upsName}' has LOW BATTERY! Preparing for shutdown sequence...`);
                this.handleLowBattery();
            });

            // Fired when battery needs replacement
            this.monitor.on('REPLBATT', () => {
                logger.warn(`UPS '${this.upsName}' needs battery replacement!`);
            });

            // Fired on UPS forced shutdown (FSD)
            this.monitor.on('FSD', () => {
                logger.warn(`UPS '${this.upsName}' forced shutdown initiated!`);
            });

            // (Optional) Catch-all for any event or specific variable changes
            // this.monitor.on('*', (event: string, ...args) => {
            //     logger.trace(`UPS Event ${event}: {args}`, { args });
            // });

            await this.monitor.start();
            logger.info('NUT Monitor started successfully.');

        } catch (error) {
            logger.error(`Failed to initialize NUT connection: {error}`, {error});
            this.close();
        }
    }

    private handlePowerLoss() {
        // TODO: Handle Power Loss
        // Possible Features:
        // - Broadcast warning to all connected clients.
        // - Save state of the GAMA Simulation if supported.
        // - Consider scheduling a graceful shutdown if power isn't restored within X minutes.
    }

    private handlePowerRestored() {
        // TODO: Handle Power Restored
        // Possible Features:
        // - Cancel any pending shutdowns.
        // - Broadcast recovery message to clients.
    }

    private handleLowBattery() {
        // TODO: Handle Low Battery Shutdown Sequence
        // Possible Features:
        // - Turn off VR Headsets to avoid useless battery drain:
        //   - Retrieve `AdbManager` instance.
        //   - For each connected device, execute `adb shell reboot -p` to turn off the headset.
        // - Turn off the main server (Mac Mini):
        //   - Execute system `shutdown` command (e.g., `sudo shutdown -h now` on macOS/Linux).
        // - Log all actions meticulously.
    }

    public close() {
        logger.debug('Cleaning up NUT Manager...');
        if (this.monitor) {
            try {
                this.monitor.stop();
            } catch (e) {
                logger.warn('Failed to stop monitor smoothly: {e}', {e});
            }
            this.monitor = null;
        }

        try {
            // We can't close client cleanly as per docs, but we can drop ref
            // nut-client manages connections automatically
        } catch (e) {
            logger.trace('Error closing client {e}', {e});
        }

        this.client = null as any; // Allow GC
    }
}

export default NutManager;
