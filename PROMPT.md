
---

**Prompt:**

ช่วยสร้างโปรเจกต์ **Thai ID Card Local Agent** สำหรับ Windows โดยใช้ **Bun + Hono** (TypeScript)

### วัตถุประสงค์
สร้าง Local HTTP Server ที่รันเป็น Windows Service (Auto Start) บน `http://localhost:9001` เพื่อให้เว็บอ่านข้อมูลบัตรประชาชน

### Requirement

1. **API Endpoints** (ต้องตรงตามนี้)
   - `GET /readers` → คืน JSON array เช่น `["Alcorlink USB Smart Card Reader 0", "ACS ACR39U 1"]`
   - `GET /data?readerName=Alcorlink%20USB%20Smart%20Card%20Reader%200` → คืน JSON ข้อมูลบัตรประชาชน (ตาม format ที่เคยให้มา มี `photoBase64`, `fullNameTH`, `pid` ฯลฯ)

2. **เทคโนโลยี**
   - **Bun** (runtime)
   - **Hono** (สำหรับ routing)
   - TypeScript
   - `pcsc-mini` หรือ library ที่อ่านบัตรประชาชนไทยได้ดี (รองรับ Bun)
   - ใช้ `node-windows` หรือวิธีอื่นที่เหมาะกับ Bun สำหรับทำ Windows Service
   - **ห้ามใช้ Express**

3. **ฟีเจอร์หลัก**
   - รองรับ Multi Card Reader
   - สามารถเลือก `readerName` ได้
   - รันเป็น Windows Service ชื่อ `ThaiIDCardAgent` (Auto Start)
   - มีไฟล์สำหรับ Install / Uninstall Service
   - สามารถ bundle เป็น single executable ด้วย `bun build` หรือ pkg
   - มีไฟล์ `installer.iss` สำหรับ Inno Setup

4. **โครงสร้างโปรเจกต์**
   - `src/index.ts` (ไฟล์หลัก)
   - `install-service.ts` / `uninstall-service.ts`
   - `bunfig.toml` (ถ้าจำเป็น)
   - `package.json` (หรือ bun.lockb)
   - `installer.iss`

ช่วยเขียนโค้ดทั้งหมดให้สมบูรณ์  
เริ่มจาก `package.json` + `src/index.ts` ก่อน  
และให้คำอธิบายขั้นตอนการติดตั้ง Bun, การ build, การทำ service, และการแก้ปัญหาที่พบบ่อย (โดยเฉพาะ native module กับ pcsc)

---