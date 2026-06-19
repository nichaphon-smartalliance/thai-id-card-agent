/**
 * Reads every supported field from an already-connected Thai ID card and
 * returns a clean JSON object (Thai text decoded, dates normalised, photo as
 * base64). Talks to the card only through the APDU helper.
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

export interface ThaiIdDate {
  /** Buddhist-era as stored on the card, e.g. "2520-11-08". null if blank. */
  be: string | null;
  /** Gregorian ISO date, e.g. "1977-11-08". null if blank / partial. */
  iso: string | null;
  /** Raw 8-char string from the card (YYYYMMDD, BE), for debugging. */
  raw: string;
}

export interface ThaiIdCardData {
  pid: string;

  titleTH: string;
  firstNameTH: string;
  middleNameTH: string;
  lastNameTH: string;
  fullNameTH: string;

  titleEN: string;
  firstNameEN: string;
  middleNameEN: string;
  lastNameEN: string;
  fullNameEN: string;

  dateOfBirth: ThaiIdDate;
  gender: "male" | "female" | "unknown";
  genderCode: number | null;

  address: string;

  issuer: string;
  issueDate: ThaiIdDate;
  expireDate: ThaiIdDate;

  /** Base64 JPEG. Prefixed with a data URI when THAI_ID_AGENT_PHOTO_DATA_URI=1. */
  photoBase64: string;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Convert the card's `YYYYMMDD` Buddhist-era date into a normalised object. */
function parseThaiDate(raw: string): ThaiIdDate {
  const s = raw.trim();
  if (s.length !== 8 || s === "00000000") {
    return { be: null, iso: null, raw: s };
  }
  const yearBE = Number(s.slice(0, 4));
  const month = Number(s.slice(4, 6));
  const day = Number(s.slice(6, 8));
  const yearCE = yearBE - 543;

  const be = `${yearBE}-${pad2(month)}-${pad2(day)}`;
  // Some cards legitimately store 00 for an unknown month/day.
  const iso =
    month >= 1 && month <= 12 && day >= 1 && day <= 31
      ? `${yearCE}-${pad2(month)}-${pad2(day)}`
      : null;

  return { be, iso, raw: s };
}

/** Card name fields are `title#first#middle#last`, padded with spaces. */
function parseName(raw: string) {
  const parts = raw.split("#").map((p) => p.trim());
  const [title = "", first = "", middle = "", last = ""] = parts;
  const full = [title, first, middle, last].filter(Boolean).join(" ");
  return { title, first, middle, last, full };
}

/** Address fields are also `#`-separated; join the non-empty pieces. */
function parseAddress(raw: string): string {
  return raw
    .split("#")
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" ");
}

/** Read and decode the full card. Assumes `card` is already connected. */
export async function readThaiIdCard(
  card: CardTransmitter,
): Promise<ThaiIdCardData> {
  // 1. Select the Thai ID applet - required before any read.
  await card.transmit(Uint8Array.from(SELECT_APPLET));

  // 2. Text / numeric fields.
  const pid = decodeAscii(await transmitRead(card, APDU.CID)).trim();
  const th = parseName(decodeTIS620(await transmitRead(card, APDU.FULLNAME_TH)));
  const en = parseName(decodeAscii(await transmitRead(card, APDU.FULLNAME_EN)));
  const dob = parseThaiDate(decodeAscii(await transmitRead(card, APDU.DOB)));
  const genderRaw = decodeAscii(await transmitRead(card, APDU.GENDER)).trim();
  const issuer = decodeTIS620(await transmitRead(card, APDU.ISSUER)).trim();
  const issueDate = parseThaiDate(
    decodeAscii(await transmitRead(card, APDU.ISSUE_DATE)),
  );
  const expireDate = parseThaiDate(
    decodeAscii(await transmitRead(card, APDU.EXPIRE_DATE)),
  );
  const address = parseAddress(decodeTIS620(await transmitRead(card, APDU.ADDRESS)));

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

  const genderCode = genderRaw ? Number(genderRaw) : null;
  const gender =
    genderCode === 1 ? "male" : genderCode === 2 ? "female" : "unknown";

  return {
    pid,
    titleTH: th.title,
    firstNameTH: th.first,
    middleNameTH: th.middle,
    lastNameTH: th.last,
    fullNameTH: th.full,
    titleEN: en.title,
    firstNameEN: en.first,
    middleNameEN: en.middle,
    lastNameEN: en.last,
    fullNameEN: en.full,
    dateOfBirth: dob,
    gender,
    genderCode,
    address,
    issuer,
    issueDate,
    expireDate,
    photoBase64,
  };
}
