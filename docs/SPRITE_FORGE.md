# Sprite Forge - pipeline Master / Variant (P0)

Tạo sprite nhân vật đồng bộ cho game (preset mặc định `HY_CHARACTER_V1`: 128×192, chibi cổ phong, 3/4 sang phải).

```
Preset → Generate (AI) hoặc Nhập ảnh → chọn 1 trong 2–4 phương án
      → Xóa nền (+ gọt halo) → Normalize (bbox + foot anchor, scale đều) → Pixel hóa (engine PNG to Pixel)
      → Kiểm tra tự động → Lưu Draft → sửa trong Editor → Review/Approve → Export PNG + JSON
```

## Chạy local

```bash
# server (cổng 4000)
cd server && cp .env.example .env   # rồi sửa JWT_SECRET; AI_PROVIDER=mock mặc định
npm install && npm run start:dev

# client (cổng 3000)
cd client && npm install && npm run dev
```

Mở `http://localhost:3000/studio` → menu trái **Sprite Forge** (hoặc `http://localhost:3000/forge`) và **Sprite Library**.

Test / build:

```bash
cd client && npm test && npm run typecheck && npm run build
cd server && npm test && npm run build
```

## Demo theo workflow (mock, không cần API key)

1. **Sprite Forge → Master mới**. Giữ preset `HY_CHARACTER_V1`, bấm **Generate 2 phương án** (mock vẽ nhân vật đơn giản trên nền trắng).
2. Chọn một phương án → cột 2 xem *Đã xóa nền / Alpha mask / Gốc*, chỉnh ngưỡng nếu cần.
3. Cột 3: xem 1×/2×/4×/8× trên nền caro/tối/sáng, đọc danh sách kiểm tra → **Lưu Draft & mở trong Editor**.
4. Sửa pixel bằng editor → bấm chip **Master · Draft** trên thanh trên → **Approved** (palette master được khóa).
5. Trong hộp Review bấm **Tạo variant** → bấm **Gợi ý: trang phục** để tô mask phần thân → nhập mô tả outfit → Generate.
6. Bật **Overlay master** để so silhouette; chế độ màu mặc định *Giữ màu master + cho phép màu mới* → Lưu → sửa → Approve.
7. **Sprite Library** → nhóm theo Character ID → **Export Approved** → ZIP gồm `<ID>.png` (1×, nền trong suốt) + `<ID>.json` + `manifest.json`.

Nếu đã có ảnh vẽ tay / ảnh từ AI khác: dùng nút **Nhập ảnh** thay cho Generate (luồng còn lại giống hệt).

## Ảnh mẫu phong cách, Đọc ảnh, Trợ lý AI

- **Ảnh mẫu phong cách** (≤3, cột Thiết lập): AI vẽ nhân vật *mới* theo nét vẽ/tô bóng/bảng màu của ảnh mẫu (OpenAI `images/edits` với nhiều `image[]`). Ảnh mẫu lưu cùng master; variant tự dùng lại.
- **Đọc ảnh** (cạnh ô mô tả, hoặc kéo ảnh thả vào ô mô tả): AI xem hình và viết mô tả tiếng Anh — Master: mô tả nhân vật; Variant: chỉ mô tả trang phục. Endpoint `POST /ai/describe`.
- **Trợ lý AI** (nút trên thanh tiêu đề): chat kèm hình như ChatGPT (đính kèm, kéo thả, dán Ctrl+V, gửi phương án đang chọn). Prompt AI đề xuất hiện thành thẻ có nút **Chèn vào mô tả**. Endpoint `POST /ai/chat` (Responses API, model `OPENAI_VISION_MODEL`). Lịch sử chat chỉ giữ trong tab (sessionStorage).
- Khi `AI_PROVIDER=mock` hoặc chưa có key, cả hai trả lời mẫu `[MOCK]` để thử giao diện.

## Nối AI provider thật (OpenAI)

Trong `server/.env`:

```
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_IMAGE_MODEL=gpt-image-2.5-sunburst  # gpt-image-1 đã bị tắt 23/10/2026; -flare nhanh/rẻ hơn
OPENAI_IMAGE_QUALITY=medium
OPENAI_IMAGE_BACKGROUND=transparent   # tùy chọn: bỏ qua bước xóa nền
OPENAI_INPUT_FIDELITY=                # để trống với gpt-image-2.x (luôn high fidelity)
AI_COST_PER_IMAGE_USD=0.05            # chỉ để hiển thị ước tính - kiểm tra bảng giá hiện tại
```

- Master → `POST /images/generations`; Variant → `POST /images/edits` với ảnh master + mask (server tự đổi quy ước mask: trắng = được sửa → alpha 0).
- **Adapter này viết theo tài liệu API công khai và chưa được chạy với key thật trong repo.** Tên model/tham số tùy chọn đều cấu hình qua `.env` vì chúng thay đổi theo thời gian; nếu provider trả 400 về một tham số, để trống biến đó.
- Thêm provider khác (Gemini, Replicate/FLUX Kontext, ComfyUI local…): implement `ImageProvider` trong `server/src/ai/` và đăng ký trong `ai.service.ts#createProvider`. Khai báo đúng `capabilities.reference/mask` - UI dựa vào đó để cảnh báo khi provider *không* dùng ảnh tham chiếu.

### Bảo mật & chi phí

- Key chỉ nằm ở server; browser chỉ gọi `/api/v1/ai/*`. Không đặt key trong `client/.env.local` (mọi biến `NEXT_PUBLIC_*` đều lộ ra trình duyệt).
- Provider thật **bắt buộc đăng nhập**; mock thì không.
- Hạn mức `AI_DAILY_IMAGE_LIMIT` ảnh/người/ngày (bộ đếm trong RAM, reset khi restart server), tối đa `AI_MAX_CANDIDATES` ảnh/lần, ảnh upload ≤ `AI_MAX_UPLOAD_MB` và được kiểm tra chữ ký file thật (PNG/JPEG/WebP).
- Timeout `AI_TIMEOUT_MS`, retry `AI_MAX_RETRIES` cho lỗi mạng / 429 / 5xx / timeout. Lỗi được trả về UI dạng thông báo; **không có bản ghi nào được tạo** khi generate lỗi (sprite chỉ được lưu khi người dùng bấm Lưu, luôn ở trạng thái Draft).

## Lưu trữ

| Dữ liệu | Ở đâu |
| --- | --- |
| Sprite (pixel + `sprite` metadata: preset snapshot, prompt, seed, provider, cleanup/normalize/pixel config, trạng thái, lịch sử) | `PixelDocument.sprite` → IndexedDB + MongoDB (đồng bộ như project thường) |
| Ảnh nguồn gốc, ảnh đã xóa nền, mask | IndexedDB store `assets` (DB v3) + server `STORAGE_DIR/<userId>/<assetId>.png` khi đăng nhập |
| Tóm tắt cho Library | `ProjectSummary.sprite` (local) / `Project.sprite` (Mongo) |

- Asset **bất biến**: ảnh nguồn không bao giờ bị ghi đè; chạy lại pipeline tạo asset mới. **Regenerate** tạo document mới `version + 1` với `previousVersionId` - bản đã Approved được giữ.
- Approve ghi `approvedHash`; sửa pixel sau đó → hiển thị "đã sửa", manifest có `editedAfterApproval: true`.
- Project cũ không có trường `sprite` → mở/đồng bộ như trước. `.pforge` vẫn version 1 (trường mới là tùy chọn).

## Manifest JSON

```json
{
  "id": "HY_MALE_SWORD_001_OUTFIT_A",
  "masterId": "<document id của master>",
  "masterAssetId": "HY_MALE_SWORD_001_BASE",
  "presetId": "HY_CHARACTER_V1", "presetVersion": 1,
  "canvas": { "width": 128, "height": 192 },
  "view": "right_3quarter", "pose": "neutral_idle",
  "footAnchor": { "x": 64, "y": 174 },
  "unityPivot": { "x": 0.5, "y": 0.08854 },
  "status": "approved", "editedAfterApproval": false,
  "sourceAssetId": "src_...", "processedAssetId": "<document id>",
  "generation": { "provider": "openai", "model": "gpt-image-2.5-sunburst", "prompt": "...", "seed": null, "referenceUsed": true, "maskUsed": true },
  "version": 1
}
```

Unity (nhập thủ công): Texture Type = Sprite (2D and UI), Filter Mode = **Point (no filter)**, Compression = **None**, Pivot = Custom với `unityPivot` (gốc dưới-trái, khớp foot anchor) → mọi outfit đứng cùng một điểm.

## Kiểm tra tự động (chỉ cảnh báo, không tự sửa ảnh)

Kích thước canvas · sprite trống · góc/diện tích đặc (nghi còn nền) · số màu > preset · màu ngoài palette master · cụm pixel lẻ · mảng tách rời · chạm/tràn mép · lệch foot anchor · lệch chân / chiều cao / silhouette (IoU) so với master · cảnh báo pipeline (tràn canvas, ảnh nguồn bị cắt mép, chiều cao khác master).

## Giới hạn đã biết - cần người kiểm tra

- **AI không bảo đảm nhất quán.** Reference + mask chỉ *giảm* sai lệch; mặt/tóc/tỉ lệ vẫn có thể đổi. Overlay và IoU giúp phát hiện, không sửa được. Luôn duyệt ở 1×.
- Xóa nền là thuật toán màu-phẳng (loang từ mép + gọt halo), không phải AI segmentation: nền gradient/có cảnh sẽ không sạch → yêu cầu nền trắng trơn (đã có trong style prompt) hoặc `OPENAI_IMAGE_BACKGROUND=transparent`.
- Ảnh AI không phải lưới pixel thật: sau khi thu nhỏ 1024→128 gần như luôn cần sửa tay (viền, mắt, tay).
- Alpha của sprite chỉ 2 mức (định dạng editor hiện có): tóc/lụa mờ bị cắt theo ngưỡng alpha.
- Các giá trị preset (128×192, chân y=174, cao 120px, 28 màu) là **thử nghiệm** - sửa trong `client/src/config/sprite-presets.json` và tăng `version` khi đổi.
- Mock provider chỉ để thử quy trình, không phải AI.
- Hạn mức AI theo ngày lưu trong RAM (mất khi restart).

## Bổ sung (P0 mở rộng)

| Chức năng | Ở đâu | Ghi chú |
| --- | --- | --- |
| **Character DNA** | Master → Review → khung "Character DNA" (AI đọc DNA / sửa tay / Lưu) | Số liệu (màu nhận diện, kích thước) tự cập nhật khi Approve; phần chữ được chèn vào prompt của mọi variant/regenerate |
| **So sánh với Master** | Sprite Forge cột 3 (variant) + Review variant | Điểm 0–100 từ: vùng đầu (IoU + màu), màu nhận diện, silhouette, chiều cao, vị trí chân — **chỉ là cảnh báo** |
| **Sprite Sheet Analyzer** | Sprite Forge → Cắt grid | Tự dò / Lưới đều / **Thủ công** (kéo vẽ ô, lấy từ Tự dò rồi sửa); viền đỏ = nội dung chạm mép ô (VFX bị cắt); đặt trạng thái + tên clip |
| **Pivot lock** | Editor → Timeline: Ground, Ghost (Frame 1 / Master), **Căn chân**, **Chỉ mặt đất**, chỉ số "lệch chân" | Căn chân dời cả frame (mọi layer), hoàn tác bằng Ctrl+Z |
| **Animation Studio** | Timeline: nhãn trạng thái (Idle/Walk/Run/Jump/Attack/Hit/Death/Cast/Release/Khác), phát riêng từng nhãn, **Xem trong game** (nền cuộn, 1–4×, lật hướng) | Tốc độ cuộn không trượt chân = tốc độ di chuyển nên dùng trong Unity |
| **Unity export** | Xuất File → tab "Unity (Atlas + Clip)" | ZIP: atlas PNG (padding 2px), `.pfanim.json` (rect gốc dưới-trái, pivot = mốc chân, clip/FPS/loop, chỗ trống cho events/attachments/hitboxes), `Editor/PixelForgeImporter.cs` (tự slice, tạo `.anim` + AnimatorController). Script chưa chạy thử trong Unity |
| **Lịch sử & rollback** | Sprite Library → nút đồng hồ trên thẻ | Khôi phục = tạo bản mới (version +1, Draft) từ bản cũ, không ghi đè |

### Chưa làm (P1) — đề xuất
- **Weapon attachment & VFX**: điểm gắn (tay trái/phải, góc, z-order) theo từng frame, sprite vũ khí / VFX tách riêng, xuất vào `attachments` của `.pfanim.json`.
- **Layer trang phục (Body/Hair/Outfit/Weapon/Accessory)**: gán vai trò cho layer, tách vùng bằng mask/cọ, thay bộ phận theo master.
