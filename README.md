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

### `GET /data?readerName=<name>`
- ถ้ามีเครื่องอ่านเพียงตัวเดียว สามารถละ `readerName` ได้
- ตัวอย่างผลลัพธ์ (ค่าตัวอย่าง):

```json
{
  "success": true,
  "readerName": "ACS ACR39U 1",
  "pid": "1234567890123",
  "titleTH": "นาย",
  "firstNameTH": "สมชาย",
  "middleNameTH": "",
  "lastNameTH": "ใจดี",
  "fullNameTH": "นาย สมชาย ใจดี",
  "titleEN": "Mr.",
  "firstNameEN": "Somchai",
  "middleNameEN": "",
  "lastNameEN": "Jaidee",
  "fullNameEN": "Mr. Somchai Jaidee",
  "dateOfBirth": { "be": "2530-01-15", "iso": "1987-01-15", "raw": "25300115" },
  "gender": "male",
  "genderCode": 1,
  "address": "99 หมู่ที่ 1 ตำบลในเมือง อำเภอเมือง จังหวัดขอนแก่น",
  "issuer": "อำเภอเมืองขอนแก่น/ขอนแก่น",
  "issueDate": { "be": "2562-03-29", "iso": "2019-03-29", "raw": "25620329" },
  "expireDate": { "be": "2570-08-25", "iso": "2027-08-25", "raw": "25700825" },
  "photoBase64": "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBD..."
}
```

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

## 7) สร้างตัวติดตั้ง (Inno Setup)

1. ติดตั้ง [Inno Setup 6+](https://jrsoftware.org/isdl.php)
2. `bun install` ให้ครบก่อน (installer จะแพ็ค `node_modules` ไปด้วย)
3. คอมไพล์:
   ```powershell
   & "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss
   ```
4. ได้ `dist-installer\ThaiIDCardAgent-Setup.exe`

ตัวติดตั้งจะ:
- คัดลอกโปรเจกต์ + `node_modules` ไปที่ `Program Files\ThaiIDCardAgent`
- รัน `bun run install-service.ts` เพื่อสร้าง service (Auto Start)
- ตอน uninstall จะ stop + ถอน service ให้

> เครื่องปลายทาง **ต้องมี Bun** (installer จะเตือนถ้าไม่พบ) — เพราะ agent รันบน Bun runtime

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
- agent ตั้ง CORS = `*` อยู่แล้ว (ปรับได้ด้วย env `THAI_ID_AGENT_CORS_ORIGIN`)
- ถ้าเว็บเป็น **https** บางเบราว์เซอร์บล็อกการเรียก `http://localhost` (mixed content) —
  พิจารณาทำ reverse proxy/หรือใช้ใบรับรองสำหรับ localhost

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
