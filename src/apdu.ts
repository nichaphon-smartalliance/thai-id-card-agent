/**
 * APDU command set for the Thai national ID smart card, plus the low-level
 * transmit helper that implements the card's request / GET RESPONSE protocol.
 *
 * Command bytes are the well-known constants used by every open-source Thai
 * ID reader (chakphanu/ThaiNationalIDCard, tirmizee/ReadThaiIDCard, etc.):
 *
 *   80 B0 <offsetHi> <offsetLo> 02 00 <Le>
 *
 * After a read command the card answers `61 <len>` ("len bytes are ready"),
 * and we must follow up with GET RESPONSE (`00 C0 00 00 <len>`) to fetch the
 * actual payload. Some readers return the data directly - the helper below
 * handles both shapes, plus the `6C <len>` "wrong length, retry" case.
 */

/** Anything we can send APDUs to (the pcsc-mini Card, or a test double). */
export interface CardTransmitter {
  transmit(data: Uint8Array): Promise<Uint8Array>;
}

/** SELECT the Thai ID applet (AID A0 00 00 00 54 48 00 01). Send this first. */
export const SELECT_APPLET: number[] = [
  0x00, 0xa4, 0x04, 0x00, 0x08, 0xa0, 0x00, 0x00, 0x00, 0x54, 0x48, 0x00, 0x01,
];

const GET_RESPONSE = [0x00, 0xc0, 0x00, 0x00];

/**
 * Read commands for each data field: `80 B0 <offsetHi> <offsetLo> 02 00 <Le>`.
 * Offsets/lengths verified by reading a real Thai ID card:
 *   version 0x0000/4 · cid 0x0004/13 · nameTH 0x0011/100 · nameEN 0x0075/100 ·
 *   dob 0x00D9/8 · gender 0x00E1/1 · cardOrRequestNo 0x00E2/20 ·
 *   issuerOrg 0x00F6/100 · issuerCode 0x015A/13 · issueDate 0x0167/8 ·
 *   expireDate 0x016F/8 · cardTypeCode 0x0177/2 · address 0x1579/160 ·
 *   underPhotoNumber 0x1619/14 · photo 0x017B...
 */
export const APDU = {
  VERSION: [0x80, 0xb0, 0x00, 0x00, 0x02, 0x00, 0x04],
  CID: [0x80, 0xb0, 0x00, 0x04, 0x02, 0x00, 0x0d],
  FULLNAME_TH: [0x80, 0xb0, 0x00, 0x11, 0x02, 0x00, 0x64],
  FULLNAME_EN: [0x80, 0xb0, 0x00, 0x75, 0x02, 0x00, 0x64],
  DOB: [0x80, 0xb0, 0x00, 0xd9, 0x02, 0x00, 0x08],
  GENDER: [0x80, 0xb0, 0x00, 0xe1, 0x02, 0x00, 0x01],
  CARD_REQUEST_NO: [0x80, 0xb0, 0x00, 0xe2, 0x02, 0x00, 0x14], // len 20
  ISSUER: [0x80, 0xb0, 0x00, 0xf6, 0x02, 0x00, 0x64],
  ISSUER_CODE: [0x80, 0xb0, 0x01, 0x5a, 0x02, 0x00, 0x0d], // len 13
  ISSUE_DATE: [0x80, 0xb0, 0x01, 0x67, 0x02, 0x00, 0x08],
  EXPIRE_DATE: [0x80, 0xb0, 0x01, 0x6f, 0x02, 0x00, 0x08],
  CARD_TYPE: [0x80, 0xb0, 0x01, 0x77, 0x02, 0x00, 0x02], // len 2
  ADDRESS: [0x80, 0xb0, 0x15, 0x79, 0x02, 0x00, 0xa0], // len 160
  UNDER_PHOTO_NO: [0x80, 0xb0, 0x16, 0x19, 0x02, 0x00, 0x0e], // len 14
} as const;

/**
 * The photo is stored as 20 consecutive 255-byte segments that concatenate
 * into a JPEG. P1 increments 0x01..0x14 while P2 decrements so that
 * P1 + P2 === 0x7C; Le is 0xFF for every segment.
 */
export const PHOTO_SEGMENTS: number[][] = Array.from({ length: 20 }, (_, i) => {
  const p1 = i + 1;
  const p2 = 0x7c - p1;
  return [0x80, 0xb0, p1, p2, 0x02, 0x00, 0xff];
});

/**
 * Send a read command and return only the data bytes (status word stripped).
 * Transparently performs GET RESPONSE on `61 xx` and retries on `6C xx`.
 */
export async function transmitRead(
  card: CardTransmitter,
  command: readonly number[],
): Promise<Uint8Array> {
  let res = await card.transmit(Uint8Array.from(command));

  let sw1 = res[res.length - 2];
  let sw2 = res[res.length - 1];

  if (sw1 === 0x61) {
    // Data ready - retrieve it with GET RESPONSE using the advertised length.
    res = await card.transmit(Uint8Array.from([...GET_RESPONSE, sw2]));
  } else if (sw1 === 0x6c) {
    // Wrong Le - resend the original command with the length the card wants.
    const retry = command.slice();
    retry[retry.length - 1] = sw2;
    res = await card.transmit(Uint8Array.from(retry));
  }

  return res.subarray(0, Math.max(0, res.length - 2));
}
