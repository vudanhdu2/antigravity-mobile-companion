# 🛡️ Antigravity Mobile Companion — Tự Host (Self-Host) Bảo Mật 100% Dữ Liệu

> **Điều khiển trực tiếp ứng dụng Antigravity Desktop đang mở trên máy PC của bạn từ Điện thoại / Máy tính bảng qua Wi-Fi LAN, Tailscale VPN hoặc 4G/5G (Cloudflare Quick Tunnel miễn phí) — 100% dữ liệu & mã nguồn nằm trọn trên máy tính của bạn.**

---

## 🌟 Vì sao bạn nên dùng bản Tự Host (Self-Host) này?

1. **🔒 Bảo mật tuyệt đối (Zero-Data-Leak)**:
   - Toàn bộ lịch sử hội thoại (`transcript.jsonl`, `conversation_summaries.db`), mã nguồn dự án và hình ảnh/tài liệu đính kèm **chỉ nằm trên ổ cứng máy PC của bạn** (`~/.gemini/antigravity`).
   - Không đồng bộ nội dung cuộc trò chuyện hay mã nguồn lên bất kỳ máy chủ trung gian nào.
2. **⚡ Điều khiển thật 100% cửa sổ Antigravity Desktop trên PC**:
   - Kết nối trực tiếp vào tiến trình `language_server` của Antigravity Desktop đang mở trên máy tính của bạn qua giao thức loopback `127.0.0.1`.
   - Giao việc mới (`new-conversation`), nhắn tiếp vào phiên đang mở (`send-message`), đính kèm hình ảnh/tài liệu (`media`), xem trực tiếp luồng suy nghĩ (`Thought`) và công cụ (`Tool Call`) theo thời gian thực.
3. **🌐 Ra ngoài dùng 4G/5G vẫn điều khiển được PC ở nhà (Cloudflare Quick Tunnel + Khóa PIN 6 số)**:
   - Tích hợp sẵn **Cloudflare Quick Tunnel miễn phí 1-Click** (tự động tải `cloudflared` chính hãng nếu máy chưa có) mà không cần mở port modem/router.
   - Mọi kết nối từ điện thoại đều được bảo vệ bằng **Mã PIN 6 số** kèm **Mã QR** để quét đăng nhập trong 2 giây.

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
- **Chạy bằng dòng lệnh Python (Chỉ cần Python 3.9+ chuẩn, không cần cài thêm thư viện ngoài)**:

```bash
# Chạy kèm đường hầm 4G/5G Cloudflare Quick Tunnel + tự mở trình duyệt hiện Mã QR:
python companion_server.py --tunnel

# Hoặc đặt mã PIN cố định theo ý muốn (ví dụ 888999):
python companion_server.py --tunnel --pin 888999 --port 8046
```

---

## 📱 Hướng dẫn kết nối từ Điện thoại trong 10 giây

1. Sau khi chạy `start-companion.bat` (hoặc `python companion_server.py --tunnel`), trình duyệt trên PC sẽ tự mở trang quản trị tại `http://127.0.0.1:8046`.
2. Bấm nút **`📱 QR & 4G/5G`** ở góc trên bên phải màn hình:
   - **Nếu điện thoại chung mạng Wi-Fi với PC**: Quét mã QR cột **1. Chung mạng Wi-Fi LAN**.
   - **Nếu bạn đi ra ngoài dùng 4G/5G**: Quét mã QR cột **2. Qua 4G/5G (Cloudflare Tunnel)**.
3. Đường dẫn trong mã QR đã kèm sẵn mã PIN bảo mật (`?pin=XXXXXX`), điện thoại mở lên là thấy ngay toàn bộ Dự án (Projects) và Phiên làm việc (Conversations) trên PC của bạn!

---

## 📂 Cấu trúc thư mục

```text
antigravity-mobile-companion/
├── companion_server.py               # Server Python độc lập (0 phụ thuộc ngoài, kết nối Local RPC + Cloudflare Tunnel)
├── start-companion.bat               # Chạy 1-Click trên Windows
├── install-and-run.ps1               # Script tự động tải & khởi chạy bằng 1 dòng lệnh PowerShell
├── web/
│   ├── index.html                    # Giao diện Mobile & Desktop dựng sẵn (chuẩn font Google Sans Antigravity)
│   └── fonts/                        # Bộ font Google Sans & Google Sans Code offline (tiếng Việt tròn nét)
└── src/
    └── RemoteAntigravityAgent.tsx    # Mã nguồn React/TypeScript đầy đủ để nhà phát triển tự tùy biến
```

---

## 🔐 Cam kết An toàn & Quyền riêng tư

- Mã nguồn 100% mở và minh bạch, chỉ sử dụng thư viện chuẩn của Python (`http.server`, `sqlite3`, `subprocess`, `urllib`, `ssl`).
- Mã xác thực CSRF của `language_server` chỉ giao tiếp nội bộ qua `127.0.0.1` trên máy tính của bạn, tuyệt đối không bao giờ truyền ra ngoài.
