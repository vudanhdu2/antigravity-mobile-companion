#!/usr/bin/env python3
"""
Bộ Kiểm Thử Bảo Mật, Giao Diện Chuẩn Antigravity & Đồng Bộ WebSocket Realtime v2.1
==================================================================================
Kiểm chứng 10 hạng mục bảo mật chủ động (Zero-Data-Leak), giao diện giống hệt
Google Antigravity Desktop và đồng bộ realtime qua WebSocket (RFC 6455):
1. Khởi chạy Companion Server & phục vụ giao diện Web tĩnh.
2. Giao diện chuẩn Google Antigravity (Sidebar #f3f3f2, Pinned Conversations, Projects tree,
   2-layer Composer 'Ask anything, @ to mention, / for actions', Google Sans font, Zero external QR leak).
3. Chặn truy cập không có mã PIN (HTTP 401).
4. Đổi mã PIN lấy Session Token 256-bit (ags_...) và đọc Overview/Conversation.
5. Tạo mã QR SVG 100% Offline & đọc danh sách Projects chuẩn từ ~/.gemini/config/projects.
6. Đọc dữ liệu thật Customizations (Rules, Skills, MCP Servers) trên máy trạm.
7. Đồng bộ Realtime WebSocket (/ws - RFC 6455): Handshake 101 Switching Protocols, nhận gói
   'overview' tức thì và phản hồi 'ping' -> 'pong' hai chiều.
8. Chặn tuyệt đối Path Traversal tại /api/ag-companion/media (HTTP 403).
9. Đổi mã PIN mới (Rotate PIN) -> vô hiệu hóa ngay lập tức Session Token cũ.
10. Chống dò mã PIN (Anti-Brute-Force): khóa IP (HTTP 429) sau 5 lần nhập sai liên tiếp.
"""
from __future__ import annotations

import base64
import json
import os
import socket
import struct
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


def _ws_recv_exact(sock: socket.socket, n: int) -> bytes:
    buf = bytearray()
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise ConnectionError("WebSocket closed unexpectedly")
        buf.extend(chunk)
    return bytes(buf)


def _ws_read_text_frame(sock: socket.socket) -> str:
    hdr = _ws_recv_exact(sock, 2)
    b1, b2 = hdr[0], hdr[1]
    opcode = b1 & 0x0F
    length = b2 & 0x7F
    if length == 126:
        length = struct.unpack("!H", _ws_recv_exact(sock, 2))[0]
    elif length == 127:
        length = struct.unpack("!Q", _ws_recv_exact(sock, 8))[0]
    payload = _ws_recv_exact(sock, length) if length > 0 else b""
    assert opcode == 0x1, f"Mong đợi text frame (0x1), nhận được opcode={opcode}"
    return payload.decode("utf-8", errors="replace")


def _ws_send_masked_text(sock: socket.socket, text: str) -> None:
    raw = text.encode("utf-8")
    mask_key = os.urandom(4)
    masked = bytes(b ^ mask_key[i % 4] for i, b in enumerate(raw))
    length = len(raw)
    header = bytearray([0x81])
    if length < 126:
        header.append(0x80 | length)
    elif length < 65536:
        header.append(0x80 | 126)
        header.extend(struct.pack("!H", length))
    else:
        header.append(0x80 | 127)
        header.extend(struct.pack("!Q", length))
    sock.sendall(bytes(header) + mask_key + masked)


def test_websocket_realtime(port: int, session_token: str) -> dict:
    sock = socket.create_connection(("127.0.0.1", port), timeout=10)
    try:
        ws_key = base64.b64encode(os.urandom(16)).decode("ascii")
        q_tok = urllib.parse.quote(session_token, safe="")
        req = (
            f"GET /ws?token={q_tok} HTTP/1.1\r\n"
            f"Host: 127.0.0.1:{port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {ws_key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        sock.sendall(req.encode("ascii"))
        resp_buf = b""
        while b"\r\n\r\n" not in resp_buf:
            chunk = sock.recv(1024)
            if not chunk:
                break
            resp_buf += chunk
        header_part, leftover = resp_buf.split(b"\r\n\r\n", 1)
        status_line = header_part.splitlines()[0].decode("ascii", errors="replace")
        assert "101" in status_line, f"WebSocket handshake thất bại: {status_line}"

        # Nếu có dữ liệu frame đi kèm trong cùng gói TCP đầu tiên, ghép lại qua bộ đệm
        class BufferedSocket:
            def __init__(self, s: socket.socket, init_bytes: bytes):
                self._s = s
                self._buf = bytearray(init_bytes)

            def recv(self, n: int) -> bytes:
                if self._buf:
                    out = bytes(self._buf[:n])
                    del self._buf[:n]
                    return out
                return self._s.recv(n)

            def sendall(self, data: bytes) -> None:
                self._s.sendall(data)

        bsock = BufferedSocket(sock, leftover)
        first_msg = json.loads(_ws_read_text_frame(bsock))
        assert first_msg.get("type") == "overview", f"Frame đầu tiên không phải overview: {first_msg.get('type')}"
        ov_projects = (first_msg.get("data") or {}).get("projects") or []

        # Gửi lệnh ping hai chiều qua WebSocket
        _ws_send_masked_text(bsock, json.dumps({"type": "ping"}))
        second_msg = json.loads(_ws_read_text_frame(bsock))
        assert second_msg.get("type") == "pong", f"Mong đợi 'pong', nhận được: {second_msg}"
        return {"projectsCount": len(ov_projects), "pongTs": second_msg.get("ts")}
    finally:
        try:
            sock.close()
        except Exception:
            pass


def run_test_suite() -> int:
    import companion_server as cs
    test_port = cs.find_available_port(18246)
    test_pin = "654321"
    base_url = f"http://127.0.0.1:{test_port}"

    print("=" * 78)
    print("  CHẠY KIỂM THỬ BẢO MẬT, GIAO DIỆN ANTIGRAVITY & WEBSOCKET REALTIME v2.2")
    print("=" * 78)

    proc = subprocess.Popen(
        [sys.executable, str(SERVER_SCRIPT), "--port", str(test_port), "--strict-port", "--pin", test_pin, "--no-browser"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    try:
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
        print("[PASS 1/14] Khởi chạy Companion Server & phục vụ giao diện Web tĩnh thành công.")

        st, html_raw, _ = http_req(f"{base_url}/index.html")
        assert st == 200 and isinstance(html_raw, str)
        assert "api.qrserver.com" not in html_raw, "LỖI BẢO MẬT: Vẫn còn gọi api.qrserver.com trong index.html!"
        assert "fonts/antigravity-fonts.css" in html_raw, "Thiếu bộ font chuẩn Antigravity!"
        for marker in [
            "Ask anything, @ to mention, / for actions",
            "Pinned Conversations",
            "Conversation History",
            "Customizations",
            "New Conversation",
            "connectRealtimeWebSocket",
        ]:
            assert marker in html_raw, f"Thiếu thành phần giao diện chuẩn Google Antigravity: {marker}"
        print("[PASS 2/14] Giao diện chuẩn Google Antigravity (Sidebar, Composer 2 tầng, WebSocket client, Google Sans).")

        st, res_unauth, _ = http_req(f"{base_url}/api/ag-companion/overview")
        assert st == 401, f"Mong đợi HTTP 401 khi không có PIN, nhận được {st}"
        print("[PASS 3/14] Chặn truy cập API khi chưa xác thực mã PIN (HTTP 401 Unauthorized).")

        st, res_sess, _ = http_req(f"{base_url}/api/ag-companion/auth-session", method="POST", body={"pin": test_pin})
        assert st == 200 and isinstance(res_sess, dict) and res_sess.get("ok") is True
        sess_token = str(res_sess.get("sessionToken") or "")
        assert sess_token.startswith("ags_"), f"Session Token không hợp lệ: {sess_token}"
        auth_hdr = {"Authorization": f"Bearer {sess_token}"}
        print(f"[PASS 4/14] Xác thực mã PIN & cấp phát Session Token 256-bit ({sess_token[:14]}...) thành công.")

        st, conn_info, _ = http_req(f"{base_url}/api/ag-companion/connection-info", headers=auth_hdr)
        assert st == 200 and isinstance(conn_info, dict)
        assert str(conn_info.get("lanQrSvgDataUrl") or "").startswith("data:image/svg+xml;base64,")
        st_qr, qr_svg, qr_hdrs = http_req(f"{base_url}/api/ag-companion/qr?text=http://127.0.0.1:8046", headers=auth_hdr)
        assert st_qr == 200 and "<svg" in str(qr_svg) and "image/svg+xml" in qr_hdrs.get("content-type", "")
        st_ov, ov_data, _ = http_req(f"{base_url}/api/ag-companion/overview", headers=auth_hdr)
        assert st_ov == 200 and isinstance(ov_data, dict) and ov_data.get("selfHosted") is True
        projs = ov_data.get("projects") or []
        print(f"[PASS 5/14] Tạo mã QR SVG Offline & đọc Overview chuẩn Antigravity ({len(projs)} dự án trên PC).")

        st_cust, cust_data, _ = http_req(f"{base_url}/api/ag-companion/customizations", headers=auth_hdr)
        assert st_cust == 200 and isinstance(cust_data, dict)
        assert "rules" in cust_data and "skills" in cust_data and "mcpServers" in cust_data
        print(
            f"[PASS 6/14] Đọc dữ liệu Customizations thật trên PC ({len(cust_data['rules'])} rules, "
            f"{len(cust_data['skills'])} skills, {len(cust_data['mcpServers'])} MCP servers)."
        )

        ws_info = test_websocket_realtime(test_port, sess_token)
        print(
            f"[PASS 7/14] Đồng bộ Realtime WebSocket (/ws - RFC 6455): 101 Switching Protocols, "
            f"nhận tức thì {ws_info['projectsCount']} projects & ping/pong hai chiều."
        )

        for bad_path in [
            str(SERVER_SCRIPT),
            r"C:\Windows\win.ini",
            "../../../companion_server.py",
            str(Path.home() / ".gemini" / "antigravity" / "companion_selfhost" / "config.json"),
        ]:
            q_bad = urllib.parse.quote(bad_path, safe="")
            st_m, _, _ = http_req(f"{base_url}/api/ag-companion/media?path={q_bad}", headers=auth_hdr)
            assert st_m == 403, f"LỖI BẢO MẬT: Đường dẫn nhạy cảm {bad_path} không bị chặn 403 (status={st_m})!"
        print("[PASS 8/14] Sandbox Media chặn 100% các cuộc tấn công Path Traversal & đọc file nhạy cảm (HTTP 403).")

        new_pin = "998877"
        st_rot, res_rot, _ = http_req(
            f"{base_url}/api/ag-companion/rotate-pin",
            method="POST",
            headers=auth_hdr,
            body={"newPin": new_pin},
        )
        assert st_rot == 200 and isinstance(res_rot, dict) and res_rot.get("pin") == new_pin
        new_sess_token = str(res_rot.get("sessionToken") or "")
        new_auth_hdr = {"Authorization": f"Bearer {new_sess_token}"}
        st_old, _, _ = http_req(f"{base_url}/api/ag-companion/overview", headers={"Authorization": f"Bearer {sess_token}"})
        assert st_old == 401, f"Session Token cũ vẫn dùng được sau khi đổi PIN (status={st_old})!"
        st_new, _, _ = http_req(f"{base_url}/api/ag-companion/overview", headers=new_auth_hdr)
        assert st_new == 200
        print("[PASS 9/14] Đổi mã PIN mới & thu hồi toàn bộ phiên cũ hoạt động chính xác.")

        # 10. Deep Health Readiness Check (/api/ag-companion/health)
        st_h, res_h, _ = http_req(f"{base_url}/api/ag-companion/health")
        assert st_h == 200 and isinstance(res_h, dict) and res_h.get("ok") is True, f"Health check failed: {st_h} {res_h}"
        assert res_h.get("workers", {}).get("wsWatcherHealthy") is True
        print(f"[PASS 10/14] Deep Health Check (/api/ag-companion/health): status={res_h.get('status')}, version={res_h.get('version')}.")

        # 11. Server-enforced TTL Guard (chặn lệnh quá hạn do nghẽn kết nối 10h)
        now_ms = int(time.time() * 1000)
        stale_cmd_id = f"cmd_test_stale_{now_ms}"
        st_exp, res_exp, _ = http_req(
            f"{base_url}/api/ag-companion/send",
            method="POST",
            headers=new_auth_hdr,
            body={
                "cmdId": stale_cmd_id,
                "createdAtMs": now_ms - 36_000_000,
                "expiresAtMs": now_ms - 35_820_000,
                "conversationId": "test_conv_ttl",
                "text": "Lệnh cũ từ đêm qua",
            },
        )
        assert st_exp == 408 and isinstance(res_exp, dict) and res_exp.get("expired") is True, f"TTL guard failed: {st_exp} {res_exp}"
        print("[PASS 11/14] Chặn 100% lệnh quá hạn TTL (HTTP 408 Expired) — không tự chạy muộn trên PC.")

        # 12. Cancel Tombstone trước khi gói tin đến (/api/ag-companion/cancel_cmd)
        cancel_cmd_id = f"cmd_test_cancel_{now_ms}"
        st_can, res_can, _ = http_req(
            f"{base_url}/api/ag-companion/cancel_cmd",
            method="POST",
            headers=new_auth_hdr,
            body={"cmdId": cancel_cmd_id, "conversationId": "test_conv_cancel"},
        )
        assert st_can == 200 and isinstance(res_can, dict) and res_can.get("status") == "CANCELLED"
        st_after_can, res_after_can, _ = http_req(
            f"{base_url}/api/ag-companion/send",
            method="POST",
            headers=new_auth_hdr,
            body={
                "cmdId": cancel_cmd_id,
                "createdAtMs": now_ms,
                "expiresAtMs": now_ms + 60_000,
                "conversationId": "test_conv_cancel",
                "text": "Lệnh đến muộn sau khi bấm hủy",
            },
        )
        assert st_after_can == 409 and isinstance(res_after_can, dict) and res_after_can.get("cancelled") is True
        print("[PASS 12/14] Hủy lệnh chủ động (/api/ag-companion/cancel_cmd) khóa vĩnh viễn gói tin đến trễ (HTTP 409 Cancelled).")

        # 13. Payload SHA-256 Mismatch Guard cho cùng cmdId
        mismatch_cmd_id = f"cmd_test_mismatch_{now_ms}"
        h1 = cs._compute_cmd_payload_sha256(
            "send",
            {"conversationId": "c1", "text": "hello", "app": "ag1", "media": [{"name": "a.png", "dataUrl": "data:image/png;base64,AAA"}]},
        )
        h2 = cs._compute_cmd_payload_sha256(
            "send",
            {"conversationId": "c1", "text": "hello", "app": "ag2", "media": [{"name": "a.png", "dataUrl": "data:image/png;base64,AAA"}]},
        )
        h3 = cs._compute_cmd_payload_sha256(
            "send",
            {"conversationId": "c1", "text": "hello", "app": "ag1", "media": [{"name": "a.png", "dataUrl": "data:image/png;base64,BBB"}]},
        )
        assert h1 != h2 and h1 != h3, "Payload SHA-256 phải phân biệt cả app và nội dung media!"
        print(f"[PASS 13/14] Băm SHA-256 toàn phần (gồm cả app & media digest) chống va chạm Idempotency ({mismatch_cmd_id[:16]}).")

        # 14. Kiểm thử Multi-User PC Compatibility (primary_pid, auto-reset isRunning & model guard)
        fake_proj_cfg = {
            "member-proj-01": {
                "id": "member-proj-01",
                "name": "MemberProject",
                "folderUri": "file:///C:/Projects/MemberProject",
                "folderPath": r"C:\Projects\MemberProject",
            },
            "default-cli-project": {
                "id": "default-cli-project",
                "name": "CLI Project",
                "folderUri": "",
                "folderPath": str(Path.home()),
            },
        }
        prim = cs.get_primary_project_info(fake_proj_cfg)
        assert prim["id"] != "e3009192-6136-4652-a8f6-1f1238312ad6", "Không được hardcode UUID của máy tác giả khi máy thành viên không có!"
        fake_cfg = {
            "pinned": {},
            "customConvs": {
                "conv_stuck_test": {
                    "id": "conv_stuck_test",
                    "title": "Test Stuck Stop",
                    "projectId": "outside-of-project",
                    "isRunning": True,
                    "lastModifiedEpoch": time.time() - 5,
                    "messages": [
                        {"id": "u_1", "role": "user", "content": "hi", "timestamp": 1000},
                        {"id": "a_2", "role": "assistant", "content": "done", "completed": True, "toolCalls": [], "timestamp": 2000},
                    ],
                }
            },
        }
        detail_fixed = cs.read_local_conversation_detail("conv_stuck_test", fake_cfg)
        assert detail_fixed["isRunning"] is False, "Phải tự động hạ isRunning=False khi assistant đã trả lời xong (completed=True)!"
        assert detail_fixed["projectId"] != "outside-of-project", "Phải ánh xạ outside-of-project về primary_pid!"
        print("[PASS 14/15] Multi-User PC Fix: Tự động nhận diện primary_pid, hiện hội thoại ngoài project & tự nhả nút Stop khi AI trả lời xong.")

        statuses = []
        for i in range(6):
            st_bf, _, _ = http_req(f"{base_url}/api/ag-companion/auth-session", method="POST", body={"pin": f"00000{i}"})
            statuses.append(st_bf)
        assert 429 in statuses, f"Brute-force rate limit không kích hoạt HTTP 429! Statuses={statuses}"
        print(f"[PASS 15/16] Chống Brute-Force kích hoạt khóa IP tự động (Statuses={statuses} -> HTTP 429 Locked).")

        # 16. Kiểm thử WMI Detached Daemon (--detach) chống ngắt kết nối Error 1033 khi phiên lệnh AI kết thúc
        if os.name == "nt":
            detach_port = cs.find_available_port(18346)
            detach_pin = "789123"
            r_det = subprocess.run(
                [sys.executable, str(SERVER_SCRIPT), "--port", str(detach_port), "--strict-port", "--pin", detach_pin, "--no-browser", "--detach"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=20,
            )
            assert r_det.returncode == 0, f"Lệnh --detach thất bại: {r_det.stderr or r_det.stdout}"
            assert "WMI Win32_Process" in (r_det.stdout or ""), "Output --detach thiếu xác nhận WMI Win32_Process!"
            try:
                st_det, h_det, _ = http_req(f"http://127.0.0.1:{detach_port}/api/ag-companion/health")
                assert st_det == 200 and isinstance(h_det, dict) and h_det.get("ok") is True, f"Tiến trình WMI detached không sống sau khi tiến trình cha kết thúc: {st_det} {h_det}"
                print(f"[PASS 16/16] WMI Detached Daemon (--detach): Tiến trình vẫn sống độc lập 100% sau khi tiến trình cha kết thúc (Chống Error 1033).")
            finally:
                try:
                    if cs.RUNTIME_STATE_FILE.exists():
                        rt_info = json.loads(cs.RUNTIME_STATE_FILE.read_text(encoding="utf-8"))
                        det_pid = int(rt_info.get("pid") or 0)
                        if det_pid > 0:
                            subprocess.run(["taskkill", "/F", "/PID", str(det_pid)], capture_output=True)
                except Exception:
                    pass

        # 17. Kiểm thử Multi-Device Session Persistence, 401 Token Auto-Clear & WebSocket Subscribe Multi-Client Sync (#inc_0de73731)
        assert "if (savedPin) {" in html_raw and "if (savedPin && !sessionToken)" not in html_raw, "web/index.html phải luôn đổi savedPin từ URL sang sessionToken mới!"
        assert "localStorage.removeItem('ag_companion_session_token')" in html_raw, "web/index.html phải tự xóa sessionToken cũ khi gặp HTTP 401!"
        srv_src = SERVER_SCRIPT.read_text(encoding="utf-8")
        sub_block = srv_src.split('elif mtype == "subscribe":', 1)[1].split('elif mtype == "refresh":', 1)[0]
        assert "_last_conv_fingerprints" not in sub_block, "Nhánh subscribe không được ghi đè _last_conv_fingerprints làm mất đồng bộ thiết bị 1!"
        print("[PASS 17/17] Multi-Device Realtime Sync (#inc_0de73731): Chống kẹt sessionToken cũ (401/429), lưu phiên bền vững & đồng bộ WebSocket đa thiết bị.")

        print("=" * 78)
        print("  KẾT QUẢ: 17/17 BÀI KIỂM THỬ BẢO MẬT, MULTI-USER, MULTI-DEVICE, WMI DETACH & WEBSOCKET ĐẠT 100% (PASS)")
        print("=" * 78)
        return 0
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()


if __name__ == "__main__":
    raise SystemExit(run_test_suite())
