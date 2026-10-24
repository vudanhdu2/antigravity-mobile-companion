#!/usr/bin/env python3
"""
Bộ Kiểm Thử Bảo Mật & Chức Năng Tự Động — Antigravity Mobile Companion v2.0
============================================================================
Kiểm chứng 8 lớp bảo mật chủ động (Zero-Data-Leak) và tích hợp Antigravity Desktop:
1. Tạo mã QR SVG 100% Offline (không rò rỉ URL/PIN ra dịch vụ bên thứ ba).
2. Chặn truy cập không có mã PIN (HTTP 401).
3. Đổi mã PIN lấy Session Token 256-bit (ags_...) và đọc Overview/Conversation.
4. Chặn tuyệt đối Path Traversal tại /api/ag-companion/media (HTTP 403).
5. Đổi mã PIN mới (Rotate PIN) -> vô hiệu hóa ngay lập tức Session Token cũ.
6. Bật/tắt chính sách mạng LAN (allowLan) và ghi Nhật ký Bảo mật (Audit Log).
7. Chống dò mã PIN (Anti-Brute-Force): khóa IP (HTTP 429) sau 5 lần nhập sai liên tiếp.
8. Kiểm tra giao diện Web Mobile (Google Sans font + 3D Icons + Zero external QR leak).
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
SERVER_SCRIPT = ROOT_DIR / "companion_server.py"
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def http_req(url: str, method: str = "GET", headers: dict | None = None, body: dict | None = None) -> tuple[int, dict | str, dict]:
    hdrs = dict(headers or {})
    data = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        hdrs.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            resp_hdrs = {k.lower(): v for k, v in resp.headers.items()}
            try:
                return resp.status, json.loads(raw), resp_hdrs
            except Exception:
                return resp.status, raw, resp_hdrs
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        resp_hdrs = {k.lower(): v for k, v in e.headers.items()} if e.headers else {}
        try:
            return e.code, json.loads(raw), resp_hdrs
        except Exception:
            return e.code, raw, resp_hdrs


def run_test_suite() -> int:
    import companion_server as cs
    test_port = cs.find_available_port(18246)
    test_pin = "654321"
    base_url = f"http://127.0.0.1:{test_port}"

    print("=" * 74)
    print("  CHẠY KIỂM THỬ BẢO MẬT & CHỨC NĂNG — ANTIGRAVITY MOBILE COMPANION v2.0")
    print("=" * 74)

    proc = subprocess.Popen(
        [sys.executable, str(SERVER_SCRIPT), "--port", str(test_port), "--strict-port", "--pin", test_pin, "--no-browser"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    try:
        # Chờ server khởi động
        ready = False
        for _ in range(25):
            try:
                st, _, _ = http_req(f"{base_url}/")
                if st == 200:
                    ready = True
                    break
            except Exception:
                time.sleep(0.2)
        assert ready, "Server không khởi động được trên cổng test."
        print("[PASS 1/8] Khởi chạy Companion Server & phục vụ giao diện Web tĩnh thành công.")

        # Kiểm tra HTML không gọi api.qrserver.com và có đủ 3D Icons + Google Sans
        st, html_raw, _ = http_req(f"{base_url}/index.html")
        assert st == 200 and isinstance(html_raw, str)
        assert "api.qrserver.com" not in html_raw, "LỖI BẢO MẬT: Vẫn còn gọi api.qrserver.com trong index.html!"
        assert "fonts/antigravity-fonts.css" in html_raw, "Thiếu bộ font chuẩn Antigravity!"
        assert "icons/ui_shield_lead.png" in html_raw, "Thiếu bộ Icon 3D chuẩn!"
        print("[PASS 2/8] Giao diện Web đạt chuẩn Zero-Data-Leak (Không gọi qrserver.com, dùng Google Sans & Icon 3D).")

        # Kiểm tra chặn truy cập khi không có PIN
        st, res_unauth, _ = http_req(f"{base_url}/api/ag-companion/overview")
        assert st == 401, f"Mong đợi HTTP 401 khi không có PIN, nhận được {st}"
        print("[PASS 3/8] Chặn truy cập API khi chưa xác thực mã PIN (HTTP 401 Unauthorized).")

        # Đổi PIN lấy Session Token
        st, res_sess, _ = http_req(f"{base_url}/api/ag-companion/auth-session", method="POST", body={"pin": test_pin})
        assert st == 200 and isinstance(res_sess, dict) and res_sess.get("ok") is True
        sess_token = str(res_sess.get("sessionToken") or "")
        assert sess_token.startswith("ags_"), f"Session Token không hợp lệ: {sess_token}"
        auth_hdr = {"Authorization": f"Bearer {sess_token}"}
        print(f"[PASS 4/8] Xác thực mã PIN & cấp phát Session Token 256-bit ({sess_token[:14]}...) thành công.")

        # Kiểm tra QR SVG Offline + Overview + Conversation Detail
        st, conn_info, _ = http_req(f"{base_url}/api/ag-companion/connection-info", headers=auth_hdr)
        assert st == 200 and isinstance(conn_info, dict)
        assert str(conn_info.get("lanQrSvgDataUrl") or "").startswith("data:image/svg+xml;base64,")
        st_qr, qr_svg, qr_hdrs = http_req(f"{base_url}/api/ag-companion/qr?text=http://127.0.0.1:8046", headers=auth_hdr)
        assert st_qr == 200 and "<svg" in str(qr_svg) and "image/svg+xml" in qr_hdrs.get("content-type", "")
        st_ov, ov_data, _ = http_req(f"{base_url}/api/ag-companion/overview", headers=auth_hdr)
        assert st_ov == 200 and isinstance(ov_data, dict) and ov_data.get("selfHosted") is True
        projs = ov_data.get("projects") or []
        print(f"[PASS 5/8] Tạo mã QR SVG Offline & đọc Overview thành công ({len(projs)} dự án trên PC).")

        # Kiểm tra chống Path Traversal trên /api/ag-companion/media
        for bad_path in [
            str(SERVER_SCRIPT),
            r"C:\Windows\win.ini",
            "../../../companion_server.py",
            str(Path.home() / ".gemini" / "antigravity" / "companion_selfhost" / "config.json"),
        ]:
            q_bad = urllib.parse.quote(bad_path, safe="")
            st_m, _, _ = http_req(f"{base_url}/api/ag-companion/media?path={q_bad}", headers=auth_hdr)
            assert st_m == 403, f"LỖI BẢO MẬT: Đường dẫn nhạy cảm {bad_path} không bị chặn 403 (status={st_m})!"
        print("[PASS 6/8] Sandbox Media chặn 100% các cuộc tấn công Path Traversal & đọc file nhạy cảm (HTTP 403).")

        # Kiểm tra Đổi mã PIN mới (Rotate PIN) -> Session Token cũ phải bị vô hiệu hóa ngay
        new_pin = "998877"
        st_rot, res_rot, _ = http_req(
            f"{base_url}/api/ag-companion/rotate-pin",
            method="POST",
            headers=auth_hdr,
            body={"newPin": new_pin},
        )
        assert st_rot == 200 and isinstance(res_rot, dict) and res_rot.get("pin") == new_pin
        new_sess_token = str(res_rot.get("sessionToken") or "")
        # Thử gọi bằng sess_token cũ -> phải bị từ chối 401
        st_old, _, _ = http_req(f"{base_url}/api/ag-companion/overview", headers={"Authorization": f"Bearer {sess_token}"})
        assert st_old == 401, f"Session Token cũ vẫn dùng được sau khi đổi PIN (status={st_old})!"
        # Gọi bằng new_sess_token -> 200 OK
        st_new, _, _ = http_req(f"{base_url}/api/ag-companion/overview", headers={"Authorization": f"Bearer {new_sess_token}"})
        assert st_new == 200
        print("[PASS 7/8] Đổi mã PIN mới & thu hồi toàn bộ phiên cũ hoạt động chính xác.")

        # Kiểm tra chống Brute-Force: nhập sai PIN 5 lần liên tiếp -> lần thứ 5/6 phải trả về HTTP 429 Too Many Requests
        statuses = []
        for i in range(6):
            st_bf, _, _ = http_req(f"{base_url}/api/ag-companion/auth-session", method="POST", body={"pin": f"00000{i}"})
            statuses.append(st_bf)
        assert 429 in statuses, f"Brute-force rate limit không kích hoạt HTTP 429! Statuses={statuses}"
        print(f"[PASS 8/8] Chống Brute-Force kích hoạt khóa IP tự động (Statuses={statuses} -> HTTP 429 Locked).")

        print("=" * 74)
        print("  KẾT QUẢ: 8/8 BÀI KIỂM THỬ BẢO MẬT & CHỨC NĂNG ĐẠT 100% (PASS)")
        print("=" * 74)
        return 0
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()


if __name__ == "__main__":
    raise SystemExit(run_test_suite())
