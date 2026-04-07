import { ApcUpsHid } from './apc-ups-hid.ts';
import { getLogger } from '@logtape/logtape';

const logger = getLogger(['infra', 'UpsManager']);

const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 5000;
const RECONNECT_DELAY_MS = 5000;
const EXPECTED_PRODUCT = 'Back-UPS BX2200MI';

export class UpsManager {
    // Single ApcUpsHid instance reused across reconnects — event handlers registered once stay valid
    private ups: ApcUpsHid;
    private _closed = false;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        this.ups = new ApcUpsHid({ autoOpen: false });
        this.setupEventHandlers();
    }

    /**
     * Attempt to open the UPS connection, with up to MAX_RETRIES attempts.
     * @returns true if connected, false if all attempts failed
     */
    async connect(): Promise<boolean> {
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                this.ups.open();

                const info = this.ups.info;
                if (info && !info.product.includes(EXPECTED_PRODUCT)) {
                    const border = "=".repeat(58);
                    logger.warn(border);
                    logger.warn("=                                                        =");
                    logger.warn(`=   UPS product "{product}" is not "${EXPECTED_PRODUCT}" =`, { product: info.product });
                    logger.warn("=     -  behavior may differ from expected.              =");
                    logger.warn("=                                                        =");
                    logger.warn(border);
                }

                this.ups.setBeeper('disabled');
                logger.debug(`[{product}] UPS beeper disabled`, { product: info?.product });

                this.ups.startPolling(5000);
                return true;
            } catch (e) {
                logger.warn(`UPS connection attempt ${attempt}/${MAX_RETRIES} failed: {error}`, { error: e instanceof Error ? e.message : String(e) });
                if (attempt < MAX_RETRIES) {
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                }
            }
        }

        logger.warn(`Could not connect to UPS after ${MAX_RETRIES} attempts — UPS monitoring disabled`);
        return false;
    }

    private setupEventHandlers(): void {
        this.ups.on('connected', (info) => {
            const status = this.ups.getStatus();
            logger.info('UPS device opened: {product}\n\t=> battery={charge}% runtime={runtime}min ac={ac}', {
                product: info.product,
                charge: status.batteryCharge,
                runtime: status.runtimeMinutes,
                ac: status.acPresent,
            });
            logger.debug('UPS device opened: {product} (S/N: {serial})\n\t- battery={charge}% runtime={runtime}min ac={ac} voltage={voltage}V', {
                product: info.product,
                serial: info.serialNumber,
                charge: status.batteryCharge,
                runtime: status.runtimeMinutes,
                ac: status.acPresent,
                voltage: status.inputVoltage,
            });
        });

        this.ups.on('disconnected', () => {
            logger.warn('UPS device disconnected');
            if (!this._closed) this.scheduleReconnect();
        });

        // HID read error likely means the USB cable was pulled — close cleanly so 'disconnected' fires and triggers reconnect
        this.ups.on('error', (error) => {
            logger.error('UPS HID error: {error}', { error: error.message });
            if (!this._closed) {
                try { this.ups.close(); } catch { /* 'disconnected' event will schedule the reconnect */ }
            }
        });

        this.ups.on('power-lost', () => {
            logger.warn('UPS: AC power LOST — now running on battery');
        });

        this.ups.on('power-restored', () => {
            logger.info('UPS: AC power RESTORED — back on mains');
        });

        this.ups.on('battery-low', (charge) => {
            logger.warn('UPS: Battery LOW at {charge}%', { charge });
        });

        this.ups.on('battery-critical', (charge) => {
            logger.error('UPS: Battery CRITICAL at {charge}% — immediate shutdown risk', { charge });
        });

        this.ups.on('status', (status) => {
            logger.trace('UPS status: battery={charge}% runtime={runtime}min ac={ac} voltage={voltage}V', {
                charge: status.batteryCharge,
                runtime: status.runtimeMinutes,
                ac: status.acPresent,
                voltage: status.inputVoltage,
            });
        });
    }

    private scheduleReconnect(): void {
        if (this._closed || this.reconnectTimer) return;
        logger.info('UPS reconnect scheduled in {delay}ms', { delay: RECONNECT_DELAY_MS });
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            void this.doReconnect();
        }, RECONNECT_DELAY_MS);
    }

    private async doReconnect(): Promise<void> {
        if (this._closed) return;
        logger.info('Attempting UPS reconnect...');
        try {
            this.ups.open();
            this.ups.setBeeper('disabled');
            this.ups.startPolling(5000);
            logger.info('[{product}] UPS reconnected', { product: this.ups.info?.product });
        } catch (e) {
            logger.warn('UPS reconnect failed: {error} — retrying in {delay}ms', {
                error: e instanceof Error ? e.message : String(e),
                delay: RECONNECT_DELAY_MS,
            });
            this.scheduleReconnect();
        }
    }

    /** Whether the UPS HID device is currently open */
    isConnected(): boolean {
        return this.ups.isConnected;
    }

    /** Whether AC power is present. Returns false if UPS is not connected. */
    isOnAC(): boolean {
        if (!this.ups.isConnected) return false;
        try {
            return this.ups.isOnAC();
        } catch (e) {
            logger.warn('Failed to read AC status from UPS: {error}', { error: e instanceof Error ? e.message : String(e) });
            return false;
        }
    }

    /**
     * Arm the UPS shutdown timer.
     * NOTE: APC UPS devices only execute the shutdown when running on battery.
     * @param seconds - seconds before UPS cuts output power
     */
    armShutdown(seconds: number): void {
        if (!this.ups.isConnected) {
            logger.warn('Cannot arm UPS shutdown — UPS not connected');
            return;
        }
        try {
            this.ups.shutdown(seconds);
            logger.warn('UPS shutdown armed: output will cut in {seconds}s (only takes effect on battery)', { seconds });
        } catch (e) {
            logger.error('Failed to arm UPS shutdown: {error}', { error: e instanceof Error ? e.message : String(e) });
        }
    }

    /** Permanently close the UPS connection and cancel any pending reconnect */
    close(): void {
        this._closed = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.ups.close();
    }
}

export default UpsManager;
