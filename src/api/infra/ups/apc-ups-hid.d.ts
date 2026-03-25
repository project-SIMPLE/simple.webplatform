/**
 * apc-ups-hid — Direct HID control of APC UPS devices on macOS (and Linux)
 *
 * Bypasses NUT/libusb entirely by using node-hid (hidapi/IOKit), which
 * coexists with macOS's native DriverKit UPS drivers instead of fighting them.
 *
 * Works on stock macOS — no SIP, AMFI, or entitlement signing required.
 *
 * Tested on: APC Back-UPS BX2200MI (vendorId 0x051d, productId 0x0002)
 *
 * @example
 * ```ts
 * import { ApcUpsHid } from './apc-ups-hid';
 *
 * const ups = new ApcUpsHid();
 * ups.on('status', (status) => console.log(status));
 * ups.on('power-lost', () => console.log('On battery!'));
 * ups.on('power-restored', () => console.log('AC is back!'));
 * ups.startPolling(5000);
 *
 * // Mute the beeper
 * ups.setBeeper('mute');
 *
 * // Shutdown UPS in 60 seconds (only works on battery!)
 * ups.shutdown(60);
 *
 * // Cancel a pending shutdown
 * ups.cancelShutdown();
 *
 * // Cleanup
 * ups.close();
 * ```
 */
import { EventEmitter } from 'events';
export interface UpsDeviceInfo {
    manufacturer: string;
    product: string;
    serialNumber: string;
    path: string;
}
export interface UpsStatus {
    /** Battery charge percentage (0–100) */
    batteryCharge: number;
    /** Estimated runtime remaining in seconds */
    runtimeSeconds: number;
    /** Estimated runtime remaining in minutes (convenience) */
    runtimeMinutes: number;
    /** Current input voltage (0 when on battery) */
    inputVoltage: number;
    /** Precise input voltage from the UPS ADC */
    inputVoltagePrecise: number;
    /** Whether AC power is currently present */
    acPresent: boolean;
    /** Whether the UPS is currently on battery */
    onBattery: boolean;
    /** Shutdown timer state: -1 = not armed, >0 = seconds until shutdown */
    shutdownTimer: number;
    /** Beeper state: 'disabled' | 'enabled' | 'muted' | 'unknown' */
    beeperStatus: BeeperState;
    /** Nominal output power in watts */
    nominalPowerWatts: number;
    /** Low voltage transfer point */
    lowVoltageTransfer: number;
    /** High voltage transfer point */
    highVoltageTransfer: number;
    /** Full charge capacity percentage */
    fullChargeCapacity: number;
    /** Raw timestamp of this reading */
    timestamp: number;
}
export type BeeperState = 'disabled' | 'enabled' | 'muted' | 'unknown';
export interface ApcUpsHidOptions {
    /** USB Vendor ID (default: 0x051d for APC) */
    vendorId?: number;
    /** USB Product ID (default: 0x0002) */
    productId?: number;
    /** Auto-open device on construction (default: true) */
    autoOpen?: boolean;
}
export interface ApcUpsHidEvents {
    /** Emitted on every poll with the full status */
    status: (status: UpsStatus) => void;
    /** Emitted when AC power is lost (UPS switches to battery) */
    'power-lost': () => void;
    /** Emitted when AC power is restored */
    'power-restored': () => void;
    /** Emitted when battery charge drops below 20% */
    'battery-low': (charge: number) => void;
    /** Emitted when battery charge drops below 10% */
    'battery-critical': (charge: number) => void;
    /** Emitted when the UPS device is opened */
    'connected': (info: UpsDeviceInfo) => void;
    /** Emitted when the UPS device is closed or lost */
    'disconnected': () => void;
    /** Emitted on any HID communication error */
    'error': (error: Error) => void;
}
export declare class ApcUpsHid extends EventEmitter {
    private device;
    private deviceInfo;
    private pollInterval;
    private lastAcPresent;
    private lastBatteryCharge;
    private readonly vendorId;
    private readonly productId;
    constructor(options?: ApcUpsHidOptions);
    on<K extends keyof ApcUpsHidEvents>(event: K, listener: ApcUpsHidEvents[K]): this;
    emit<K extends keyof ApcUpsHidEvents>(event: K, ...args: Parameters<ApcUpsHidEvents[K]>): boolean;
    /** Open the HID connection to the UPS */
    open(): void;
    /** Close the HID connection and stop polling */
    close(): void;
    /** Whether the device is currently open */
    get isConnected(): boolean;
    /** Device information (null if not connected) */
    get info(): UpsDeviceInfo | null;
    /** Read a single-byte feature report value */
    private readU8;
    /** Read a 16-bit unsigned LE feature report value */
    private readU16;
    /** Read a 16-bit signed LE feature report value */
    private readS16;
    /** Write a single-byte feature report */
    private writeU8;
    /** Write a 16-bit LE feature report */
    private writeU16;
    private assertOpen;
    /** Get the full UPS status in a single call */
    getStatus(): UpsStatus;
    /** Get battery charge percentage (0–100) */
    getBatteryCharge(): number;
    /** Get estimated runtime remaining in seconds */
    getRuntimeSeconds(): number;
    /** Check if AC power is present */
    isOnAC(): boolean;
    /** Get input voltage */
    getInputVoltage(): number;
    /**
     * Arm the UPS shutdown timer.
     *
     * **IMPORTANT**: APC UPS devices ignore this command while on AC power.
     * The UPS must be running on battery for the shutdown to take effect.
     *
     * @param delaySeconds - Seconds before the UPS cuts output power (min: 1)
     */
    shutdown(delaySeconds: number): void;
    /**
     * Cancel a pending shutdown.
     * Writes -1 (0xFFFF) to the shutdown timer, which disarms it.
     */
    cancelShutdown(): void;
    /**
     * Check whether a shutdown is currently armed.
     * @returns The remaining seconds, or -1 if not armed.
     */
    getShutdownTimer(): number;
    /**
     * Set the beeper state.
     * @param state - 'enabled' (beep on events), 'muted' (silence), or 'disabled'
     */
    setBeeper(state: 'enabled' | 'muted' | 'disabled'): void;
    /** Get the current beeper state */
    getBeeperStatus(): BeeperState;
    /**
     * Set the startup delay (seconds the UPS waits before restoring power
     * after AC returns following a shutdown).
     */
    setStartupDelay(seconds: number): void;
    /** Get the current startup delay in seconds */
    getStartupDelay(): number;
    /**
     * Start periodic status polling.
     * Emits 'status' on every tick, plus 'power-lost', 'power-restored',
     * 'battery-low', and 'battery-critical' events on state transitions.
     *
     * @param intervalMs - Poll interval in milliseconds (default: 5000)
     */
    startPolling(intervalMs?: number): void;
    /** Stop periodic polling */
    stopPolling(): void;
    /** Whether polling is currently active */
    get isPolling(): boolean;
    /**
     * List all connected APC UPS devices without opening them.
     */
    static listDevices(vendorId?: number, productId?: number): UpsDeviceInfo[];
}
export default ApcUpsHid;
//# sourceMappingURL=apc-ups-hid.d.ts.map