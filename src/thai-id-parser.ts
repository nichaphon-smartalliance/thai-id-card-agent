/**
 * Reads every supported field from an already-connected Thai ID card and
 * returns a flat JSON object matching the format consumed by the
 * smartalliance / DOPA web frontend (Raw + formatted variants per field).
 */

import {
  APDU,
  PHOTO_SEGMENTS,
  SELECT_APPLET,
  transmitRead,
  type CardTransmitter,
} from "./apdu";
import { decodeAscii, decodeTIS620 } from "./encoding";
import { CONFIG } from "./config";

export interface ThaiIdCardData {
  version: string;
  pid: string;

  fullNameTHRaw: string;
  fullNameTH: string;
  fullNameENRaw: string;
  fullNameEN: string;

  birthDateRaw: string;
  birthDate: string;

  genderCode: string;
  genderText: string;

  cardOrRequestNo: string;
  issuerOrg: string;
  issuerCode: string;

  issueDateRaw: string;
  issueDate: string;
  expiryDateRaw: string;
  expiryDate: string;

  cardTypeCode: string;

  addressRaw: string;
  addressText: string;

  underPhotoNumber: string;

  /** Base64 JPEG. Prefixed with a data URI when THAI_ID_AGENT_PHOTO_DATA_URI=1. */
  photoBase64: string;
}

/** Trim trailing spaces and '#' padding while keeping internal separators. */
const trimRaw = (s: string) => s.replace(/[\s#]+$/u, "");

/** Join the non-empty '#'-separated segments with single spaces. */
const joinSegments = (s: string) =>
  s
    .split("#")
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" ");

/** Insert dashes into an 8-char Buddhist-era YYYYMMDD (kept in BE, e.g. 2543-03-14). */
function formatBEDate(raw: string): string {
  const s = raw.trim();
  if (s.length !== 8 || s === "00000000") return s.trim();
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function genderText(code: string): string {
  if (code === "1") return "ชาย";
  if (code === "2") return "หญิง";
  return "";
}

/** Read and decode the full card. Assumes `card` is already connected. */
export async function readThaiIdCard(
  card: CardTransmitter,
): Promise<ThaiIdCardData> {
  // 1. Select the Thai ID applet - required before any read.
  await card.transmit(Uint8Array.from(SELECT_APPLET));

  // 2. Text / numeric fields.
  const version = decodeAscii(await transmitRead(card, APDU.VERSION)).trim();
  const pid = decodeAscii(await transmitRead(card, APDU.CID)).trim();

  const fullNameTHRaw = trimRaw(
    decodeTIS620(await transmitRead(card, APDU.FULLNAME_TH)),
  );
  const fullNameENRaw = trimRaw(
    decodeAscii(await transmitRead(card, APDU.FULLNAME_EN)),
  );

  const birthDateRaw = decodeAscii(await transmitRead(card, APDU.DOB)).trim();
  const genderCode = decodeAscii(await transmitRead(card, APDU.GENDER)).trim();
  const cardOrRequestNo = decodeAscii(
    await transmitRead(card, APDU.CARD_REQUEST_NO),
  ).trim();
  const issuerOrg = decodeTIS620(await transmitRead(card, APDU.ISSUER)).trim();
  const issuerCode = decodeAscii(
    await transmitRead(card, APDU.ISSUER_CODE),
  ).trim();
  const issueDateRaw = decodeAscii(
    await transmitRead(card, APDU.ISSUE_DATE),
  ).trim();
  const expiryDateRaw = decodeAscii(
    await transmitRead(card, APDU.EXPIRE_DATE),
  ).trim();
  const cardTypeCode = decodeAscii(
    await transmitRead(card, APDU.CARD_TYPE),
  ).trim();
  const addressRaw = trimRaw(
    decodeTIS620(await transmitRead(card, APDU.ADDRESS)),
  );
  const underPhotoNumber = decodeAscii(
    await transmitRead(card, APDU.UNDER_PHOTO_NO),
  ).trim();

  // 3. Photo - 20 segments concatenated into a single JPEG.
  const segments: Uint8Array[] = [];
  let total = 0;
  for (const seg of PHOTO_SEGMENTS) {
    const chunk = await transmitRead(card, seg);
    segments.push(chunk);
    total += chunk.length;
  }
  const photo = new Uint8Array(total);
  let offset = 0;
  for (const seg of segments) {
    photo.set(seg, offset);
    offset += seg.length;
  }
  const base64 = Buffer.from(photo).toString("base64");
  const photoBase64 = CONFIG.photoAsDataUri
    ? `data:image/jpeg;base64,${base64}`
    : base64;

  return {
    version,
    pid,
    fullNameTHRaw,
    fullNameTH: joinSegments(fullNameTHRaw),
    fullNameENRaw,
    fullNameEN: joinSegments(fullNameENRaw),
    birthDateRaw,
    birthDate: formatBEDate(birthDateRaw),
    genderCode,
    genderText: genderText(genderCode),
    cardOrRequestNo,
    issuerOrg,
    issuerCode,
    issueDateRaw,
    issueDate: formatBEDate(issueDateRaw),
    expiryDateRaw,
    expiryDate: formatBEDate(expiryDateRaw),
    cardTypeCode,
    addressRaw,
    addressText: joinSegments(addressRaw),
    underPhotoNumber,
    photoBase64,
  };
}
