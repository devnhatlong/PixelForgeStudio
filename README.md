# PixelForge Studio

Trình vẽ pixel art & hoạt họa sprite cho game, chạy trên trình duyệt.

## Kiến trúc

- `client/`: Next.js 15 + React 19 + TypeScript + Zustand + HTML5 Canvas. Lưu project cục bộ bằng IndexedDB.
- `server/`: NestJS 11 + MongoDB (Mongoose) + JWT. Dùng cho đăng nhập, Cloud Storage và Marketplace.

## Chạy frontend

```bash
cd client
npm install
npm run dev
```

Mặc định chạy tại `http://localhost:3000`. Nếu server chạy ở địa chỉ khác, tạo `client/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

## Chạy backend

Cần MongoDB tại `mongodb://127.0.0.1:27017/pixelforge` (hoặc cấu hình `MONGODB_URI`). Sao chép `server/.env.example` thành `.env` và đặt `JWT_SECRET`.

```bash
cd server
npm install
npm run start:dev
```

API tại `http://localhost:4000/api/v1`.

| Method | Endpoint | Mô tả |
| --- | --- | --- |
| POST | `/auth/register` | Đăng ký `{email, password, name}` |
| POST | `/auth/login` | Đăng nhập → `{token, user}` |
| GET | `/auth/me` | Thông tin user (Bearer token) |
| GET | `/projects` | Danh sách project của tôi |
| POST | `/projects` | Tạo/cập nhật project (upsert theo `clientId`) |
| GET | `/projects/:id` | Tải project đầy đủ |
| DELETE | `/projects/:id` | Xóa khỏi Cloud |
| PATCH | `/projects/:id/publish` | Đăng / gỡ Marketplace `{published, description, tags}` |
| PATCH | `/projects/meta` | Đổi thư mục / thùng rác / tên (không gửi pixel) |
| GET | `/projects/by-client/:clientId` | Tải project theo id phía client |
| DELETE | `/projects/by-client/:clientId` | Xóa vĩnh viễn theo id phía client |
| GET/POST | `/folders` | Danh sách / tạo-đổi tên thư mục (upsert theo `clientId`) |
| DELETE | `/folders/:clientId` | Xóa thư mục (project bên trong về gốc) |
| GET | `/marketplace` | Danh sách sprite công khai |
| GET | `/marketplace/:id` | Tải sprite công khai (tăng lượt tải) |

## Chức năng

**Trang chủ**: Đăng nhập/Đăng ký, New file (preset 16→192 px + tùy chỉnh, mẫu "Chú Mèo Vẫy Đuôi" 5 frame), Open file `.pforge` (hoặc kéo thả), PNG to Pixel (downscale + lượng tử màu), Recent (IndexedDB, sắp xếp/lọc, lưới/danh sách), Marketplace, Recycle Bin (khôi phục / xóa vĩnh viễn).

**Editor**:
- 15 công cụ: Cọ vẽ (B), Tẩy (E), Đổ màu (G), Hút màu (I), Chọn chữ nhật (M), Đũa thần (W), Di chuyển (V), Kéo màn hình (H / giữ Space), Zoom (Z, Alt để thu nhỏ), Đường thẳng (L), Chữ nhật (U), Tròn (C), Dither (J), Làm sáng (O), Làm tối (K).
- Cỡ nét 1–4 px (`[` `]`), đối xứng gương ngang/dọc/cả hai, lật layer.
- Chuột phải = tẩy (khi vẽ) hoặc chọn màu phụ (bảng màu). `X` hoán đổi màu.
- Undo/Redo (Ctrl+Z / Ctrl+Y), chọn tất cả (Ctrl+A), bỏ chọn (Ctrl+D), xóa vùng chọn (Delete), Esc kết thúc di chuyển.
- Bảng màu: swatches theo bộ chuẩn (PICO-8, Endesga 32, Game Boy…), palette tùy chỉnh của sprite, màu vừa dùng, nhập HEX.
- Layers: thêm, ẩn/hiện, khóa, độ mờ, đổi tên (nhấp đúp), nhân bản, gộp xuống, sắp xếp, xóa.
- Timeline: thêm/nhân bản/xóa/kéo thả sắp xếp frame, thời lượng từng frame (ms), FPS, phát tiến/lùi/qua lại (Enter), Onion Skin, `,` `.` chuyển frame.
- Tự động lưu vào IndexedDB; Ctrl+S tải file `.pforge`; Ctrl+E mở Xuất file.
- Zoom: Ctrl + cuộn chuột, `+` `-`.

**Xuất file**: PNG tĩnh (chọn frame, 1–32x, nền trong suốt/đen/trắng), ZIP từng frame + `animation_meta.json`, GIF động (timing theo từng frame, nền trong suốt), Sprite Sheet PNG + JSON (lưới/dải ngang/dải dọc, số cột, khoảng cách, tỉ lệ; JSON kiểu Aseprite/TexturePacker hash dùng được với Unity, Godot, Phaser).

**Đồng bộ Cloud** (`client/src/lib/sync.ts`): khi đã đăng nhập, MongoDB là nguồn dữ liệu chính, IndexedDB chỉ là cache. Mỗi lần auto-save sẽ đẩy lên server (debounce 1.5s, last-write-wins theo `updatedAt` của document); thư mục, thùng rác, đổi tên cũng được phản chiếu. Khi mở app / đăng nhập, client kéo danh sách project + thư mục về, tải pixel theo nhu cầu và tự đẩy lại các project local mới hơn Cloud. Lần đăng nhập đầu sẽ hỏi đồng bộ các project chỉ có trên máy. Chưa đăng nhập → làm việc hoàn toàn cục bộ.

**Cloud & Marketplace** (cần đăng nhập): lưu/mở/xóa project trên server, đăng sprite lên Marketplace kèm mô tả + tags, người khác tải về và mở thành bản sao.

## Định dạng `.pforge`

JSON: `{ magic: "PFORGE", version: 1, document: PixelDocument }`. `PixelDocument` gồm `width`, `height`, `layers[]` (metadata), `frames[]` với `cels` = map `layerId → string[]` (mỗi pixel là `"#rrggbb"` hoặc `""` trong suốt), `palette[]`.
