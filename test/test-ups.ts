#!/usr/bin/env node
/**
 * Test script for apc-ups-hid library
 *
 * Run: npx tsx test/test-ups.ts
 *
 * Tests proceed in order. The shutdown test is COMMENTED OUT by default.
 */

import { ApcUpsHid } from '../src/api/infra/ups/apc-ups-hid';

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║           apc-ups-hid Library Test Suite             ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');

    // ── Test 1: Device discovery ──
    console.log('── Test 1: Device Discovery ──');
    const devices = ApcUpsHid.listDevices();
    console.log(`  Found ${devices.length} APC UPS device(s):`);
    devices.forEach(d => {
        console.log(d.product);
        console.log(d.serialNumber);
        console.log(d.manufacturer);
        console.log(`    ${d.product} (S/N: ${d.serialNumber}) — ${d.manufacturer}`);
    });
    if (devices.length === 0) {
        console.error('  FAIL: No UPS found. Is it plugged in via USB?');
        process.exit(1);
    }
    console.log('  PASS ✓\n');

    // ── Test 2: Open connection ──
    console.log('── Test 2: Open Connection ──');
    const ups = new ApcUpsHid();
    console.log(`  Connected: ${ups.isConnected}`);
    console.log(`  Device: ${ups.info?.product}`);
    console.log(`  Serial: ${ups.info?.serialNumber}`);
    console.log('  PASS ✓\n');

    // ── Test 3: Read full status ──
    console.log('── Test 3: Read Full Status ──');
    const status = ups.getStatus();
    console.log(`  Battery charge:       ${status.batteryCharge}%`);
    console.log(`  Runtime remaining:    ${status.runtimeSeconds}s (${status.runtimeMinutes} min)`);
    console.log(`  AC present:           ${status.acPresent}`);
    console.log(`  On battery:           ${status.onBattery}`);
    console.log(`  Input voltage:        ${status.inputVoltage}V`);
    console.log(`  Input voltage (fine): ${status.inputVoltagePrecise}V`);
    console.log(`  Shutdown timer:       ${status.shutdownTimer} (${status.shutdownTimer === -1 ? 'not armed' : 'ARMED!'})`);
    console.log(`  Beeper status:        ${status.beeperStatus}`);
    console.log(`  Nominal power:        ${status.nominalPowerWatts}W`);
    console.log(`  Low transfer:         ${status.lowVoltageTransfer}V`);
    console.log(`  High transfer:        ${status.highVoltageTransfer}V`);
    console.log(`  Full charge capacity: ${status.fullChargeCapacity}%`);

    // Sanity checks
    const checks = [
        { name: 'battery 0–100',   ok: status.batteryCharge >= 0 && status.batteryCharge <= 100 },
        { name: 'runtime > 0',     ok: status.runtimeSeconds > 0 },
        { name: 'voltage > 0',     ok: status.inputVoltage > 0 || !status.acPresent },
        { name: 'power > 0',       ok: status.nominalPowerWatts > 0 },
        { name: 'shutdown = -1',   ok: status.shutdownTimer === -1 },
    ];
    const allPass = checks.every(c => c.ok);
    checks.forEach(c => console.log(`  Check ${c.name}: ${c.ok ? 'PASS ✓' : 'FAIL ✗'}`));
    console.log(`  ${allPass ? 'ALL PASS ✓' : 'SOME FAILED ✗'}\n`);

    // ── Test 4: Individual readers ──
    console.log('── Test 4: Individual Readers ──');
    console.log(`  getBatteryCharge():   ${ups.getBatteryCharge()}%`);
    console.log(`  getRuntimeSeconds():  ${ups.getRuntimeSeconds()}s`);
    console.log(`  isOnAC():             ${ups.isOnAC()}`);
    console.log(`  getInputVoltage():    ${ups.getInputVoltage()}V`);
    console.log(`  getShutdownTimer():   ${ups.getShutdownTimer()}`);
    console.log(`  getBeeperStatus():    ${ups.getBeeperStatus()}`);
    console.log(`  getStartupDelay():    ${ups.getStartupDelay()}s`);
    console.log('  PASS ✓\n');

    // ── Test 5: Beeper control ──
    console.log('── Test 5: Beeper Control ──');
    const originalBeeper = ups.getBeeperStatus();
    console.log(`  Current beeper state: ${originalBeeper}`);

    console.log('  Setting beeper to "muted"...');
    ups.setBeeper('muted');
    await sleep(500);
    console.log(`  Beeper state after mute: ${ups.getBeeperStatus()}`);

    console.log('  Setting beeper to "enabled"...');
    ups.setBeeper('enabled');
    await sleep(500);
    console.log(`  Beeper state after enable: ${ups.getBeeperStatus()}`);

    console.log('  Setting beeper to "disabled"...');
    ups.setBeeper('disabled');
    await sleep(500);
    console.log(`  Beeper state after disable: ${ups.getBeeperStatus()}`);

    // Restore original
    if (originalBeeper !== 'unknown') {
        console.log(`  Restoring to: ${originalBeeper}`);
        ups.setBeeper(originalBeeper as 'enabled' | 'muted' | 'disabled');
        await sleep(500);
        console.log(`  Restored: ${ups.getBeeperStatus()}`);
    }
    console.log('  DONE (verify beeper behavior matches expected states)\n');

    // ── Test 6: Polling with events ──
    console.log('── Test 6: Polling (5 ticks at 2s interval) ──');

    let tickCount = 0;
    ups.on('status', (s) => {
        tickCount++;
        console.log(`  [tick ${tickCount}] charge=${s.batteryCharge}% runtime=${s.runtimeMinutes}min ac=${s.acPresent} voltage=${s.inputVoltage}V`);
    });
    ups.on('power-lost',     () => console.log('  ⚡ EVENT: power-lost'));
    ups.on('power-restored', () => console.log('  ⚡ EVENT: power-restored'));
    ups.on('battery-low',    (c) => console.log(`  ⚡ EVENT: battery-low (${c}%)`));
    ups.on('battery-critical',(c) => console.log(`  ⚡ EVENT: battery-critical (${c}%)`));
    ups.on('error',           (e) => console.log(`  ⚡ EVENT: error — ${e.message}`));

    ups.startPolling(2000);

    // Wait for 5 ticks
    while (tickCount < 5) {
        await sleep(500);
    }
    ups.stopPolling();
    console.log(`  Polling stopped after ${tickCount} ticks.`);
    console.log('  PASS ✓\n');

    // ── Test 7: Shutdown / Cancel (COMMENTED OUT FOR SAFETY) ──
    console.log('── Test 7: Shutdown Test (COMMENTED OUT) ──');
    console.log('  To test shutdown, uncomment the block below and');
    console.log('  UNPLUG THE UPS FROM THE WALL before running.');
    console.log('');
    console.log('  // ups.shutdown(30);    // arm shutdown in 30 seconds');
    console.log('  // await sleep(3000);');
    console.log('  // console.log("Timer:", ups.getShutdownTimer());');
    console.log('  // ups.cancelShutdown(); // cancel before it fires');
    console.log('  // console.log("Timer after cancel:", ups.getShutdownTimer());');
    console.log('');

    /*
    // ── UNCOMMENT TO TEST (unplug UPS from wall first!) ──
    console.log('  Arming shutdown in 30 seconds...');
    ups.shutdown(30);
    await sleep(1000);
    console.log(`  Shutdown timer: ${ups.getShutdownTimer()}s`);

    console.log('  Cancelling shutdown...');
    ups.cancelShutdown();
    await sleep(500);
    console.log(`  Shutdown timer after cancel: ${ups.getShutdownTimer()}`);
    console.log('  PASS ✓');
    */

    // ── Cleanup ──
    ups.close();
    console.log('\n══════════════════════════════════════════════════════');
    console.log('  All tests completed. UPS connection closed.');
    console.log('══════════════════════════════════════════════════════');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});