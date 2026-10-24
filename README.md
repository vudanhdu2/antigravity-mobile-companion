# 🛡️ Antigravity Mobile Companion v2.0 — Tự Host (Self-Host) Bảo Mật 100% Dữ Liệu

> **Điều khiển trực tiếp ứng dụng Antigravity Desktop đang mở trên máy PC của bạn từ Điện thoại / Máy tính bảng qua Wi-Fi LAN, Tailscale VPN hoặc 4G/5G (Cloudflare Quick Tunnel miễn phí) — 100% dữ liệu, mã nguồn và mã QR nằm trọn trên máy tính của bạn (Zero-Data-Leak).**

---

## 🌟 Vì sao toàn bộ thành viên chuyển sang bản Tự Host (Self-Host) này?

Để đảm bảo an toàn thông tin tuyệt đối cho mã nguồn dự án và dữ liệu hội thoại của từng thành viên, tính năng **Giao việc Antigravity (Mục 5)** trên cổng chung đã được tắt và chuyển hoàn toàn sang mô hình **Tự Host Chủ Động (Self-Host)** trên máy tính cá nhân của bạn:

1. **🔒 Bảo mật tuyệt đối (Zero-Data-Leak)**:
   - Toàn bộ lịch sử hội thoại (`transcript.jsonl`, `conversation_summaries.db`, `<cid>.db`), mã nguồn dự án và hình ảnh/tài liệu đính kèm **chỉ nằm trên ổ cứng máy PC của bạn** (`~/.gemini/antigravity`).
   - Không đồng bộ nội dung cuộc trò chuyện hay mã nguồn lên bất kỳ máy chủ trung gian nào.
2. **🛡️ Tạo Mã QR SVG 100% Offline & Tự Ẩn Mã PIN**:
   - Mã QR kết nối Wi-Fi LAN và 4G/5G Cloudflare Tunnel được tạo trực tiếp bằng thuật toán ISO/IEC 18004 ngay trong Python trên máy PC của bạn (**tuyệt đối không gửi URL hay mã PIN ra dịch vụ bên thứ ba như `api.qrserver.com`**).
   - Ngay khi điện thoại quét mã QR, trình duyệt tự động đổi mã PIN sang **Session Token 256-bit (`ags_...`)** và xóa ngay `?pin=XXXXXX` khỏi thanh địa chỉ trình duyệt để chống lộ PIN trong lịch sử duyệt web.
3. **🚨 Chống Dò Mật Khẩu (Anti-Brute-Force) & Tường Lửa LAN Chủ Động**:
   - So sánh mã PIN hằng thời gian (`hmac.compare_digest`) và **tự động khóa IP trong 5 phút** nếu nhập sai mã PIN quá 5 lần liên tiếp.
   - **Nút Đổi Mã PIN 1-Chạm & Thu Hồi Phiên Cũ**: Đổi mã PIN mới bất cứ lúc nào để đăng xuất ngay lập tức mọi thiết bị cũ.
   - **Chế độ Khóa Mạng LAN (Dành cho Wi-Fi công cộng / Quán Cafe)**: Cho phép tắt kết nối LAN chỉ với 1 nút bấm để chỉ chính máy PC hoặc đường hầm 4G/5G có mã PIN mới truy cập được.
   - **Sandbox đường dẫn Media nghiêm ngặt**: Chặn tuyệt đối mọi hành vi đọc file ngoài thư mục `brain/` và `uploads/` (chống Path Traversal 100%).
4. **⚡ Điều khiển thật 100% cửa sổ Antigravity Desktop trên PC (Connect RPC `<30ms`)**:
   - Kết nối trực tiếp vào tiến trình `language_server` của Antigravity Desktop đang mở trên máy tính của bạn qua giao thức loopback `127.0.0.1` (`StartCascade`, `SendUserCascadeMessage`, `SaveMediaAsArtifact`, `CancelCascadeInvocation`).
   - Giao việc mới, nhắn tiếp vào phiên đang mở, chọn Model AI (`Gemini 4 Argon`, `Gemini 3.8 Flash`, `Claude Opus 4.6`, `Claude Sonnet 4.6`), đính kèm hình ảnh/tài liệu, dừng tác vụ đang chạy, xem trực tiếp tiến độ (`Kế hoạch:` / `Tiến độ:`), luồng suy nghĩ (`Thinking`) và công cụ (`Tool Calls`) theo thời gian thực.

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
# Chạy kèm đường hầm 4G/5G Cloudflare Quick Tunnel + tự mở trình duyệt hiện Mã QR:
python companion_server.py --tunnel

# Đặt mã PIN cố định theo ý muốn (ví dụ 888999):
python companion_server.py --tunnel --pin 888999 --port 8046

# Chế độ Wi-Fi công cộng / Quán Cafe (Khóa mạng LAN, chỉ mở Localhost + Tunnel):
python companion_server.py --tunnel --localhost-only
```

---

## 🧪 Tự Kiểm Thử Bảo Mật & Chức Năng (Self-Audit Test Suite)

Repo đi kèm bộ kiểm thử tự động `test_companion_security.py` giúp bạn tự kiểm chứng 8 lớp bảo mật và kết nối ngay trên máy tính:

```bash
python test_companion_security.py
```

Bộ kiểm thử sẽ xác minh:
1. Tạo mã QR SVG Offline (0 rò rỉ dữ liệu ra ngoài).
2. Chặn truy cập trái phép khi không có mã PIN (`HTTP 401`).
3. Cấp phát Session Token (`ags_...`) khi xác thực đúng mã PIN.
4. Chống Path Traversal trên `/api/ag-companion/media` (`HTTP 403` với file hệ thống / `.env` / `.py`).
5. Đổi mã PIN mới (`Rotate PIN`) và thu hồi toàn bộ phiên cũ.
6. Chính sách khóa/mở mạng Wi-Fi LAN (`allowLan`) & Nhật ký Bảo mật (`Security Audit Log`).
7. Chống Brute-Force: tự động khóa IP (`HTTP 429`) sau 5 lần nhập sai mã PIN liên tiếp.
8. Kết nối thực tế với ứng dụng Antigravity Desktop & đọc danh sách dự án/hội thoại local.

---

## 📂 Cấu trúc thư mục

```text
antigravity-mobile-companion/
├── companion_server.py               # Server Python độc lập (Connect RPC + QR Offline + Anti-Brute-Force + Sandbox)
├── test_companion_security.py        # Bộ kiểm thử tự động 8 lớp bảo mật & chức năng
├── start-companion.bat               # Chạy 1-Click trên Windows
├── install-and-run.ps1               # Script tự động tải & khởi chạy bằng 1 dòng lệnh PowerShell
├── web/
│   ├── index.html                    # Giao diện Mobile & Desktop (chuẩn font Google Sans + Trung tâm Bảo mật)
│   ├── icons/                        # Bộ Icon 3D Game/App Art sắc nét
│   └── fonts/                        # Bộ font Google Sans & Google Sans Code offline (tiếng Việt tròn nét)
└── src/
    └── RemoteAntigravityAgent.tsx    # Mã nguồn React/TypeScript đầy đủ để nhà phát triển tự tùy biến
```
