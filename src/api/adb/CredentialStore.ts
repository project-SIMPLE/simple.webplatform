/**
 * CredentialStore.ts
 * ===========
 *
 * Description:
 * Directly connecting to ADB's devices requires authentication. The authentication process uses `RSA algorithm`, except it uses a custom public key format.
 *
 * ---
 *
 * There is currently no NPM package for a Node.js compatible credential store, but here is a reference implementation:
 *
 * It uses `Web Crypto API` to generate private keys, and stores them in ~/.android/adbkey and ~/.android/adbkey.pub files, same as Google ADB.
 *
 * Source: https://docs.tangoapp.dev/tango/daemon/credential-store/
 */

import { AdbCredentialStore, adbGeneratePublicKey } from "@yume-chan/adb";
import { webcrypto } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { homedir, hostname, userInfo } from "node:os";
import { join } from "node:path";

class CredentialStore implements AdbCredentialStore {
    #name: string;

    constructor(name: string) {
        this.#name = name;
    }

    #privateKeyPath() {
        return join(homedir(), ".android", "adbkey");
    }

    #publicKeyPath() {
        return join(homedir(), ".android", "adbkey.pub");
    }

    async generateKey() {
        const { privateKey: cryptoKey } = await webcrypto.subtle.generateKey(
            {
                name: "RSASSA-PKCS1-v1_5",
                modulusLength: 2048,
                // 65537
                publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
                hash: "SHA-1",
            },
            true,
            ["sign", "verify"],
        );

        const privateKey = new Uint8Array(await crypto.subtle.exportKey("pkcs8", cryptoKey));
        await writeFile(this.#privateKeyPath(), Buffer.from(privateKey).toString("utf8"));
        await writeFile(
            this.#publicKeyPath(),
            `${Buffer.from(adbGeneratePublicKey(privateKey)).toString("base64")} ${this.#name}\n`,
        );

        return {
            buffer: privateKey,
            name: this.#name,
        };
    }

    async #readPubKeyName() {
        const content = await readFile(this.#publicKeyPath(), "utf8");
        const pubKeyName = content.split(" ")[1];
        return pubKeyName || `${userInfo().username}@${hostname()}`;
    }

    async *iterateKeys() {
        const content = await readFile(this.#privateKeyPath(), "utf8");
        const privateKey = Buffer.from(content.split("\n").slice(1, -2).join(""), "base64");
        yield {
            buffer: privateKey,
            name: await this.#readPubKeyName(),
        };
    }
}

export const CREDENTIAL = new CredentialStore(`${userInfo().username}@${hostname()}`);