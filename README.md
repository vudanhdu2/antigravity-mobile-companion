# 🛡️ Antigravity Mobile Companion v2.3 — Giao Diện Chuẩn Google Antigravity (Desktop & Mobile Web) + Đồng Bộ WebSocket Realtime + Tự Host Bảo Mật 100%

> **Điều khiển trực tiếp ứng dụng Antigravity Desktop đang mở trên máy PC của bạn từ Điện thoại / Máy tính bảng / Laptop qua Wi-Fi LAN, Tailscale VPN hoặc 4G/5G (Cloudflare Quick Tunnel miễn phí) — giao diện giống hệt Google Antigravity trên cả Desktop (`#f9f9f8`) lẫn Mobile Web (`#1e1f1c` chuẩn `antigravity.google.com`), khóa cứng `window.visualViewport` trên iOS/Android, đồng bộ WebSocket Realtime (`<0.5s`), chống trễ/lặp lệnh (TTL + Idempotency) và 100% dữ liệu nằm trọn trên máy tính của bạn (Zero-Data-Leak).**

---

## 🌟 Điểm nổi bật trên phiên bản v2.3

1. **📱 Tối Ưu Giao Diện Mobile Web Chuẩn `antigravity.google.com` (`< 768px`)**:
   - **Khóa Cứng `window.visualViewport` (iOS Safari / Chrome & Android)**: Tự động neo khung ứng dụng theo chiều cao thực tế `visualViewport.height` và `visualViewport.offsetTop`, đảm bảo khung nhập Prompt ở đáy luôn hiển thị 100% phía trên thanh địa chỉ dưới của Chrome iOS và tự động đẩy lên mượt mà ngay trên đỉnh bàn phím ảo.
   - **Thanh Header Mobile 1 Dòng (`52px`, nền tối `#1e1f1c`)**:
     - **Màn hình Home Mobile**: Logo chữ `A` 4 màu chuẩn Google Antigravity + Pill chọn máy trạm (`🟢 vudanhdu-cosmic-spark ⌄`) + Tìm kiếm `🔍` + `⚙ Customizations` + `↻ Refresh` + `💬! Mã QR` + Vòng Avatar 4 màu.
     - **Màn hình Hội Thoại Đang Mở**: Nút `←` quay lại + Tiêu đề hội thoại + Menu `⋮` ghim hội thoại + `⊟` làm mới + `💬!` + Vòng Avatar 4 màu.
   - **Màn Hình Home Mobile Trực Quan**: Hiển thị trực tiếp hàng `Customizations`, `Pinned Conversations` và cây thư mục `Projects` (kèm chấm đỏ/hồng thông báo chưa đọc và vòng xoay tác vụ đang chạy) ngay trên màn hình chính mà không cần mở menu ngang, cùng khung nhập Prompt cố định sẵn ở đáy màn hình.
   - **Khung Nhập Prompt 2 Dòng Bo Tròn (`24px`, `#252624`) & Bottom Sheet Chọn Model**:
     - Hàng 1: Ô nhập `Ask anything, @ to mention, / for actions` cỡ chữ `16px` chống iOS tự phóng to.
     - Hàng 2: Nút `+` đính kèm ảnh/tài liệu, chọn Model (`Gemini 4 Argon High ^` mở **Bottom Sheet** trượt từ đáy lên kèm nhãn `New`, `Fast ⓘ`, `Notice ⓘ` và `View Usage`), nút `🎤` giọng nói, và nút tròn `36x36` gửi `→` / dừng tác vụ `⏹` (hình vuông đỏ khi đang chạy).
     - Nút nổi `↓` tự động hiện chính giữa phía trên khung nhập khi cuộn xem lịch sử tin nhắn phía trên.
2. **🖥️ Giao Diện Giống Hệt Google Antigravity Desktop (`>= 768px`)**:
   - **Sidebar Chuẩn Antigravity (`#f3f3f2`)**: Thanh tiêu đề `Antigravity` kèm nút đóng/mở sidebar & tìm kiếm nhanh, nút `+ New Conversation`, hộp thoại `Conversation History`, hộp thoại `Customizations` (đọc trực tiếp Rules, Skills `SKILL.md` và MCP Servers trên máy), danh sách `Pinned Conversations`, cây thư mục `Projects` đọc trực tiếp từ `~/.gemini/config/projects/`, trạng thái đang chạy (vòng xoay), chấm xanh chưa đọc và thẻ chọn máy trạm ở đáy sidebar.
   - **Khung Soạn Thảo 2 Tầng Chuẩn Antigravity (`#f9f9f8`)**:
     - Trạng thái `+ New Conversation`: Pill chọn dự án chính giữa màn hình + khung nhập liệu 2 tầng (`Ask anything, @ to mention, / for actions`), nút `+` đính kèm hình ảnh/tài liệu, chọn Model AI (`Gemini 4 Argon High`, `Gemini 4 Argon Low`, `Gemini 3.8 Flash`, `Claude Opus 4.6`, `Claude Sonnet 4.6`), chế độ thực thi (`Turbo` / `Auto` / `Ask`), nhập giọng nói, nút gửi `→` / dừng `⏹`, và thanh trạng thái `Local` ở tầng dưới.
     - Trạng thái Hội Thoại Đang Mở: Hiển thị luồng suy nghĩ (`Worked for Xs`), các khối công cụ (`>_ CMD` / `FILE` bấm mở rộng xem console output), khối code có nút `Copy`, tiến độ `Kế hoạch:` / `Tiến độ:` và tự động cuộn mượt khi AI trả lời.
3. **⚡ Đồng Bộ Realtime Hai Chiều Qua WebSocket (`/ws` — RFC 6455) & Chống Trễ Lệnh Tuyệt Đối**:
   - Tích hợp máy chủ **WebSocket RFC 6455 thuần Python** (không cần cài thêm thư viện ngoài) tại đường dẫn `/ws` và `/api/ag-companion/ws`.
   - **ACK Đồng Bộ Connect RPC (`StartCascade` + `SendUserCascadeMessage`)**: Server chỉ trả `HTTP 200 OK` sau khi tin nhắn đã thực sự được Antigravity IDE trên PC tiếp nhận (nếu Connect RPC timeout trả ngay `HTTP 502` rõ ràng).
   - **Chốt Chặn TTL (`CMD_TTL_MS = 180s`) & Idempotency (`cmdId` + Băm SHA-256 Toàn Phần)**: Lưu trạng thái lệnh vào SQLite WAL (`cmd_state.db`) kèm Pre-RPC Intent Checkpoint (`start_intent` / `send_intent`), chặn 100% lệnh quá hạn do nghẽn mạng (`HTTP 408 Expired`), chống tạo/gửi trùng 2 lần khi mạng chập chờn (`HTTP 409 In-Doubt / Payload Mismatch`), và hỗ trợ hủy lệnh đang chờ qua `/api/ag-companion/cancel_cmd`.
   - **Deep Health Check (`/api/ag-companion/health`)**: Kiểm tra thực trạng luồng WebSocket watcher, kết nối Antigravity IDE và bộ đếm telemetry.
4. **🔒 Bảo Mật Chủ Động 100% (Zero-Data-Leak)**:
   - Toàn bộ lịch sử hội thoại (`transcript.jsonl`, `conversation_summaries.db`, `<cid>.db`), mã nguồn dự án và hình ảnh/tài liệu đính kèm **chỉ nằm trên ổ cứng máy PC của bạn** (`~/.gemini/antigravity`).
   - **Tạo Mã QR SVG 100% Offline**: Thuật toán ISO/IEC 18004 chạy trực tiếp trong Python trên PC (**tuyệt đối không gửi URL hay mã PIN ra dịch vụ bên thứ ba như `api.qrserver.com`**).
   - **Tự Ẩn Mã PIN & Cấp Session Token 256-bit (`ags_...`)**: Ngay khi quét mã QR, trình duyệt tự động đổi mã PIN lấy Session Token và xóa `?pin=XXXXXX` khỏi thanh địa chỉ.
   - **Chống Brute-Force & Tường Lửa LAN Chủ Động**: Khóa IP 5 phút nếu nhập sai mã PIN quá 5 lần liên tiếp (`HTTP 429`), nút **Đổi Mã PIN 1-Chạm** thu hồi ngay mọi phiên cũ, chế độ **Khóa Mạng LAN** khi ngồi Wi-Fi công cộng, và **Sandbox đường dẫn Media** chống Path Traversal 100% (`HTTP 403`).

---

## 🚀 Cách 1: Chạy 1-Chạm bằng PowerShell (Khuyên dùng)

Mở **PowerShell** trên máy tính Windows đang chạy Antigravity Desktop và dán lệnh sau:

```powershell
irm https://raw.githubusercontent.com/vudanhdu2/antigravity-mobile-companion/main/install-and-run.ps1 | iex
```

---

## 🛠️ Cách 2: Tải Repo về máy và bấm đúp `start-companion.bat`

```bash
git clone https://github.com/vudanhdu2/antigravity-mobile-companion.git
cd antigravity-mobile-companion
```

- **Chạy trên Windows (1-Click)**: Bấm đúp vào file `start-companion.bat`.
- **Chạy bằng dòng lệnh Python (Chỉ cần Python 3.9+ chuẩn, 0 phụ thuộc ngoài)**:

```bash
# Chạy kèm đường hầm 4G/5G Cloudflare Quick Tunnel + tự tách tiến trình WMI (không bị ngắt Error 1033 khi đóng phiên AI):
python companion_server.py --tunnel --detach

# Đặt mã PIN cố định theo ý muốn (ví dụ 888999):
python companion_server.py --tunnel --detach --pin 888999 --port 8046

# Chế độ Wi-Fi công cộng / Quán Cafe (Khóa mạng LAN, chỉ mở Localhost + Tunnel):
python companion_server.py --tunnel --detach --localhost-only
```

---

## 🧪 Tự Kiểm Thử Bảo Mật, TTL/Idempotency, WMI Detach & WebSocket Realtime (16/16 Tests)

Repo đi kèm bộ kiểm thử tự động `test_companion_security.py` giúp bạn tự kiểm chứng 16 hạng mục bảo mật, chống trễ/lặp lệnh, tự tách WMI chống Error 1033, giao diện chuẩn Antigravity và đồng bộ WebSocket ngay trên máy tính:

```bash
python test_companion_security.py
```

Bộ kiểm thử xác minh tự động 14/14 tiêu chí:
1. Khởi chạy Companion Server & phục vụ giao diện Web tĩnh.
2. Giao diện chuẩn Google Antigravity (`Sidebar #f3f3f2`, `Pinned Conversations`, `Conversation History`, `Customizations`, khung nhập 2 tầng `Ask anything, @ to mention, / for actions`, bộ font `Google Sans` offline, Zero external QR leak).
3. Chặn truy cập trái phép khi không có mã PIN (`HTTP 401`).
4. Xác thực mã PIN & cấp phát Session Token 256-bit (`ags_...`).
5. Tạo mã QR SVG Offline & đọc danh sách Projects chuẩn từ `~/.gemini/config/projects/`.
6. Đọc dữ liệu thật `Customizations` (`Rules`, `Skills`, `MCP Servers`) trên máy PC.
7. Đồng bộ Realtime WebSocket (`/ws` — RFC 6455): bắt tay `101 Switching Protocols`, nhận tức thì gói `overview` và phản hồi `ping` ↔ `pong` hai chiều.
8. Chống Path Traversal trên `/api/ag-companion/media` (`HTTP 403` với file hệ thống / `.env` / `.py`).
9. Đổi mã PIN mới (`Rotate PIN`) và thu hồi toàn bộ phiên cũ.
10. Deep Health Readiness (`/api/ag-companion/health`): kiểm tra luồng WebSocket watcher & trạng thái kết nối IDE.
11. Chốt chặn TTL (`HTTP 408 Expired`): từ chối lệnh quá hạn do nghẽn kết nối trước đó, không tự chạy muộn trên PC.
12. Hủy lệnh chủ động (`/api/ag-companion/cancel_cmd`): ghi tombstone khóa vĩnh viễn gói tin đến trễ (`HTTP 409 Cancelled`).
13. Băm SHA-256 toàn phần (gồm `app` & `media` digest): chống va chạm và phát hiện giả mạo/lệch nội dung cho cùng `cmdId`.
14. Chống Brute-Force: tự động khóa IP (`HTTP 429`) sau 5 lần nhập sai mã PIN liên tiếp.
