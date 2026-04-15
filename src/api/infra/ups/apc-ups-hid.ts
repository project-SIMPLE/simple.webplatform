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
import HID from 'node-hid';

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── HID Report Map (APC Back-UPS BXnnnnMI) ─────────────────────────────────
//
// Mapped from NUT apc-hid.c source + empirical discovery on BX2200MI.
// Report IDs are specific to this device family. Other APC models may differ.

const REPORT = {
    // ── Read-only status ──
    REMAINING_CAPACITY:      0x0c,  // 1 byte, 0–100%
    FULL_CHARGE_CAPACITY:    0x0d,  // 1 byte, 0–100%
    DESIGN_CAPACITY:         0x0e,  // 1 byte, 0–100%
    RUNTIME_TO_EMPTY:        0x0f,  // 2 bytes LE, seconds
    AC_PRESENT:              0x13,  // 1 byte, 1=AC present, 0=on battery
    INPUT_VOLTAGE:           0x30,  // 1 byte, volts (approximate)
    INPUT_VOLTAGE_PRECISE:   0x31,  // 2 bytes LE, volts (drops to 0 on battery)
    LOW_VOLTAGE_TRANSFER:    0x32,  // 2 bytes LE, volts
    HIGH_VOLTAGE_TRANSFER:   0x33,  // 2 bytes LE, volts
    CONFIG_ACTIVE_POWER:     0x52,  // 2 bytes LE, watts

    // ── Writable timers ──
    DELAY_BEFORE_SHUTDOWN:   0x15,  // 2 bytes LE, signed: -1=not armed, >0=seconds
    DELAY_BEFORE_STARTUP:    0x16,  // 2 bytes LE, seconds
    DELAY_BEFORE_REBOOT:     0x17,  // 2 bytes LE, seconds

    // ── Beeper control ──
    // HID descriptor: Usage Page 0x84, Usage 0x5A (AudibleAlarmControl)
    // Values: 1=disabled, 2=enabled, 3=muted
    AUDIBLE_ALARM_CONTROL:   0x78,  // 1 byte

    // ── Status bitfield ──
    PRESENT_STATUS:          0x07,  // variable-length bitfield
} as const;

// Beeper values per USB HID Power Device spec
const BEEPER_VALUES: Record<BeeperState, number> = {
    disabled: 1,
    enabled:  2,
    muted:    3,
    unknown:  0,
};

const BEEPER_LABELS: Record<number, BeeperState> = {
    1: 'disabled',
    2: 'enabled',
    3: 'muted',
};

// ─── Main Class ──────────────────────────────────────────────────────────────

export class ApcUpsHid extends EventEmitter {
    private device: HID.HID | null = null;
    private deviceInfo: UpsDeviceInfo | null = null;
    private pollInterval: ReturnType<typeof setInterval> | null = null;
    private lastAcPresent: boolean | null = null;
    private lastBatteryCharge: number | null = null;

    private readonly vendorId: number;
    private readonly productId: number;

    constructor(options: ApcUpsHidOptions = {}) {
        super();
        this.vendorId  = options.vendorId  ?? 0x051d;
        this.productId = options.productId ?? 0x0002;

        if (options.autoOpen !== false) {
            this.open();
        }
    }

    // ── Typed event emitter overrides ──

    on<K extends keyof ApcUpsHidEvents>(event: K, listener: ApcUpsHidEvents[K]): this {
        return super.on(event, listener);
    }

    emit<K extends keyof ApcUpsHidEvents>(event: K, ...args: Parameters<ApcUpsHidEvents[K]>): boolean {
        return super.emit(event, ...args);
    }

    // ── Connection ──

    /** Open the HID connection to the UPS */
    open(): void {
        if (this.device) return;

        const devices = HID.devices().filter(
            (d) => d.vendorId === this.vendorId && d.productId === this.productId
        );

        if (devices.length === 0) {
            throw new Error(
                `No APC UPS found (vendorId=0x${this.vendorId.toString(16)}, ` +
                `productId=0x${this.productId.toString(16)}). Is it plugged in via USB?`
            );
        }

        const target = devices[0];
        this.device = new HID.HID(target.path!);
        this.deviceInfo = {
            manufacturer: target.manufacturer ?? 'Unknown',
            product:      target.product ?? 'Unknown',
            serialNumber: target.serialNumber ?? 'Unknown',
            path:         target.path!,
        };

        this.emit('connected', this.deviceInfo);
    }

    /** Close the HID connection and stop polling */
    close(): void {
        this.stopPolling();
        if (this.device) {
            try { this.device.close(); } catch { /* ignore */ }
            this.device = null;
            this.deviceInfo = null;
            this.lastAcPresent = null;
            this.lastBatteryCharge = null;
            this.emit('disconnected');
        }
    }

    /** Whether the device is currently open */
    get isConnected(): boolean {
        return this.device !== null;
    }

    /** Device information (null if not connected) */
    get info(): UpsDeviceInfo | null {
        return this.deviceInfo;
    }

    // ── Reading ──

    /** Read a single-byte feature report value */
    private readU8(reportId: number): number {
        this.assertOpen();
        const buf = this.device!.getFeatureReport(reportId, 2);
        return buf.length >= 2 ? buf[1] : buf[0];
    }

    /** Read a 16-bit unsigned LE feature report value */
    private readU16(reportId: number): number {
        this.assertOpen();
        const buf = this.device!.getFeatureReport(reportId, 3);
        if (buf.length >= 3) return buf[1] | (buf[2] << 8);
        if (buf.length === 2) return buf[0] | (buf[1] << 8);
        return buf[0];
    }

    /** Read a 16-bit signed LE feature report value */
    private readS16(reportId: number): number {
        const val = this.readU16(reportId);
        return val > 32767 ? val - 65536 : val;
    }

    /** Write a single-byte feature report */
    private writeU8(reportId: number, value: number): void {
        this.assertOpen();
        this.device!.sendFeatureReport([reportId, value & 0xff]);
    }

    /** Write a 16-bit LE feature report */
    private writeU16(reportId: number, value: number): void {
        this.assertOpen();
        const unsigned = value < 0 ? value + 65536 : value;
        this.device!.sendFeatureReport([
            reportId,
            unsigned & 0xff,
            (unsigned >> 8) & 0xff,
        ]);
    }

    private assertOpen(): void {
        if (!this.device) {
            throw new Error('UPS device is not open. Call open() first.');
        }
    }

    /** Get the full UPS status in a single call */
    getStatus(): UpsStatus {
        const batteryCharge     = this.readU8(REPORT.REMAINING_CAPACITY);
        const runtimeSeconds    = this.readU16(REPORT.RUNTIME_TO_EMPTY);
        const acPresentRaw      = this.readU8(REPORT.AC_PRESENT);
        const inputVoltage      = this.readU8(REPORT.INPUT_VOLTAGE);
        const inputVoltagePrecise = this.readU16(REPORT.INPUT_VOLTAGE_PRECISE);
        const shutdownTimer     = this.readS16(REPORT.DELAY_BEFORE_SHUTDOWN);
        const beeperRaw         = this.readU8(REPORT.AUDIBLE_ALARM_CONTROL);
        const nominalPower      = this.readU16(REPORT.CONFIG_ACTIVE_POWER);
        const lowVoltage        = this.readU16(REPORT.LOW_VOLTAGE_TRANSFER);
        const highVoltage       = this.readU16(REPORT.HIGH_VOLTAGE_TRANSFER);
        const fullCharge        = this.readU8(REPORT.FULL_CHARGE_CAPACITY);

        const acPresent = acPresentRaw === 1;

        return {
            batteryCharge,
            runtimeSeconds,
            runtimeMinutes: Math.round(runtimeSeconds / 60 * 10) / 10,
            inputVoltage,
            inputVoltagePrecise,
            acPresent,
            onBattery: !acPresent,
            shutdownTimer,
            beeperStatus: BEEPER_LABELS[beeperRaw] ?? 'unknown',
            nominalPowerWatts: nominalPower,
            lowVoltageTransfer: lowVoltage,
            highVoltageTransfer: highVoltage,
            fullChargeCapacity: fullCharge,
            timestamp: Date.now(),
        };
    }

    /** Get battery charge percentage (0–100) */
    getBatteryCharge(): number {
        return this.readU8(REPORT.REMAINING_CAPACITY);
    }

    /** Get estimated runtime remaining in seconds */
    getRuntimeSeconds(): number {
        return this.readU16(REPORT.RUNTIME_TO_EMPTY);
    }

    /** Check if AC power is present */
    isOnAC(): boolean {
        return this.readU8(REPORT.AC_PRESENT) === 1;
    }

    /** Get input voltage */
    getInputVoltage(): number {
        return this.readU8(REPORT.INPUT_VOLTAGE);
    }

    // ── Commands ──

    /**
     * Arm the UPS shutdown timer.
     *
     * **IMPORTANT**: APC UPS devices ignore this command while on AC power.
     * The UPS must be running on battery for the shutdown to take effect.
     *
     * @param delaySeconds - Seconds before the UPS cuts output power (min: 1)
     */
    shutdown(delaySeconds: number): void {
        if (delaySeconds < 1) {
            throw new Error('Shutdown delay must be at least 1 second.');
        }
        if (delaySeconds > 32767) {
            throw new Error('Shutdown delay must be at most 32767 seconds (~9 hours).');
        }
        this.writeU16(REPORT.DELAY_BEFORE_SHUTDOWN, delaySeconds);
    }

    /**
     * Cancel a pending shutdown.
     * Writes -1 (0xFFFF) to the shutdown timer, which disarms it.
     */
    cancelShutdown(): void {
        this.writeU16(REPORT.DELAY_BEFORE_SHUTDOWN, -1);
    }

    /**
     * Check whether a shutdown is currently armed.
     * @returns The remaining seconds, or -1 if not armed.
     */
    getShutdownTimer(): number {
        return this.readS16(REPORT.DELAY_BEFORE_SHUTDOWN);
    }

    /**
     * Set the beeper state.
     * @param state - 'enabled' (beep on events), 'muted' (silence), or 'disabled'
     */
    setBeeper(state: 'enabled' | 'muted' | 'disabled'): void {
        const value = BEEPER_VALUES[state];
        if (!value) throw new Error(`Invalid beeper state: ${state}`);
        this.writeU8(REPORT.AUDIBLE_ALARM_CONTROL, value);
    }

    /** Get the current beeper state */
    getBeeperStatus(): BeeperState {
        const raw = this.readU8(REPORT.AUDIBLE_ALARM_CONTROL);
        return BEEPER_LABELS[raw] ?? 'unknown';
    }

    /**
     * Set the startup delay (seconds the UPS waits before restoring power
     * after AC returns following a shutdown).
     */
    setStartupDelay(seconds: number): void {
        this.writeU16(REPORT.DELAY_BEFORE_STARTUP, seconds);
    }

    /** Get the current startup delay in seconds */
    getStartupDelay(): number {
        return this.readU16(REPORT.DELAY_BEFORE_STARTUP);
    }

    // ── Polling ──

    /**
     * Start periodic status polling.
     * Emits 'status' on every tick, plus 'power-lost', 'power-restored',
     * 'battery-low', and 'battery-critical' events on state transitions.
     *
     * @param intervalMs - Poll interval in milliseconds (default: 5000)
     */
    startPolling(intervalMs: number = 5000): void {
        this.stopPolling();

        const poll = () => {
            try {
                const status = this.getStatus();
                this.emit('status', status);

                // AC power transition events
                if (this.lastAcPresent !== null) {
                    if (this.lastAcPresent && !status.acPresent) {
                        this.emit('power-lost');
                    } else if (!this.lastAcPresent && status.acPresent) {
                        this.emit('power-restored');
                    }
                }
                this.lastAcPresent = status.acPresent;

                // Battery level events
                if (status.onBattery) {
                    if (status.batteryCharge <= 10 &&
                        (this.lastBatteryCharge === null || this.lastBatteryCharge > 10)) {
                        this.emit('battery-critical', status.batteryCharge);
                    } else if (status.batteryCharge <= 20 &&
                        (this.lastBatteryCharge === null || this.lastBatteryCharge > 20)) {
                        this.emit('battery-low', status.batteryCharge);
                    }
                }
                this.lastBatteryCharge = status.batteryCharge;

            } catch (err) {
                this.emit('error', err instanceof Error ? err : new Error(String(err)));
            }
        };

        // Initial poll immediately
        poll();
        this.pollInterval = setInterval(poll, intervalMs);
    }

    /** Stop periodic polling */
    stopPolling(): void {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    /** Whether polling is currently active */
    get isPolling(): boolean {
        return this.pollInterval !== null;
    }

    // ── Static helpers ──

    /**
     * List all connected APC UPS devices without opening them.
     */
    static listDevices(vendorId = 0x051d, productId = 0x0002): UpsDeviceInfo[] {
        const seen = new Set<string>();
        return HID.devices()
            .filter((d) => d.vendorId === vendorId && d.productId === productId)
            .filter((d) => {
                // Deduplicate by path (multiple collections share the same device)
                if (seen.has(d.path!)) return false;
                seen.add(d.path!);
                return true;
            })
            .map((d) => ({
                manufacturer: d.manufacturer ?? 'Unknown',
                product:      d.product ?? 'Unknown',
                serialNumber: d.serialNumber ?? 'Unknown',
                path:         d.path!,
            }));
    }
}

export default ApcUpsHid;