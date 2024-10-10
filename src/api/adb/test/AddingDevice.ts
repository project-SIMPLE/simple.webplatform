/**
 * AddingDevice.ts
 * ===========
 *
 * Description:
 * Display the simplest usage of AdbManager
 * - Create manager
 * - Add/Connect a new device
 * - Get ADB socket
 * - Send a command
 *
 * Note: Run with `npx tsx src/api/adb/test/AddingDevice.ts`
 */
import { AdbManager } from "../AdbManager.ts";

const ipAndroid: string = "192.168.1.93";

console.log("Create ADB Manager ===");
const manager = new AdbManager();

console.log("Adding new device to Manager ===");
await manager.addDevice(ipAndroid);

console.log("Take ADB socket from Manager with IP address ===");
const adbConnection = manager.getAdbConnections().get(ipAndroid);
console.log(adbConnection);

console.log("Sending ADB command to device ===");
// @ts-ignore
const androidVersion = await adbConnection.getProp("ro.build.version.release");

console.log(`Android version is : `+androidVersion);

process.exit();