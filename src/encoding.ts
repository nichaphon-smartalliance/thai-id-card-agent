/**
 * Text decoding helpers for Thai ID card data.
 *
 * Thai-language fields on the card are encoded in TIS-620, not UTF-8. In
 * TIS-620 the Thai block sits at bytes 0xA1-0xFB and maps linearly onto the
 * Unicode Thai block U+0E01-U+0E5B, so we can decode it without pulling in a
 * native/iconv dependency (which would complicate `bun build --compile`).
 */

/** Decode a TIS-620 byte buffer (Thai text) into a JS string. */
export function decodeTIS620(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    if (b === 0x00) continue; // padding
    if (b < 0x80) {
      out += String.fromCharCode(b); // ASCII range is identical
    } else if (b >= 0xa1 && b <= 0xfb) {
      out += String.fromCharCode(0x0e00 + (b - 0xa0)); // Thai block
    } else {
      out += " "; // unused TIS-620 code point - treat as space
    }
  }
  return out;
}

/** Decode a plain ASCII field (English name, dates, CID, gender code). */
export function decodeAscii(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    if (b === 0x00) continue;
    out += String.fromCharCode(b);
  }
  return out;
}
