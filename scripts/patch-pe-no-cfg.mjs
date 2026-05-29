/**
 * Strips the Authenticode digital signature from a Windows PE binary and
 * clears the IMAGE_DLLCHARACTERISTICS_GUARD_CF (0x4000) CFG flag.
 *
 * Both steps are necessary before postject injects the SEA blob into a signed
 * Windows node.exe binary:
 *
 *  1. Signature strip: postject adds a raw PE section which invalidates the
 *     Authenticode signature, leaving it "corrupted" (present but invalid).
 *     Windows may apply different security policies (process mitigation,
 *     loader restrictions) to a binary with a corrupted vs absent signature.
 *     Stripping it first produces a cleanly UNSIGNED binary — postject then
 *     keeps it unsigned rather than corrupting it.
 *
 *  2. CFG clear: postject adds a section without updating the CFG guard tables.
 *     Clearing the GUARD_CF DllCharacteristic opts the process out of CFG
 *     enforcement, which prevents 0xC0000005 crashes when NAPI functions make
 *     indirect calls back into node.exe.
 */

import fs from 'fs';

const IMAGE_DLLCHARACTERISTICS_GUARD_CF = 0x4000;

export function patchPe(filePath) {
  const orig = fs.readFileSync(filePath);
  const buf = Buffer.from(orig); // mutable copy

  // ── 0. Verify PE signature ──────────────────────────────────────────────
  const e_lfanew = buf.readUInt32LE(0x3c);
  if (buf.readUInt32LE(e_lfanew) !== 0x00004550) {
    throw new Error(`${filePath}: not a PE file (no PE signature)`);
  }

  const optStart = e_lfanew + 4 + 20; // after PE sig + COFF header

  // ── 1. Clear CFG flag ───────────────────────────────────────────────────
  const dllCharOffset = optStart + 70;
  const dllCharBefore = buf.readUInt16LE(dllCharOffset);
  const dllCharAfter  = dllCharBefore & ~IMAGE_DLLCHARACTERISTICS_GUARD_CF;
  if (dllCharBefore !== dllCharAfter) {
    buf.writeUInt16LE(dllCharAfter, dllCharOffset);
    console.log(`[patch-pe] CFG cleared: 0x${dllCharBefore.toString(16)} → 0x${dllCharAfter.toString(16)}`);
  } else {
    console.log(`[patch-pe] CFG already clear (DllCharacteristics=0x${dllCharBefore.toString(16)})`);
  }

  // ── 2. Strip Authenticode signature ────────────────────────────────────
  // DataDirectory[4] = CertificateTable, at OptionalHeader+144.
  // Each DataDirectory entry is 8 bytes: VirtualAddress (4) + Size (4).
  const certDirOffset = optStart + 144;
  const certVA   = buf.readUInt32LE(certDirOffset);
  const certSize = buf.readUInt32LE(certDirOffset + 4);

  if (certVA === 0 && certSize === 0) {
    console.log('[patch-pe] No Authenticode signature found (already unsigned).');
    fs.writeFileSync(filePath, buf);
    return;
  }

  console.log(`[patch-pe] Stripping Authenticode signature at file offset 0x${certVA.toString(16)}, size ${certSize} bytes`);

  // Zero the Certificate Table directory entry
  buf.writeUInt32LE(0, certDirOffset);
  buf.writeUInt32LE(0, certDirOffset + 4);

  // Truncate the file at the start of the certificate data.
  // Authenticode certificates are typically appended at the end of the file;
  // certVA is a raw file offset (not RVA) per the PE spec for this directory.
  const truncated = buf.subarray(0, certVA);
  fs.writeFileSync(filePath, truncated);

  console.log(`[patch-pe] Done. File size: ${orig.length} → ${truncated.length} bytes`);
}
