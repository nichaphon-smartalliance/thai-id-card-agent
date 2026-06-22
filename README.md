# Thai ID Card Agent

Local HTTP agent ที่อ่านข้อมูล **บัตรประชาชนไทย** ผ่านเครื่องอ่าน Smart Card (PC/SC)
แล้วเปิดให้เว็บแอปเรียกใช้งานผ่าน `http://127.0.0.1:9001`

สร้างด้วย **Bun + Hono (TypeScript)** — ไม่ใช้ Express, ไม่ต้องมี C/C++ toolchain
(ใช้ prebuilt native binary ของ `pcsc-mini`)

> ✅ ทดสอบแล้วบน Windows 11 x64, Bun 1.3.13 — อ่านบัตรจริงได้ (ชื่อไทย/อังกฤษ, ที่อยู่,
> วันเกิด พ.ศ.→ค.ศ., รูปถ่าย JPEG)

---

## คุณสมบัติ

- `GET /readers` — คืนรายชื่อเครื่องอ่านที่เชื่อมต่ออยู่ (รองรับ **Multi Reader**)
- `GET /data?readerName=...` — อ่านข้อมูลบัตรจากเครื่องอ่านที่เลือก
- ถอดรหัสภาษาไทย (TIS-620), แปลงวันที่ พ.ศ. → ค.ศ., รูปถ่ายเป็น base64
- รันเป็น **Windows Service** ชื่อ `ThaiIDCardAgent` (Auto Start) ผ่าน `node-windows`
- มี CORS ให้เว็บแอปเรียกข้ามโดเมนได้ (bind เฉพาะ loopback เพื่อความปลอดภัย)
- ไฟล์ติดตั้ง/ถอน service + ตัวอย่าง `installer.iss` สำหรับ Inno Setup

---

## โครงสร้างโปรเจกต์

```
thai-id-card-agent/
├─ src/
│  ├─ index.ts            # entry: boot reader manager + Bun.serve
│  ├─ server.ts           # Hono app (/, /readers, /data) + CORS
│  ├─ reader-manager.ts   # PC/SC client + registry ของ reader + อ่านบัตร
│  ├─ thai-id-parser.ts   # อ่านทุก field จากบัตร → JSON
│  ├─ apdu.ts             # APDU commands + request/GET RESPONSE helper
│  ├─ encoding.ts         # ตัวถอดรหัส TIS-620 / ASCII
│  ├─ config.ts           # port, host, CORS (override ได้ด้วย env)
│  ├─ errors.ts           # AgentError (พก HTTP status)
│  └─ compiled-entry.ts   # entry สำหรับ bun build --compile (ดู Troubleshooting)
├─ install-service.ts     # ติดตั้ง Windows Service (node-windows)
├─ uninstall-service.ts   # ถอน Windows Service
├─ scripts/build.ts       # bundle → dist/ (+ exe ทดลอง)
├─ types/node-windows.d.ts
├─ patches/pcsc-mini@0.1.3.patch   # patch ให้ exe หา native addon ข้างไฟล์ exe ได้
├─ installer.iss          # Inno Setup
├─ package.json / bunfig.toml / tsconfig.json
```

---

## 1) ติดตั้ง Bun

เปิด **PowerShell** แล้วรัน:

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

ปิด-เปิด terminal ใหม่ แล้วตรวจสอบ:

```powershell
bun --version    # ควรได้ >= 1.2.12
```

> ต้องการ Windows **x64** และเครื่องอ่าน Smart Card ที่ลง driver แล้ว
> (บริการ `Smart Card` / `SCardSvr` ของ Windows ต้องทำงานอยู่ — ปกติเปิดอัตโนมัติ)

---

## 2) ติดตั้ง dependencies

```powershell
bun install
```

`pcsc-mini` จะดึง prebuilt native addon (`@pcsc-mini/windows-x86_64-bun`) ลงมาเอง
— **ไม่ต้องมี Visual Studio / node-gyp**

---

## 3) รันแบบ Dev

```powershell
bun run dev      # auto-reload
# หรือ
bun run start
```

จะได้:

```
  ThaiIDCardAgent v1.0.0
  ➜ http://127.0.0.1:9001
  ➜ GET /readers
  ➜ GET /data?readerName=<name>
```

ทดสอบ:

```powershell
curl http://127.0.0.1:9001/readers
# ["Alcorlink USB Smart Card Reader 0","ACS ACR39U 1"]

curl "http://127.0.0.1:9001/data?readerName=ACS%20ACR39U%201"
```

> เปลี่ยน port ได้ด้วย env: `THAI_ID_AGENT_PORT=9002 bun run start`

---

## 4) API

### `GET /` — health
```json
{ "service": "ThaiIDCardAgent", "version": "1.0.0", "status": "ok", "pcsc": "ready",
  "endpoints": ["GET /readers", "GET /data?readerName=<name>"] }
```

### `GET /readers`
คืน array ของชื่อเครื่องอ่าน:
```json
["Alcorlink USB Smart Card Reader 0", "ACS ACR39U 1"]
```

### `GET /readers/details`
เหมือน `/readers` แต่เพิ่มข้อมูล **ยี่ห้อชิป + VID/PID** (อ่านจาก USB descriptor ของ Windows)
เพื่อให้แยกเครื่องอ่านที่ชื่อ PC/SC ซ้ำกันได้ — ให้เว็บโชว์ `label` แต่ส่ง `name` ไปที่ `/data`
```json
[
  { "name": "Generic EMV Smartcard Reader 0", "vendor": "Alcor Micro",
    "vid": "058F", "pid": "9540", "usb": "EMV Smartcard Reader",
    "label": "Alcor Micro · EMV Smartcard Reader 0" },
  { "name": "Generic Smart Card Reader Interface 0", "vendor": "Realtek",
    "vid": "0BDA", "pid": "0165", "usb": "Smart Card Reader Interface",
    "label": "Realtek · Smart Card Reader Interface 0" }
]
```
> ⚠️ ดึงได้แค่ **ยี่ห้อชิป** (จาก VID) ไม่ใช่ยี่ห้อที่พิมพ์ข้างกล่อง — เครื่องอ่านคนละแบรนด์ที่ใช้
> ชิปเดียวกัน (เช่น Alcor Micro AU9540) จะได้ vendor/VID/PID เหมือนกัน แยกได้ด้วยเลข index ท้ายชื่อ

### `GET /data?readerName=<name>`
- ถ้ามีเครื่องอ่านเพียงตัวเดียว สามารถละ `readerName` ได้
- ตัวอย่างผลลัพธ์ (ค่าตัวอย่าง):

คืน **flat object** ตรงตามรูปแบบที่ frontend smartalliance/DOPA ใช้ (มีทั้งค่า `*Raw` ดิบและ
ค่าจัดรูปแบบแล้ว, วันที่เป็น พ.ศ. คั่นด้วย `-`):

```json
{
  "version": "0003",
  "pid": "1234567890123",
  "fullNameTHRaw": "นาย#สมชาย##ใจดี",
  "fullNameTH": "นาย สมชาย ใจดี",
  "fullNameENRaw": "Mr.#Somchai##Jaidee",
  "fullNameEN": "Mr. Somchai Jaidee",
  "birthDateRaw": "25300115",
  "birthDate": "2530-01-15",
  "genderCode": "1",
  "genderText": "ชาย",
  "cardOrRequestNo": "35014196304/03291314",
  "issuerOrg": "อำเภอเมืองขอนแก่น/ขอนแก่น",
  "issuerCode": "3340100007599",
  "issueDateRaw": "25620329",
  "issueDate": "2562-03-29",
  "expiryDateRaw": "25700825",
  "expiryDate": "2570-08-25",
  "cardTypeCode": "01",
  "addressRaw": "99#หมู่ที่ 1##ตำบลในเมือง#อำเภอเมือง#จังหวัดขอนแก่น",
  "addressText": "99 หมู่ที่ 1 ตำบลในเมือง อำเภอเมือง จังหวัดขอนแก่น",
  "underPhotoNumber": "35010303291314",
  "photoBase64": "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBD..."
}
```

> field offset บนบัตร (ตรวจสอบกับบัตรจริงแล้ว) อยู่ใน [`src/apdu.ts`](src/apdu.ts) ·
> `version` อ่านจาก offset 0x00, `cardOrRequestNo` 0xE2, `issuerCode` 0x15A,
> `cardTypeCode` 0x177, `address` 0x1579, `underPhotoNumber` 0x1619

ค่า error (เช่น ไม่พบบัตร):
```json
{ "success": false, "error": "ไม่พบบัตร หรือเชื่อมต่อบัตรไม่ได้ในเครื่องอ่าน \"...\" - กรุณาเสียบบัตรให้แน่นแล้วลองใหม่ (...)" }
```

| สถานการณ์ | HTTP |
|---|---|
| สำเร็จ | 200 |
| ไม่ได้ส่ง `readerName` และมีหลายเครื่องอ่าน | 400 |
| ไม่พบชื่อเครื่องอ่าน | 404 |
| ไม่มีบัตร / เชื่อมต่อบัตรไม่ได้ | 409 |
| อ่านบัตรล้มเหลว | 500 |
| PC/SC ใช้งานไม่ได้ (native module โหลดไม่ขึ้น) | 503 |

### ตัวอย่างเรียกจากเว็บ (browser)

```js
const readers = await fetch("http://127.0.0.1:9001/readers").then(r => r.json());
const data = await fetch(
  `http://127.0.0.1:9001/data?readerName=${encodeURIComponent(readers[0])}`
).then(r => r.json());

document.querySelector("#name").textContent = data.fullNameTH;
document.querySelector("#photo").src = "data:image/jpeg;base64," + data.photoBase64;
```

> `photoBase64` เป็น base64 ดิบ — ใส่ prefix `data:image/jpeg;base64,` เองเวลาแสดงผล
> (หรือ set env `THAI_ID_AGENT_PHOTO_DATA_URI=1` ให้ agent ใส่ prefix มาให้)

---

## 5) ติดตั้งเป็น Windows Service (วิธีหลักที่ใช้งานจริง)

เปิด terminal **แบบ Run as Administrator** แล้ว:

```powershell
bun run install-service       # ติดตั้ง + start service "ThaiIDCardAgent" (Auto Start)
bun run uninstall-service     # ถอน service
```

ตรวจสอบ:
```powershell
sc query ThaiIDCardAgent
# หรือเปิด services.msc
```

> ใช้ `node-windows` (ภายในห่อด้วย WinSW) ซึ่งจัดการ Service Control Manager ให้ถูกต้อง
> — service จะรัน `bun.exe src\index.ts` (หรือ `agent.js` ถ้าเป็นโฟลเดอร์ที่ build แล้ว)
> และ restart อัตโนมัติเมื่อ crash

---

## 6) Build เป็นไฟล์แจกจ่าย

```powershell
bun run build            # → dist/
bun run build --no-exe   # ข้ามการ compile exe (เร็วกว่า)
```

ได้:
```
dist/
├─ agent.js                       # ✅ รันได้จริงด้วย Bun runtime:  bun agent.js
├─ start.cmd                      # ตัวช่วยรัน
├─ node_modules/@pcsc-mini/...    # native addon (ต้องอยู่ข้าง agent.js)
└─ thai-id-card-agent.exe         # ⚠ ทดลอง — ดู Troubleshooting
```

วิธีรันที่แนะนำ (ต้องมี Bun บนเครื่องปลายทาง):
```powershell
cd dist
bun agent.js
```

---

## 7) สร้างตัวติดตั้ง (.exe) ไปลงเครื่องลูกค้า — Self-contained

ตัวติดตั้งนี้ **ฝัง Bun runtime (bun.exe) ไว้ในตัว** → ลูกค้าดับเบิลคลิกไฟล์เดียวจบ
**ไม่ต้องลง Bun หรืออะไรเพิ่มเลย**

บนเครื่อง dev (ที่มี Bun) ทำ 2 ขั้น:

```powershell
# 1. แพ็คทุกอย่าง (app + bun.exe + node_modules) ลง dist-bundle/
bun run package

# 2. คอมไพล์ตัวติดตั้ง (ต้องลง Inno Setup 6 ก่อน: https://jrsoftware.org/isdl.php)
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss
```

ได้ไฟล์เดียวพร้อมส่งลูกค้า → **`dist-installer\ThaiIDCardAgent-Setup.exe`** (~50–60 MB)

**สิ่งที่ตัวติดตั้งทำบนเครื่องลูกค้า:**
1. คัดลอก agent + `bun.exe` + `node_modules` ไปที่ `Program Files\ThaiIDCardAgent`
2. สร้าง Windows Service `ThaiIDCardAgent` (Auto Start) ที่รัน `bun.exe agent.js`
3. เปิด `http://localhost:9001/readers` ให้ดูหลังติดตั้งเสร็จ
4. ตอน Uninstall → stop + ถอน service ให้อัตโนมัติ

> ลูกค้าแค่ต้องมี **เครื่องอ่าน Smart Card + driver** เท่านั้น (Windows x64)
> — Bun ฝังมาในตัวติดตั้งแล้ว

โครงสร้าง payload (สร้างโดย `bun run package`):
```
dist-bundle/
├─ bun.exe            # Bun runtime ฝังมาด้วย
├─ agent.js           # แอป (bundle แล้ว)
├─ install-service.ts / uninstall-service.ts
├─ node_modules/      # @pcsc-mini (native) + node-windows
└─ patches/
```

---

## Troubleshooting

### ⭐ native module / pcsc

**`bun build --compile` (single exe) แล้วเปิดมา PC/SC ใช้ไม่ได้ / exe crash (Segmentation fault)**
- นี่เป็น **ข้อจำกัดของ Bun เอง** (Bun 1.3.x): native addon ของ `pcsc-mini` จะ **segfault**
  เมื่อถูกโหลดภายใน standalone executable ที่สร้างด้วย `--compile`
  (ทดสอบแล้วว่าโปรแกรมที่แค่ `dlopen` addon เปล่า ๆ ก็ crash เหมือนกัน — Bun รายงานเองว่า
  "This indicates a bug in Bun, not your code")
- **วิธีแก้ปัจจุบัน:** อย่าใช้ exe เป็น production — ให้รันบน **Bun runtime** แทน
  (`bun run start` หรือผ่าน Windows Service ในข้อ 5) ซึ่งทดสอบแล้วว่าอ่านบัตรได้จริง
- ไฟล์ `compiled-entry.ts` + `patches/pcsc-mini@0.1.3.patch` เตรียมไว้ให้ exe หา native addon
  จาก `node_modules/@pcsc-mini` ที่อยู่ข้าง ๆ ได้ — พร้อมใช้ทันทีเมื่อ Bun แก้บั๊ก standalone N-API

**โหลด `pcsc-mini` ไม่ขึ้น (`/readers` ว่าง, `/` ขึ้น status: degraded)**
- รัน `bun install` ใหม่ ให้แน่ใจว่ามี `node_modules/@pcsc-mini/windows-x86_64-bun/addon.node`
- ต้องเป็น Windows **x64** + Bun **≥ 1.2.12**
- ถ้าแพ็ค `node_modules` ไปเครื่องอื่น ให้คงโฟลเดอร์ `@pcsc-mini/windows-x86_64-bun` ไว้ครบ

### `GET /readers` ว่างทั้งที่เสียบเครื่องอ่านแล้ว
- เปิด `services.msc` ตรวจว่า **Smart Card (SCardSvr)** ทำงานอยู่
- ลง driver เครื่องอ่าน, ลองถอด-เสียบ USB ใหม่
- ลองเปิด "อ่านบัตร" ด้วยโปรแกรมอื่นเพื่อยืนยันว่าเครื่องอ่านทำงาน

### `GET /data` ได้ 409 "ไม่พบบัตร"
- เสียบบัตรให้แน่น (หน้าสัมผัสชิปเข้าเครื่อง), รอสักครู่แล้วลองใหม่
- เช็คว่า `readerName` ตรงกับที่ได้จาก `/readers` (ใช้ URL-encode เวลามีช่องว่าง)

### Service ติดตั้งไม่ได้ / start ไม่ขึ้น
- ต้องเปิด terminal เป็น **Administrator**
- ตรวจว่า `bun` อยู่ใน PATH (`where bun`)
- ดู log ที่โฟลเดอร์ `daemon\` (node-windows สร้างไว้) หรือ Event Viewer
- ถ้าเคยติดตั้งค้าง ให้ `bun run uninstall-service` ก่อนติดตั้งใหม่

### ชื่อไทยเพี้ยน / เป็นภาษาต่างดาว
- ข้อมูลบนบัตรเป็น **TIS-620** (โค้ดถอดรหัสอยู่ใน `src/encoding.ts` แล้ว)
  ฝั่งเว็บต้องแสดงผลเป็น UTF-8 (response เป็น UTF-8 อยู่แล้ว)

### วันที่ผิด
- บัตรเก็บวันที่เป็น **พ.ศ.** (`YYYYMMDD`) — agent คืนทั้ง `be` (พ.ศ.) และ `iso` (ค.ศ. = พ.ศ. − 543)

### เว็บเรียกไม่ได้ (CORS / mixed content)
- agent **สะท้อน Origin ของผู้เรียกกลับ** (ไม่ใช่ `*`) และส่ง `Access-Control-Allow-Credentials: true`
  ให้อัตโนมัติ → รองรับทั้งการเรียกแบบมี cookie/credentials และไม่มี จากทุกโดเมน
  (จำกัดได้ด้วย env `THAI_ID_AGENT_CORS_ORIGIN=https://a.com,https://b.com`)
- ⚠️ ถ้ายังติด CORS หลังอัปเดต ให้เช็กว่า service รันโค้ดเวอร์ชันใหม่แล้ว (ติดตั้ง installer ตัวล่าสุดทับ)
- ถ้าเว็บเป็น **https** บางเบราว์เซอร์บล็อกการเรียก `http://localhost` (mixed content) —
  พิจารณาทำ reverse proxy/หรือใช้ใบรับรองสำหรับ localhost

### เสียบเครื่องอ่านกลับเข้าไปแล้วไม่เจอ (หลังถอดออกจนหมด)
- เวอร์ชันใหม่มี watchdog: ถ้าไม่มีเครื่องอ่านเหลือเลย จะ re-scan ใหม่ทุก ~2.5 วินาที
  → เสียบกลับแล้วจะเจอเองภายในไม่กี่วินาที (อัปเดต installer ตัวล่าสุดถ้ายังเป็นของเดิม)
- ⚠️ Windows อาจ**เปลี่ยนชื่อเครื่องอ่าน**หลังถอด-เสียบ (เช่น `...Reader 0` → `...Reader 1`)
  ฝั่งเว็บจึงควรเรียก `GET /readers` เพื่อเอาชื่อล่าสุดทุกครั้ง อย่า hardcode ชื่อไว้

### Antivirus / Firewall
- บางตัวอาจเตือน exe ที่ build จาก Bun หรือบล็อกพอร์ต — อนุญาต `bun.exe` / พอร์ต 9001 (loopback)

### พอร์ตชนกัน (EADDRINUSE)
- มีโปรแกรมอื่นใช้ 9001 อยู่ — เปลี่ยนด้วย `THAI_ID_AGENT_PORT`

---

## หมายเหตุด้านความปลอดภัย
- agent bind เฉพาะ `127.0.0.1` (เข้าจากเครื่องตัวเองเท่านั้น ไม่เปิดออก LAN)
- CORS เปิดกว้างเพื่อให้เว็บแอปต่าง ๆ เรียกได้ — ข้อมูลจะถูกอ่านก็ต่อเมื่อ **เสียบบัตรจริง**
  ที่เครื่อง ถ้าต้องการจำกัด ให้ตั้ง `THAI_ID_AGENT_CORS_ORIGIN` เป็นโดเมนที่อนุญาต

## เทคนิคการอ่านบัตร (อ้างอิง)
- SELECT applet: `00 A4 04 00 08 A0 00 00 00 54 48 00 01`
- อ่านแต่ละ field ด้วย `80 B0 <offset> 02 00 <len>` แล้วตามด้วย GET RESPONSE `00 C0 00 00 <len>`
- รูปถ่าย = 20 ท่อน ท่อนละ 255 ไบต์ ต่อกันเป็น JPEG
- รายละเอียดคำสั่งอยู่ใน [`src/apdu.ts`](src/apdu.ts)

## License
MIT
