# Bedgorm Phase 3 — Tabletop RC

ภาพก่อนปรับมาจาก `ca062ca` ภาพหลังปรับมาจากชุด UI ใน branch `feat/phase3-enhancement` ใช้ Chrome headless และเกม Seed 42 เพื่อเทียบกระดานกับตำแหน่งแมวชุดเดียวกัน

| หน้าจอ | ก่อน | หลัง |
| --- | --- | --- |
| เกม 1440px | [ภาพ](before-game-1440.png) | [ภาพ](after-game-1440.png) |
| เกม 768px | [ภาพ](before-game-768.png) | [ภาพ](after-game-768.png) |
| เกม 390px | [ภาพ](before-game-390.png) | [ภาพ](after-game-390.png) |
| กระดานระยะใกล้ | [ภาพ](before-board.png) | [ภาพ](after-board.png) |
| แผงการกระทำ | [ภาพ](before-actions.png) | [ภาพ](after-actions.png) |
| Lobby 1440px | [ภาพ](before-lobby-1440.png) | [ภาพ](after-lobby-1440.png) |
| Lobby 768px | [ภาพ](before-lobby-768.png) | [ภาพ](after-lobby-768.png) |
| Lobby 390px | [ภาพ](before-lobby-390.png) | [ภาพ](after-lobby-390.png) |

## ผลทดสอบ

- `npm test` ผ่าน 19 เทสต์ รวมจำลองเกม 180 เกม ห้อง 2 ผู้เล่นกับ 2 บอต ห้อง 4 และ 8 ผู้เล่นเล่นจนจบ ตรวจคะแนนและที่นั่งเมื่อ reconnect และตรวจห้องหมดอายุ
- `node test/tabletop-browser.mjs` ผ่านที่ 1440, 1024, 768, 390 และ 360px ตรวจลำดับกระดาน 16 ช่อง แมวซ้อนจากบนลงล่าง แมวเดินย้อน ปุ่มตามสถานะตา Keyboard Focus, Reduced Motion และ guest reconnect ในเบราว์เซอร์แยก ชุด axe สำหรับหน้าเกมที่ 390px ไม่พบ violation ตามแท็ก WCAG ที่เปิดตรวจ
- `npm audit --audit-level=high` พบ 0 vulnerabilities การจำลองโหลด SQLite ส่ง 420 คำขอผ่านทั้งหมด
- Neon staging เชื่อม Direct TLS แบบ `verify-full` บน PostgreSQL 18.7 มีตารางครบหกตาราง เทสต์เปิด server instance ใหม่ด้วยฐาน Neon ใน schema ชั่วคราวผ่านทั้งการคืนตำแหน่งผู้เล่น สถานะเกม และการเล่นต่อจนจบ
- Render Staging ตอบ `/ready` HTTP 204 การทดสอบเกมสมมติยืนยันห้อง 1 ห้อง, guest sessions 2 รายการ, actions 2 รายการ และสถานะเกม version 2 ใน Neon ผู้เล่นกลับเข้าที่นั่งเดิมผ่าน API ได้ก่อน restart
- Phase 2 Production ตอบ HTTP 200 เมื่ออ่านหน้าแรก และ `main` อยู่ที่ `ab9fe19` ระหว่างการตรวจ

## งานก่อนอนุมัติ Release

1. ใน Render Dashboard ยืนยันว่า `bedgorm-phase3-staging` ใช้ Free, Singapore, branch `feat/phase3-enhancement`, Auto Deploy Off, build `npm ci --ignore-scripts && npm test`, start `npm run dev` และ health check `/ready`
2. ยืนยันจากประวัติการดูแลบัญชีว่าหมุนรหัสผ่าน Neon ที่เคยเปิดเผยแล้ว หากยังไม่มีหลักฐาน ให้หมุนรหัสผ่านของ role ที่ใช้กับ staging แล้วอัปเดต `DATABASE_URL` โดยตรงใน Render Environment
3. Deploy commit RC จาก branch พัฒนา ตรวจ build และ runtime logs, SHA และ `/ready` สร้างห้องทดสอบ 2 ผู้เล่นกับ 2 บอต เล่นอย่างน้อยสองตา และตรวจ `rooms`, `guest_sessions`, `games` และ `actions` ใน Neon
4. จดที่นั่ง รอบ ตำแหน่งแมว และคะแนนของห้องทดสอบ จากนั้น Restart เฉพาะ Render Staging เมื่อกลับมาให้ refresh ในเบราว์เซอร์เดิม ทดสอบ reconnect ด้วย guest เดิม เทียบสถานะและทอยต่อหนึ่งตา
5. **มือถือจริง — Not Tested** เปิด iPhone Safari และ Android Chrome ทดสอบแนวตั้ง แนวนอน ขอบหน้าจอและแป้นพิมพ์ ตรวจแตะทุกการกระทำ อ่านลำดับแมวซ้อน อ่านเวลาและสถานะผู้เล่น ทดสอบ Reduced Motion และสลับ Wi‑Fi/มือถือ จากนั้นเล่นหนึ่งเกมจนจบ
6. ปล่อย staging idle เพื่อวัดเวลา cold start เปิดลิงก์และสร้างห้องหนึ่งครั้ง ตรวจว่ามีเพียงห้องเดียว แล้วบันทึกผล UAT พร้อม SHA และรุ่นอุปกรณ์โดยเก็บ session และ credentials เป็นความลับ
