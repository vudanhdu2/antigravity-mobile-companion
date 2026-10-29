#!/usr/bin/env python3
"""
Antigravity Mobile Companion — Self-Hosted Local Bridge (100% Data Privacy + WebSocket Realtime)
================================================================================================
Điều khiển trực tiếp ứng dụng Antigravity Desktop đang mở trên máy PC của bạn
từ Điện thoại / Máy tính bảng / Web qua mạng Wi-Fi LAN, Tailscale VPN hoặc 4G/5G
(Cloudflare Quick Tunnel miễn phí) với giao diện chuẩn Google Antigravity
và đồng bộ Realtime qua WebSocket (/ws).

Cam kết Bảo mật Chủ động (Zero-Data-Leak):
- 100% dữ liệu hội thoại (transcript.jsonl, summaries.db, <cid>.db), mã nguồn
  dự án và ảnh/file đính kèm chỉ nằm trên ổ cứng máy tính của bạn.
- Không gửi bất kỳ lịch sử chat, mã nguồn hay URL/mã PIN nào lên máy chủ bên thứ ba.
- Tạo mã QR SVG 100% Offline ngay trong bộ nhớ máy tính (không gọi api.qrserver.com).
- Chống dò mã PIN (Brute-Force Rate Limit & IP Lockout), so sánh hằng thời gian
  (hmac.compare_digest), tự động đổi PIN sang Session Token và xóa PIN khỏi thanh địa chỉ.
- Sandbox nghiêm ngặt đường dẫn file media (chỉ cho phép đọc ảnh/tài liệu đính kèm
  trong thư mục brain/ và uploads/, chặn tuyệt đối Path Traversal).
"""
from __future__ import annotations

import argparse
import base64
import contextlib
import copy
import datetime
import hashlib
import hmac
import http.server
import json
import mimetypes
import os
import re
import secrets
import shutil
import socket
import socketserver
import sqlite3
import ssl
import struct
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

NO_WINDOW = 0x08000000 if os.name == "nt" else 0
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HOME = Path.home()


def _resolve_gemini_root_dir() -> Path:
    env_dir = os.environ.get("AG_GEMINI_DIR", "").strip()
    if env_dir:
        cand = Path(env_dir)
        if cand.exists():
            return cand
    candidates: list[Path] = [HOME / ".gemini"]
    try:
        for pat in ("Antigravity*", ".antigravity*"):
            for d in HOME.glob(pat):
                if not d.is_dir() or d.name in (".antigravity_tools", ".antigravity_cockpit"):
                    continue
                sub = d / ".gemini"
                if sub.is_dir():
                    candidates.append(sub)
                elif (d / "antigravity").is_dir():
                    candidates.append(d)
    except Exception:
        pass
    best = HOME / ".gemini"
    best_mtime = -1.0
    for c in candidates:
        try:
            db_f = c / "antigravity" / "conversation_summaries.db"
            if db_f.exists():
                mt = db_f.stat().st_mtime
                if mt > best_mtime:
                    best_mtime = mt
                    best = c
        except Exception:
            continue
    return best


GEMINI_ROOT_DIR = _resolve_gemini_root_dir()
ANTIGRAVITY_DIR = GEMINI_ROOT_DIR / "antigravity"
SUMMARIES_DB = ANTIGRAVITY_DIR / "conversation_summaries.db"
CONV_DIR = ANTIGRAVITY_DIR / "conversations"
BRAIN_DIR = ANTIGRAVITY_DIR / "brain"
ANNOTATIONS_DIR = ANTIGRAVITY_DIR / "annotations"
PROJECTS_DIR = GEMINI_ROOT_DIR / "config" / "projects"
ALT_PROJECTS_DIR = ANTIGRAVITY_DIR / "projects"
COMPANION_DATA_DIR = ANTIGRAVITY_DIR / "companion_selfhost"
UPLOADS_DIR = COMPANION_DATA_DIR / "uploads"
BIN_DIR = COMPANION_DATA_DIR / "bin"
CONFIG_FILE = COMPANION_DATA_DIR / "config.json"
CMD_STATE_DB = COMPANION_DATA_DIR / "cmd_state.db"
RUNTIME_STATE_FILE = COMPANION_DATA_DIR / "runtime_state.json"

COMPANION_RUNTIME_VERSION = "2026.10.29-v2.2.2-wmi-tunnel-guard"
CMD_TTL_MS = 180_000          # Hard cap: 3 minutes max command age
CMD_CLAIM_LEASE_MS = 60_000   # Atomic claim lease: 60 seconds

WEB_DIR = Path(__file__).resolve().parent / "web"
DEFAULT_PORT = int(os.environ.get("AG_COMPANION_PORT", "8046"))
HOST_NAME = os.environ.get("AG_COMPANION_HOSTNAME") or socket.gethostname() or "antigravity-pc"
SERVICE = "/exa.language_server_pb.LanguageServerService/"
ZERO_UUID = "00000000-0000-0000-0000-000000000000"
AG_SETTLED = (3, 4, 5, 6, 7, 12)
WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

BLOCKED_MEDIA_EXTENSIONS = {
    ".env", ".db", ".sqlite", ".sqlite3", ".wal", ".shm", ".json", ".jsonl",
    ".py", ".pyc", ".ps1", ".bat", ".cmd", ".exe", ".dll", ".sh", ".key",
    ".pem", ".pfx", ".p12", ".crt", ".csr", ".pbtxt", ".ini", ".cfg", ".conf",
}

_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE

DEFAULT_MODELS = [
    {"id": "MODEL_PLACEHOLDER_M417", "label": "Gemini 4 Argon (High)", "name": "Gemini 4 Argon", "tier": "High", "tag": "New", "cliModel": "pro", "remainingFraction": 1.0},
    {"id": "MODEL_PLACEHOLDER_M418", "label": "Gemini 4 Argon (Medium)", "name": "Gemini 4 Argon", "tier": "Medium", "tag": "New", "cliModel": "pro", "remainingFraction": 1.0},
    {"id": "MODEL_PLACEHOLDER_M419", "label": "Gemini 4 Argon (Low)", "name": "Gemini 4 Argon", "tier": "Low", "tag": "New", "cliModel": "flash", "remainingFraction": 1.0},
    {"id": "MODEL_PLACEHOLDER_M318", "label": "Gemini 3.8 Flash (High)", "name": "Gemini 3.8 Flash", "tier": "High", "tag": "Fast", "cliModel": "flash", "remainingFraction": 1.0},
    {"id": "MODEL_PLACEHOLDER_M319", "label": "Gemini 3.8 Flash (Medium)", "name": "Gemini 3.8 Flash", "tier": "Medium", "tag": "Fast", "cliModel": "flash", "remainingFraction": 1.0},
    {"id": "MODEL_PLACEHOLDER_M320", "label": "Gemini 3.8 Flash (Low)", "name": "Gemini 3.8 Flash", "tier": "Low", "tag": "Fast", "cliModel": "flash_lite", "remainingFraction": 1.0},
    {"id": "MODEL_PLACEHOLDER_M26", "label": "Claude Opus 4.6 (Thinking)", "name": "Claude Opus 4.6", "tier": "Thinking", "tag": "Opus", "cliModel": "pro", "remainingFraction": 1.0},
    {"id": "MODEL_PLACEHOLDER_M35", "label": "Claude Sonnet 4.6 (Thinking)", "name": "Claude Sonnet 4.6", "tier": "Thinking", "tag": "Sonnet", "cliModel": "pro", "remainingFraction": 1.0},
    {"id": "MODEL_OPENAI_GPT_OSS_120B_MEDIUM", "label": "GPT-OSS 120B (Medium)", "name": "GPT-OSS 120B", "tier": "Medium", "tag": "", "cliModel": "pro", "remainingFraction": 1.0},
]

_state_lock = threading.RLock()
_tunnel_lock = threading.Lock()
_tunnel_state: dict = {
    "running": False,
    "wanted": False,
    "localPort": 0,
    "url": "",
    "process": None,
    "error": "",
    "startedAt": 0,
}
_tunnel_watchdog_started: list[bool] = [False]

# Quản lý bảo mật phiên, chống brute-force và nhật ký truy cập
_auth_lock = threading.RLock()
_failed_attempts: dict[str, list[float]] = {}  # ip -> [timestamps]
_locked_ips: dict[str, float] = {}             # ip -> unlock_epoch
_active_sessions: dict[str, dict] = {}         # token -> {ip, ua, createdAt, lastSeen, via}
_security_audit_log: list[dict] = []           # [{ts, event, ip, detail, level}]
_optimistic_convs: dict[str, dict] = {}
_viewed_overrides: dict[str, float] = {}
_pinned_overrides: dict[str, bool] = {}
_user_cfg_cache: dict = {"at": 0.0, "cfg": None}
_projects_cfg_cache: dict = {"at": 0.0, "data": {}}
_annotations_cache: dict = {"at": 0.0, "data": {}}
_live_rpc_cache: dict = {"at": 0.0, "summaries": {}, "models": list(DEFAULT_MODELS), "email": "", "tier": ""}

# Quản lý kết nối WebSocket Realtime (RFC 6455) & Telemetry
_ws_lock = threading.Lock()
_ws_clients: list[dict] = []  # [{"sock": sock, "lock": Lock(), "cid": None, "ip": ip}]
_last_ov_fingerprint: list[str] = [""]
_last_conv_fingerprints: dict[str, str] = {}
_ws_thread_ref: list[threading.Thread | None] = [None]
_cmd_state_lock = threading.RLock()
_now_init_ms = int(time.time() * 1000)
_worker_telemetry: dict[str, int | str | bool] = {
    "version": COMPANION_RUNTIME_VERSION,
    "pid": os.getpid(),
    "started_at_ms": _now_init_ms,
    "last_ws_loop_at_ms": _now_init_ms,
    "active_claimed_count": 0,
    "delivered_count": 0,
    "failed_count": 0,
    "expired_count": 0,
    "cancelled_count": 0,
    "dedup_hit_count": 0,
    "last_error": "",
}

MAX_FAILED_ATTEMPTS = 5
FAILED_WINDOW_SEC = 300.0
LOCKOUT_DURATION_SEC = 300.0
SESSION_TTL_SEC = 86400.0 * 7


def append_security_audit(event: str, ip: str, detail: str, level: str = "info") -> None:
    with _auth_lock:
        _security_audit_log.insert(0, {
            "id": f"evt_{int(time.time() * 1000)}_{secrets.token_hex(2)}",
            "timestamp": int(time.time() * 1000),
            "timeStr": datetime.datetime.now().strftime("%H:%M:%S %d/%m"),
            "event": event,
            "ip": ip,
            "detail": detail,
            "level": level,
        })
        del _security_audit_log[80:]


# ============================================================================
# 1. WEBSOCKET REALTIME ENGINE (RFC 6455)
# ============================================================================

def ws_send_frame(client: dict, payload_str: str, opcode: int = 0x1) -> bool:
    """Gửi frame WebSocket RFC-6455 từ server xuống trình duyệt/điện thoại."""
    data = payload_str.encode("utf-8")
    length = len(data)
    header = bytearray([0x80 | (opcode & 0x0F)])
    if length < 126:
        header.append(length)
    elif length < 65536:
        header.append(126)
        header.extend(struct.pack("!H", length))
    else:
        header.append(127)
        header.extend(struct.pack("!Q", length))
    try:
        with client["lock"]:
            client["sock"].sendall(bytes(header) + data)
        return True
    except Exception:
        return False


def ws_read_frame(sock: socket.socket) -> tuple[int | None, bytes]:
    """Đọc 1 frame WebSocket RFC-6455 từ client gửi lên."""
    try:
        b12 = sock.recv(2)
        if len(b12) < 2:
            return None, b""
        opcode = b12[0] & 0x0F
        masked = (b12[1] & 0x80) != 0
        length = b12[1] & 0x7F
        if length == 126:
            ext = sock.recv(2)
            if len(ext) < 2:
                return None, b""
            length = struct.unpack("!H", ext)[0]
        elif length == 127:
            ext = sock.recv(8)
            if len(ext) < 8:
                return None, b""
            length = struct.unpack("!Q", ext)[0]
        mask_key = b""
        if masked:
            mask_key = sock.recv(4)
            if len(mask_key) < 4:
                return None, b""
        payload = bytearray()
        while len(payload) < length:
            chunk = sock.recv(min(65536, length - len(payload)))
            if not chunk:
                return None, b""
            payload.extend(chunk)
        if masked and mask_key:
            for i in range(len(payload)):
                payload[i] ^= mask_key[i & 3]
        return opcode, bytes(payload)
    except Exception:
        return None, b""


def broadcast_ws(msg_obj: dict, target_cid: str | None = None) -> None:
    """Đẩy sự kiện JSON tới tất cả WebSocket client đang mở."""
    raw = json.dumps(msg_obj, ensure_ascii=False)
    dead = []
    with _ws_lock:
        clients = list(_ws_clients)
    for c in clients:
        if target_cid and c.get("cid") and c.get("cid") != target_cid:
            continue
        if not ws_send_frame(c, raw):
            dead.append(c)
    if dead:
        with _ws_lock:
            for d in dead:
                if d in _ws_clients:
                    _ws_clients.remove(d)


def compute_overview_fingerprint(ov: dict) -> str:
    parts = []
    for c in ov.get("pinnedConversations", []):
        parts.append(f"P:{c['id']}:{c.get('title','')}:{c['isRunning']}:{c['unread']}:{c['stepCount']}:{c['relativeTime']}")
    for p in ov.get("projects", []):
        for c in p.get("conversations", [])[:25]:
            parts.append(f"{p['name']}:{c['id']}:{c.get('title','')}:{c['isRunning']}:{c['unread']}:{c['stepCount']}:{c['relativeTime']}")
    return "|".join(parts)


def compute_conv_fingerprint(detail: dict) -> str:
    msgs = detail.get("messages") or []
    last = msgs[-1] if msgs else {}
    tcs = last.get("toolCalls") or []
    last_tc_out = len(str(tcs[-1].get("output") or "")) if tcs else 0
    return (
        f"{detail.get('status')}:{detail.get('isRunning')}:{detail.get('pinned')}:"
        f"{detail.get('stepCount')}:{len(msgs)}:{last.get('id','')}:"
        f"{len(str(last.get('content','')))}:{len(str(last.get('thinking','')))}:"
        f"{len(tcs)}:{last_tc_out}"
    )


def trigger_immediate_ws_sync(force_cid: str | None = None) -> None:
    """Đẩy ngay bản cập nhật overview + hội thoại qua WebSocket khi có thao tác mới."""
    try:
        with _ws_lock:
            has_clients = len(_ws_clients) > 0
            sub_cids = {c.get("cid") for c in _ws_clients if c.get("cid")}
        if not has_clients:
            return
        ov = build_local_overview(APP_CONFIG)
        fp = compute_overview_fingerprint(ov)
        if fp != _last_ov_fingerprint[0]:
            _last_ov_fingerprint[0] = fp
            broadcast_ws({"type": "overview", "data": ov})
        target_cids = set(sub_cids)
        if force_cid:
            target_cids.add(force_cid)
        for cid in target_cids:
            if not cid:
                continue
            detail = read_local_conversation_detail(str(cid), APP_CONFIG)
            cfp = compute_conv_fingerprint(detail)
            if _last_conv_fingerprints.get(str(cid)) != cfp or str(cid) == force_cid:
                _last_conv_fingerprints[str(cid)] = cfp
                broadcast_ws({"type": "conversation", "conversationId": str(cid), "data": detail}, target_cid=str(cid))
    except Exception:
        pass


def _realtime_ws_watcher_loop() -> None:
    """Luồng nền theo dõi thay đổi của Antigravity IDE mỗi 0.55s và đồng bộ tức thì qua WebSocket."""
    while True:
        time.sleep(0.55)
        _worker_telemetry["last_ws_loop_at_ms"] = int(time.time() * 1000)
        try:
            with _ws_lock:
                if not _ws_clients:
                    continue
                sub_cids = {str(c.get("cid")) for c in _ws_clients if c.get("cid")}
            ov = build_local_overview(APP_CONFIG)
            fp = compute_overview_fingerprint(ov)
            if fp != _last_ov_fingerprint[0]:
                _last_ov_fingerprint[0] = fp
                broadcast_ws({"type": "overview", "data": ov})

            # Đồng bộ các hội thoại đang mở trên màn hình hoặc đang chạy (Running)
            for p in ov.get("projects", []):
                for c in p.get("conversations", [])[:10]:
                    if c.get("isRunning") and c.get("id"):
                        sub_cids.add(str(c["id"]))

            for cid in list(sub_cids)[:15]:
                if not cid or cid.startswith("pending_"):
                    continue
                detail = read_local_conversation_detail(cid, APP_CONFIG)
                cfp = compute_conv_fingerprint(detail)
                if _last_conv_fingerprints.get(cid) != cfp:
                    _last_conv_fingerprints[cid] = cfp
                    broadcast_ws({"type": "conversation", "conversationId": cid, "data": detail}, target_cid=cid)
        except Exception:
            continue


# ============================================================================
# 2. BỘ TẠO MÃ QR SVG 100% OFFLINE (ZERO-DATA-LEAK, KHÔNG GỌI SERVER NGOÀI)
# ============================================================================

def make_qr_matrix(text: str) -> list[list[bool]]:
    """Tạo ma trận QR chuẩn ISO/IEC 18004 (Version 1..6, ECC L, Byte mode) hoàn toàn bằng Python chuẩn."""
    data = text.encode("utf-8")
    specs = [
        (1, 21, 19, 7, 1, []),
        (2, 25, 34, 10, 1, [6, 18]),
        (3, 29, 55, 15, 1, [6, 22]),
        (4, 33, 80, 20, 1, [6, 26]),
        (5, 37, 108, 26, 1, [6, 30]),
        (6, 41, 136, 18, 2, [6, 34]),
    ]
    ver, size, data_cap, ec_len, blocks, align = specs[-1]
    for s in specs:
        if len(data) + 2 <= s[2]:
            ver, size, data_cap, ec_len, blocks, align = s
            break
    else:
        data = data[: data_cap - 2]

    bits = [0, 1, 0, 0]
    for i in range(7, -1, -1):
        bits.append((len(data) >> i) & 1)
    for b in data:
        for i in range(7, -1, -1):
            bits.append((b >> i) & 1)
    bits.extend([0] * min(4, data_cap * 8 - len(bits)))
    while len(bits) % 8 != 0:
        bits.append(0)
    cw = [int("".join(map(str, bits[i : i + 8])), 2) for i in range(0, len(bits), 8)]
    pads = [0xEC, 0x11]
    pad_idx = 0
    while len(cw) < data_cap:
        cw.append(pads[pad_idx % 2])
        pad_idx += 1

    exp = [0] * 512
    log = [0] * 256
    x = 1
    for i in range(255):
        exp[i] = x
        log[x] = i
        x <<= 1
        if x & 0x100:
            x ^= 0x11D
    for i in range(255, 512):
        exp[i] = exp[i - 255]

    def rs_encode(msg: list[int], nsym: int) -> list[int]:
        gen = [1]
        for i in range(nsym):
            ng = [0] * (len(gen) + 1)
            for j, g in enumerate(gen):
                ng[j] ^= g
                ng[j + 1] ^= exp[log[g] + i] if g else 0
            gen = ng
        res = list(msg) + [0] * nsym
        for i in range(len(msg)):
            coef = res[i]
            if coef != 0:
                for j in range(1, len(gen)):
                    if gen[j] != 0:
                        res[i + j] ^= exp[log[gen[j]] + log[coef]]
        return res[len(msg) :]

    blk_size = data_cap // blocks
    data_blocks = [cw[i * blk_size : (i + 1) * blk_size] for i in range(blocks)]
    ec_blocks = [rs_encode(b, ec_len) for b in data_blocks]
    final_cw = [b[i] for i in range(blk_size) for b in data_blocks] + [
        b[i] for i in range(ec_len) for b in ec_blocks
    ]
    final_bits = [(b >> i) & 1 for b in final_cw for i in range(7, -1, -1)]
    if ver in (2, 3, 4, 5, 6):
        final_bits.extend([0] * 7)

    grid = [[False] * size for _ in range(size)]
    is_func = [[False] * size for _ in range(size)]

    def set_f(r: int, c: int, val: bool) -> None:
        if 0 <= r < size and 0 <= c < size:
            grid[r][c] = bool(val)
            is_func[r][c] = True

    for r0, c0 in [(0, 0), (0, size - 7), (size - 7, 0)]:
        for dr in range(-1, 8):
            for dc in range(-1, 8):
                val = (
                    0 <= dr <= 6
                    and 0 <= dc <= 6
                    and (dr in (0, 6) or dc in (0, 6) or (2 <= dr <= 4 and 2 <= dc <= 4))
                )
                set_f(r0 + dr, c0 + dc, val)

    for i in range(8, size - 8):
        set_f(6, i, i % 2 == 0)
        set_f(i, 6, i % 2 == 0)

    for ar in align:
        for ac in align:
            if (ar < 9 and ac < 9) or (ar < 9 and ac > size - 10) or (ar > size - 10 and ac < 9):
                continue
            for dr in range(-2, 3):
                for dc in range(-2, 3):
                    set_f(ar + dr, ac + dc, max(abs(dr), abs(dc)) != 1)

    set_f(size - 8, 8, True)
    for i in range(9):
        if i != 6:
            set_f(8, i, False)
            set_f(i, 8, False)
    for i in range(8):
        set_f(8, size - 1 - i, False)
        set_f(size - 1 - i, 8, False)

    bit_idx = 0
    up = True
    col = size - 1
    while col > 0:
        if col == 6:
            col -= 1
        rows = range(size - 1, -1, -1) if up else range(size)
        for r in rows:
            for dc in (0, -1):
                c = col + dc
                if not is_func[r][c]:
                    b = final_bits[bit_idx] if bit_idx < len(final_bits) else 0
                    bit_idx += 1
                    if (r + c) % 2 == 0:
                        b ^= 1
                    grid[r][c] = bool(b)
        up = not up
        col -= 2

    fmt_bits = [(0x77C4 >> i) & 1 for i in range(15)]
    for i in range(6):
        set_f(8, i, bool(fmt_bits[14 - i]))
    set_f(8, 7, bool(fmt_bits[14 - 6]))
    set_f(8, 8, bool(fmt_bits[14 - 7]))
    set_f(7, 8, bool(fmt_bits[14 - 8]))
    for i in range(9, 15):
        set_f(14 - i, 8, bool(fmt_bits[14 - i]))
    for i in range(8):
        set_f(size - 1 - i, 8, bool(fmt_bits[14 - i]))
    for i in range(8, 15):
        set_f(8, size - 15 + i, bool(fmt_bits[14 - i]))
    return grid


def generate_qr_svg(text: str, border: int = 2) -> str:
    if not text:
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>'
    grid = make_qr_matrix(text)
    sz = len(grid)
    total = sz + border * 2
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total} {total}" shape-rendering="crispEdges">',
        f'<rect width="{total}" height="{total}" fill="#ffffff"/>',
        '<path fill="#090d16" d="',
    ]
    for r in range(sz):
        for c in range(sz):
            if grid[r][c]:
                parts.append(f"M{c + border},{r + border}h1v1h-1z")
    parts.append('"/></svg>')
    return "".join(parts)


def generate_qr_data_url(text: str) -> str:
    if not text:
        return ""
    svg = generate_qr_svg(text)
    b64 = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{b64}"


# ============================================================================
# 3. CẤU HÌNH BẢO MẬT MÃ PIN, CHÍNH SÁCH MẠNG & ĐỊA CHỈ LAN / TAILSCALE
# ============================================================================

def _generate_random_pin() -> str:
    return f"{secrets.randbelow(900000) + 100000}"


def load_or_create_config(custom_pin: str | None = None, custom_port: int | None = None) -> dict:
    COMPANION_DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    BIN_DIR.mkdir(parents=True, exist_ok=True)
    cfg: dict = {}
    if CONFIG_FILE.exists():
        try:
            cfg = json.loads(CONFIG_FILE.read_text(encoding="utf-8", errors="replace"))
        except Exception:
            cfg = {}
    if custom_pin:
        cfg["pin"] = str(custom_pin).strip()
    elif not cfg.get("pin"):
        cfg["pin"] = _generate_random_pin()
    if custom_port:
        cfg["port"] = int(custom_port)
    elif not cfg.get("port"):
        cfg["port"] = DEFAULT_PORT
    cfg.setdefault("allowLan", True)
    cfg.setdefault("pinned", {})
    cfg.setdefault("customConvs", {})
    save_config(cfg)
    return cfg


def save_config(cfg: dict) -> None:
    with _state_lock:
        COMPANION_DATA_DIR.mkdir(parents=True, exist_ok=True)
        tmp = CONFIG_FILE.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, CONFIG_FILE)


def get_lan_and_tailscale_ips() -> dict[str, str]:
    lan_ip = "127.0.0.1"
    tailscale_ip = ""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(("8.8.8.8", 80))
        lan_ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip.startswith("100."):
                tailscale_ip = ip
            elif lan_ip == "127.0.0.1" and (ip.startswith("192.168.") or ip.startswith("10.") or ip.startswith("172.")):
                lan_ip = ip
    except Exception:
        pass
    return {"lan_ip": lan_ip, "tailscale_ip": tailscale_ip}


def is_port_available(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s_check:
        s_check.settimeout(0.2)
        if s_check.connect_ex(("127.0.0.1", port)) == 0:
            return False
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if os.name == "nt" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            s.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        try:
            s.bind(("0.0.0.0", port))
            return True
        except OSError:
            return False


def find_available_port(preferred: int) -> int:
    if is_port_available(preferred):
        return preferred
    for p in range(preferred + 1, preferred + 50):
        if is_port_available(p):
            return p
    return preferred


# ============================================================================
# 4. KẾT NỐI TRỰC TIẾP VỚI ỨNG DỤNG ANTIGRAVITY DESKTOP TRÊN MÁY (CONNECT RPC)
# ============================================================================

def uri_to_path(uri: str) -> str:
    if not uri or not str(uri).startswith("file:"):
        return ""
    p = urllib.parse.unquote(urllib.parse.urlparse(str(uri)).path)
    if re.match(r"^/[A-Za-z]:", p):
        p = p[1:2].upper() + p[2:]
    return p.replace("/", "\\") if os.name == "nt" else p


def _instance_label(exe: str) -> tuple[str, str]:
    e = str(exe or "").replace("/", "\\").lower()
    m = re.search(r"\\apps\\acct(\d+)\\", e)
    if m:
        return f"acct{m.group(1)}", f"Antigravity #{m.group(1)}"
    return "chinh", "Antigravity (app chính)"


class LocalAgInstance:
    def __init__(self, name: str, label: str, pid: int, exe: str, csrf: str, ports: list[int]):
        self.name = name
        self.label = label
        self.pid = pid
        self.exe = exe
        self.csrf = csrf
        self.ports = ports
        self.grpc_port: int | None = None
        self.https_port: int | None = None

    def rpc(self, method: str, body: dict | None = None, timeout: int = 12) -> dict | None:
        payload = body if body is not None else {
            "metadata": {"ideName": "antigravity", "extensionName": "antigravity", "locale": "en"}
        }
        candidates = ([self.https_port] if self.https_port else []) + [
            p for p in self.ports if p != self.https_port
        ]
        opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),
            urllib.request.HTTPSHandler(context=_SSL_CTX),
        )
        for p in candidates:
            if not p:
                continue
            req = urllib.request.Request(
                f"https://127.0.0.1:{int(p)}{SERVICE}{method}",
                data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Connect-Protocol-Version": "1",
                    "X-Codeium-Csrf-Token": self.csrf,
                },
                method="POST",
            )
            try:
                with opener.open(req, timeout=timeout) as resp:
                    raw = resp.read(16 * 1024 * 1024)
                    data = json.loads(raw or b"{}")
                    if isinstance(data, dict):
                        self.https_port = p
                        return data
            except Exception:
                continue
        return None

    def user_config(self, cid: str, summary: dict | None) -> dict | None:
        if not isinstance(summary, dict):
            return None
        idx = summary.get("lastUserInputStepIndex")
        if idx is None or int(idx) < 0:
            return None
        res = self.rpc("GetCascadeTrajectorySteps", {"cascadeId": cid, "stepOffset": int(idx)}, timeout=15)
        steps = (res or {}).get("steps") or []
        ui = next((s.get("userInput") for s in steps if isinstance(s, dict) and s.get("userInput")), None) or {}
        cfg = ui.get("userConfig") or ui.get("lastUserConfig")
        return cfg if isinstance(cfg, dict) and cfg.get("plannerConfig") else None

    def call_agentapi(self, *args: str, project_id: str = "", timeout: int = 90) -> dict:
        candidates = ([self.grpc_port] if self.grpc_port else []) + [
            p for p in self.ports if p != self.grpc_port
        ]
        last_err = "Không kết nối được cổng gRPC của Antigravity Desktop"
        for p in candidates:
            if not p:
                continue
            env = dict(os.environ)
            env["ANTIGRAVITY_LS_ADDRESS"] = f"127.0.0.1:{p}"
            env["ANTIGRAVITY_CSRF_TOKEN"] = self.csrf
            if project_id:
                env["ANTIGRAVITY_PROJECT_ID"] = project_id
            try:
                r = subprocess.run(
                    [self.exe, "agentapi", *args],
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    env=env,
                    timeout=timeout,
                    creationflags=NO_WINDOW,
                )
                out = (r.stdout or "").strip()
                if r.returncode == 0 and out:
                    parsed = json.loads(out)
                    if isinstance(parsed, dict) and not parsed.get("error"):
                        self.grpc_port = p
                        return parsed
                last_err = (r.stderr or r.stdout or last_err).strip()[:300]
            except Exception as e:
                last_err = str(e)
        raise RuntimeError(last_err)


_instances_cache: dict = {"at": 0.0, "list": []}
_discover_lock = threading.Lock()


def discover_local_antigravity_instances(force: bool = False) -> list[LocalAgInstance]:
    now = time.time()
    with _discover_lock:
        if not force and _instances_cache["list"] and (now - _instances_cache["at"]) < 15.0:
            return _instances_cache["list"]

        procs: list[dict] = []
        ports_by_pid: dict[int, list[int]] = {}

        used_psutil = False
        try:
            import psutil  # type: ignore
            for proc in psutil.process_iter(["pid", "name"]):
                pname = (proc.info.get("name") or "").lower()
                if not pname.startswith("language_server"):
                    continue
                try:
                    procs.append({
                        "ProcessId": proc.pid,
                        "ExecutablePath": proc.exe(),
                        "CommandLine": subprocess.list2cmdline(proc.cmdline()),
                    })
                except Exception:
                    continue
            pids_set = {int(p["ProcessId"]) for p in procs if p.get("ProcessId")}
            if pids_set:
                for c in psutil.net_connections(kind="tcp"):
                    if c.pid in pids_set and c.status == psutil.CONN_LISTEN and c.laddr:
                        ports_by_pid.setdefault(int(c.pid), []).append(int(c.laddr.port))
            used_psutil = True
        except Exception:
            procs = []
            ports_by_pid = {}

        if not used_psutil and os.name == "nt":
            ps_cmd = (
                "Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'language_server*.exe' } | "
                "Select-Object ProcessId, ExecutablePath, CommandLine | ConvertTo-Json -Compress"
            )
            try:
                r = subprocess.run(
                    ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_cmd],
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=12,
                    creationflags=NO_WINDOW,
                )
                raw = (r.stdout or "").strip()
                if raw:
                    d = json.loads(raw)
                    procs = d if isinstance(d, list) else [d]
            except Exception:
                procs = []

            if procs:
                pids_set = {int(p.get("ProcessId") or 0) for p in procs if p.get("ProcessId")}
                try:
                    ns = subprocess.run(
                        ["netstat", "-ano", "-p", "tcp"],
                        capture_output=True,
                        text=True,
                        encoding="utf-8",
                        errors="replace",
                        timeout=5,
                        creationflags=NO_WINDOW,
                    )
                    for line in (ns.stdout or "").splitlines():
                        if "LISTENING" not in line:
                            continue
                        parts = line.split()
                        if len(parts) >= 5:
                            try:
                                pid_val = int(parts[-1])
                                if pid_val in pids_set:
                                    addr_part = parts[1]
                                    port_val = int(addr_part.rsplit(":", 1)[-1])
                                    ports_by_pid.setdefault(pid_val, []).append(port_val)
                            except ValueError:
                                continue
                except Exception:
                    pass

        old_by_pid = {i.pid: i for i in _instances_cache.get("list") or []}
        instances: list[LocalAgInstance] = []
        for p in procs:
            cmd = str(p.get("CommandLine") or "")
            if " agentapi" in cmd:
                continue
            m = re.search(r"--csrf_token[= ]([0-9a-fA-F-]{36})", cmd)
            if not m:
                continue
            pid = int(p.get("ProcessId") or 0)
            exe = str(p.get("ExecutablePath") or "")
            ports = sorted(set(ports_by_pid.get(pid, [])))
            if pid and exe and ports:
                name, label = _instance_label(exe)
                inst = LocalAgInstance(name=name, label=label, pid=pid, exe=exe, csrf=m.group(1), ports=ports)
                prev = old_by_pid.get(pid)
                if prev and prev.csrf == inst.csrf and prev.https_port in ports:
                    inst.https_port = prev.https_port
                    inst.grpc_port = prev.grpc_port
                if inst.rpc("GetUserStatus", timeout=4) is not None:
                    instances.append(inst)

        instances.sort(key=lambda a: (a.name != "chinh", a.name, a.pid))
        _instances_cache["at"] = now
        _instances_cache["list"] = instances
        return instances


def get_cached_user_config(
    inst: LocalAgInstance,
    cid: str | None = None,
    summary: dict | None = None,
    model_id: str = "",
) -> dict | None:
    now = time.time()
    base_cfg = _user_cfg_cache.get("cfg")
    if not base_cfg or (now - float(_user_cfg_cache.get("at") or 0)) > 1800:
        if cid and isinstance(summary, dict) and summary.get("lastUserInputStepIndex") is not None:
            try:
                base_cfg = inst.user_config(cid, summary)
            except Exception:
                base_cfg = None
        if not base_cfg:
            try:
                res = inst.rpc("GetAllCascadeTrajectories", {})
                summ = (res or {}).get("trajectorySummaries") or {}
                recent = sorted(
                    ((k, x) for k, x in summ.items() if isinstance(x, dict) and x.get("lastUserInputStepIndex") is not None),
                    key=lambda kv: str(kv[1].get("lastUserInputTime") or ""),
                    reverse=True,
                )
                for k, x in recent[:6]:
                    base_cfg = inst.user_config(k, x)
                    if base_cfg:
                        break
            except Exception:
                pass
        if base_cfg:
            _user_cfg_cache["at"] = now
            _user_cfg_cache["cfg"] = copy.deepcopy(base_cfg)

    if not base_cfg:
        return None
    cfg = copy.deepcopy(base_cfg)
    if isinstance(cfg.get("plannerConfig"), dict) and model_id and model_id.startswith("MODEL_"):
        known_models = {
            str(m.get("id") or "")
            for m in (_live_rpc_cache.get("models") or DEFAULT_MODELS)
            if isinstance(m, dict) and m.get("id")
        }
        if not known_models or model_id in known_models:
            cfg["plannerConfig"]["planModel"] = model_id
    return cfg


# ============================================================================
# 5. ĐỌC CẤU TRÚC PROJECTS, ANNOTATIONS, CUSTOMIZATIONS & TRANSCRIPT REALTIME
# ============================================================================

def _varint(b: bytes, i: int) -> tuple[int, int]:
    shift = 0
    result = 0
    while True:
        if i >= len(b):
            raise IndexError("Truncated varint")
        byte = b[i]
        i += 1
        result |= (byte & 0x7F) << shift
        if not (byte & 0x80):
            return result, i
        shift += 7


def _mostly_printable(s: str) -> bool:
    if not s:
        return True
    good = sum(1 for ch in s if ch.isprintable() or ch in "\n\r\t")
    return (good / len(s)) >= 0.85


def pb_parse(b: bytes, depth: int = 0) -> dict | None:
    out: dict = {}
    i = 0
    try:
        while i < len(b):
            key, i = _varint(b, i)
            f, wt = key >> 3, key & 7
            if f == 0:
                return None
            if wt == 0:
                v, i = _varint(b, i)
            elif wt == 1:
                v, i = b[i : i + 8], i + 8
            elif wt == 5:
                v, i = b[i : i + 4], i + 4
            elif wt == 2:
                n, i = _varint(b, i)
                chunk = b[i : i + n]
                i += n
                if i > len(b):
                    return None
                try:
                    text = chunk.decode("utf-8")
                except UnicodeDecodeError:
                    text = None
                printable = (
                    text is not None
                    and not (text and text[0] < " " and text[0] not in "\n\t\r")
                    and _mostly_printable(text)
                )
                if printable and text is not None and len(text) > 3 and not text.startswith("\n"):
                    out.setdefault(f, []).append(text)
                    continue
                sub = pb_parse(chunk, depth + 1) if depth < 10 and n > 1 else None
                if printable and sub is None:
                    v = text
                elif sub is not None:
                    v = sub
                else:
                    v = b""
            else:
                return None
            out.setdefault(f, []).append(v)
        return out
    except Exception:
        return None


def pb_get(msg: dict | None, *path: int):
    cur = msg
    for f in path:
        if not isinstance(cur, dict) or f not in cur:
            return None
        cur = cur[f][0]
    return cur


def parse_iso_epoch(s: str) -> float:
    if not s:
        return 0.0
    m = re.match(r"(\d{4}-\d\d-\d\d)[T ](\d\d:\d\d:\d\d)(?:\.(\d+))?", str(s))
    if m:
        try:
            dt = datetime.datetime.strptime(f"{m[1]} {m[2]}", "%Y-%m-%d %H:%M:%S").replace(
                tzinfo=datetime.timezone.utc
            )
            frac = float("0." + (m[3][:6] if m[3] else "0"))
            return dt.timestamp() + frac
        except ValueError:
            pass
    try:
        return datetime.datetime.fromisoformat(str(s).replace("Z", "+00:00")).timestamp()
    except Exception:
        return 0.0


def format_relative_time(epoch: float, now: float | None = None) -> str:
    """Định dạng thời gian chuẩn Google Antigravity: now, 2m, 4h, 7d, 1mo, 1y."""
    if not epoch or epoch <= 0:
        return ""
    now = now or time.time()
    diff = max(0.0, now - epoch)
    if diff < 60:
        return "now"
    if diff < 3600:
        return f"{int(diff // 60)}m"
    if diff < 86400:
        return f"{int(diff // 3600)}h"
    if diff < 86400 * 30:
        return f"{int(diff // 86400)}d"
    if diff < 86400 * 365:
        return f"{max(1, int(diff // (86400 * 30)))}mo"
    return f"{max(1, int(diff // (86400 * 365)))}y"


def clean_user_prompt_text(raw: str) -> str:
    s = str(raw or "")
    m_req = re.search(r"<USER_REQUEST>\s*([\s\S]*?)\s*</USER_REQUEST>", s)
    if m_req:
        s = m_req.group(1).strip()
    else:
        s = re.sub(r"<ADDITIONAL_METADATA>[\s\S]*?</ADDITIONAL_METADATA>", "", s)
        s = re.sub(r"<USER_SETTINGS_CHANGE>[\s\S]*?</USER_SETTINGS_CHANGE>", "", s)
    s = re.sub(r"\n*\[Đính kèm (?:từ Web/Mobile|file/ảnh tại máy local)\]:[\s\S]*$", "", s)
    return s.strip()


def load_annotations_map() -> dict[str, dict]:
    now = time.time()
    if _annotations_cache["data"] and (now - _annotations_cache["at"]) < 1.8:
        base = dict(_annotations_cache["data"])
        for cid, p_val in _pinned_overrides.items():
            base.setdefault(cid, {"pinned": p_val, "lastUserViewEpoch": 0.0, "title": ""})["pinned"] = p_val
        for cid, v_ts in _viewed_overrides.items():
            if cid in base and v_ts > base[cid].get("lastUserViewEpoch", 0.0):
                base[cid]["lastUserViewEpoch"] = v_ts
        return base

    out: dict[str, dict] = {}
    if not ANNOTATIONS_DIR.is_dir():
        return out
    for f in ANNOTATIONS_DIR.glob("*.pbtxt"):
        cid = f.stem
        try:
            txt = f.read_text(encoding="utf-8", errors="replace")
            pinned = bool(re.search(r"\bpinned:\s*true\b", txt))
            if cid in _pinned_overrides:
                pinned = _pinned_overrides[cid]
            m_sec = re.search(r"last_user_view_time:\s*\{\s*seconds:\s*(\d+)", txt)
            view_ts = float(m_sec.group(1)) if m_sec else 0.0
            if cid in _viewed_overrides and _viewed_overrides[cid] > view_ts:
                view_ts = _viewed_overrides[cid]
            m_title = re.search(r'\btitle:\s*"((?:[^"\\]|\\.)*)"', txt)
            title = m_title.group(1).replace('\\"', '"') if m_title else ""
            out[cid] = {"pinned": pinned, "lastUserViewEpoch": view_ts, "title": title}
        except Exception:
            continue
    _annotations_cache["at"] = now
    _annotations_cache["data"] = out
    return out


def load_projects_config() -> dict[str, dict]:
    """Đọc ~/.gemini/config/projects/*.json và ~/.gemini/antigravity/projects/*.json để hiển thị đúng tên Project trên mọi máy PC."""
    now = time.time()
    if _projects_cfg_cache["data"] and (now - _projects_cfg_cache["at"]) < 25.0:
        return _projects_cfg_cache["data"]
    out: dict[str, dict] = {}
    for p_dir in (ALT_PROJECTS_DIR, PROJECTS_DIR):
        if not p_dir.is_dir():
            continue
        for p in sorted(p_dir.glob("*.json")):
            try:
                d = json.loads(p.read_text(encoding="utf-8", errors="replace"))
            except Exception:
                continue
            pid = str(d.get("id") or p.stem).strip()
            if not pid or pid == "outside-of-project":
                continue
            name = str(d.get("name") or pid).strip()
            folder_uri = str(d.get("folderUri") or "").strip()
            resources = (d.get("projectResources") or {}).get("resources") or []
            if not folder_uri and resources and isinstance(resources[0], dict):
                r0 = resources[0]
                folder_uri = str(r0.get("folderUri") or (r0.get("gitFolder") or {}).get("folderUri") or "").strip()
            if not folder_uri:
                raw_paths = d.get("paths") or d.get("workspaceUris") or []
                if isinstance(raw_paths, list) and raw_paths:
                    first_p = str(raw_paths[0] or "").strip()
                    if first_p.startswith("file:"):
                        folder_uri = first_p
                    elif first_p:
                        try:
                            folder_uri = Path(first_p).resolve().as_uri()
                        except Exception:
                            pass
            folder_path = uri_to_path(folder_uri) if folder_uri else str(d.get("folderPath") or "")
            out[pid] = {
                "id": pid,
                "name": name,
                "folderUri": folder_uri,
                "folderPath": folder_path,
            }
    out.setdefault("default-cli-project", {
        "id": "default-cli-project",
        "name": "CLI Project",
        "folderUri": "",
        "folderPath": str(HOME),
    })
    _projects_cfg_cache["at"] = now
    _projects_cfg_cache["data"] = out
    return out


def get_primary_project_info(proj_cfg: dict[str, dict] | None = None) -> dict:
    """Xác định project chính (primary_pid & folderUri) của máy người dùng hiện tại, không hardcode UUID của máy tác giả."""
    cfg_map = proj_cfg if isinstance(proj_cfg, dict) else load_projects_config()
    author_default = "e3009192-6136-4652-a8f6-1f1238312ad6"
    if author_default in cfg_map and cfg_map[author_default].get("folderUri"):
        return cfg_map[author_default]

    synthesized_from_db: dict | None = None
    # Ưu tiên project có trong cfg_map trùng với phiên làm việc gần nhất trong conversation_summaries.db
    if SUMMARIES_DB.exists():
        try:
            with sqlite3.connect(SUMMARIES_DB.resolve().as_uri() + "?mode=ro", uri=True, timeout=2) as con:
                recent_rows = con.execute(
                    """
                    SELECT project_id, workspace_uris
                    FROM conversation_summaries
                    WHERE nesting_depth = 0 AND killed = 0
                    ORDER BY last_modified_time DESC
                    LIMIT 25
                    """
                ).fetchall()
            for r_pid, r_uris_str in recent_rows:
                clean_pid = str(r_pid or "").strip()
                if clean_pid and clean_pid not in ("outside-of-project", "default-cli-project") and clean_pid in cfg_map:
                    return cfg_map[clean_pid]
                try:
                    uris = json.loads(r_uris_str or "[]")
                except Exception:
                    uris = []
                if uris and isinstance(uris[0], str) and uris[0].strip():
                    u0 = uris[0].strip()
                    p0 = uri_to_path(u0)
                    for cand in cfg_map.values():
                        if cand.get("id") in ("default-cli-project", "outside-of-project"):
                            continue
                        if (cand.get("folderUri") and cand["folderUri"].rstrip("/") == u0.rstrip("/")) or (
                            cand.get("folderPath") and p0 and Path(cand["folderPath"]) == Path(p0)
                        ):
                            return cand
                    if synthesized_from_db is None:
                        folder_name = Path(p0).name if p0 else "Workspace"
                        synthesized_id = clean_pid if (clean_pid and clean_pid != "outside-of-project") else f"ws-{folder_name.lower()}"
                        synthesized_from_db = {
                            "id": synthesized_id,
                            "name": folder_name or "Workspace",
                            "folderUri": u0,
                            "folderPath": p0 or str(HOME),
                        }
        except Exception:
            pass

    for pid, info in cfg_map.items():
        if pid not in ("default-cli-project", "outside-of-project") and info.get("folderUri"):
            return info
    for pid, info in cfg_map.items():
        if pid not in ("default-cli-project", "outside-of-project"):
            return info
    if synthesized_from_db is not None:
        return synthesized_from_db
    return cfg_map.get("default-cli-project") or {
        "id": "default-cli-project",
        "name": "CLI Project",
        "folderUri": "",
        "folderPath": str(HOME),
    }


def discover_local_customizations() -> dict:
    """Quét thật danh sách Rules, Skills và MCP Servers trên máy PC cho cửa sổ Customizations."""
    rules = []
    for r_path in [
        HOME / ".gemini" / "GEMINI.md",
        HOME / "Documents" / "AG" / "AGENTS.md",
        Path.cwd() / "AGENTS.md",
    ]:
        try:
            if r_path.is_file():
                rules.append({
                    "name": r_path.name,
                    "path": str(r_path),
                    "size": r_path.stat().st_size,
                })
        except Exception:
            continue

    skills = []
    seen_skills: set[str] = set()
    for s_root in [
        HOME / "Documents" / "AG" / ".agents" / "skills",
        HOME / ".gemini" / "antigravity" / "builtin" / "skills",
    ]:
        if not s_root.is_dir():
            continue
        for sk_dir in sorted(s_root.iterdir()):
            sk_md = sk_dir / "SKILL.md"
            if sk_md.is_file() and sk_dir.name not in seen_skills:
                seen_skills.add(sk_dir.name)
                desc = ""
                try:
                    raw = sk_md.read_text(encoding="utf-8", errors="replace")[:800]
                    m_d = re.search(r"description:\s*(.+)", raw)
                    if m_d:
                        desc = m_d.group(1).strip().strip('"\'')[:140]
                except Exception:
                    pass
                skills.append({
                    "name": sk_dir.name,
                    "description": desc or f"Antigravity Skill ({sk_dir.name})",
                    "path": str(sk_md),
                })

    mcp_servers = []
    mcp_root = ANTIGRAVITY_DIR / "mcp"
    if mcp_root.is_dir():
        for m_dir in sorted(mcp_root.iterdir()):
            if m_dir.is_dir():
                tools_count = len(list(m_dir.glob("*.json")))
                mcp_servers.append({
                    "name": m_dir.name,
                    "toolsCount": tools_count,
                    "status": "Connected",
                })

    return {
        "ok": True,
        "host": HOST_NAME,
        "rules": rules,
        "skills": skills,
        "mcpServers": mcp_servers,
    }


def _refresh_live_rpc_state(instances: list[LocalAgInstance]) -> None:
    now = time.time()
    if (now - float(_live_rpc_cache.get("at") or 0)) < 1.2:
        return
    _live_rpc_cache["at"] = now
    live_summaries: dict = {}
    models_list = list(_live_rpc_cache.get("models") or DEFAULT_MODELS)
    account_email = str(_live_rpc_cache.get("email") or "")
    account_tier = str(_live_rpc_cache.get("tier") or "")

    for inst in instances:
        try:
            res = inst.rpc("GetAllCascadeTrajectories", {}, timeout=3)
            if isinstance(res, dict) and isinstance(res.get("trajectorySummaries"), dict):
                for k, v in res["trajectorySummaries"].items():
                    if k not in live_summaries or "RUNNING" in str(v.get("status") or ""):
                        live_summaries[k] = v
        except Exception:
            pass
        if (now - float(_live_rpc_cache.get("models_at") or 0)) >= 30.0 or not account_email:
            try:
                us = (inst.rpc("GetUserStatus", timeout=3) or {}).get("userStatus") or {}
                if us and not account_email:
                    account_email = str(us.get("email") or "")
                    t_raw = us.get("userTier")
                    account_tier = str(t_raw.get("name") or "") if isinstance(t_raw, dict) else str(t_raw or "")
                cfgs = ((us.get("cascadeModelConfigData") or {}).get("clientModelConfigs")) or []
                if cfgs:
                    parsed_m = []
                    for c in cfgs:
                        m_id = str(((c.get("modelOrAlias") or {}).get("model")) or "")
                        lbl = str(c.get("label") or "")
                        if m_id and lbl:
                            m_tier = re.match(r"^(.*?)\s*\(([^()]+)\)\s*$", lbl)
                            b_name = m_tier.group(1).strip() if m_tier else lbl
                            t_name = m_tier.group(2).strip() if m_tier else ""
                            parsed_m.append({
                                "id": m_id,
                                "label": lbl,
                                "name": b_name,
                                "tier": t_name,
                                "tag": str(c.get("tagTitle") or ""),
                                "cliModel": "flash" if "flash" in lbl.lower() else "pro",
                                "remainingFraction": float(((c.get("quotaInfo") or {}).get("remainingFraction")) or 1.0),
                            })
                    if parsed_m:
                        parsed_m.sort(key=lambda x: (0 if "Argon (High)" in x["label"] else 1, x["label"]))
                        models_list = parsed_m
                        _live_rpc_cache["models_at"] = now
            except Exception:
                pass

    _live_rpc_cache["summaries"] = live_summaries
    _live_rpc_cache["models"] = models_list
    _live_rpc_cache["email"] = account_email
    _live_rpc_cache["tier"] = account_tier


def build_local_overview(cfg: dict) -> dict:
    now = time.time()
    instances = discover_local_antigravity_instances()
    _refresh_live_rpc_state(instances)
    ann_map = load_annotations_map()
    proj_cfg = load_projects_config()
    pinned_map: dict = cfg.get("pinned", {})
    custom_convs: dict = cfg.get("customConvs", {})

    live_summaries: dict = _live_rpc_cache.get("summaries") or {}
    models_list: list = _live_rpc_cache.get("models") or list(DEFAULT_MODELS)
    account_email = str(_live_rpc_cache.get("email") or "")
    account_tier = str(_live_rpc_cache.get("tier") or "")

    primary_proj = get_primary_project_info(proj_cfg)
    primary_pid = str(primary_proj.get("id") or "default-cli-project")
    if primary_pid not in proj_cfg:
        proj_cfg[primary_pid] = primary_proj

    preferred_order: list[str] = []
    for cand_pid in [
        primary_pid,
        "e3009192-6136-4652-a8f6-1f1238312ad6",
        "default-cli-project",
        *list(proj_cfg.keys()),
    ]:
        if cand_pid and cand_pid != "outside-of-project" and cand_pid not in preferred_order:
            preferred_order.append(cand_pid)

    projects_map: dict[str, dict] = {}
    for pid in preferred_order:
        if pid in proj_cfg:
            projects_map[pid] = {
                "id": pid,
                "name": proj_cfg[pid]["name"],
                "folderPath": proj_cfg[pid].get("folderPath") or str(HOME),
                "totalCount": 0,
                "conversations": [],
            }

    pinned_items: list[dict] = []
    seen_cids: set[str] = set()

    rows = []
    if SUMMARIES_DB.exists():
        try:
            with sqlite3.connect(SUMMARIES_DB.resolve().as_uri() + "?mode=ro", uri=True, timeout=3) as con:
                rows = con.execute(
                    """
                    SELECT conversation_id, title, preview, step_count, last_modified_time,
                           workspace_uris, status, project_id, not_fully_idle
                    FROM conversation_summaries
                    WHERE nesting_depth = 0 AND killed = 0
                    ORDER BY last_modified_time DESC
                    """
                ).fetchall()
        except Exception:
            rows = []

    for cid, title, preview, step_count, last_mod_str, ws_uris_str, status, project_id, not_fully_idle in rows:
        seen_cids.add(cid)
        live = live_summaries.get(cid) or {}
        live_ann = live.get("annotations") or {}
        ann = ann_map.get(cid) or {}

        final_title = (
            str(live.get("summary") or "").strip()
            or str(ann.get("title") or "").strip()
            or str(title or "").strip()
        )
        if not final_title:
            continue

        pid = str(project_id or "").strip()
        if not pid:
            live_meta = live.get("trajectoryMetadata") or {}
            pid = str(live_meta.get("projectId") or "").strip()
        if not pid or pid == "outside-of-project":
            matched_pid = ""
            try:
                uris = json.loads(ws_uris_str or "[]")
                if uris and isinstance(uris[0], str):
                    u0 = uris[0].strip().rstrip("/")
                    p0 = uri_to_path(u0)
                    for cand_id, cand_info in proj_cfg.items():
                        if cand_id in ("default-cli-project", "outside-of-project"):
                            continue
                        c_uri = str(cand_info.get("folderUri") or "").rstrip("/")
                        c_path = str(cand_info.get("folderPath") or "")
                        if (c_uri and c_uri == u0) or (c_path and p0 and Path(c_path) == Path(p0)):
                            matched_pid = cand_id
                            break
            except Exception:
                pass
            pid = matched_pid or primary_pid

        p_info = proj_cfg.get(pid)
        if not p_info:
            folder_path = ""
            try:
                uris = json.loads(ws_uris_str or "[]")
                if uris:
                    folder_path = uri_to_path(uris[0])
            except Exception:
                pass
            p_name = Path(folder_path).name if folder_path else pid
            p_info = {"id": pid, "name": p_name, "folderPath": folder_path}
        p_name = p_info["name"]

        ws_prefix = ""
        try:
            ws_list = json.loads(ws_uris_str or "[]")
            if ws_list and pid == "default-cli-project":
                folder_name = Path(urllib.parse.unquote(ws_list[0].replace("file:///", ""))).name
                if folder_name and folder_name not in final_title:
                    ws_prefix = folder_name
        except Exception:
            pass

        mod_epoch = max(parse_iso_epoch(str(last_mod_str or "")), parse_iso_epoch(str(live.get("lastModifiedTime") or "")))
        view_epoch = float(ann.get("lastUserViewEpoch") or 0.0)
        if cid in _viewed_overrides and _viewed_overrides[cid] > view_epoch:
            view_epoch = _viewed_overrides[cid]

        live_status = str(live.get("status") or status or "CASCADE_RUN_STATUS_IDLE")
        is_running = "RUNNING" in live_status or bool(not_fully_idle)

        if (now - mod_epoch) < 7200:
            t_jsonl = BRAIN_DIR / cid / ".system_generated" / "logs" / "transcript.jsonl"
            try:
                if t_jsonl.exists():
                    mt = t_jsonl.stat().st_mtime
                    if mt > mod_epoch:
                        mod_epoch = mt
                    if (now - mt) < 10.0:
                        is_running = True
                        live_status = "CASCADE_RUN_STATUS_RUNNING"
            except OSError:
                pass

        opt = _optimistic_convs.get(cid)
        if opt and (now - float(opt.get("createdAt") or 0)) < 15.0:
            is_running = True
            live_status = "CASCADE_RUN_STATUS_RUNNING"
            mod_epoch = max(mod_epoch, float(opt.get("createdAt") or now))

        is_unread = (
            (view_epoch > 0 and (mod_epoch - view_epoch) > 5 and (now - mod_epoch) < 86400 * 2)
            or (pid == "default-cli-project" and view_epoch == 0.0 and cid not in _viewed_overrides)
        )

        is_pinned = (
            bool(pinned_map[cid])
            if cid in pinned_map
            else (bool(_pinned_overrides[cid]) if cid in _pinned_overrides else (bool(ann.get("pinned")) or bool(live_ann.get("pinned"))))
        )

        item = {
            "id": cid,
            "title": final_title,
            "workspaceTag": ws_prefix,
            "projectId": pid,
            "projectName": p_name,
            "stepCount": int(live.get("stepCount") or step_count or 0),
            "lastModifiedEpoch": mod_epoch or now,
            "relativeTime": format_relative_time(mod_epoch or now, now),
            "status": "CASCADE_RUN_STATUS_RUNNING" if is_running else "CASCADE_RUN_STATUS_IDLE",
            "isRunning": is_running,
            "unread": is_unread,
            "pinned": is_pinned,
        }
        if is_pinned:
            pinned_items.append(item)

        if pid not in projects_map:
            projects_map[pid] = {
                "id": pid,
                "name": p_name,
                "folderPath": p_info.get("folderPath") or str(HOME),
                "totalCount": 0,
                "conversations": [],
            }
        projects_map[pid]["totalCount"] += 1
        if len(projects_map[pid]["conversations"]) < 100:
            projects_map[pid]["conversations"].append(item)

    # Thêm các hội thoại vừa tạo (optimistic) hoặc lưu cục bộ chưa kịp vào summaries.db
    for cid, c_conv in custom_convs.items():
        if cid in seen_cids or not isinstance(c_conv, dict):
            continue
        pid = str(c_conv.get("projectId") or primary_pid)
        if pid == "outside-of-project" or pid not in proj_cfg:
            pid = primary_pid
        p_info = proj_cfg.get(pid) or {"id": pid, "name": str(c_conv.get("projectName") or primary_proj.get("name") or "Workspace"), "folderPath": str(primary_proj.get("folderPath") or HOME)}
        proj_name = p_info["name"]
        mod_epoch = float(c_conv.get("lastModifiedEpoch") or now)
        is_pinned = bool(pinned_map.get(cid, c_conv.get("pinned", False)))
        is_running = bool(c_conv.get("isRunning", False)) and ((now - mod_epoch) < 120.0)
        item = {
            "id": cid,
            "title": str(c_conv.get("title") or f"Conversation {cid[:8]}"),
            "workspaceTag": "",
            "projectId": pid,
            "projectName": proj_name,
            "stepCount": len(c_conv.get("messages") or []),
            "lastModifiedEpoch": mod_epoch,
            "relativeTime": format_relative_time(mod_epoch, now),
            "status": "CASCADE_RUN_STATUS_RUNNING" if is_running else "CASCADE_RUN_STATUS_IDLE",
            "isRunning": is_running,
            "unread": False,
            "pinned": is_pinned,
        }
        if is_pinned:
            pinned_items.append(item)
        if pid not in projects_map:
            projects_map[pid] = {
                "id": pid,
                "name": proj_name,
                "folderPath": p_info.get("folderPath") or str(HOME),
                "totalCount": 0,
                "conversations": [],
            }
        projects_map[pid]["totalCount"] += 1
        projects_map[pid]["conversations"].insert(0, item)

    for p in projects_map.values():
        p["conversations"].sort(key=lambda x: -x["lastModifiedEpoch"])

    pinned_items.sort(key=lambda x: (0 if x["projectId"] == primary_pid else 1, -x["lastModifiedEpoch"]))

    projects_out = [
        p for p in projects_map.values() if p["totalCount"] > 0 or p["id"] in preferred_order[:2]
    ]
    if not projects_out:
        projects_out.append({
            "id": primary_pid,
            "name": str(primary_proj.get("name") or "Workspace"),
            "folderPath": str(primary_proj.get("folderPath") or HOME),
            "totalCount": 0,
            "conversations": [],
        })

    return {
        "host": {
            "id": HOST_NAME,
            "name": HOST_NAME,
            "online": True,
            "accountEmail": account_email,
            "accountTier": account_tier,
            "instances": [
                {
                    "id": i.name,
                    "name": HOST_NAME if i.name == "chinh" else f"{HOST_NAME} ({i.label})",
                    "label": f"{i.label} (PID {i.pid})",
                    "pid": i.pid,
                    "online": True,
                }
                for i in instances
            ] or [{"id": "chinh", "name": HOST_NAME, "label": "Antigravity (app chính)", "pid": 0, "online": True}],
        },
        "models": models_list,
        "pinnedConversations": pinned_items,
        "projects": projects_out,
        "generatedAt": int(now * 1000),
        "selfHosted": True,
    }


def read_local_conversation_detail(cid: str, cfg: dict, limit_steps: int = 180) -> dict:
    pinned_map = cfg.get("pinned", {})
    ann_map = load_annotations_map()
    proj_cfg = load_projects_config()
    custom_convs = cfg.get("customConvs", {})
    saved_custom = custom_convs.get(cid) if isinstance(custom_convs.get(cid), dict) else {}

    t_jsonl = BRAIN_DIR / cid / ".system_generated" / "logs" / "transcript.jsonl"
    t_full_jsonl = BRAIN_DIR / cid / ".system_generated" / "logs" / "transcript_full.jsonl"
    source_jsonl = t_full_jsonl if t_full_jsonl.exists() else t_jsonl
    db_path = CONV_DIR / f"{cid}.db"
    messages: list[dict] = []
    any_running_step = False
    plan_text = ""
    progress_text = ""

    if source_jsonl.exists():
        try:
            f_size = source_jsonl.stat().st_size
            with source_jsonl.open("rb") as fb:
                if f_size > 2 * 1024 * 1024:
                    fb.seek(f_size - 2 * 1024 * 1024)
                    fb.readline()
                raw_text = fb.read().decode("utf-8", errors="replace")
            lines = raw_text.splitlines()
            for idx, raw_line in enumerate(lines[-limit_steps:]):
                if not raw_line.strip():
                    continue
                try:
                    step = json.loads(raw_line)
                except Exception:
                    continue
                s_idx = int(step.get("step_index") or idx)
                stype = str(step.get("type") or "")
                st_status = str(step.get("status") or "DONE")
                if st_status == "RUNNING":
                    any_running_step = True
                ts_epoch = parse_iso_epoch(str(step.get("created_at") or "")) or time.time()
                ts_ms = int(ts_epoch * 1000)

                if stype == "USER_INPUT":
                    raw_c = str(step.get("content") or "")
                    content = clean_user_prompt_text(raw_c)
                    media_arr = []
                    for m in step.get("media") or []:
                        if isinstance(m, dict) and m.get("uri"):
                            u_path = str(m["uri"]).replace("file:///", "")
                            media_arr.append({
                                "name": str(m.get("description") or Path(u_path).name),
                                "mimeType": str(m.get("mime_type") or m.get("mimeType") or "image/png"),
                                "uri": u_path,
                                "url": f"/api/ag-companion/media?path={urllib.parse.quote(u_path, safe='')}",
                            })
                    if content or media_arr:
                        msg_obj: dict = {
                            "id": f"step_u_{s_idx}",
                            "idx": s_idx,
                            "role": "user",
                            "content": content,
                            "timestamp": ts_ms,
                        }
                        if media_arr:
                            msg_obj["media"] = media_arr
                        messages.append(msg_obj)

                elif stype == "PLANNER_RESPONSE":
                    content = str(step.get("content") or "").strip()
                    thinking = str(step.get("thinking") or "").strip()
                    for line_c in content.splitlines():
                        ls = line_c.strip()
                        if ls.startswith("Kế hoạch:"):
                            plan_text = ls
                        elif ls.startswith("Tiến độ:"):
                            progress_text = ls
                    tcs = []
                    for tc in step.get("tool_calls") or []:
                        if isinstance(tc, dict):
                            t_name = str(tc.get("name") or "tool")
                            args = tc.get("args") if isinstance(tc.get("args"), dict) else {}
                            cmd_str = str(args.get("CommandLine") or args.get("command") or "")
                            path_str = str(args.get("Path") or args.get("path") or args.get("TargetFile") or "")
                            sum_str = str(args.get("toolSummary") or args.get("Description") or t_name)
                            tcs.append({
                                "id": str(tc.get("id") or f"tc_{s_idx}"),
                                "stepIdx": s_idx,
                                "name": t_name,
                                "command": cmd_str,
                                "path": path_str,
                                "summary": sum_str,
                                "status": "running" if st_status == "RUNNING" else "success",
                                "output": "",
                            })
                    if content or thinking or tcs:
                        messages.append({
                            "id": f"step_a_{s_idx}",
                            "idx": s_idx,
                            "role": "assistant",
                            "content": content,
                            "thinking": thinking,
                            "thinkingSeconds": max(1, min(60, len(thinking) // 140)) if thinking else 0,
                            "toolCalls": tcs,
                            "completed": st_status == "DONE",
                            "timestamp": ts_ms,
                        })

                elif stype == "GENERIC":
                    res_out = str(step.get("content") or "").strip()
                    if res_out:
                        for m in reversed(messages):
                            if m.get("role") == "assistant" and m.get("toolCalls"):
                                for tc in reversed(m["toolCalls"]):
                                    if not tc.get("output"):
                                        tc["output"] = res_out[:2500]
                                        if st_status == "ERROR" or "exited with code 1" in res_out[:200]:
                                            tc["status"] = "failed"
                                        break
                                break
        except Exception:
            pass

    if not messages and db_path.exists():
        try:
            with sqlite3.connect(db_path.resolve().as_uri() + "?mode=ro", uri=True, timeout=3) as con:
                cols = {r[1] for r in con.execute("PRAGMA table_info(steps)").fetchall()}
                st_col = "step_status" if "step_status" in cols else "status"
                max_row = con.execute("SELECT MAX(idx) FROM steps").fetchone()
                total_db = (int(max_row[0]) + 1) if (max_row and max_row[0] is not None) else 0
                offset = max(0, total_db - limit_steps)
                rows = con.execute(
                    f"SELECT idx, step_type, {st_col}, metadata, step_payload FROM steps WHERE idx >= ? ORDER BY idx ASC",
                    (offset,),
                ).fetchall()
            for idx, stype_num, st_code, meta_blob, payload_blob in rows:
                p = pb_parse(payload_blob or b"") or {}
                m_parsed = pb_parse(meta_blob or b"") or {}
                secs = pb_get(m_parsed, 1, 1)
                ts_ms = int(secs * 1000) if isinstance(secs, int) and secs > 1_500_000_000 else int(time.time() * 1000)
                if stype_num == 14:
                    txt = pb_get(p, 19, 2)
                    if isinstance(txt, str) and txt.strip():
                        cleaned = clean_user_prompt_text(txt)
                        if cleaned:
                            messages.append({
                                "id": f"step_u_{idx}",
                                "idx": idx,
                                "role": "user",
                                "content": cleaned,
                                "timestamp": ts_ms,
                            })
                elif stype_num == 15:
                    txt = pb_get(p, 20, 1) or pb_get(p, 20, 8)
                    thinking = pb_get(p, 20, 3)
                    clean_txt = str(txt).strip() if isinstance(txt, str) else ""
                    clean_think = str(thinking).strip() if isinstance(thinking, str) else ""
                    if clean_txt or clean_think:
                        messages.append({
                            "id": f"step_a_{idx}",
                            "idx": idx,
                            "role": "assistant",
                            "content": clean_txt,
                            "thinking": clean_think,
                            "thinkingSeconds": max(1, len(clean_think) // 140) if clean_think else 0,
                            "toolCalls": [],
                            "completed": st_code in AG_SETTLED,
                            "timestamp": ts_ms,
                        })
        except Exception:
            pass

    if saved_custom and isinstance(saved_custom.get("messages"), list):
        for cm in saved_custom["messages"]:
            if isinstance(cm, dict) and str(cm.get("id") or "").startswith(("u_", "a_")):
                already = any(
                    m.get("role") == cm.get("role") and str(m.get("content") or "").strip() == str(cm.get("content") or "").strip()
                    for m in messages[-6:]
                )
                if not already:
                    messages.append(cm)

    opt = _optimistic_convs.get(cid)
    if opt and (time.time() - float(opt.get("createdAt") or 0)) < 45.0:
        opt_prompt = str(opt.get("prompt") or "").strip()
        opt_media = list(opt.get("media") or [])
        already = any(
            m.get("role") == "user" and str(m.get("content") or "").strip() == opt_prompt
            for m in messages[-6:]
        )
        if (opt_prompt or opt_media) and not already:
            opt_msg: dict = {
                "id": f"opt_u_{int(float(opt.get('createdAt') or time.time()) * 1000)}",
                "role": "user",
                "content": opt_prompt,
                "timestamp": int(float(opt.get("createdAt") or time.time()) * 1000),
            }
            if opt_media:
                opt_msg["media"] = opt_media
            messages.append(opt_msg)
            any_running_step = True

    primary_proj = get_primary_project_info(proj_cfg)
    primary_pid = str(primary_proj.get("id") or "default-cli-project")

    live_s = (_live_rpc_cache.get("summaries") or {}).get(cid) or {}
    title = str(
        live_s.get("summary")
        or (ann_map.get(cid) or {}).get("title")
        or saved_custom.get("title")
        or ""
    )
    proj_id = str(saved_custom.get("projectId") or primary_pid)
    status_db = str(live_s.get("status") or "")
    not_idle_db = 0
    if SUMMARIES_DB.exists():
        try:
            with sqlite3.connect(SUMMARIES_DB.resolve().as_uri() + "?mode=ro", uri=True, timeout=2) as con:
                row = con.execute(
                    "SELECT title, project_id, status, not_fully_idle FROM conversation_summaries WHERE conversation_id = ?",
                    (cid,),
                ).fetchone()
                if row:
                    title = title or str(row[0] or "")
                    if row[1] and str(row[1]).strip() and str(row[1]).strip() != "outside-of-project":
                        proj_id = str(row[1]).strip()
                    status_db = status_db or str(row[2] or "")
                    not_idle_db = int(row[3] or 0)
        except Exception:
            pass

    if not proj_id or proj_id == "outside-of-project":
        proj_id = primary_pid
    p_name = (proj_cfg.get(proj_id) or {}).get("name") or str(saved_custom.get("projectName") or primary_proj.get("name") or "Workspace")

    last_msg = messages[-1] if messages else {}
    last_tcs = last_msg.get("toolCalls") if isinstance(last_msg, dict) else []
    assistant_finished = (
        bool(messages)
        and last_msg.get("role") == "assistant"
        and bool(last_msg.get("completed"))
        and not any(isinstance(tc, dict) and tc.get("status") == "running" for tc in (last_tcs or []))
    )

    if assistant_finished and not any_running_step and "RUNNING" not in status_db and not not_idle_db:
        _optimistic_convs.pop(cid, None)
        if saved_custom and saved_custom.get("isRunning"):
            saved_custom["isRunning"] = False
            save_config(cfg)

    custom_running = (
        bool(saved_custom.get("isRunning", False))
        and not assistant_finished
        and ((time.time() - float(saved_custom.get("lastModifiedEpoch") or 0)) < 45.0)
    )

    is_running = (
        any_running_step
        or "RUNNING" in status_db
        or bool(not_idle_db)
        or custom_running
    )
    if t_jsonl.exists() and not assistant_finished:
        try:
            if (time.time() - t_jsonl.stat().st_mtime) < 8.0:
                is_running = True
        except OSError:
            pass

    is_pinned = (
        bool(pinned_map[cid])
        if cid in pinned_map
        else (bool(_pinned_overrides[cid]) if cid in _pinned_overrides else bool((ann_map.get(cid) or {}).get("pinned", False)))
    )

    return {
        "id": cid,
        "title": title or f"Conversation {cid[:8]}",
        "projectId": proj_id,
        "projectName": p_name,
        "status": "CASCADE_RUN_STATUS_RUNNING" if is_running else "CASCADE_RUN_STATUS_IDLE",
        "isRunning": is_running,
        "pinned": is_pinned,
        "stepCount": len(messages),
        "planText": plan_text,
        "progressText": progress_text,
        "messages": messages,
    }


def save_and_prepare_media(
    inst: LocalAgInstance | None,
    cid: str,
    media_list: list | None,
) -> tuple[list[dict], list[dict], list[str]]:
    if not media_list or not isinstance(media_list, list):
        return [], [], []
    safe_cid = re.sub(r"[^a-zA-Z0-9_.-]", "_", str(cid or "general"))
    dest_dir = (BRAIN_DIR / safe_cid / ".user_uploaded") if re.fullmatch(r"[0-9a-fA-F-]{36}", safe_cid) else (UPLOADS_DIR / safe_cid)
    dest_dir.mkdir(parents=True, exist_ok=True)

    ui_items: list[dict] = []
    cascade_media: list[dict] = []
    file_notes: list[str] = []

    for idx, item in enumerate(media_list[:10]):
        if not isinstance(item, dict):
            continue
        orig_name = str(item.get("name") or f"media_{idx + 1}.png").strip()
        safe_name = re.sub(r"[^a-zA-Z0-9_.-]", "_", orig_name) or f"media_{idx + 1}.png"
        ext = Path(safe_name).suffix.lower()
        if ext in {".exe", ".bat", ".cmd", ".ps1", ".vbs", ".scr", ".dll"}:
            safe_name += ".txt"
        mime_type = str(item.get("mimeType") or "").strip().lower()
        data_url = str(item.get("dataUrl") or item.get("base64") or "").strip()
        if not data_url:
            continue
        b64_str = data_url.split(",", 1)[1].strip() if data_url.startswith("data:") and "," in data_url else data_url
        if not mime_type:
            mime_type = mimetypes.guess_type(safe_name)[0] or "application/octet-stream"
        try:
            pad = (-len(b64_str)) % 4
            b64_padded = b64_str + ("=" * pad)
            raw_bytes = base64.b64decode(b64_padded)
        except Exception:
            continue
        fpath = dest_dir / f"media_{int(time.time() * 1000)}_{idx}_{safe_name}"
        fpath.write_bytes(raw_bytes)
        posix_path = fpath.as_posix()

        ui_items.append({
            "name": orig_name,
            "mimeType": mime_type,
            "uri": posix_path,
            "url": f"/api/ag-companion/media?path={urllib.parse.quote(posix_path, safe='')}",
            "size": len(raw_bytes),
        })

        if inst is not None and (mime_type.startswith("image/") or len(raw_bytes) <= 15 * 1024 * 1024):
            try:
                art = inst.rpc(
                    "SaveMediaAsArtifact",
                    {"media": {"mimeType": mime_type, "inlineData": b64_padded, "description": orig_name}},
                    timeout=12,
                )
                art_uri = str((art or {}).get("uri") or posix_path)
                cascade_media.append({
                    "mimeType": mime_type,
                    "inlineData": b64_padded,
                    "uri": art_uri,
                    "description": orig_name,
                })
            except Exception:
                if mime_type.startswith("image/"):
                    cascade_media.append({
                        "mimeType": mime_type,
                        "inlineData": b64_padded,
                        "uri": posix_path,
                        "description": orig_name,
                    })

        file_notes.append(f"- `{orig_name}` ({mime_type}): `{posix_path}`")

    return ui_items, cascade_media, file_notes


def is_safe_media_path(fpath: Path) -> bool:
    """Kiểm tra nghiêm ngặt: chỉ cho phép đọc file media nằm trong BRAIN_DIR hoặc UPLOADS_DIR và không thuộc danh sách đuôi nhạy cảm."""
    try:
        resolved = fpath.resolve()
    except Exception:
        return False
    if not resolved.is_file():
        return False
    if resolved.suffix.lower() in BLOCKED_MEDIA_EXTENSIONS or resolved.name.lower().startswith(".env"):
        return False
    allowed_roots = []
    for root in (BRAIN_DIR, UPLOADS_DIR):
        try:
            allowed_roots.append(root.resolve())
        except Exception:
            continue
    for root in allowed_roots:
        try:
            resolved.relative_to(root)
            return True
        except ValueError:
            continue
    return False


# ============================================================================
# 6. CLOUDFLARE QUICK TUNNEL (ĐIỀU KHIỂN QUA 4G/5G KHÔNG CẦN MỞ PORT MODEM)
# ============================================================================

def ensure_cloudflared_binary() -> Path:
    exe_name = "cloudflared.exe" if os.name == "nt" else "cloudflared"
    sys_cf = shutil.which(exe_name)
    if sys_cf:
        return Path(sys_cf)
    local_cf = BIN_DIR / exe_name
    if local_cf.exists() and local_cf.stat().st_size > 1_000_000:
        return local_cf

    BIN_DIR.mkdir(parents=True, exist_ok=True)
    if os.name == "nt":
        dl_url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    elif sys.platform == "darwin":
        dl_url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz"
    else:
        dl_url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"

    req = urllib.request.Request(dl_url, headers={"User-Agent": "Antigravity-Mobile-Companion/2.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        local_cf.write_bytes(resp.read())
    if os.name != "nt":
        os.chmod(local_cf, 0o755)
    return local_cf


def _sync_runtime_state_file() -> None:
    try:
        COMPANION_DATA_DIR.mkdir(parents=True, exist_ok=True)
        port_val = int(APP_CONFIG.get("port") or DEFAULT_PORT)
        pin_val = str(APP_CONFIG.get("pin") or "")
        ips = get_lan_and_tailscale_ips()
        tun_base = str(_tunnel_state.get("url") or "")
        tun_running = bool(_tunnel_state.get("running") and tun_base)
        tun_url = f"{tun_base}/?pin={pin_val}" if tun_running and pin_val else ""
        payload = {
            "pid": os.getpid(),
            "updatedAt": int(time.time()),
            "version": COMPANION_RUNTIME_VERSION,
            "hostName": HOST_NAME,
            "antigravityDir": str(ANTIGRAVITY_DIR),
            "port": port_val,
            "pin": pin_val,
            "allowLan": bool(APP_CONFIG.get("allowLan", True)),
            "localUrl": f"http://127.0.0.1:{port_val}/?pin={pin_val}" if pin_val else f"http://127.0.0.1:{port_val}/",
            "lanUrl": f"http://{ips['lan_ip']}:{port_val}/?pin={pin_val}" if pin_val else f"http://{ips['lan_ip']}:{port_val}/",
            "tailscaleUrl": (f"http://{ips['tailscale_ip']}:{port_val}/?pin={pin_val}" if ips.get("tailscale_ip") else ""),
            "tunnelRunning": tun_running,
            "tunnelBaseUrl": tun_base,
            "tunnelUrl": tun_url,
            "tunnelError": str(_tunnel_state.get("error") or ""),
        }
        tmp_file = RUNTIME_STATE_FILE.with_suffix(".tmp")
        tmp_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp_file.replace(RUNTIME_STATE_FILE)
    except Exception:
        pass


def _tunnel_watchdog_loop() -> None:
    while True:
        time.sleep(6.0)
        try:
            wanted = bool(_tunnel_state.get("wanted"))
            port_val = int(_tunnel_state.get("localPort") or 0)
            proc = _tunnel_state.get("process")
            if wanted and port_val > 0:
                if proc is None or proc.poll() is not None:
                    append_security_audit("TUNNEL_AUTOHEAL", "127.0.0.1", "Phát hiện cloudflared bị ngắt, đang tự động nối lại đường hầm 4G/5G...", "warn")
                    start_cloudflare_quick_tunnel(port_val)
        except Exception:
            pass


def start_cloudflare_quick_tunnel(local_port: int) -> dict:
    with _tunnel_lock:
        _tunnel_state["wanted"] = True
        _tunnel_state["localPort"] = int(local_port)
        if not _tunnel_watchdog_started[0]:
            _tunnel_watchdog_started[0] = True
            threading.Thread(target=_tunnel_watchdog_loop, daemon=True, name="ag-companion-tunnel-watchdog").start()

        proc = _tunnel_state.get("process")
        if _tunnel_state.get("running") and proc and proc.poll() is None and _tunnel_state.get("url"):
            _sync_runtime_state_file()
            return {"ok": True, "running": True, "url": _tunnel_state["url"]}

        if proc and proc.poll() is None:
            try:
                proc.terminate()
            except Exception:
                pass

        _tunnel_state["error"] = ""
        try:
            cf_bin = ensure_cloudflared_binary()
        except Exception as e:
            _tunnel_state["error"] = f"Không tải được cloudflared: {e}"
            _sync_runtime_state_file()
            return {"ok": False, "running": False, "error": _tunnel_state["error"]}

        cmd = [str(cf_bin), "tunnel", "--no-autoupdate", "--url", f"http://127.0.0.1:{local_port}"]
        spawn_flags = NO_WINDOW | (0x00000200 if os.name == "nt" else 0)
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                creationflags=spawn_flags,
            )
        except Exception as e:
            _tunnel_state["error"] = str(e)
            _sync_runtime_state_file()
            return {"ok": False, "running": False, "error": str(e)}

        _tunnel_state["process"] = proc
        _tunnel_state["running"] = True
        _tunnel_state["url"] = ""
        _tunnel_state["startedAt"] = int(time.time())

        found_event = threading.Event()

        def _reader() -> None:
            assert proc.stdout is not None
            for line in proc.stdout:
                m = re.search(r"(https://[a-zA-Z0-9-]+\.trycloudflare\.com)", line)
                if m:
                    _tunnel_state["url"] = m.group(1)
                    found_event.set()
                    _sync_runtime_state_file()
            _tunnel_state["running"] = False
            _sync_runtime_state_file()

        threading.Thread(target=_reader, daemon=True).start()
        found_event.wait(timeout=18.0)
        _sync_runtime_state_file()
        if _tunnel_state["url"]:
            append_security_audit("TUNNEL_STARTED", "127.0.0.1", f"Đã bật Cloudflare Quick Tunnel: {_tunnel_state['url']}", "info")
            return {"ok": True, "running": True, "url": _tunnel_state["url"]}
        return {"ok": False, "running": proc.poll() is None, "error": "Đang khởi tạo đường hầm Cloudflare, vui lòng thử lại sau vài giây."}


def stop_cloudflare_quick_tunnel() -> dict:
    with _tunnel_lock:
        _tunnel_state["wanted"] = False
        proc = _tunnel_state.get("process")
        if proc and proc.poll() is None:
            try:
                proc.terminate()
            except Exception:
                pass
        _tunnel_state["running"] = False
        _tunnel_state["url"] = ""
        _tunnel_state["process"] = None
        _sync_runtime_state_file()
        append_security_audit("TUNNEL_STOPPED", "127.0.0.1", "Đã ngắt đường hầm 4G/5G Cloudflare Quick Tunnel", "warn")
        return {"ok": True, "running": False, "url": ""}


# ============================================================================
# 6B. BỘ CHỐNG TRỄ LỆNH (TTL GUARD), CHỐNG LẶP (IDEMPOTENCY) & DEEP HEALTH
# ============================================================================

def _ensure_cmd_state_table() -> None:
    try:
        COMPANION_DATA_DIR.mkdir(parents=True, exist_ok=True)
        with _cmd_state_lock, contextlib.closing(sqlite3.connect(str(CMD_STATE_DB), timeout=5)) as conn:
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS ag_companion_cmd_state (
                    cmd_id TEXT PRIMARY KEY,
                    action_type TEXT NOT NULL,
                    payload_sha256 TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL,
                    conversation_id TEXT DEFAULT '',
                    created_at_ms INTEGER NOT NULL,
                    expires_at_ms INTEGER NOT NULL,
                    claimed_at_ms INTEGER DEFAULT 0,
                    completed_at_ms INTEGER DEFAULT 0,
                    cancelled_at_ms INTEGER DEFAULT 0,
                    response_json TEXT DEFAULT '',
                    error_message TEXT DEFAULT ''
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_cmd_state_status_exp ON ag_companion_cmd_state(status, expires_at_ms);")
            conn.commit()
    except Exception:
        pass


def _compute_cmd_payload_sha256(action_type: str, body: dict) -> str:
    raw_media = body.get("media") if isinstance(body.get("media"), list) else []
    media_digests: list[str] = []
    for item in raw_media[:20]:
        if isinstance(item, dict):
            m_name = str(item.get("name") or "").strip()
            m_mime = str(item.get("mimeType") or item.get("type") or "").strip()
            m_data = str(item.get("dataUrl") or item.get("base64") or item.get("data") or "")
            m_hash = hashlib.sha256(m_data.encode("utf-8", errors="ignore")).hexdigest()[:24]
            media_digests.append(f"{m_name}:{m_mime}:{len(m_data)}:{m_hash}")
        else:
            media_digests.append(str(item)[:64])
    norm = {
        "action": str(action_type or "").strip().lower(),
        "conversationId": str(body.get("conversationId") or "").strip(),
        "projectId": str(body.get("projectId") or "").strip(),
        "title": str(body.get("title") or "").strip(),
        "prompt": str(body.get("prompt") or body.get("text") or "").strip(),
        "model": str(body.get("model") or "").strip(),
        "app": str(body.get("app") or body.get("appId") or "").strip().lower(),
        "mediaDigests": media_digests,
    }
    raw = json.dumps(norm, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _get_cmd_effect_checkpoint(cmd_id: str) -> dict:
    cid_clean = str(cmd_id or "").strip()
    if not cid_clean:
        return {}
    _ensure_cmd_state_table()
    try:
        with _cmd_state_lock, contextlib.closing(sqlite3.connect(str(CMD_STATE_DB), timeout=5)) as conn:
            row = conn.execute(
                "SELECT conversation_id, response_json FROM ag_companion_cmd_state WHERE cmd_id = ?",
                (cid_clean,),
            ).fetchone()
            if not row:
                return {}
            conv_id, resp_json = row
            parsed = json.loads(resp_json) if resp_json else {}
            if not isinstance(parsed, dict):
                parsed = {}
            if conv_id and not parsed.get("conversationId"):
                parsed["conversationId"] = str(conv_id)
            return parsed
    except Exception:
        return {}


def _save_cmd_effect_checkpoint(cmd_id: str, checkpoint: dict) -> None:
    cid_clean = str(cmd_id or "").strip()
    if not cid_clean or not isinstance(checkpoint, dict):
        return
    _ensure_cmd_state_table()
    conv_id = str(checkpoint.get("conversationId") or "").strip()
    try:
        with _cmd_state_lock, contextlib.closing(sqlite3.connect(str(CMD_STATE_DB), timeout=5)) as conn:
            conn.execute(
                """
                UPDATE ag_companion_cmd_state
                SET conversation_id = COALESCE(NULLIF(?, ''), conversation_id),
                    response_json = ?
                WHERE cmd_id = ? AND status = 'PROCESSING'
                """,
                (conv_id, json.dumps(checkpoint, ensure_ascii=False), cid_clean),
            )
            conn.commit()
    except Exception:
        pass


def _extract_cmd_timestamps(body: dict) -> tuple[int, int]:
    now_ms = int(time.time() * 1000)
    raw_created = body.get("createdAtMs") or body.get("clientTimestampMs") or body.get("timestamp")
    try:
        created_ms = int(float(raw_created)) if raw_created is not None else now_ms
        if created_ms < 1_000_000_000_000:
            created_ms *= 1000
    except Exception:
        created_ms = now_ms

    raw_ttl = body.get("ttlMs")
    try:
        ttl_ms = max(15_000, min(600_000, int(float(raw_ttl)))) if raw_ttl is not None else CMD_TTL_MS
    except Exception:
        ttl_ms = CMD_TTL_MS

    raw_expires = body.get("expiresAtMs")
    try:
        expires_ms = int(float(raw_expires)) if raw_expires is not None else (created_ms + ttl_ms)
        if expires_ms < 1_000_000_000_000:
            expires_ms *= 1000
    except Exception:
        expires_ms = created_ms + ttl_ms

    return created_ms, expires_ms


def _cancel_pending_cmd_by_id(cmd_id: str, conversation_id: str = "") -> dict:
    cid_clean = str(cmd_id or "").strip()
    if not cid_clean:
        return {"ok": False, "error": "Missing cmdId"}
    _ensure_cmd_state_table()
    now_ms = int(time.time() * 1000)
    try:
        with _cmd_state_lock, contextlib.closing(sqlite3.connect(str(CMD_STATE_DB), timeout=5)) as conn:
            row = conn.execute(
                "SELECT status, conversation_id FROM ag_companion_cmd_state WHERE cmd_id = ?",
                (cid_clean,),
            ).fetchone()
            if row:
                cur_status, cur_conv = row
                if cur_status == "COMPLETED":
                    return {
                        "ok": True,
                        "cmdId": cid_clean,
                        "status": "ALREADY_COMPLETED",
                        "conversationId": cur_conv or conversation_id,
                    }
                conn.execute(
                    """
                    UPDATE ag_companion_cmd_state
                    SET status = 'CANCELLED', cancelled_at_ms = ?, error_message = 'Cancelled by user/client'
                    WHERE cmd_id = ?
                    """,
                    (now_ms, cid_clean),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO ag_companion_cmd_state
                    (cmd_id, action_type, payload_sha256, status, conversation_id, created_at_ms, expires_at_ms, cancelled_at_ms, error_message)
                    VALUES (?, 'cancel_tombstone', '', 'CANCELLED', ?, ?, ?, ?, 'Cancelled before arrival')
                    """,
                    (cid_clean, conversation_id, now_ms, now_ms + CMD_TTL_MS, now_ms),
                )
            conn.commit()
    except Exception as e:
        return {"ok": False, "cmdId": cid_clean, "error": str(e)}
    return {"ok": True, "cmdId": cid_clean, "status": "CANCELLED", "conversationId": conversation_id}


def _execute_with_cmd_idempotency(action_type: str, body: dict, handler_fn) -> tuple[dict, int]:
    now_ms = int(time.time() * 1000)
    created_ms, expires_ms = _extract_cmd_timestamps(body)
    cmd_id = str(body.get("cmdId") or body.get("commandId") or body.get("requestId") or "").strip()
    payload_sha256 = _compute_cmd_payload_sha256(action_type, body)

    if now_ms > expires_ms:
        age_sec = round((now_ms - created_ms) / 1000.0, 1)
        _worker_telemetry["commands_expired_total"] = int(_worker_telemetry.get("commands_expired_total") or 0) + 1
        err_obj = {
            "ok": False,
            "expired": True,
            "cmdId": cmd_id or None,
            "error": f"Lệnh đã quá hạn ({age_sec}s > TTL) do nghẽn kết nối trước đó nên bị chặn để tránh tự chạy muộn trên PC.",
        }
        if cmd_id:
            _ensure_cmd_state_table()
            try:
                with _cmd_state_lock, contextlib.closing(sqlite3.connect(str(CMD_STATE_DB), timeout=5)) as conn:
                    conn.execute(
                        """
                        INSERT OR IGNORE INTO ag_companion_cmd_state
                        (cmd_id, action_type, payload_sha256, status, created_at_ms, expires_at_ms, error_message, response_json)
                        VALUES (?, ?, ?, 'EXPIRED', ?, ?, ?, ?)
                        """,
                        (cmd_id, action_type, payload_sha256, created_ms, expires_ms, err_obj["error"], json.dumps(err_obj, ensure_ascii=False)),
                    )
                    conn.commit()
            except Exception:
                pass
        return err_obj, 408

    if not cmd_id:
        res_obj, status_code = handler_fn()
        if status_code < 400 and isinstance(res_obj, dict) and res_obj.get("ok"):
            _worker_telemetry["commands_processed_total"] = int(_worker_telemetry.get("commands_processed_total") or 0) + 1
        else:
            _worker_telemetry["commands_failed_total"] = int(_worker_telemetry.get("commands_failed_total") or 0) + 1
        return res_obj, status_code

    _ensure_cmd_state_table()
    try:
        with _cmd_state_lock, contextlib.closing(sqlite3.connect(str(CMD_STATE_DB), timeout=5)) as conn:
            row = conn.execute(
                """
                SELECT action_type, payload_sha256, status, claimed_at_ms, response_json, error_message, conversation_id
                FROM ag_companion_cmd_state WHERE cmd_id = ?
                """,
                (cmd_id,),
            ).fetchone()
            if row:
                stored_action, stored_hash, status, claimed_at_ms, resp_json, err_msg, stored_cid = row
                if status != "CANCELLED" and stored_hash and stored_hash != payload_sha256:
                    _worker_telemetry["commands_failed_total"] = int(_worker_telemetry.get("commands_failed_total") or 0) + 1
                    return {
                        "ok": False,
                        "cmdId": cmd_id,
                        "payloadMismatch": True,
                        "error": f"Xung đột Idempotency: cmdId '{cmd_id}' đã được dùng cho một nội dung lệnh khác ({stored_action}).",
                    }, 409
                if status == "CANCELLED":
                    return {
                        "ok": False,
                        "cancelled": True,
                        "cmdId": cmd_id,
                        "error": "Lệnh này đã bị hủy trước khi thực thi.",
                    }, 409
                if status == "EXPIRED":
                    return {
                        "ok": False,
                        "expired": True,
                        "cmdId": cmd_id,
                        "error": err_msg or "Lệnh đã hết hạn TTL.",
                    }, 408
                if status == "COMPLETED" and resp_json:
                    try:
                        cached = json.loads(resp_json)
                        cached["deduplicated"] = True
                        cached["cmdId"] = cmd_id
                        _worker_telemetry["commands_deduplicated_total"] = int(_worker_telemetry.get("commands_deduplicated_total") or 0) + 1
                        return cached, 200
                    except Exception:
                        pass
                if status == "PROCESSING":
                    cp_existing: dict = {}
                    if resp_json:
                        try:
                            cp_existing = json.loads(resp_json) if resp_json else {}
                        except Exception:
                            cp_existing = {}
                    if isinstance(cp_existing, dict) and cp_existing.get("stage") in ("start_intent", "send_intent", "cli_new_intent") and not cp_existing.get("ok"):
                        if (now_ms - int(claimed_at_ms or 0)) < CMD_CLAIM_LEASE_MS:
                            return {
                                "ok": False,
                                "inProgress": True,
                                "cmdId": cmd_id,
                                "conversationId": stored_cid or cp_existing.get("conversationId") or "",
                                "error": "Lệnh đang được xử lý trên PC, vui lòng đợi phản hồi.",
                            }, 409
                        return {
                            "ok": False,
                            "ambiguous": True,
                            "cmdId": cmd_id,
                            "conversationId": stored_cid or cp_existing.get("conversationId") or "",
                            "stage": cp_existing.get("stage"),
                            "error": "Lệnh trước đó đang ở trạng thái chờ xác nhận từ Antigravity IDE (in-doubt). Đã khóa phát lại tự động để chống tạo/gửi trùng 2 lần.",
                        }, 409
                    if (now_ms - int(claimed_at_ms or 0)) < CMD_CLAIM_LEASE_MS:
                        return {
                            "ok": False,
                            "inProgress": True,
                            "cmdId": cmd_id,
                            "conversationId": stored_cid,
                            "error": "Lệnh đang được xử lý trên PC, vui lòng đợi giây lát.",
                        }, 409
                conn.execute(
                    """
                    UPDATE ag_companion_cmd_state
                    SET action_type = ?, payload_sha256 = ?, status = 'PROCESSING', claimed_at_ms = ?, expires_at_ms = ?
                    WHERE cmd_id = ?
                    """,
                    (action_type, payload_sha256, now_ms, expires_ms, cmd_id),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO ag_companion_cmd_state
                    (cmd_id, action_type, payload_sha256, status, created_at_ms, expires_at_ms, claimed_at_ms)
                    VALUES (?, ?, ?, 'PROCESSING', ?, ?, ?)
                    """,
                    (cmd_id, action_type, payload_sha256, created_ms, expires_ms, now_ms),
                )
            conn.commit()
    except Exception:
        pass

    res_obj, status_code = handler_fn()
    done_ms = int(time.time() * 1000)

    if isinstance(res_obj, dict):
        res_obj["cmdId"] = cmd_id

    try:
        with _cmd_state_lock, contextlib.closing(sqlite3.connect(str(CMD_STATE_DB), timeout=5)) as conn:
            row_after = conn.execute(
                "SELECT status FROM ag_companion_cmd_state WHERE cmd_id = ?",
                (cmd_id,),
            ).fetchone()
            if row_after and row_after[0] == "CANCELLED":
                res_cid = str((res_obj or {}).get("conversationId") or "").strip()
                if res_cid:
                    for inst in discover_local_antigravity_instances():
                        try:
                            inst.rpc("CancelCascadeInvocation", {"cascadeId": res_cid}, timeout=4)
                        except Exception:
                            pass
                return {
                    "ok": False,
                    "cancelled": True,
                    "cmdId": cmd_id,
                    "conversationId": res_cid,
                    "error": "Lệnh đã được thu hồi/hủy ngay khi hoàn tất.",
                }, 409

            if status_code < 400 and isinstance(res_obj, dict) and res_obj.get("ok"):
                _worker_telemetry["commands_processed_total"] = int(_worker_telemetry.get("commands_processed_total") or 0) + 1
                conn.execute(
                    """
                    UPDATE ag_companion_cmd_state
                    SET status = 'COMPLETED',
                        completed_at_ms = ?,
                        conversation_id = ?,
                        response_json = ?
                    WHERE cmd_id = ?
                    """,
                    (
                        done_ms,
                        str(res_obj.get("conversationId") or ""),
                        json.dumps(res_obj, ensure_ascii=False),
                        cmd_id,
                    ),
                )
            else:
                _worker_telemetry["commands_failed_total"] = int(_worker_telemetry.get("commands_failed_total") or 0) + 1
                err_txt = str((res_obj or {}).get("error") or f"HTTP {status_code}")
                conn.execute(
                    """
                    UPDATE ag_companion_cmd_state
                    SET status = 'FAILED',
                        completed_at_ms = ?,
                        error_message = ?,
                        response_json = ?
                    WHERE cmd_id = ?
                    """,
                    (done_ms, err_txt, json.dumps(res_obj or {}, ensure_ascii=False), cmd_id),
                )
            conn.commit()
    except Exception:
        pass

    return res_obj, status_code


def _build_health_status() -> dict:
    now_ms = int(time.time() * 1000)
    instances = discover_local_antigravity_instances()
    ide_ready = len(instances) > 0
    ws_t = _ws_thread_ref[0]
    ws_alive = bool(ws_t is not None and ws_t.is_alive())
    last_ws_ms = int(_worker_telemetry.get("last_ws_loop_at_ms") or 0)
    ws_Loop_age_ms = (now_ms - last_ws_ms) if last_ws_ms > 0 else -1
    ws_healthy = ws_alive and (ws_Loop_age_ms < 15_000)
    with _ws_lock:
        ws_count = len(_ws_clients)

    return {
        "ok": ws_healthy,
        "status": "ready" if (ws_healthy and ide_ready) else ("degraded_no_ide" if ws_healthy else "unhealthy"),
        "version": COMPANION_RUNTIME_VERSION,
        "host": HOST_NAME,
        "pid": os.getpid(),
        "uptimeSec": int((now_ms - int(_worker_telemetry.get("started_at_ms") or now_ms)) / 1000),
        "ideReady": ide_ready,
        "ideInstancesCount": len(instances),
        "ideApps": [
            {
                "pid": getattr(i, "pid", 0),
                "port": getattr(i, "https_port", None) or getattr(i, "grpc_port", None) or (i.ports[0] if getattr(i, "ports", None) else 0),
            }
            for i in instances
        ],
        "workers": {
            "wsWatcherAlive": ws_alive,
            "wsWatcherHealthy": ws_healthy,
            "lastWsLoopAgeMs": ws_Loop_age_ms,
            "wsClientsConnected": ws_count,
        },
        "telemetry": {
            "commandsProcessed": int(_worker_telemetry.get("commands_processed_total") or 0),
            "commandsExpired": int(_worker_telemetry.get("commands_expired_total") or 0),
            "commandsDeduplicated": int(_worker_telemetry.get("commands_deduplicated_total") or 0),
            "commandsFailed": int(_worker_telemetry.get("commands_failed_total") or 0),
            "lastRpcOkAtMs": int(_worker_telemetry.get("last_rpc_ok_at_ms") or 0),
            "lastRpcError": str(_worker_telemetry.get("last_rpc_error") or ""),
        },
        "cmdTtlMs": CMD_TTL_MS,
        "timestamp": now_ms,
    }


# ============================================================================
# 7. HTTP + WEBSOCKET SERVER BẢO MẬT CAO (CHỐNG BRUTE-FORCE, SESSION TOKEN, SANDBOX)
# ============================================================================

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = os.name != "nt"


class CompanionRequestHandler(http.server.BaseHTTPRequestHandler):
    server_version = "AntigravityCompanionSelfHost/2.2"

    def log_message(self, fmt: str, *args) -> None:
        return

    def _client_ip_and_via(self) -> tuple[str, str]:
        raw_ip = str(self.client_address[0] if self.client_address else "127.0.0.1")
        cf_ip = str(self.headers.get("CF-Connecting-IP") or "").strip()
        if cf_ip and raw_ip in ("127.0.0.1", "::1"):
            return cf_ip, "4G/5G Cloudflare Tunnel"
        if raw_ip in ("127.0.0.1", "::1"):
            return "127.0.0.1", "PC Localhost"
        if raw_ip.startswith("100."):
            return raw_ip, "Tailscale VPN"
        return raw_ip, "Wi-Fi LAN"

    def _is_lan_blocked(self) -> bool:
        raw_ip = str(self.client_address[0] if self.client_address else "127.0.0.1")
        if raw_ip in ("127.0.0.1", "::1"):
            return False
        return not bool(APP_CONFIG.get("allowLan", True))

    def _send_security_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Companion-Pin, X-Companion-Session")

    def _send_json(self, obj: dict, status: int = 200) -> None:
        raw = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self._send_security_headers()
        self.end_headers()
        self.wfile.write(raw)

    def _check_rate_limit(self, client_ip: str) -> tuple[bool, int]:
        now = time.time()
        with _auth_lock:
            unlock_at = _locked_ips.get(client_ip, 0.0)
            if unlock_at > now:
                return False, int(unlock_at - now)
            if unlock_at:
                _locked_ips.pop(client_ip, None)
            return True, 0

    def _record_auth_failure(self, client_ip: str, via: str) -> int:
        now = time.time()
        with _auth_lock:
            hist = [t for t in _failed_attempts.get(client_ip, []) if (now - t) < FAILED_WINDOW_SEC]
            hist.append(now)
            _failed_attempts[client_ip] = hist
            remaining = max(0, MAX_FAILED_ATTEMPTS - len(hist))
            if len(hist) >= MAX_FAILED_ATTEMPTS:
                _locked_ips[client_ip] = now + LOCKOUT_DURATION_SEC
                _failed_attempts.pop(client_ip, None)
                append_security_audit(
                    "BRUTE_FORCE_LOCKED",
                    client_ip,
                    f"Khóa tạm 5 phút IP {client_ip} ({via}) do nhập sai PIN {MAX_FAILED_ATTEMPTS} lần liên tiếp",
                    "danger",
                )
            else:
                append_security_audit(
                    "AUTH_FAILED",
                    client_ip,
                    f"Nhập sai mã PIN từ {client_ip} ({via}) — còn {remaining} lần thử",
                    "warn",
                )
            return remaining

    def _issue_session_token(self, client_ip: str, via: str) -> str:
        now = time.time()
        ua = str(self.headers.get("User-Agent") or "Unknown Device")[:120]
        with _auth_lock:
            _failed_attempts.pop(client_ip, None)
            for tok, info in list(_active_sessions.items()):
                if (now - float(info.get("lastSeen") or 0)) > SESSION_TTL_SEC:
                    _active_sessions.pop(tok, None)
                    continue
                if info.get("ip") == client_ip and info.get("ua") == ua:
                    info["lastSeen"] = now
                    return tok
            tok = f"ags_{secrets.token_urlsafe(32)}"
            _active_sessions[tok] = {
                "tokenId": tok[:12] + "...",
                "ip": client_ip,
                "via": via,
                "ua": ua,
                "createdAt": int(now * 1000),
                "lastSeen": now,
            }
            append_security_audit("SESSION_GRANTED", client_ip, f"Mở khóa thành công từ {via} ({ua[:50]})", "info")
            return tok

    def _authenticate(self, parsed_url: urllib.parse.SplitResult) -> tuple[bool, int, str]:
        """Trả về (authorized, http_status_if_failed, message)."""
        if self._is_lan_blocked():
            client_ip, via = self._client_ip_and_via()
            append_security_audit("LAN_BLOCKED", client_ip, f"Chặn kết nối LAN từ {client_ip} do bật chế độ Chỉ Localhost/Tunnel", "warn")
            return False, 403, "Chế độ bảo mật hiện tại đang tắt truy cập qua mạng Wi-Fi LAN."

        client_ip, via = self._client_ip_and_via()
        allowed_rate, retry_after = self._check_rate_limit(client_ip)
        if not allowed_rate:
            return False, 429, f"Quá nhiều lần thử sai mã PIN. Tạm khóa IP {client_ip} trong {retry_after} giây để bảo vệ PC."

        expected_pin = str(APP_CONFIG.get("pin") or "").strip()
        if not expected_pin:
            return True, 200, ""

        qs = urllib.parse.parse_qs(parsed_url.query)
        candidate = (qs.get("pin") or qs.get("token") or qs.get("key") or [""])[0].strip()
        if not candidate:
            auth = str(self.headers.get("Authorization") or "").strip()
            if auth.lower().startswith("bearer "):
                candidate = auth[7:].strip()
            else:
                candidate = str(self.headers.get("X-Companion-Session") or self.headers.get("X-Companion-Pin") or "").strip()

        if not candidate:
            return False, 401, "Vui lòng nhập mã PIN 6 số để kết nối."

        if candidate.startswith("ags_"):
            with _auth_lock:
                for tok, info in list(_active_sessions.items()):
                    if hmac.compare_digest(tok, candidate):
                        if (time.time() - float(info.get("lastSeen") or 0)) <= SESSION_TTL_SEC:
                            info["lastSeen"] = time.time()
                            return True, 200, ""
                        _active_sessions.pop(tok, None)
            return False, 401, "Phiên bảo mật đã hết hạn hoặc mã PIN đã được đổi mới."

        if hmac.compare_digest(candidate.encode("utf-8"), expected_pin.encode("utf-8")):
            with _auth_lock:
                _failed_attempts.pop(client_ip, None)
            return True, 200, ""

        rem = self._record_auth_failure(client_ip, via)
        if rem == 0:
            return False, 429, f"Bạn đã nhập sai {MAX_FAILED_ATTEMPTS} lần. IP {client_ip} bị khóa tạm 5 phút."
        return False, 401, f"Mã PIN bảo mật không chính xác (còn {rem} lần thử)."

    def _handle_websocket_upgrade(self, parsed: urllib.parse.SplitResult) -> None:
        ok_auth, err_status, err_msg = self._authenticate(parsed)
        if not ok_auth:
            self._send_json({"ok": False, "error": err_msg, "requirePin": True}, err_status)
            return

        ws_key = str(self.headers.get("Sec-WebSocket-Key") or "").strip()
        if not ws_key:
            self._send_json({"ok": False, "error": "Missing Sec-WebSocket-Key"}, 400)
            return

        accept_val = base64.b64encode(hashlib.sha1((ws_key + WS_MAGIC).encode("utf-8")).digest()).decode("utf-8")
        self.protocol_version = "HTTP/1.1"
        self.send_response(101, "Switching Protocols")
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", accept_val)
        self._send_security_headers()
        self.end_headers()

        qs = urllib.parse.parse_qs(parsed.query)
        initial_cid = (qs.get("cid") or [None])[0]
        client_ip, via = self._client_ip_and_via()
        client = {
            "sock": self.request,
            "lock": threading.Lock(),
            "cid": initial_cid,
            "ip": client_ip,
            "via": via,
        }
        with _ws_lock:
            _ws_clients.append(client)

        try:
            ov = build_local_overview(APP_CONFIG)
            ws_send_frame(client, json.dumps({"type": "overview", "data": ov}, ensure_ascii=False))
            if initial_cid:
                _viewed_overrides[str(initial_cid)] = time.time()
                detail = read_local_conversation_detail(str(initial_cid), APP_CONFIG)
                ws_send_frame(
                    client,
                    json.dumps({"type": "conversation", "conversationId": str(initial_cid), "data": detail}, ensure_ascii=False),
                )

            while True:
                opcode, payload = ws_read_frame(self.request)
                if opcode is None or opcode == 0x8:  # Close
                    break
                if opcode == 0x9:  # Ping
                    ws_send_frame(client, payload.decode("utf-8", errors="ignore"), opcode=0xA)
                    continue
                if opcode == 0x1:  # Text frame
                    try:
                        msg = json.loads(payload.decode("utf-8", errors="replace"))
                    except ValueError:
                        continue
                    mtype = msg.get("type")
                    if mtype == "ping":
                        ws_send_frame(client, json.dumps({"type": "pong", "ts": int(time.time() * 1000)}))
                    elif mtype == "subscribe":
                        sub_cid = msg.get("conversationId") or None
                        client["cid"] = sub_cid
                        if sub_cid:
                            _viewed_overrides[str(sub_cid)] = time.time()
                            detail = read_local_conversation_detail(str(sub_cid), APP_CONFIG)
                            _last_conv_fingerprints[str(sub_cid)] = compute_conv_fingerprint(detail)
                            ws_send_frame(
                                client,
                                json.dumps({"type": "conversation", "conversationId": str(sub_cid), "data": detail}, ensure_ascii=False),
                            )
                    elif mtype == "refresh":
                        ov = build_local_overview(APP_CONFIG)
                        ws_send_frame(client, json.dumps({"type": "overview", "data": ov}, ensure_ascii=False))
                        if client.get("cid"):
                            detail = read_local_conversation_detail(str(client["cid"]), APP_CONFIG)
                            ws_send_frame(
                                client,
                                json.dumps({"type": "conversation", "conversationId": str(client["cid"]), "data": detail}, ensure_ascii=False),
                            )
        finally:
            with _ws_lock:
                if client in _ws_clients:
                    _ws_clients.remove(client)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._send_security_headers()
        self.end_headers()

    def do_HEAD(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self._send_security_headers()
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlsplit(self.path)
        path = parsed.path

        if self._is_lan_blocked():
            self._send_json({"ok": False, "error": "Truy cập qua mạng LAN đang được khóa bởi chủ máy PC."}, 403)
            return

        if path in ("/health", "/api/ag-companion/health"):
            h = _build_health_status()
            self._send_json(h, 200 if h.get("ok") else 503)
            return

        # Hỗ trợ nâng cấp kết nối WebSocket Realtime (/ws hoặc /api/ag-companion/ws)
        if str(self.headers.get("Upgrade") or "").lower() == "websocket" or path in ("/ws", "/api/ag-companion/ws"):
            self._handle_websocket_upgrade(parsed)
            return

        # Phục vụ giao diện Web Antigravity + Font Google Sans + Icon 3D
        if path in ("/", "/index.html") or not path.startswith("/api/"):
            rel = path.lstrip("/") or "index.html"
            target = (WEB_DIR / rel).resolve()
            if not str(target).startswith(str(WEB_DIR.resolve())) or not target.is_file():
                target = WEB_DIR / "index.html"
            if target.is_file():
                raw = target.read_bytes()
                mime = mimetypes.guess_type(target.name)[0] or "text/html; charset=utf-8"
                self.send_response(200)
                self.send_header("Content-Type", mime)
                self.send_header("Content-Length", str(len(raw)))
                self._send_security_headers()
                self.end_headers()
                self.wfile.write(raw)
                return
            self._send_json({"ok": False, "error": "Không tìm thấy web/index.html"}, 404)
            return

        ok_auth, err_status, err_msg = self._authenticate(parsed)
        if path == "/api/ag-companion/auth-check":
            if ok_auth:
                client_ip, via = self._client_ip_and_via()
                sess_tok = self._issue_session_token(client_ip, via)
                self._send_json({"ok": True, "host": HOST_NAME, "sessionToken": sess_tok, "via": via}, 200)
            else:
                self._send_json({"ok": False, "error": err_msg, "requirePin": True}, err_status)
            return

        if not ok_auth:
            self._send_json({"ok": False, "error": err_msg, "requirePin": True}, err_status)
            return

        if path == "/api/ag-companion/qr":
            qs = urllib.parse.parse_qs(parsed.query)
            text_val = (qs.get("text") or qs.get("data") or [""])[0].strip()
            svg_bytes = generate_qr_svg(text_val).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "image/svg+xml; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(svg_bytes)))
            self._send_security_headers()
            self.end_headers()
            self.wfile.write(svg_bytes)
            return

        if path == "/api/ag-companion/customizations":
            self._send_json(discover_local_customizations())
            return

        if path == "/api/ag-companion/connection-info":
            ips = get_lan_and_tailscale_ips()
            port = int(APP_CONFIG.get("port") or DEFAULT_PORT)
            pin = str(APP_CONFIG.get("pin") or "")
            lan_url = f"http://{ips['lan_ip']}:{port}/?pin={pin}"
            ts_url = f"http://{ips['tailscale_ip']}:{port}/?pin={pin}" if ips["tailscale_ip"] else ""
            tun_running = bool(_tunnel_state.get("running") and _tunnel_state.get("url"))
            tun_url = f"{_tunnel_state['url']}/?pin={pin}" if tun_running else ""
            client_ip, via = self._client_ip_and_via()
            with _auth_lock:
                sessions_list = list(_active_sessions.values())
                audit_list = list(_security_audit_log[:25])
                locked_count = sum(1 for v in _locked_ips.values() if v > time.time())
            with _ws_lock:
                ws_count = len(_ws_clients)
            self._send_json({
                "ok": True,
                "host": HOST_NAME,
                "port": port,
                "pin": pin,
                "allowLan": bool(APP_CONFIG.get("allowLan", True)),
                "clientIp": client_ip,
                "clientVia": via,
                "wsClientsCount": ws_count,
                "lanIp": ips["lan_ip"],
                "lanUrl": lan_url,
                "lanQrSvgDataUrl": generate_qr_data_url(lan_url),
                "tailscaleIp": ips["tailscale_ip"],
                "tailscaleUrl": ts_url,
                "tailscaleQrSvgDataUrl": generate_qr_data_url(ts_url) if ts_url else "",
                "tunnelRunning": tun_running,
                "tunnelBaseUrl": _tunnel_state.get("url") or "",
                "tunnelUrl": tun_url,
                "tunnelQrSvgDataUrl": generate_qr_data_url(tun_url) if tun_url else "",
                "activeSessionsCount": len(sessions_list),
                "activeSessions": sessions_list,
                "lockedIpsCount": locked_count,
                "auditLog": audit_list,
            })
            return

        if path == "/api/ag-companion/security-status":
            client_ip, via = self._client_ip_and_via()
            with _auth_lock:
                sessions_list = list(_active_sessions.values())
                audit_list = list(_security_audit_log[:30])
            with _ws_lock:
                ws_count = len(_ws_clients)
            self._send_json({
                "ok": True,
                "host": HOST_NAME,
                "allowLan": bool(APP_CONFIG.get("allowLan", True)),
                "tunnelRunning": bool(_tunnel_state.get("running") and _tunnel_state.get("url")),
                "clientIp": client_ip,
                "clientVia": via,
                "wsClientsCount": ws_count,
                "activeSessions": sessions_list,
                "auditLog": audit_list,
                "dataLocation": str(ANTIGRAVITY_DIR),
                "zeroDataLeak": True,
            })
            return

        if path == "/api/ag-companion/overview":
            self._send_json(build_local_overview(APP_CONFIG))
            return

        if path.startswith("/api/ag-companion/conversation/"):
            cid = urllib.parse.unquote(path.split("/api/ag-companion/conversation/", 1)[1]).strip("/")
            qs = urllib.parse.parse_qs(parsed.query)
            if (qs.get("markRead") or ["1"])[0] == "1":
                _viewed_overrides[cid] = time.time()
            self._send_json(read_local_conversation_detail(cid, APP_CONFIG))
            return

        if path == "/api/ag-companion/media":
            qs = urllib.parse.parse_qs(parsed.query)
            raw_p = (qs.get("path") or [""])[0].strip()
            fpath = Path(raw_p)
            if not is_safe_media_path(fpath):
                client_ip, via = self._client_ip_and_via()
                append_security_audit("MEDIA_PATH_BLOCKED", client_ip, f"Chặn truy cập đường dẫn ngoài vùng cho phép: {raw_p[:80]}", "danger")
                self._send_json({"ok": False, "error": "Forbidden: Chỉ cho phép đọc file media đính kèm trong vùng an toàn của Antigravity."}, 403)
                return
            data = fpath.read_bytes()
            mime = mimetypes.guess_type(fpath.name)[0] or "application/octet-stream"
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; media-src 'self'; sandbox")
            self._send_security_headers()
            self.end_headers()
            self.wfile.write(data)
            return

        self._send_json({"ok": False, "error": "Not found"}, 404)

    def do_POST(self) -> None:
        parsed = urllib.parse.urlsplit(self.path)
        path = parsed.path

        length = int(self.headers.get("Content-Length") or 0)
        if length < 0 or length > 25 * 1024 * 1024:
            self._send_json({"ok": False, "error": "Dung lượng yêu cầu vượt quá giới hạn 25MB"}, 413)
            return
        body_raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            body = json.loads(body_raw.decode("utf-8", errors="replace"))
        except Exception:
            body = {}

        if path == "/api/ag-companion/auth-session":
            pin_in = str(body.get("pin") or "").strip()
            fake_url = urllib.parse.urlsplit(f"{self.path}?pin={urllib.parse.quote(pin_in)}") if pin_in else parsed
            ok_auth, err_status, err_msg = self._authenticate(fake_url)
            if not ok_auth:
                self._send_json({"ok": False, "error": err_msg, "requirePin": True}, err_status)
                return
            client_ip, via = self._client_ip_and_via()
            sess_tok = self._issue_session_token(client_ip, via)
            self._send_json({"ok": True, "host": HOST_NAME, "sessionToken": sess_tok, "via": via})
            return

        ok_auth, err_status, err_msg = self._authenticate(parsed)
        if not ok_auth:
            self._send_json({"ok": False, "error": err_msg, "requirePin": True}, err_status)
            return

        if path == "/api/ag-companion/rotate-pin":
            custom_pin = str(body.get("newPin") or "").strip()
            if custom_pin and (not custom_pin.isdigit() or len(custom_pin) < 4 or len(custom_pin) > 12):
                self._send_json({"ok": False, "error": "Mã PIN mới phải gồm từ 4 đến 12 chữ số."}, 400)
                return
            new_pin = custom_pin or _generate_random_pin()
            APP_CONFIG["pin"] = new_pin
            save_config(APP_CONFIG)
            client_ip, via = self._client_ip_and_via()
            with _auth_lock:
                _active_sessions.clear()
                _failed_attempts.clear()
                _locked_ips.clear()
            new_sess = self._issue_session_token(client_ip, via)
            append_security_audit("PIN_ROTATED", client_ip, f"Đã đổi mã PIN mới và thu hồi toàn bộ phiên cũ ({via})", "warn")
            self._send_json({"ok": True, "pin": new_pin, "sessionToken": new_sess})
            return

        if path == "/api/ag-companion/security-policy":
            if "allowLan" in body:
                APP_CONFIG["allowLan"] = bool(body["allowLan"])
            if body.get("revokeAllSessions"):
                with _auth_lock:
                    _active_sessions.clear()
            save_config(APP_CONFIG)
            client_ip, via = self._client_ip_and_via()
            sess_tok = self._issue_session_token(client_ip, via)
            append_security_audit(
                "POLICY_UPDATED",
                client_ip,
                f"Cập nhật chính sách mạng: allowLan={APP_CONFIG['allowLan']}",
                "info",
            )
            self._send_json({"ok": True, "allowLan": APP_CONFIG["allowLan"], "sessionToken": sess_tok})
            return

        if path == "/api/ag-companion/tunnel-toggle":
            enable = bool(body.get("enable", True))
            if enable:
                res = start_cloudflare_quick_tunnel(int(APP_CONFIG.get("port") or DEFAULT_PORT))
            else:
                res = stop_cloudflare_quick_tunnel()
            pin = str(APP_CONFIG.get("pin") or "")
            tun_url = f"{res.get('url')}/?pin={pin}" if res.get("url") else ""
            res["tunnelUrl"] = tun_url
            res["tunnelQrSvgDataUrl"] = generate_qr_data_url(tun_url) if tun_url else ""
            self._send_json(res)
            return

        if path == "/api/ag-companion/pin":
            cid = str(body.get("conversationId") or "").strip()
            pinned = bool(body.get("pinned", True))
            if cid:
                _pinned_overrides[cid] = pinned
                APP_CONFIG.setdefault("pinned", {})[cid] = pinned
                save_config(APP_CONFIG)
                instances = discover_local_antigravity_instances()
                if instances:
                    try:
                        instances[0].rpc(
                            "UpdateConversationAnnotations",
                            {"cascadeId": cid, "annotations": {"pinned": pinned}},
                            timeout=5,
                        )
                    except Exception:
                        pass
                ann_file = ANNOTATIONS_DIR / f"{cid}.pbtxt"
                try:
                    ANNOTATIONS_DIR.mkdir(parents=True, exist_ok=True)
                    txt = ann_file.read_text(encoding="utf-8", errors="replace") if ann_file.exists() else ""
                    txt = re.sub(r"\s*pinned:\s*(?:true|false)", "", txt).strip()
                    txt = (txt + " pinned:true\n") if pinned else (txt + "\n")
                    ann_file.write_text(txt, encoding="utf-8")
                except Exception:
                    pass
                threading.Thread(target=trigger_immediate_ws_sync, args=(cid,), daemon=True).start()
            self._send_json({"ok": True, "conversationId": cid, "pinned": pinned})
            return

        if path == "/api/ag-companion/cancel_cmd":
            cmd_id = str(body.get("cmdId") or body.get("commandId") or "").strip()
            cid = str(body.get("conversationId") or "").strip()
            res_cancel = _cancel_pending_cmd_by_id(cmd_id, cid)
            if cid:
                for inst in discover_local_antigravity_instances():
                    try:
                        inst.rpc("CancelCascadeInvocation", {"cascadeId": cid}, timeout=5)
                    except Exception:
                        pass
            self._send_json(res_cancel, 200 if res_cancel.get("ok") else 400)
            return

        if path == "/api/ag-companion/cancel":
            cid = str(body.get("conversationId") or "").strip()
            cmd_id = str(body.get("cmdId") or body.get("commandId") or "").strip()
            if cmd_id:
                _cancel_pending_cmd_by_id(cmd_id, cid)
            instances = discover_local_antigravity_instances()
            cancelled = False
            for inst in instances:
                if cid:
                    try:
                        inst.rpc("CancelCascadeInvocation", {"cascadeId": cid}, timeout=8)
                        cancelled = True
                    except Exception:
                        continue
            _optimistic_convs.pop(cid, None)
            if cid in APP_CONFIG.get("customConvs", {}):
                APP_CONFIG["customConvs"][cid]["isRunning"] = False
                save_config(APP_CONFIG)
            threading.Thread(target=trigger_immediate_ws_sync, args=(cid,), daemon=True).start()
            self._send_json({"ok": True, "conversationId": cid, "cancelled": cancelled})
            return

        if path == "/api/ag-companion/new":
            def _handle_new() -> tuple[dict, int]:
                cmd_id_local = str(body.get("cmdId") or body.get("commandId") or body.get("requestId") or "").strip()
                prompt = str(body.get("prompt") or body.get("text") or "").strip()
                title_in = str(body.get("title") or "").strip()
                media_raw = body.get("media") if isinstance(body.get("media"), list) else []
                proj_id = str(body.get("projectId") or "").strip()
                model_raw = str(body.get("model") or "").strip()
                cli_model = "flash" if "flash" in model_raw.lower() else "pro"
                if not prompt and not media_raw:
                    return {"ok": False, "error": "Vui lòng nhập nội dung giao việc hoặc đính kèm ảnh/tài liệu."}, 400

                instances = discover_local_antigravity_instances(force=True)
                inst = instances[0] if instances else None
                cp = _get_cmd_effect_checkpoint(cmd_id_local) if cmd_id_local else {}
                real_cid = str(cp.get("conversationId") or "").strip()
                auto_title = title_in or (prompt.split("\n")[0][:70] if prompt else "New Conversation")

                proj_cfg = load_projects_config()
                primary_proj = get_primary_project_info(proj_cfg)
                primary_pid = str(primary_proj.get("id") or "default-cli-project")

                if inst is not None:
                    eff_proj = (
                        proj_id
                        if (proj_id and proj_id not in ("local-workspace", "outside-of-project") and proj_id in proj_cfg)
                        else primary_pid
                    )
                    folder_uri = str((proj_cfg.get(eff_proj) or {}).get("folderUri") or primary_proj.get("folderUri") or "").strip()
                    if not real_cid:
                        if cmd_id_local:
                            _save_cmd_effect_checkpoint(cmd_id_local, {"stage": "start_intent"})
                        start_payloads: list[dict] = []
                        if folder_uri:
                            start_payloads.append({
                                "source": "CORTEX_TRAJECTORY_SOURCE_CASCADE_CLIENT",
                                "trajectoryType": "CORTEX_TRAJECTORY_TYPE_CASCADE",
                                "workspaceUris": [folder_uri],
                            })
                        if (
                            eff_proj
                            and eff_proj not in ("default-cli-project", "outside-of-project", "local-workspace")
                            and not eff_proj.startswith("ws-")
                            and eff_proj in proj_cfg
                        ):
                            p_payload: dict = {
                                "source": "CORTEX_TRAJECTORY_SOURCE_CASCADE_CLIENT",
                                "trajectoryType": "CORTEX_TRAJECTORY_TYPE_CASCADE",
                                "projectEnvConfig": {"projectId": eff_proj, "defaultProjectEnvironment": {}},
                            }
                            if folder_uri:
                                p_payload["workspaceUris"] = [folder_uri]
                            start_payloads.append(p_payload)
                        start_payloads.append({
                            "source": "CORTEX_TRAJECTORY_SOURCE_CASCADE_CLIENT",
                            "trajectoryType": "CORTEX_TRAJECTORY_TYPE_CASCADE",
                        })

                        for sc_payload in start_payloads:
                            try:
                                sc = inst.rpc("StartCascade", sc_payload, timeout=12)
                                real_cid = str((sc or {}).get("cascadeId") or "").strip()
                                if real_cid:
                                    if cmd_id_local:
                                        _save_cmd_effect_checkpoint(cmd_id_local, {"conversationId": real_cid, "stage": "started"})
                                    break
                            except Exception as e:
                                _worker_telemetry["last_rpc_error"] = f"StartCascade: {e}"
                                real_cid = ""

                    if real_cid:
                        ui_media, cascade_media, file_notes = save_and_prepare_media(inst, real_cid, media_raw)
                        full_prompt = prompt or f"Phân tích media đính kèm: {', '.join(m['name'] for m in ui_media)}"
                        if file_notes:
                            full_prompt = f"{full_prompt}\n\n[Đính kèm từ Web/Mobile]:\n" + "\n".join(file_notes)

                        now_ep = time.time()
                        _optimistic_convs[real_cid] = {
                            "id": real_cid,
                            "title": auto_title,
                            "projectId": eff_proj,
                            "prompt": prompt or "Đính kèm media",
                            "media": ui_media,
                            "createdAt": now_ep,
                        }
                        _viewed_overrides[real_cid] = now_ep

                        try:
                            inst.rpc("UpdateConversationAnnotations", {"cascadeId": real_cid, "annotations": {"title": auto_title}}, timeout=5)
                        except Exception:
                            pass

                        dispatched_ok = bool(cp.get("stage") == "sent")
                        if not dispatched_ok:
                            if cmd_id_local:
                                _save_cmd_effect_checkpoint(cmd_id_local, {"conversationId": real_cid, "stage": "send_intent"})
                            cfg_u = get_cached_user_config(inst, real_cid, None, model_id=model_raw)
                            if cfg_u:
                                payload_rpc: dict = {"cascadeId": real_cid, "items": [{"text": full_prompt}], "cascadeConfig": cfg_u}
                                if cascade_media:
                                    payload_rpc["media"] = cascade_media
                                if inst.rpc("SendUserCascadeMessage", payload_rpc, timeout=25) is not None:
                                    dispatched_ok = True
                                    _worker_telemetry["last_rpc_ok_at_ms"] = int(time.time() * 1000)

                            if not dispatched_ok:
                                try:
                                    cli_res = inst.call_agentapi("send-message", real_cid, full_prompt)
                                    if cli_res.get("ok") or cli_res.get("returncode") == 0 or cli_res.get("response"):
                                        dispatched_ok = True
                                        _worker_telemetry["last_rpc_ok_at_ms"] = int(time.time() * 1000)
                                except Exception as e:
                                    _worker_telemetry["last_rpc_error"] = f"send-message: {e}"

                            if dispatched_ok and cmd_id_local:
                                _save_cmd_effect_checkpoint(cmd_id_local, {"conversationId": real_cid, "stage": "sent"})

                        threading.Thread(target=trigger_immediate_ws_sync, args=(real_cid,), daemon=True).start()
                        if not dispatched_ok:
                            return {
                                "ok": False,
                                "conversationId": real_cid,
                                "title": auto_title,
                                "dispatchedToIde": False,
                                "error": "Đã tạo phiên nhưng không thể nạp tin nhắn đầu tiên vào Antigravity IDE (Connect RPC timeout).",
                            }, 502
                        return {"ok": True, "conversationId": real_cid, "title": auto_title, "dispatchedToIde": True, "media": ui_media}, 200

                    try:
                        if cmd_id_local:
                            _save_cmd_effect_checkpoint(cmd_id_local, {"stage": "cli_new_intent"})
                        temp_cid = str(uuid.uuid4())
                        ui_media, _, file_notes = save_and_prepare_media(inst, temp_cid, media_raw)
                        full_prompt = prompt or "Phân tích media đính kèm"
                        if file_notes:
                            full_prompt = f"{full_prompt}\n\n[Đính kèm từ Web/Mobile]:\n" + "\n".join(file_notes)
                        res = inst.call_agentapi(
                            "new-conversation",
                            f"--model={cli_model}",
                            full_prompt,
                            project_id=eff_proj if (eff_proj in proj_cfg and eff_proj not in ("local-workspace", "default-cli-project", "outside-of-project") and not eff_proj.startswith("ws-")) else "",
                        )
                        new_c = ((res.get("response") or {}).get("newConversation")) or {}
                        if new_c.get("conversationId"):
                            real_cid = str(new_c["conversationId"])
                            if cmd_id_local:
                                _save_cmd_effect_checkpoint(cmd_id_local, {"conversationId": real_cid, "stage": "sent"})
                            _worker_telemetry["last_rpc_ok_at_ms"] = int(time.time() * 1000)
                            threading.Thread(target=trigger_immediate_ws_sync, args=(real_cid,), daemon=True).start()
                            return {"ok": True, "conversationId": real_cid, "title": auto_title, "dispatchedToIde": True, "media": ui_media}, 200
                    except Exception as e:
                        _worker_telemetry["last_rpc_error"] = f"new-conversation: {e}"

                    return {
                        "ok": False,
                        "dispatchedToIde": False,
                        "error": f"Đã kết nối Antigravity Desktop (PID {inst.pid}) nhưng không khởi tạo được phiên mới ({_worker_telemetry.get('last_rpc_error') or 'RPC StartCascade returned None'}). Hãy mở sẵn 1 thư mục Workspace trong Antigravity Desktop rồi thử lại.",
                    }, 502

                real_cid = str(uuid.uuid4())
                ui_media, _, _ = save_and_prepare_media(None, real_cid, media_raw)
                now_ms = int(time.time() * 1000)
                u_msg: dict = {"id": f"u_{now_ms}", "role": "user", "content": prompt or "Phân tích media đính kèm", "timestamp": now_ms}
                if ui_media:
                    u_msg["media"] = ui_media
                eff_pid = proj_id if (proj_id and proj_id in proj_cfg) else primary_pid
                eff_pname = (proj_cfg.get(eff_pid) or {}).get("name") or str(primary_proj.get("name") or "Workspace")
                conv_obj = {
                    "id": real_cid,
                    "title": auto_title,
                    "projectId": eff_pid,
                    "projectName": eff_pname,
                    "isRunning": False,
                    "status": "CASCADE_RUN_STATUS_IDLE",
                    "lastModifiedEpoch": time.time(),
                    "messages": [
                        u_msg,
                        {
                            "id": f"a_{now_ms + 1}",
                            "role": "assistant",
                            "content": "Đã lưu yêu cầu trên ổ cứng máy tính của bạn. Hiện chưa phát hiện cửa sổ Antigravity Desktop đang mở — hãy mở ứng dụng Antigravity trên PC và gửi lại nhé!",
                            "completed": True,
                            "timestamp": now_ms + 1,
                        },
                    ],
                }
                APP_CONFIG.setdefault("customConvs", {})[real_cid] = conv_obj
                save_config(APP_CONFIG)
                threading.Thread(target=trigger_immediate_ws_sync, args=(real_cid,), daemon=True).start()
                return {"ok": True, "conversationId": real_cid, "title": auto_title, "dispatchedToIde": False, "media": ui_media}, 200

            res_obj, status_code = _execute_with_cmd_idempotency("new", body, _handle_new)
            self._send_json(res_obj, status_code)
            return

        if path == "/api/ag-companion/send":
            def _handle_send() -> tuple[dict, int]:
                cmd_id_local = str(body.get("cmdId") or body.get("commandId") or body.get("requestId") or "").strip()
                cid = str(body.get("conversationId") or "").strip()
                text = str(body.get("text") or body.get("prompt") or "").strip()
                model_raw = str(body.get("model") or "").strip()
                media_raw = body.get("media") if isinstance(body.get("media"), list) else []
                if not cid or (not text and not media_raw):
                    return {"ok": False, "error": "Thiếu mã phiên (conversationId) hoặc nội dung tin nhắn."}, 400

                instances = discover_local_antigravity_instances(force=True)
                inst = instances[0] if instances else None
                ui_media, cascade_media, file_notes = save_and_prepare_media(inst, cid, media_raw)
                full_text = text or f"Phân tích media đính kèm: {', '.join(m['name'] for m in ui_media)}"
                if file_notes:
                    full_text = f"{full_text}\n\n[Đính kèm từ Web/Mobile]:\n" + "\n".join(file_notes)

                now_ep = time.time()
                _optimistic_convs[cid] = {
                    "id": cid,
                    "prompt": text or "Đính kèm media",
                    "media": ui_media,
                    "createdAt": now_ep,
                }
                _viewed_overrides[cid] = now_ep

                cp = _get_cmd_effect_checkpoint(cmd_id_local) if cmd_id_local else {}
                dispatched = bool(cp.get("stage") == "sent")
                if inst is not None and not dispatched:
                    if cmd_id_local:
                        _save_cmd_effect_checkpoint(cmd_id_local, {"conversationId": cid, "stage": "send_intent"})
                    cfg_u = get_cached_user_config(inst, cid, None, model_id=model_raw)
                    if cfg_u:
                        payload_rpc: dict = {"cascadeId": cid, "items": [{"text": full_text}], "cascadeConfig": cfg_u}
                        if cascade_media:
                            payload_rpc["media"] = cascade_media
                        res_rpc = inst.rpc("SendUserCascadeMessage", payload_rpc, timeout=25)
                        if res_rpc is None:
                            inst.rpc("LoadTrajectory", {"cascadeId": cid}, timeout=10)
                            res_rpc = inst.rpc("SendUserCascadeMessage", payload_rpc, timeout=25)
                        if res_rpc is not None:
                            dispatched = True
                            _worker_telemetry["last_rpc_ok_at_ms"] = int(time.time() * 1000)

                    if not dispatched:
                        try:
                            cli_res = inst.call_agentapi("send-message", cid, full_text)
                            if cli_res.get("ok") or cli_res.get("returncode") == 0 or cli_res.get("response"):
                                dispatched = True
                                _worker_telemetry["last_rpc_ok_at_ms"] = int(time.time() * 1000)
                        except Exception as e:
                            _worker_telemetry["last_rpc_error"] = f"send-message: {e}"

                    if dispatched and cmd_id_local:
                        _save_cmd_effect_checkpoint(cmd_id_local, {"conversationId": cid, "stage": "sent"})

                    if not dispatched:
                        _optimistic_convs.pop(cid, None)
                        return {
                            "ok": False,
                            "conversationId": cid,
                            "dispatchedToIde": False,
                            "error": "Không thể chuyển tin nhắn tới Antigravity IDE trên PC (Connect RPC timeout).",
                        }, 502

                now_ms = int(now_ep * 1000)
                u_msg = {"id": f"u_{now_ms}", "role": "user", "content": text or "Đính kèm media", "timestamp": now_ms}
                if ui_media:
                    u_msg["media"] = ui_media
                c_conv = APP_CONFIG.setdefault("customConvs", {}).setdefault(cid, {"id": cid, "messages": []})
                c_conv.setdefault("messages", []).append(u_msg)
                c_conv["isRunning"] = dispatched
                c_conv["lastModifiedEpoch"] = now_ep
                save_config(APP_CONFIG)
                threading.Thread(target=trigger_immediate_ws_sync, args=(cid,), daemon=True).start()
                return {"ok": True, "conversationId": cid, "dispatchedToIde": dispatched, "media": ui_media}, 200

            res_obj, status_code = _execute_with_cmd_idempotency("send", body, _handle_send)
            self._send_json(res_obj, status_code)
            return

        self._send_json({"ok": False, "error": "Unsupported endpoint"}, 404)


# ============================================================================
# 8. KHỞI CHẠY SERVER & LUỒNG WEBSOCKET REALTIME
# ============================================================================

APP_CONFIG: dict = {}


def spawn_wmi_detached_companion(args: argparse.Namespace) -> int:
    COMPANION_DATA_DIR.mkdir(parents=True, exist_ok=True)
    cfg_init = load_or_create_config(custom_pin=args.pin or None, custom_port=args.port or None)
    target_port = int(args.port or cfg_init.get("port") or DEFAULT_PORT)

    # Dọn tiến trình companion_server.py / cloudflared.exe cũ đang giữ cùng cổng (nếu có)
    cleanup_ps = (
        f"$myPid = {os.getpid()}; "
        f"$targetPort = '{target_port}'; "
        "Get-CimInstance Win32_Process | Where-Object { "
        "  $_.ProcessId -ne $myPid -and ( "
        "    ($_.Name -like 'python*' -and $_.CommandLine -like '*companion_server.py*' -and ($_.CommandLine -notlike '*--port*' -or $_.CommandLine -like ('*--port ' + $targetPort + '*'))) -or "
        "    ($_.Name -like 'cloudflared*' -and $_.CommandLine -like ('*127.0.0.1:' + $targetPort + '*')) "
        "  ) "
        "} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
    )
    try:
        subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", cleanup_ps],
            capture_output=True,
            timeout=10,
            creationflags=NO_WINDOW,
        )
    except Exception:
        pass

    try:
        if RUNTIME_STATE_FILE.exists():
            RUNTIME_STATE_FILE.unlink()
    except Exception:
        pass

    wmi_log = COMPANION_DATA_DIR / "companion_wmi.log"
    script_path = Path(__file__).resolve()
    child_cmd = [
        sys.executable,
        str(script_path),
        "--foreground",
        "--no-browser",
        "--log-file",
        str(wmi_log),
    ]
    if args.port:
        child_cmd.extend(["--port", str(args.port)])
    if args.strict_port:
        child_cmd.append("--strict-port")
    if args.pin:
        child_cmd.extend(["--pin", str(args.pin)])
    if args.tunnel:
        child_cmd.append("--tunnel")
    if args.localhost_only:
        child_cmd.append("--localhost-only")

    cmd_line = subprocess.list2cmdline(child_cmd)
    spawn_ps = (
        "$si = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }; "
        "$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ "
        "  CommandLine = $env:AG_WMI_CMD; "
        "  CurrentDirectory = $env:AG_WMI_CWD; "
        "  ProcessStartupInformation = $si "
        "}; "
        "if ($r.ReturnValue -eq 0) { Write-Output $r.ProcessId } else { exit ([int]$r.ReturnValue) }"
    )
    env_copy = os.environ.copy()
    env_copy["AG_WMI_CMD"] = cmd_line
    env_copy["AG_WMI_CWD"] = str(script_path.parent)
    start_ts = int(time.time())

    r = subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", spawn_ps],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env_copy,
        timeout=15,
        creationflags=NO_WINDOW,
    )
    if r.returncode != 0:
        raise RuntimeError(f"WMI Win32_Process.Create trả về mã lỗi {r.returncode}: {r.stderr}")

    wmi_pid_str = (r.stdout or "").strip().splitlines()[-1].strip() if (r.stdout or "").strip() else "0"
    wmi_pid = int(wmi_pid_str) if wmi_pid_str.isdigit() else 0

    state_data: dict = {}
    wait_deadline = time.time() + (24.0 if args.tunnel else 8.0)
    while time.time() < wait_deadline:
        if RUNTIME_STATE_FILE.exists():
            try:
                raw_st = json.loads(RUNTIME_STATE_FILE.read_text(encoding="utf-8"))
                if int(raw_st.get("updatedAt") or 0) >= start_ts - 2:
                    state_data = raw_st
                    if not args.tunnel:
                        break
                    if state_data.get("tunnelUrl") or state_data.get("tunnelError"):
                        break
            except Exception:
                pass
        time.sleep(0.35)

    listen_port = int(state_data.get("port") or target_port)
    pin_code = str(state_data.get("pin") or cfg_init.get("pin") or "")
    ips = get_lan_and_tailscale_ips()
    local_url = state_data.get("localUrl") or f"http://127.0.0.1:{listen_port}/?pin={pin_code}"
    lan_url = state_data.get("lanUrl") or f"http://{ips['lan_ip']}:{listen_port}/?pin={pin_code}"
    tun_url = str(state_data.get("tunnelUrl") or "")
    tun_err = str(state_data.get("tunnelError") or "")

    print("=" * 76)
    print("  ANTIGRAVITY MOBILE COMPANION v2.2 — WMI DETACHED DAEMON (CHỐNG ERROR 1033)")
    print("=" * 76)
    print(f"  * Tiến trình Độc Lập  : PID {wmi_pid} (WMI Win32_Process — Tách khỏi Job Object AI)")
    print(f"  * Máy trạm (Host PC)  : {HOST_NAME}")
    print(f"  * Vùng dữ liệu Local  : {ANTIGRAVITY_DIR}")
    print(f"  * Đồng bộ Realtime    : WebSocket ws://{ips['lan_ip']}:{listen_port}/ws (0.55s live stream)")
    print(f"  * Mã PIN Bảo Mật      : {pin_code} (Chống Brute-Force: khóa IP sau {MAX_FAILED_ATTEMPTS} lần sai)")
    print(f"  * Mở trên PC này      : {local_url}")
    if state_data.get("allowLan", True):
        print(f"  * Mở qua Wi-Fi LAN    : {lan_url}")
    else:
        print("  * Chế độ Wi-Fi LAN    : ĐANG KHÓA (Chỉ cho phép Localhost + Tunnel)")
    if ips.get("tailscale_ip"):
        print(f"  * Mở qua Tailscale    : http://{ips['tailscale_ip']}:{listen_port}/?pin={pin_code}")
    if args.tunnel:
        if tun_url:
            print(f"  * Mở qua 4G/5G (Mọi nơi): {tun_url}")
        else:
            print(f"  * Lưu ý Tunnel        : {tun_err or 'Đang hoàn tất kết nối Cloudflare, xem trong giao diện Web'}")
    print(f"  * Nhật ký chạy nền    : {wmi_log}")
    print("=" * 76)

    if not args.no_browser:
        try:
            import webbrowser
            webbrowser.open(local_url)
        except Exception:
            pass
    return 0


def main() -> None:
    global APP_CONFIG
    parser = argparse.ArgumentParser(description="Antigravity Mobile Companion (Self-Host + WebSocket Realtime)")
    parser.add_argument("--port", type=int, default=0, help="Cổng lắng nghe (mặc định: 8046, tự chọn cổng trống nếu bận)")
    parser.add_argument("--strict-port", action="store_true", help="Bắt buộc dùng đúng cổng --port, không tự chuyển cổng")
    parser.add_argument("--pin", type=str, default="", help="Mã PIN (4-12 chữ số) bảo vệ truy cập từ điện thoại")
    parser.add_argument("--tunnel", action="store_true", help="Bật ngay Cloudflare Quick Tunnel (4G/5G miễn phí)")
    parser.add_argument("--localhost-only", action="store_true", help="Khóa truy cập Wi-Fi LAN (chỉ cho phép Localhost + Cloudflare Tunnel)")
    parser.add_argument("--no-browser", action="store_true", help="Không tự mở trình duyệt trên PC")
    parser.add_argument("--detach", action="store_true", help="Chạy độc lập qua WMI Win32_Process.Create (không bị tắt khi đóng phiên chat AI)")
    parser.add_argument("--foreground", action="store_true", help="Giữ tiến trình chạy trực tiếp trong terminal hiện tại")
    parser.add_argument("--log-file", type=str, default="", help="Đường dẫn file ghi log khi chạy ngầm WMI")
    args = parser.parse_args()

    if args.log_file:
        try:
            lf = Path(args.log_file)
            lf.parent.mkdir(parents=True, exist_ok=True)
            log_fh = open(lf, "a", encoding="utf-8", buffering=1, errors="replace")
            sys.stdout = log_fh
            sys.stderr = log_fh
        except Exception:
            pass

    # Trên Windows, nếu gọi --detach hoặc gọi --tunnel từ trong phiên lệnh của AI (stdin không phải TTY)
    # mà không truyền --foreground -> tự động tách qua WMI Win32_Process.Create để không bị Windows Job Object đóng!
    is_non_tty_ai_session = (not sys.stdin) or (not sys.stdin.isatty())
    if os.name == "nt" and (not args.foreground) and (args.detach or (args.tunnel and is_non_tty_ai_session)):
        try:
            spawn_wmi_detached_companion(args)
            return
        except Exception as e:
            print(f"[!] Không tách được WMI ({e}), chuyển sang chạy trực tiếp...")

    APP_CONFIG = load_or_create_config(custom_pin=args.pin or None, custom_port=args.port or None)
    preferred_port = int(args.port or APP_CONFIG.get("port") or DEFAULT_PORT)
    listen_port = preferred_port if args.strict_port else find_available_port(preferred_port)
    APP_CONFIG["port"] = listen_port
    if args.localhost_only:
        APP_CONFIG["allowLan"] = False
    save_config(APP_CONFIG)
    _ensure_cmd_state_table()

    pin_code = str(APP_CONFIG["pin"])
    ips = get_lan_and_tailscale_ips()

    lan_url = f"http://{ips['lan_ip']}:{listen_port}/?pin={pin_code}"
    local_url = f"http://127.0.0.1:{listen_port}/?pin={pin_code}"

    append_security_audit("SERVER_STARTED", "127.0.0.1", f"Khởi động Self-Host Companion + WebSocket Realtime trên cổng {listen_port}", "info")

    # Khởi chạy luồng theo dõi & đẩy sự kiện WebSocket Realtime (0.55s)
    ws_thread = threading.Thread(target=_realtime_ws_watcher_loop, daemon=True, name="ag-companion-ws-watcher")
    _ws_thread_ref[0] = ws_thread
    _worker_telemetry["last_ws_loop_at_ms"] = int(time.time() * 1000)
    ws_thread.start()

    bind_host = "127.0.0.1" if args.localhost_only else "0.0.0.0"
    srv = ThreadingHTTPServer((bind_host, listen_port), CompanionRequestHandler)
    _sync_runtime_state_file()

    print("=" * 76)
    print("  ANTIGRAVITY MOBILE COMPANION v2.2 — HARDENED SYNC + WEBSOCKET REALTIME")
    print("=" * 76)
    print(f"  * Máy trạm (Host PC)  : {HOST_NAME}")
    print(f"  * Vùng dữ liệu Local  : {ANTIGRAVITY_DIR}")
    print(f"  * Đồng bộ Realtime    : WebSocket ws://{ips['lan_ip']}:{listen_port}/ws (0.55s live stream)")
    print(f"  * Mã PIN Bảo Mật      : {pin_code} (Chống Brute-Force: khóa IP sau {MAX_FAILED_ATTEMPTS} lần sai)")
    print(f"  * Mã QR Offline       : Tạo SVG trực tiếp trên máy (Zero Third-Party Leak)")
    print(f"  * Mở trên PC này      : {local_url}")
    if APP_CONFIG.get("allowLan", True):
        print(f"  * Mở qua Wi-Fi LAN    : {lan_url}")
    else:
        print("  * Chế độ Wi-Fi LAN    : ĐANG KHÓA (Chỉ cho phép Localhost + Tunnel)")
    if ips["tailscale_ip"]:
        print(f"  * Mở qua Tailscale    : http://{ips['tailscale_ip']}:{listen_port}/?pin={pin_code}")

    if args.tunnel:
        print("  * Đang khởi tạo đường hầm 4G/5G Cloudflare Quick Tunnel...")
        tun = start_cloudflare_quick_tunnel(listen_port)
        if tun.get("url"):
            print(f"  * Mở qua 4G/5G (Mọi nơi): {tun['url']}/?pin={pin_code}")
        else:
            print(f"  * Lưu ý Tunnel        : {tun.get('error')}")
    else:
        print("  * Mẹo 4G/5G           : Bấm nút [Settings] -> [Kết Nối QR & 4G/5G] trên giao diện")
    print("=" * 76)
    _sync_runtime_state_file()

    if not args.no_browser:
        def _open_ui() -> None:
            time.sleep(0.8)
            try:
                import webbrowser
                webbrowser.open(local_url)
            except Exception:
                pass
        threading.Thread(target=_open_ui, daemon=True).start()

    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nĐang dừng Antigravity Mobile Companion...")
        stop_cloudflare_quick_tunnel()
        srv.server_close()


if __name__ == "__main__":
    main()
