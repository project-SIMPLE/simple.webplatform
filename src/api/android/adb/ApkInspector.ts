/**
 * ApkInspector.ts
 * ===============
 *
 * Description:
 * Reads metadata out of an APK file without any external tooling (e.g. aapt),
 * so it keeps working inside the packaged SEA binary.
 *
 * An APK is a plain ZIP archive whose manifest is stored as Android's compiled
 * binary XML ("AXML"). We extract the AndroidManifest.xml entry and read the
 * android:versionName attribute straight out of its string pool.
 */

import { inflateRawSync } from "node:zlib";

/** Read android:versionName from an APK's compiled manifest. Returns null if unavailable. */
export function readApkVersionName(apk: Buffer): string | null {
	const manifest = extractZipEntry(apk, "AndroidManifest.xml");
	if (manifest === null) return null;
	return readManifestVersionName(manifest);
}

/** Extract a single entry's uncompressed bytes from a ZIP (APK) buffer. */
function extractZipEntry(zip: Buffer, entryName: string): Buffer | null {
	// Locate the End Of Central Directory record by scanning backwards for its
	// signature (its variable-length trailing comment forbids a fixed offset).
	const EOCD_SIG = 0x06054b50;
	let eocd = -1;
	for (let i = zip.length - 22; i >= 0; i--) {
		if (zip.readUInt32LE(i) === EOCD_SIG) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) return null;

	const entryCount = zip.readUInt16LE(eocd + 10);
	let p = zip.readUInt32LE(eocd + 16); // start of the central directory

	const CDH_SIG = 0x02014b50;
	for (let n = 0; n < entryCount; n++) {
		if (zip.readUInt32LE(p) !== CDH_SIG) return null;
		const method = zip.readUInt16LE(p + 10);
		const compSize = zip.readUInt32LE(p + 20);
		const nameLen = zip.readUInt16LE(p + 28);
		const extraLen = zip.readUInt16LE(p + 30);
		const commentLen = zip.readUInt16LE(p + 32);
		const localOffset = zip.readUInt32LE(p + 42);
		const name = zip.toString("utf8", p + 46, p + 46 + nameLen);

		if (name === entryName) {
			// The central directory's extra field can differ from the local one,
			// so recompute the data offset from the local file header.
			const lfNameLen = zip.readUInt16LE(localOffset + 26);
			const lfExtraLen = zip.readUInt16LE(localOffset + 28);
			const dataStart = localOffset + 30 + lfNameLen + lfExtraLen;
			const data = zip.subarray(dataStart, dataStart + compSize);
			// 0 = stored, 8 = deflate (manifests are typically deflated).
			return method === 0 ? Buffer.from(data) : inflateRawSync(data);
		}
		p += 46 + nameLen + extraLen + commentLen;
	}
	return null;
}

/** Read android:versionName from a compiled AndroidManifest.xml (AXML) buffer. */
function readManifestVersionName(axml: Buffer): string | null {
	const strings = readAxmlStringPool(axml);
	if (strings === null) return null;

	const CHUNK_START_ELEMENT = 0x0102;
	const TYPE_STRING = 0x03;
	const NO_ENTRY = 0xffffffff;

	// Walk top-level chunks (skipping the 8-byte file header) until <manifest>.
	let p = 8;
	while (p + 8 <= axml.length) {
		const type = axml.readUInt16LE(p);
		const size = axml.readUInt32LE(p + 4);
		if (size <= 0) break;

		if (type === CHUNK_START_ELEMENT && strings[axml.readUInt32LE(p + 20)] === "manifest") {
			// attrExt starts right after the 16-byte node header.
			const attrStart = axml.readUInt16LE(p + 24);
			const attrCount = axml.readUInt16LE(p + 28);
			let a = p + 16 + attrStart;
			for (let i = 0; i < attrCount; i++, a += 20) {
				if (strings[axml.readUInt32LE(a + 4)] !== "versionName") continue;
				const rawValue = axml.readUInt32LE(a + 8);
				const dataType = axml.readUInt8(a + 15);
				const data = axml.readUInt32LE(a + 16);
				if (dataType === TYPE_STRING) return strings[data] ?? null;
				if (rawValue !== NO_ENTRY) return strings[rawValue] ?? null;
				return String(data);
			}
			return null; // <manifest> found but no versionName attribute
		}
		p += size;
	}
	return null;
}

/** Decode the string pool that is the first chunk of an AXML file. */
function readAxmlStringPool(axml: Buffer): string[] | null {
	const p = 8; // string pool immediately follows the 8-byte file header
	if (axml.readUInt16LE(p) !== 0x0001) return null; // RES_STRING_POOL_TYPE
	const headerSize = axml.readUInt16LE(p + 2);
	const stringCount = axml.readUInt32LE(p + 8);
	const flags = axml.readUInt32LE(p + 16);
	const stringsStart = axml.readUInt32LE(p + 20);
	const isUtf8 = (flags & 0x0100) !== 0; // UTF8_FLAG

	const offsetsBase = p + headerSize; // array of uint32 offsets into the data
	const dataBase = p + stringsStart;
	const out: string[] = [];
	for (let i = 0; i < stringCount; i++) {
		const off = dataBase + axml.readUInt32LE(offsetsBase + i * 4);
		out.push(isUtf8 ? decodeAxmlUtf8(axml, off) : decodeAxmlUtf16(axml, off));
	}
	return out;
}

/** Decode a length-prefixed UTF-16LE string from an AXML string pool. */
function decodeAxmlUtf16(buf: Buffer, off: number): string {
	let len = buf.readUInt16LE(off);
	off += 2;
	if (len & 0x8000) {
		len = ((len & 0x7fff) << 16) | buf.readUInt16LE(off);
		off += 2;
	}
	return buf.toString("utf16le", off, off + len * 2);
}

/** Decode a length-prefixed (modified) UTF-8 string from an AXML string pool. */
function decodeAxmlUtf8(buf: Buffer, off: number): string {
	// First a character count, then a byte count — each 1 or 2 bytes.
	let chars = buf.readUInt8(off++);
	if (chars & 0x80) chars = ((chars & 0x7f) << 8) | buf.readUInt8(off++);
	let bytes = buf.readUInt8(off++);
	if (bytes & 0x80) bytes = ((bytes & 0x7f) << 8) | buf.readUInt8(off++);
	return buf.toString("utf8", off, off + bytes);
}
