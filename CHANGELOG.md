# Lịch Sử Phát Hành & Các Bản Cập Nhật (Changelog)

Toàn bộ lịch sử phiên bản, ngày giờ phát hành (múi giờ Việt Nam `GMT+7`) và mã commit đối chiếu của dự án **Antigravity Mobile Companion (Self-Host)** được công bố minh bạch dưới đây:

---

## `v2.5.0` — Phát hành: `27/11/2026 (GMT+7)`
- **Khử trùng lặp bước `step_index` khi sửa/rewind prompt & mở rộng chống lặp cho ChatGPT > 6 bước**:
  - Loại bỏ triệt để bong bóng người dùng bị lặp khi `transcript_full.jsonl` ghi đè cùng `step_index` (sửa hoặc quay lại bước cũ trong Antigravity IDE).
  - Mở rộng kiểm tra trùng lặp trên toàn bộ danh sách tin nhắn (thay vì chỉ 6 bước cuối) cho cả phiên ChatGPT PC tiếp nối (`cg_cont_u_`), phiên đang stream (`cg_act_u_`) và gói gửi lạc quan (`_optimistic_convs`), đồng thời chạy bộ lọc che bí mật `_sanitize_companion_text` trước khi so khớp để không bao giờ lộ khóa và không gây lệch chuỗi.
- **Bảo toàn byte gốc WebSocket Ping / Close (RFC 6455)**:
  - `ws_send_frame` hỗ trợ truyền trực tiếp `str | bytes`, phản hồi chuẩn mã khung Close (`0x8`) và giữ nguyên payload nhị phân của khung Ping (`0x9` -> `0xA`) giúp kết nối realtime ổn định trên Safari/Chrome di động và Cloudflare Tunnel.
- **Ẩn AI Subagent & `run_workflow` Worker khỏi thanh bên**:
  - Bổ sung bộ lọc `_is_hidden_ai_spawned_trajectory` tự động ẩn các luồng phụ `nestingDepth != 0`, `killed`, `parentConversationId`, `agentName`, `isSubagent` / `workflowWorker` khỏi sidebar.
- **Trải nghiệm gõ tiếng Việt & sao chép chuẩn Antigravity PC**:
  - Chặn gửi nhầm khi đang gõ tổ hợp dấu tiếng Việt IME (`!event.isComposing && event.keyCode !== 229`) trong `web/index.html`.
  - Gỡ `select-none` khỏi `<body>` giúp bôi đen và sao chép tự do mọi nội dung hội thoại.
  - Đồng bộ `src/RemoteAntigravityAgent.tsx` lên bản mới nhất (27/11/2026) và mở rộng bộ kiểm thử tự động lên **20/20 PASS**.

---

## `v2.4.0` — Phát hành: `08/11/2026 18:50 (GMT+7)` · Commit `8462141`
- **Dual-Engine Antigravity IDE + ChatGPT PC (Codex Desktop)**:
  - Chuyển đổi tức thì `ANTIGRAVITY` ↔ `CHATGPT`, đồng bộ danh mục Đã ghim, Dự án Công việc, Trò chuyện ChatGPT, hạn mức gói 5 giờ / hằng tuần theo thời gian thực (`wham/usage`), hỗ trợ giao việc & stream realtime cho cả phiên Local Codex (`01a...`) và phiên Cloud/TPP (`6af...`).

---

## `v2.3.0` — Phát hành: `07/11/2026 22:09 (GMT+7)` · Commit `7529c3e`
- **Tối ưu giao diện Mobile Web chuẩn `antigravity.google.com` & khóa `window.visualViewport`**:
  - Neo chặt khung nhập Prompt phía trên thanh địa chỉ và bàn phím ảo trên iOS/Android, thêm Bottom Sheet chọn Model và giao diện Home Mobile trực quan.

---

## `v2.2.0` — Phát hành: `29/10/2026 10:42 (GMT+7)` · Commit `24e1d80` & `b9daa3a`
- **Multi-Device Realtime Sync & WMI Detached Daemon (`--detach`)**:
  - Tự tách tiến trình bằng WMI `Win32_Process.Create` kèm watchdog chống Cloudflare Error 1033, sửa kẹt `sessionToken` cũ `401/429` và đồng bộ WebSocket đa thiết bị.
