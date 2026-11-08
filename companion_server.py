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

COMPANION_RUNTIME_VERSION = "2026.11.08-v2.4.0-chatgpt-codex-dual-engine"
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
    cg = ov.get("chatgpt") or {}
    cg_q = cg.get("quota") or {}
    parts.append(f"CGQ:{cg_q.get('source')}:{cg_q.get('limitReached')}:{(cg_q.get('fiveHour') or {}).get('remainingPercent')}:{(cg_q.get('weekly') or {}).get('remainingPercent')}")
    for c in cg.get("pinnedConversations", [])[:35]:
        parts.append(f"CGP:{c['id']}:{c.get('title','')}:{c.get('isRunning')}:{c.get('stepCount')}:{c.get('relativeTime')}")
    for p in cg.get("projects", []):
        for c in p.get("conversations", [])[:25]:
            parts.append(f"CG:{p['name']}:{c['id']}:{c.get('title','')}:{c.get('isRunning')}:{c.get('stepCount')}:{c.get('relativeTime')}")
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

            # Đồng bộ các hội thoại đang mở trên màn hình hoặc đang chạy (Running) trên cả Antigravity & ChatGPT PC
            for p in ov.get("projects", []):
                for c in p.get("conversations", [])[:10]:
                    if c.get("isRunning") and c.get("id"):
                        sub_cids.add(str(c["id"]))
            for p in ((ov.get("chatgpt") or {}).get("projects") or []):
                for c in p.get("conversations", [])[:10]:
                    if c.get("isRunning") and c.get("id"):
                        sub_cids.add(str(c["id"]))
            for act_cid in list(_chatgpt_active_turns.keys()):
                sub_cids.add(str(act_cid))

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
    prev_pin = str(cfg.get("pin") or "").strip()
    if custom_pin:
        new_pin_val = str(custom_pin).strip()
        if prev_pin and prev_pin != new_pin_val:
            cfg["activeSessions"] = {}
        cfg["pin"] = new_pin_val
    elif not cfg.get("pin"):
        cfg["pin"] = _generate_random_pin()
    if custom_port:
        cfg["port"] = int(custom_port)
    elif not cfg.get("port"):
        cfg["port"] = DEFAULT_PORT
    cfg.setdefault("allowLan", True)
    cfg.setdefault("pinned", {})
    cfg.setdefault("customConvs", {})
    raw_sessions = cfg.get("activeSessions")
    valid_sessions: dict[str, dict] = {}
    now_ts = time.time()
    if isinstance(raw_sessions, dict):
        for tok, info in raw_sessions.items():
            if isinstance(tok, str) and tok.startswith("ags_") and isinstance(info, dict):
                if (now_ts - float(info.get("lastSeen") or 0)) <= SESSION_TTL_SEC:
                    valid_sessions[tok] = info
    cfg["activeSessions"] = valid_sessions
    with _auth_lock:
        _active_sessions.clear()
        _active_sessions.update(valid_sessions)
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



# ============================================================================
# 5B. CHATGPT PC (CODEX DESKTOP) DUAL-ENGINE REALTIME SYNC & PROMPT DISPATCH
# ============================================================================

CODEX_DIR = Path(os.environ.get("AG_CODEX_DIR") or (Path(r"C:\Users\vuuyd\.codex") if Path(r"C:\Users\vuuyd\.codex").is_dir() else (HOME / ".codex")))
CODEX_GLOBAL_STATE_FILE = CODEX_DIR / ".codex-global-state.json"
CODEX_CATALOG_DB = CODEX_DIR / "sqlite" / "codex.db"
CODEX_CATALOG_DEV_DB = CODEX_DIR / "sqlite" / "codex-dev.db"
CODEX_STATE_DB = CODEX_DIR / "state_5.sqlite"
CODEX_HISTORY_DB = CODEX_DIR / "thread_history_1.sqlite"
CODEX_LOCKS_DIR = CODEX_DIR / "thread-writer-locks"
CODEX_MODELS_WORK_FILE = CODEX_DIR / "models_cache.codex_work_desktop.json"
CODEX_MODELS_FILE = CODEX_DIR / "models_cache.json"
COMPANION_REMOTE_VAULT_DIR = HOME / ".antigravity_tools" / "ag-remote-vault"

_conv_detail_cache: dict[str, dict] = {}
_chatgpt_overview_cache: dict = {"at": 0.0, "sig": (), "data": None}
_chatgpt_models_cache: dict = {"at": 0.0, "data": []}
_chatgpt_pinned_overrides: dict = {}
_chatgpt_optimistic_convs: dict[str, dict] = {}
_chatgpt_known_cids: set[str] = set()
CHATGPT_CONTINUATIONS_FILE = (
    (HOME / ".antigravity_tools" / "chatgpt_tpp_continuations.json")
    if (HOME / ".antigravity_tools").is_dir()
    else (COMPANION_DATA_DIR / "chatgpt_tpp_continuations.json")
)
_chatgpt_cont_lock = threading.Lock()
_chatgpt_continuations: dict[str, dict] = {}
_chatgpt_continuations_loaded: list[bool] = [False]
_chatgpt_active_turns: dict[str, dict] = {}


def _load_chatgpt_continuations() -> dict[str, dict]:
    """Load persisted follow-up turns and backing thread IDs for ChatGPT PC conversations."""
    if _chatgpt_continuations_loaded[0]:
        return _chatgpt_continuations
    with _chatgpt_cont_lock:
        if _chatgpt_continuations_loaded[0]:
            return _chatgpt_continuations
        for cand_file in (CHATGPT_CONTINUATIONS_FILE, COMPANION_DATA_DIR / "chatgpt_tpp_continuations.json"):
            if cand_file.is_file():
                try:
                    raw = json.loads(cand_file.read_text(encoding="utf-8", errors="replace"))
                    if isinstance(raw, dict):
                        for k, v in raw.items():
                            if isinstance(v, dict) and str(k) not in _chatgpt_continuations:
                                _chatgpt_continuations[str(k)] = v
                except Exception:
                    pass
        _chatgpt_continuations_loaded[0] = True
    return _chatgpt_continuations


def _save_chatgpt_continuations() -> None:
    """Persist _chatgpt_continuations atomically to disk."""
    with _chatgpt_cont_lock:
        for target_file in {CHATGPT_CONTINUATIONS_FILE, COMPANION_DATA_DIR / "chatgpt_tpp_continuations.json"}:
            try:
                target_file.parent.mkdir(parents=True, exist_ok=True)
                tmp_p = target_file.with_name(target_file.name + ".tmp")
                tmp_p.write_text(json.dumps(_chatgpt_continuations, ensure_ascii=False, indent=2), encoding="utf-8")
                os.replace(tmp_p, target_file)
            except Exception:
                pass


def _read_codex_rollout_jsonl(r_path: Path) -> list[dict]:
    """Standalone rollout JSONL parser (zero external dependency)."""
    out: list[dict] = []
    try:
        for raw_line in r_path.read_text(encoding="utf-8", errors="replace").splitlines():
            if not raw_line.strip():
                continue
            try:
                ev = json.loads(raw_line)
            except Exception:
                continue
            if not isinstance(ev, dict):
                continue
            payload = ev.get("payload") if isinstance(ev.get("payload"), dict) else ev
            role = str(payload.get("role") or "")
            if role in ("user", "assistant"):
                parts = payload.get("content") or []
                txts = []
                if isinstance(parts, list):
                    for pt in parts:
                        if isinstance(pt, dict) and pt.get("text"):
                            txts.append(str(pt["text"]))
                        elif isinstance(pt, str):
                            txts.append(pt)
                elif isinstance(parts, str):
                    txts.append(parts)
                if txts:
                    out.append({"role": role, "text": "\n".join(txts), "thinking": "", "tools": []})
    except Exception:
        pass
    return out


SNAPSHOT_SCHEMA_V = 4

_COMPANION_SECRET_PATTERNS = [
    (
        re.compile(r"-----BEGIN [^-]*(?:PRIVATE KEY|CERTIFICATE)[^-]*-----.*?(?:-----END [^-]+-----|$)", re.S),
        "[PRIVATE KEY REDACTED]",
    ),
    (
        re.compile(
            r"\b(?:sk-(?:ant-|proj-)?[A-Za-z0-9_\-]{20,}|[sr]k_(?:live|test)_[A-Za-z0-9]{20,}"
            r"|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|glpat-[A-Za-z0-9_\-]{20,}"
            r"|AIza[A-Za-z0-9_\-]{30,}|ya29\.[A-Za-z0-9_\-]{25,}|xox[abprs]-[A-Za-z0-9\-]{15,}"
            r"|A(?:KIA|SIA)[0-9A-Z]{16}|hf_[A-Za-z0-9]{30,}|npm_[A-Za-z0-9]{30,})\b"
        ),
        "[SECRET REDACTED]",
    ),
    (
        re.compile(r"\beyJ[A-Za-z0-9_\-]{15,}\.eyJ[A-Za-z0-9_\-]{15,}\.[A-Za-z0-9_\-]{15,}\b"),
        "[JWT REDACTED]",
    ),
    (
        re.compile(r"(\b(?:postgres|postgresql|mysql|mongodb|redis|amqp)s?://[^\s:/@]+:)[^\s@/]+@"),
        r"\1[REDACTED]@",
    ),
]


def _sanitize_companion_text(text: str | None) -> str:
    """Redact only genuine high-confidence secret keys without mangling file paths, prose, or markdown tables."""
    if not text:
        return ""
    out = str(text)
    for pat, repl in _COMPANION_SECRET_PATTERNS:
        out = pat.sub(repl, out)
    return out


def _clip_companion_text(text: str | None, max_chars: int = 8000) -> str:
    s = _sanitize_companion_text(text)
    if len(s) <= max_chars:
        return s
    return s[:max_chars] + f"\n… [đã rút gọn {len(s) - max_chars} ký tự log công cụ]"



def _get_transcript_path(cid: str) -> Path:
    """Prefer untruncated transcript_full.jsonl over compact transcript.jsonl."""
    logs_dir = BRAIN_DIR / cid / ".system_generated" / "logs"
    t_full = logs_dir / "transcript_full.jsonl"
    if t_full.exists():
        return t_full
    return logs_dir / "transcript.jsonl"


def _norm_codex_epoch(val) -> float:
    """Normalize Codex/ChatGPT timestamps (which may be in seconds or milliseconds) to epoch seconds."""
    if not val:
        return 0.0
    try:
        f = float(val)
    except (ValueError, TypeError):
        return parse_iso_epoch(str(val))
    if f > 1e11:
        return f / 1000.0
    return f


def get_chatgpt_models() -> list[dict]:
    """Read ChatGPT PC / Codex Desktop models from models_cache.codex_work_desktop.json."""
    now = time.time()
    if _chatgpt_models_cache["data"] and (now - _chatgpt_models_cache["at"]) < 60.0:
        return _chatgpt_models_cache["data"]

    default_list = [
        {
            "id": "gpt-6.1-sol:ultra",
            "slug": "gpt-6.1-sol",
            "effort": "ultra",
            "label": "GPT-6.1 Sol Ultra",
            "name": "GPT-6.1 Sol",
            "tier": "Ultra",
            "tag": "Ultra",
            "remainingFraction": 1.0,
        },
        {
            "id": "gpt-6.1-sol:max",
            "slug": "gpt-6.1-sol",
            "effort": "max",
            "label": "GPT-6.1 Sol Max",
            "name": "GPT-6.1 Sol",
            "tier": "Max",
            "tag": "Max",
            "remainingFraction": 1.0,
        },
        {
            "id": "gpt-6.1-sol:xhigh",
            "slug": "gpt-6.1-sol",
            "effort": "xhigh",
            "label": "GPT-6.1 Sol Extra High",
            "name": "GPT-6.1 Sol",
            "tier": "Extra High",
            "tag": "xHigh",
            "remainingFraction": 1.0,
        },
        {
            "id": "gpt-6.1-sol:high",
            "slug": "gpt-6.1-sol",
            "effort": "high",
            "label": "GPT-6.1 Sol High",
            "name": "GPT-6.1 Sol",
            "tier": "High",
            "tag": "High",
            "remainingFraction": 1.0,
        },
        {
            "id": "gpt-6-astra:high",
            "slug": "gpt-6-astra",
            "effort": "high",
            "label": "GPT-6 Astra (High)",
            "name": "GPT-6 Astra",
            "tier": "High",
            "tag": "Fast",
            "remainingFraction": 1.0,
        },
        {
            "id": "gpt-6.1-terra:high",
            "slug": "gpt-6.1-terra",
            "effort": "high",
            "label": "GPT-6.1 Terra (High)",
            "name": "GPT-6.1 Terra",
            "tier": "High",
            "tag": "Terra",
            "remainingFraction": 1.0,
        },
        {
            "id": "gpt-6-sol:high",
            "slug": "gpt-6-sol",
            "effort": "high",
            "label": "GPT-6 Sol (High)",
            "name": "GPT-6 Sol",
            "tier": "High",
            "tag": "",
            "remainingFraction": 1.0,
        },
        {
            "id": "gpt-6-luna:high",
            "slug": "gpt-6-luna",
            "effort": "high",
            "label": "GPT-6 Luna (High)",
            "name": "GPT-6 Luna",
            "tier": "High",
            "tag": "Fast",
            "remainingFraction": 1.0,
        },
    ]

    src_file = CODEX_MODELS_WORK_FILE if CODEX_MODELS_WORK_FILE.is_file() else CODEX_MODELS_FILE
    if src_file.is_file():
        try:
            raw = json.loads(src_file.read_text(encoding="utf-8", errors="replace"))
            models_arr = [
                m for m in (raw.get("models") or [])
                if isinstance(m, dict) and m.get("visibility") == "list" and m.get("slug")
            ]
            models_arr.sort(key=lambda x: int(x.get("priority") if x.get("priority") is not None else 99))
            parsed: list[dict] = []
            for m in models_arr:
                slug = str(m.get("slug") or "").strip()
                raw_dname = str(m.get("display_name") or slug).strip()
                dname = re.sub(
                    r"^gpt-(\d+(?:\.\d+)?)-([a-z0-9]+)$",
                    lambda mo: f"GPT-{mo.group(1)} {mo.group(2).capitalize()}",
                    raw_dname,
                    flags=re.IGNORECASE,
                )
                levels = [
                    str(lv.get("effort") or "").strip()
                    for lv in (m.get("supported_reasoning_levels") or [])
                    if isinstance(lv, dict) and lv.get("effort")
                ]
                if slug == "gpt-6.1-sol":
                    for eff, tier_lbl, tag_lbl in (
                        ("ultra", "Ultra", "Ultra"),
                        ("max", "Max", "Max"),
                        ("xhigh", "Extra High", "xHigh"),
                        ("high", "High", "High"),
                        ("medium", "Medium", "Med"),
                    ):
                        if not levels or eff in levels:
                            parsed.append({
                                "id": f"{slug}:{eff}",
                                "slug": slug,
                                "effort": eff,
                                "label": f"{dname} {tier_lbl}",
                                "name": dname,
                                "tier": tier_lbl,
                                "tag": tag_lbl,
                                "remainingFraction": 1.0,
                            })
                else:
                    def_eff = str(m.get("default_reasoning_level") or "high").strip()
                    tier_lbl = def_eff.capitalize()
                    parsed.append({
                        "id": f"{slug}:{def_eff}",
                        "slug": slug,
                        "effort": def_eff,
                        "label": f"{dname} ({tier_lbl})",
                        "name": dname,
                        "tier": tier_lbl,
                        "tag": "Fast" if ("astra" in slug or "luna" in slug or "mini" in slug) else "",
                        "remainingFraction": 1.0,
                    })
            if parsed:
                _chatgpt_models_cache["at"] = now
                _chatgpt_models_cache["data"] = parsed
                return parsed
        except Exception:
            pass

    _chatgpt_models_cache["at"] = now
    _chatgpt_models_cache["data"] = default_list
    return default_list


_chatgpt_quota_cache: dict = {"at": 0.0, "tried_at": 0.0, "data": None, "fetching": False, "error": ""}
_chatgpt_quota_lock = threading.Lock()


def _clean_win_path(p: str) -> str:
    """Strip Windows extended-length path prefix (\\\\?\\) so path comparisons work reliably."""
    s = str(p or "").strip()
    if s.startswith("\\\\?\\UNC\\"):
        s = "\\\\" + s[8:]
    elif s.startswith("\\\\?\\"):
        s = s[4:]
    return s


def _codex_db_effective_mtime(db_path: Path) -> float:
    """Return effective mtime+size signature of SQLite file and its -wal/-shm files so WAL writes invalidate caches immediately."""
    best = 0.0
    for p in (
        db_path,
        db_path.with_name(db_path.name + "-wal"),
        db_path.with_name(db_path.name + "-shm"),
    ):
        try:
            if p.exists():
                st = p.stat()
                m = float(st.st_mtime) + (int(st.st_size) % 100000) * 1e-6
                if m > best:
                    best = m
        except OSError:
            pass
    return best


def _codex_active_lock_tids() -> set[str]:
    """Return set of thread IDs that currently hold an active writer lock in ~/.codex/thread-writer-locks."""
    out: set[str] = set()
    if not CODEX_LOCKS_DIR.is_dir():
        return out
    now = time.time()
    try:
        for f in CODEX_LOCKS_DIR.iterdir():
            if f.name.endswith(".lock") and not f.name.startswith("."):
                tid = f.name[:-5].strip()
                if len(tid) == 36:
                    try:
                        if (now - f.stat().st_mtime) < 600.0:
                            out.add(tid)
                    except OSError:
                        out.add(tid)
    except OSError:
        pass
    return out


def _pct_ceil(v) -> int:
    try:
        f = float(v)
        c = int(f) if f == int(f) else int(f) + 1
        return max(0, min(100, c))
    except (TypeError, ValueError):
        return 0


def _int_or(v, default: int) -> int:
    try:
        return int(v) if v is not None else default
    except (TypeError, ValueError):
        return default


def _format_codex_reset_duration(seconds: int, is_weekly: bool = False) -> str:
    sec = max(0, int(seconds or 0))
    if is_weekly:
        days = sec // 86400
        hours = (sec % 86400 + 1800) // 3600
        if hours >= 24:
            days += 1
            hours = 0
        if days > 0:
            return f"Đặt lại sau {days} ngày, {hours} giờ"
        return f"Đặt lại sau {hours} giờ"
    hours = sec // 3600
    mins = (sec % 3600 + 30) // 60
    if mins >= 60:
        hours += 1
        mins = 0
    return f"Đặt lại sau {hours} giờ, {mins} phút"


def _fetch_chatgpt_live_quota_sync() -> dict | None:
    auth_file = CODEX_DIR / "auth.json"
    if not auth_file.is_file():
        return None
    try:
        auth = json.loads(auth_file.read_text(encoding="utf-8", errors="replace"))
        tokens = auth.get("tokens") if isinstance(auth, dict) and isinstance(auth.get("tokens"), dict) else {}
        acc_tok = str(tokens.get("access_token") or auth.get("access_token") or "").strip()
        acc_id = str(tokens.get("account_id") or auth.get("account_id") or "").strip()
        if not acc_tok:
            return None
        headers = {
            "Authorization": f"Bearer {acc_tok}",
            "User-Agent": "CodexDesktop/1.0",
            "Accept": "application/json",
        }
        if acc_id:
            headers["ChatGPT-Account-Id"] = acc_id
        req = urllib.request.Request("https://chatgpt.com/backend-api/wham/usage", headers=headers)
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            raw = json.loads(resp.read().decode("utf-8", errors="replace"))
        if not isinstance(raw, dict):
            return None
        rl = raw.get("rate_limit") if isinstance(raw.get("rate_limit"), dict) else None
        if not isinstance(rl, dict):
            return None
        pw = rl.get("primary_window") if isinstance(rl.get("primary_window"), dict) else {}
        sw = rl.get("secondary_window") if isinstance(rl.get("secondary_window"), dict) else {}
        p_used = _pct_ceil(pw.get("used_percent"))
        s_used = _pct_ceil(sw.get("used_percent"))
        p_rem = max(0, 100 - p_used)
        s_rem = max(0, 100 - s_used)
        now_i = int(time.time())
        p_reset_after = max(0, _int_or(pw.get("reset_after_seconds"), 18000))
        s_reset_after = max(0, _int_or(sw.get("reset_after_seconds"), 604800))
        p_reset_at = _int_or(pw.get("reset_at"), now_i + p_reset_after)
        s_reset_at = _int_or(sw.get("reset_at"), now_i + s_reset_after)
        allowed_raw = rl.get("allowed")
        allowed = (True if allowed_raw is None else bool(allowed_raw)) and p_rem > 0 and s_rem > 0
        limit_reached = bool(rl.get("limit_reached", False)) or p_rem <= 0 or s_rem <= 0
        if s_rem <= 0 and p_rem <= 0:
            blocked_until = max(p_reset_at, s_reset_at)
        elif s_rem <= 0:
            blocked_until = s_reset_at
        elif p_rem <= 0:
            blocked_until = p_reset_at
        else:
            blocked_until = None
        reset_hm = (
            datetime.datetime.fromtimestamp(blocked_until).strftime("%H:%M %d/%m")
            if blocked_until
            else ""
        )
        return {
            "source": "live",
            "accountId": acc_id,
            "fetchedAt": now_i,
            "planType": str(raw.get("plan_type") or "plus"),
            "allowed": allowed,
            "limitReached": limit_reached,
            "blockedUntil": blocked_until,
            "resetTimeHm": reset_hm,
            "fiveHour": {
                "usedPercent": p_used,
                "remainingPercent": p_rem,
                "resetAfterSeconds": p_reset_after,
                "resetAt": p_reset_at,
                "resetLabel": _format_codex_reset_duration(p_reset_after, is_weekly=False),
            },
            "weekly": {
                "usedPercent": s_used,
                "remainingPercent": s_rem,
                "resetAfterSeconds": s_reset_after,
                "resetAt": s_reset_at,
                "resetLabel": _format_codex_reset_duration(s_reset_after, is_weekly=True),
            },
        }
    except Exception as exc:
        _chatgpt_quota_cache["error"] = str(exc)[:120]
        return None


def _refresh_chatgpt_quota_bg() -> None:
    try:
        fresh = _fetch_chatgpt_live_quota_sync()
        if fresh:
            _chatgpt_quota_cache["data"] = fresh
            _chatgpt_quota_cache["at"] = time.time()
            _chatgpt_quota_cache["error"] = ""
    finally:
        _chatgpt_quota_cache["tried_at"] = time.time()
        _chatgpt_quota_cache["fetching"] = False


def _quota_view(data: dict | None, now: float) -> dict:
    """Recompute remaining reset duration dynamically at serve time; never fabricate numbers when unavailable."""
    if not data:
        return {
            "source": "unavailable",
            "error": _chatgpt_quota_cache.get("error") or "",
            "fetchedAt": None,
            "planType": None,
            "allowed": True,
            "limitReached": False,
            "blockedUntil": None,
            "resetTimeHm": "",
            "fiveHour": None,
            "weekly": None,
        }
    out = copy.deepcopy(data)
    now_i = int(now)
    for key, is_wk in (("fiveHour", False), ("weekly", True)):
        w = out.get(key)
        if isinstance(w, dict):
            ra = int(w.get("resetAt") or 0)
            if ra > 0:
                left = max(0, ra - now_i)
                w["resetAfterSeconds"] = left
                w["resetLabel"] = _format_codex_reset_duration(left, is_weekly=is_wk)
    age = now - float(out.get("fetchedAt") or 0.0)
    out["source"] = "live" if age < 180.0 else "stale"
    return out


def get_chatgpt_live_quota(max_age: float = 45.0, retry_after: float = 20.0) -> dict:
    now = time.time()
    with _chatgpt_quota_lock:
        cached = _chatgpt_quota_cache.get("data")
        tried_at = float(_chatgpt_quota_cache.get("tried_at") or 0.0)
        if cached is None and tried_at == 0.0 and not _chatgpt_quota_cache.get("fetching"):
            _chatgpt_quota_cache["fetching"] = True
            _chatgpt_quota_cache["tried_at"] = now
            fresh = _fetch_chatgpt_live_quota_sync()
            if fresh:
                _chatgpt_quota_cache["data"] = fresh
                _chatgpt_quota_cache["at"] = time.time()
                _chatgpt_quota_cache["error"] = ""
            _chatgpt_quota_cache["fetching"] = False
            return _quota_view(_chatgpt_quota_cache.get("data"), time.time())
        age = now - float(_chatgpt_quota_cache.get("at") or 0.0)
        since_try = now - tried_at
        if age >= max_age and since_try >= retry_after and not _chatgpt_quota_cache.get("fetching"):
            _chatgpt_quota_cache["fetching"] = True
            threading.Thread(target=_refresh_chatgpt_quota_bg, daemon=True).start()
    return _quota_view(_chatgpt_quota_cache.get("data"), now)


def build_chatgpt_overview() -> dict:
    """Build real-time overview of ChatGPT PC (Codex Desktop) pinned threads, projects, models, and quota alerts."""
    now = time.time()
    live_quota = get_chatgpt_live_quota()
    gs_mtime = _codex_db_effective_mtime(CODEX_GLOBAL_STATE_FILE)
    cat_mtime = _codex_db_effective_mtime(CODEX_CATALOG_DB)
    cat_dev_mtime = _codex_db_effective_mtime(CODEX_CATALOG_DEV_DB)
    st_mtime = _codex_db_effective_mtime(CODEX_STATE_DB)
    th_mtime = _codex_db_effective_mtime(CODEX_HISTORY_DB)
    active_lock_tids = _codex_active_lock_tids()

    fh_rem = (live_quota.get("fiveHour") or {}).get("remainingPercent")
    wk_rem = (live_quota.get("weekly") or {}).get("remainingPercent")
    _load_chatgpt_continuations()
    pin_sig = tuple(
        sorted((k, v[0] if isinstance(v, tuple) else bool(v)) for k, v in _chatgpt_pinned_overrides.items())
    )
    opt_sig = tuple(sorted(_chatgpt_optimistic_convs.keys()))
    cont_sig = tuple(
        sorted(
            (k, round(float(v.get("updatedAt") or 0.0), 2), len(v.get("turns") or []))
            for k, v in _chatgpt_continuations.items()
            if isinstance(v, dict)
        )
    )
    act_sig = tuple(
        sorted(
            (k, int(v.get("seq") or 0))
            for k, v in _chatgpt_active_turns.items()
            if isinstance(v, dict)
        )
    )
    lock_sig = tuple(sorted(active_lock_tids))
    sig = (
        round(gs_mtime, 6),
        round(cat_mtime, 6),
        round(cat_dev_mtime, 6),
        round(st_mtime, 6),
        round(th_mtime, 6),
        pin_sig,
        opt_sig,
        cont_sig,
        act_sig,
        lock_sig,
        live_quota.get("source"),
        bool(live_quota.get("limitReached")),
        fh_rem,
        wk_rem,
    )
    if (
        _chatgpt_overview_cache.get("data") is not None
        and _chatgpt_overview_cache.get("sig") == sig
        and (now - float(_chatgpt_overview_cache.get("at") or 0.0)) < 1.1
    ):
        return _chatgpt_overview_cache["data"]

    pinned_ids: list[str] = []
    thread_proj_assign: dict[str, str] = {}
    gs_local_projects: dict[str, dict] = {}
    gs_proj_order: list[str] = []
    if CODEX_GLOBAL_STATE_FILE.is_file():
        try:
            gs = json.loads(CODEX_GLOBAL_STATE_FILE.read_text(encoding="utf-8", errors="replace"))
            if isinstance(gs, dict):
                pinned_ids = [str(x).strip() for x in (gs.get("pinned-thread-ids") or []) if str(x).strip()]
                raw_assign = gs.get("thread-project-assignments") or {}
                if isinstance(raw_assign, dict):
                    for tid, aobj in raw_assign.items():
                        if isinstance(aobj, dict) and aobj.get("projectId"):
                            thread_proj_assign[str(tid).strip()] = str(aobj["projectId"]).strip()
                raw_lp = gs.get("local-projects") or {}
                if isinstance(raw_lp, dict):
                    gs_local_projects = {str(k).strip(): v for k, v in raw_lp.items() if isinstance(v, dict)}
                gs_proj_order = [str(x).strip() for x in (gs.get("project-order") or []) if str(x).strip()]
        except Exception:
            pass

    gs_pinned_set = set(pinned_ids)
    for cid_ov, raw_ov in list(_chatgpt_pinned_overrides.items()):
        p_val = raw_ov[0] if isinstance(raw_ov, tuple) else bool(raw_ov)
        ov_ts = float(raw_ov[1]) if isinstance(raw_ov, tuple) and len(raw_ov) > 1 else now
        if (cid_ov in gs_pinned_set) == p_val or (now - ov_ts) > 120.0:
            _chatgpt_pinned_overrides.pop(cid_ov, None)
            continue
        if p_val and cid_ov not in pinned_ids:
            pinned_ids.insert(0, cid_ov)
        elif not p_val and cid_ov in pinned_ids:
            pinned_ids = [x for x in pinned_ids if x != cid_ov]
    pinned_set = set(pinned_ids)

    # Load projects and threads from state_5.sqlite (isolated try blocks so project errors never drop threads)
    projects_meta: dict[str, dict] = {}
    project_roots_list: list[tuple[str, str]] = []  # (norm_root_lower, canonical_project_id)
    pid_alias_to_canonical: dict[str, str] = {}
    threads_meta: dict[str, dict] = {}

    if CODEX_STATE_DB.is_file():
        try:
            with contextlib.closing(
                sqlite3.connect(f"file:{CODEX_STATE_DB.as_posix()}?mode=ro", uri=True, timeout=2.0)
            ) as con_st:
                try:
                    proj_rows = con_st.execute(
                        """
                        SELECT p.id, p.name, p.position, pr.path, p.metadata
                        FROM projects p
                        LEFT JOIN project_roots pr ON p.id = pr.project_id
                        ORDER BY p.position ASC, pr.position ASC
                        """
                    ).fetchall()
                except Exception:
                    proj_rows = []
                for pid, pname, pos, rpath, pmeta_raw in proj_rows:
                    pid_s = str(pid or "").strip()
                    if not pid_s:
                        continue
                    rpath_s = _clean_win_path(rpath)
                    pid_alias_to_canonical[pid_s] = pid_s
                    if pmeta_raw:
                        try:
                            pm_obj = json.loads(str(pmeta_raw))
                            if isinstance(pm_obj, dict):
                                lp_id_meta = str(pm_obj.get("codex.localProjectId") or "").strip()
                                if lp_id_meta:
                                    pid_alias_to_canonical[lp_id_meta] = pid_s
                                cb_raw = pm_obj.get("codex.chatGptBacking")
                                cb_obj = json.loads(cb_raw) if isinstance(cb_raw, str) else cb_raw
                                if isinstance(cb_obj, dict) and cb_obj.get("projectId"):
                                    pid_alias_to_canonical[str(cb_obj["projectId"]).strip()] = pid_s
                        except Exception:
                            pass
                    if pid_s not in projects_meta:
                        projects_meta[pid_s] = {
                            "id": pid_s,
                            "name": str(pname or pid_s).strip(),
                            "position": _int_or(pos, 99),
                            "folderPath": rpath_s,
                        }
                    elif rpath_s and not projects_meta[pid_s]["folderPath"]:
                        projects_meta[pid_s]["folderPath"] = rpath_s
                    if rpath_s:
                        norm_r = rpath_s.replace("/", "\\").rstrip("\\").lower()
                        if len(norm_r) > 3:
                            project_roots_list.append((norm_r, pid_s))

                try:
                    t_rows = con_st.execute(
                        """
                        SELECT id, title, name, cwd, project_id, is_pinned, archived,
                               updated_at, recency_at, model, reasoning_effort, source, thread_source, rollout_path
                        FROM threads
                        WHERE COALESCE(archived, 0) = 0
                          AND COALESCE(thread_source, '') != 'subagent'
                        """
                    ).fetchall()
                except Exception:
                    t_rows = []
                for r in t_rows:
                    tid = str(r[0] or "").strip()
                    if not tid:
                        continue
                    src_str = str(r[11] or "vscode").strip()
                    if src_str.startswith('{"subagent"'):
                        continue
                    title_src = str(r[2] or r[1] or "").strip()
                    raw_t = (title_src.splitlines() or [""])[0][:85]
                    threads_meta[tid] = {
                        "id": tid,
                        "title": raw_t,
                        "cwd": _clean_win_path(r[3]),
                        "project_id": str(r[4] or "").strip(),
                        "is_pinned": bool(r[5]),
                        "updated_at": _norm_codex_epoch(r[7]),
                        "recency_at": _norm_codex_epoch(r[8]),
                        "model": str(r[9] or "gpt-6.1-sol").strip(),
                        "reasoning_effort": str(r[10] or "ultra").strip(),
                        "source": src_str,
                        "thread_source": str(r[12] or "").strip(),
                        "rollout_path": str(r[13] or "").strip(),
                    }
        except Exception:
            pass

    # Map .codex-global-state.json local-projects IDs and chatGptBacking.projectId to canonical project IDs
    order_idx = {pid: i for i, pid in enumerate(gs_proj_order)}
    for lp_id, lp_obj in gs_local_projects.items():
        lp_name = str(lp_obj.get("name") or lp_id).strip()
        roots = lp_obj.get("rootPaths") or []
        rpath_s = _clean_win_path(roots[0] if roots else "")
        norm_r = rpath_s.replace("/", "\\").rstrip("\\").lower() if rpath_s else ""
        matched_canon = ""
        for ex_r, ex_pid in project_roots_list:
            if norm_r and ex_r == norm_r:
                matched_canon = ex_pid
                break
        if not matched_canon:
            for ex_pid, ex_meta in projects_meta.items():
                if ex_meta["name"].lower() == lp_name.lower():
                    matched_canon = ex_pid
                    break
        if not matched_canon:
            matched_canon = lp_id
            projects_meta[matched_canon] = {
                "id": matched_canon,
                "name": lp_name,
                "position": order_idx.get(lp_id, 50),
                "folderPath": rpath_s,
            }
            if norm_r:
                project_roots_list.append((norm_r, matched_canon))
        pid_alias_to_canonical[lp_id] = matched_canon
        backing = lp_obj.get("chatGptBacking")
        if isinstance(backing, dict) and backing.get("projectId"):
            pid_alias_to_canonical[str(backing["projectId"]).strip()] = matched_canon

    # Sort project_roots_list longest path first so deeper folders match before parent folders
    project_roots_list.sort(key=lambda x: len(x[0]), reverse=True)

    # Read local_thread_catalog from sqlite/codex.db AND sqlite/codex-dev.db, plus active_chat_turns
    catalog_by_tid: dict[str, tuple] = {}
    active_turn_tids: set[str] = set(active_lock_tids)
    for db_p in (CODEX_CATALOG_DEV_DB, CODEX_CATALOG_DB):
        if not db_p.is_file():
            continue
        try:
            with contextlib.closing(
                sqlite3.connect(f"file:{db_p.as_posix()}?mode=ro", uri=True, timeout=2.0)
            ) as con_cat:
                try:
                    rows = con_cat.execute(
                        """
                        SELECT thread_id, display_title, cwd, project_id,
                               source_created_at, source_updated_at, source_recency_at,
                               source_kind, thread_source, chatgpt_async_status, conversation_origin
                        FROM local_thread_catalog
                        WHERE COALESCE(missing_candidate, 0) = 0
                        """
                    ).fetchall()
                except Exception:
                    rows = [
                        (*r, None)
                        for r in con_cat.execute(
                            """
                            SELECT thread_id, display_title, cwd, project_id,
                                   source_created_at, source_updated_at, source_recency_at,
                                   source_kind, thread_source, chatgpt_async_status
                            FROM local_thread_catalog
                            WHERE COALESCE(missing_candidate, 0) = 0
                            """
                        ).fetchall()
                    ]
                for r in rows:
                    tid_k = str(r[0] or "").strip()
                    if not tid_k:
                        continue
                    prev_r = catalog_by_tid.get(tid_k)
                    if prev_r is None or _norm_codex_epoch(r[5] or r[6]) >= _norm_codex_epoch(prev_r[5] or prev_r[6]):
                        catalog_by_tid[tid_k] = r
                try:
                    for act_tid, obs_ms in con_cat.execute("SELECT thread_id, observed_at_ms FROM active_chat_turns").fetchall():
                        if act_tid and (now - _norm_codex_epoch(obs_ms)) < 300.0:
                            active_turn_tids.add(str(act_tid).strip())
                except Exception:
                    pass
        except Exception:
            pass

    hidden_backing_tids = {
        str(v.get("backingTid") or "").strip()
        for k, v in _chatgpt_continuations.items()
        if isinstance(v, dict) and v.get("backingTid") and str(v.get("backingTid")).strip() != k
    }
    all_items_by_id: dict[str, dict] = {}
    for (
        tid,
        d_title,
        cwd,
        cat_pid,
        s_created,
        s_updated,
        s_recency,
        s_kind,
        t_source,
        async_st,
        conv_origin,
    ) in catalog_by_tid.values():
        tid_s = str(tid or "").strip()
        if not tid_s or tid_s in hidden_backing_tids:
            continue
        if str(t_source or "").strip().lower() == "subagent":
            continue
        t_meta = threads_meta.get(tid_s) or {}
        final_title = str(d_title or t_meta.get("title") or "").strip()
        if not final_title:
            continue
        cwd_s = _clean_win_path(cwd or t_meta.get("cwd") or "")
        skind = str(s_kind or t_meta.get("source") or "vscode").strip().lower()
        origin_s = str(conv_origin or "").strip().lower()
        upd_epoch = _norm_codex_epoch(s_updated) or t_meta.get("updated_at") or _norm_codex_epoch(s_created)
        rec_epoch = _norm_codex_epoch(s_recency) or t_meta.get("recency_at") or upd_epoch

        # Always resolve explicit project assignment / chatGptBacking project_id / cwd FIRST
        # so ChatGPT PC project sessions (e.g. Phiên AI, BUSINESS, CLAUDE CODE with g-p-... backing)
        # land in their true project under "Công việc" instead of being misclassified into "Trò chuyện ChatGPT".
        raw_pid = (
            thread_proj_assign.get(tid_s)
            or str(cat_pid or "").strip()
            or str(t_meta.get("project_id") or "").strip()
        )
        pid_s = pid_alias_to_canonical.get(raw_pid, "") if raw_pid else ""
        if not pid_s and cwd_s:
            norm_cwd = cwd_s.replace("/", "\\").rstrip("\\").lower()
            for r_prefix, cand_pid in project_roots_list:
                if norm_cwd == r_prefix or norm_cwd.startswith(r_prefix + "\\"):
                    pid_s = cand_pid
                    break

        if not pid_s:
            if skind == "chatgpt" and origin_s != "tpp":
                pid_s = "chatgpt-cloud-chat"
            elif skind == "cli" and tid_s not in pinned_set:
                pid_s = "chatgpt-cli-sessions"
            else:
                pid_s = "chatgpt-other-workspaces"

        p_info = projects_meta.get(pid_s)
        if p_info:
            p_name = p_info["name"]
            if not cwd_s and p_info.get("folderPath"):
                cwd_s = p_info["folderPath"]
        elif pid_s == "chatgpt-cloud-chat":
            p_name = "Trò chuyện ChatGPT"
        elif pid_s == "chatgpt-cli-sessions":
            p_name = "Phiên Codex CLI"
        else:
            p_name = "Không gian làm việc khác"

        is_chat_group = pid_s == "chatgpt-cloud-chat"
        ws_tag = Path(cwd_s).name if cwd_s else ("ChatGPT" if is_chat_group else p_name)
        is_run_now = (
            tid_s in active_turn_tids
            or str(async_st or "").lower() in ("running", "in_progress", "inprogress", "1")
        )
        all_items_by_id[tid_s] = {
            "id": tid_s,
            "title": final_title,
            "workspaceTag": ws_tag,
            "folderPath": cwd_s,
            "projectId": pid_s,
            "projectName": p_name,
            "stepCount": 1,
            "lastModifiedEpoch": upd_epoch or rec_epoch or now,
            "recencyEpoch": rec_epoch or upd_epoch or now,
            "relativeTime": format_relative_time(rec_epoch or upd_epoch or now, now),
            "status": "CASCADE_RUN_STATUS_RUNNING" if is_run_now else "CASCADE_RUN_STATUS_IDLE",
            "isRunning": is_run_now,
            "unread": False,
            "pinned": tid_s in pinned_set,
            "provider": "chatgpt",
            "sourceKind": "chat" if is_chat_group else "work",
            "rawSourceKind": skind,
            "model": t_meta.get("model") or "gpt-6.1-sol",
            "reasoningEffort": t_meta.get("reasoning_effort") or "ultra",
            "hasError": False,
            "errorMessage": "",
        }

    # Include any threads from state_5.sqlite that were not in local_thread_catalog yet
    for tid_s, t_meta in threads_meta.items():
        if tid_s in all_items_by_id or tid_s in hidden_backing_tids:
            continue
        final_title = str(t_meta.get("title") or "").strip()
        if not final_title:
            continue
        cwd_s = _clean_win_path(t_meta.get("cwd") or "")
        skind = str(t_meta.get("source") or "vscode").strip().lower()
        raw_pid = thread_proj_assign.get(tid_s) or str(t_meta.get("project_id") or "").strip()
        pid_s = pid_alias_to_canonical.get(raw_pid, "") if raw_pid else ""
        if not pid_s and cwd_s:
            norm_cwd = cwd_s.replace("/", "\\").rstrip("\\").lower()
            for r_prefix, cand_pid in project_roots_list:
                if norm_cwd == r_prefix or norm_cwd.startswith(r_prefix + "\\"):
                    pid_s = cand_pid
                    break
        if not pid_s:
            if skind == "cli" and tid_s not in pinned_set:
                pid_s = "chatgpt-cli-sessions"
            else:
                pid_s = "chatgpt-other-workspaces"
        p_info = projects_meta.get(pid_s)
        if p_info:
            p_name = p_info["name"]
        elif pid_s == "chatgpt-cli-sessions":
            p_name = "Phiên Codex CLI"
        else:
            p_name = "Không gian làm việc khác"
        rec_epoch = t_meta.get("recency_at") or t_meta.get("updated_at") or now
        upd_epoch = t_meta.get("updated_at") or rec_epoch
        is_run_now = tid_s in active_turn_tids
        all_items_by_id[tid_s] = {
            "id": tid_s,
            "title": final_title,
            "workspaceTag": Path(cwd_s).name if cwd_s else "",
            "folderPath": cwd_s,
            "projectId": pid_s,
            "projectName": p_name,
            "stepCount": 1,
            "lastModifiedEpoch": upd_epoch,
            "recencyEpoch": max(rec_epoch, upd_epoch),
            "relativeTime": format_relative_time(max(rec_epoch, upd_epoch), now),
            "status": "CASCADE_RUN_STATUS_RUNNING" if is_run_now else "CASCADE_RUN_STATUS_IDLE",
            "isRunning": is_run_now,
            "unread": False,
            "pinned": tid_s in pinned_set,
            "provider": "chatgpt",
            "sourceKind": "work",
            "rawSourceKind": skind,
            "model": t_meta.get("model") or "gpt-6.1-sol",
            "reasoningEffort": t_meta.get("reasoning_effort") or "ultra",
            "hasError": False,
            "errorMessage": "",
        }

    # Inject or merge optimistic ChatGPT conversations without overwriting existing thread metadata on follow-up
    for opt_cid, opt_info in list(_chatgpt_optimistic_convs.items()):
        if now > float(opt_info.get("expiresAt") or 0):
            _chatgpt_optimistic_convs.pop(opt_cid, None)
            continue
        opt_created = float(opt_info.get("createdAt") or now)
        if opt_cid in all_items_by_id:
            existing = all_items_by_id[opt_cid]
            existing["isRunning"] = True
            existing["status"] = "CASCADE_RUN_STATUS_RUNNING"
            existing["relativeTime"] = "now"
            existing["lastModifiedEpoch"] = max(float(existing.get("lastModifiedEpoch") or 0.0), opt_created)
            existing["recencyEpoch"] = max(float(existing.get("recencyEpoch") or 0.0), opt_created)
            continue
        pid_s = str(opt_info.get("projectId") or "01a0b8c2-f8cd-7b81-bf3a-290e3eedee39")
        p_info = projects_meta.get(pid_s) or {"name": "BUSINESS", "folderPath": r"C:\BUSINESS"}
        all_items_by_id[opt_cid] = {
            "id": opt_cid,
            "title": str(opt_info.get("title") or "Phiên làm việc mới"),
            "workspaceTag": Path(str(p_info.get("folderPath") or "")).name,
            "folderPath": str(p_info.get("folderPath") or ""),
            "projectId": pid_s,
            "projectName": str(p_info.get("name") or "BUSINESS"),
            "stepCount": 1,
            "lastModifiedEpoch": opt_created,
            "recencyEpoch": opt_created,
            "relativeTime": "now",
            "status": "CASCADE_RUN_STATUS_RUNNING",
            "isRunning": True,
            "unread": False,
            "pinned": opt_cid in pinned_set,
            "provider": "chatgpt",
            "sourceKind": "work",
            "model": str(opt_info.get("model") or "gpt-6.1-sol"),
            "reasoningEffort": str(opt_info.get("effort") or "ultra"),
            "hasError": False,
            "errorMessage": "",
        }

    _chatgpt_known_cids.clear()
    _chatgpt_known_cids.update(all_items_by_id.keys())

    # Check latest turn statuses and usageLimitExceeded errors in thread_history_1.sqlite for top threads (fast indexed query)
    top_sorted_ids = [
        x["id"]
        for x in sorted(all_items_by_id.values(), key=lambda item: -float(item.get("recencyEpoch") or 0.0))[:70]
    ]
    check_turn_ids = list(dict.fromkeys(pinned_ids + list(active_turn_tids) + top_sorted_ids))
    quota_alert: dict | None = None

    if check_turn_ids and CODEX_HISTORY_DB.is_file():
        try:
            with contextlib.closing(
                sqlite3.connect(f"file:{CODEX_HISTORY_DB.as_posix()}?mode=ro", uri=True, timeout=2.0)
            ) as con_th:
                q_marks = ",".join("?" for _ in check_turn_ids)
                t_rows = con_th.execute(
                    f"""
                    SELECT thread_id, turn_id, status, started_at, completed_at, error_json, rollout_ordinal
                    FROM thread_turns
                    WHERE thread_id IN ({q_marks})
                    ORDER BY thread_id, rollout_ordinal DESC
                    """,
                    check_turn_ids,
                ).fetchall()
                turns_by_tid: dict[str, list[tuple]] = {}
                for tr in t_rows:
                    turns_by_tid.setdefault(str(tr[0]), []).append(tr)

                latest_quota_err_ts = 0.0
                for tid_s, tlist in turns_by_tid.items():
                    item = all_items_by_id.get(tid_s)
                    if not item or not tlist:
                        continue
                    item["stepCount"] = max(1, len(tlist) * 2)
                    latest_tr = tlist[0]
                    st_str = str(latest_tr[2] or "").lower()
                    latest_ts = _norm_codex_epoch(latest_tr[4] or latest_tr[3])
                    if latest_ts > float(item.get("lastModifiedEpoch") or 0.0):
                        item["lastModifiedEpoch"] = latest_ts
                    if latest_ts > float(item.get("recencyEpoch") or 0.0):
                        item["recencyEpoch"] = latest_ts
                        item["relativeTime"] = format_relative_time(latest_ts, now)
                    if st_str in ("running", "in_progress", "inprogress", "pending"):
                        if tid_s in active_turn_tids or (now - max(latest_ts, float(item.get("lastModifiedEpoch") or 0.0))) < 300.0:
                            item["isRunning"] = True
                            item["status"] = "CASCADE_RUN_STATUS_RUNNING"
                    # Check if latest turn failed
                    for tr in tlist[:2]:
                        tr_st = str(tr[2] or "").lower()
                        tr_err_raw = str(tr[5] or "").strip()
                        tr_ts = _norm_codex_epoch(tr[4] or tr[3])
                        if tr_st == "failed" or tr_err_raw:
                            err_msg = ""
                            err_code = ""
                            if tr_err_raw:
                                try:
                                    eobj = json.loads(tr_err_raw)
                                    if isinstance(eobj, dict):
                                        err_msg = str(eobj.get("message") or "").strip()
                                        err_code = str(eobj.get("codexErrorInfo") or "").strip()
                                except Exception:
                                    err_msg = tr_err_raw[:240]
                            # Only flag usageLimitExceeded as active error if live_quota currently shows limitReached
                            if err_code == "usageLimitExceeded" and not live_quota.get("limitReached"):
                                continue
                            if tr == latest_tr:
                                item["hasError"] = True
                                item["errorMessage"] = err_msg or "Lỗi thực thi lượt chạy"
                                item["errorCode"] = err_code
                            if err_code == "usageLimitExceeded" and live_quota.get("limitReached") and tr_ts > latest_quota_err_ts:
                                latest_quota_err_ts = tr_ts
                                m_reset = re.search(r"try again at ([^.\"]+)$", err_msg)
                                reset_str = m_reset.group(1).strip() if m_reset else (live_quota.get("resetTimeHm") or "22:35")
                                quota_alert = {
                                    "active": True,
                                    "title": "Bạn đã hết lượt sử dụng Codex và Công việc",
                                    "subtitle": f"Thêm credit hoặc nâng cấp gói — hoặc chờ mức sử dụng được đặt lại vào {reset_str}",
                                    "rawMessage": err_msg,
                                    "resetTimeLabel": reset_str,
                                    "threadId": tid_s,
                                    "timestamp": int(tr_ts),
                                }
        except Exception:
            pass

    for tid_s, cl_cached in list(_chatgpt_cloud_conv_cache.items()):
        item = all_items_by_id.get(tid_s)
        if not item or not isinstance(cl_cached, dict):
            continue
        cl_msgs = cl_cached.get("messages")
        if isinstance(cl_msgs, list) and cl_msgs:
            cl_steps = len(cl_msgs) + sum(len(m.get("toolCalls") or []) for m in cl_msgs if isinstance(m, dict))
            item["stepCount"] = max(int(item.get("stepCount") or 1), cl_steps)
        cl_mod = float(cl_cached.get("last_mod") or 0.0)
        if cl_mod > float(item.get("lastModifiedEpoch") or 0.0):
            item["lastModifiedEpoch"] = cl_mod
            item["recencyEpoch"] = max(float(item.get("recencyEpoch") or 0.0), cl_mod)
            item["relativeTime"] = format_relative_time(cl_mod, now)
        if cl_cached.get("is_running"):
            item["isRunning"] = True
            item["status"] = "CASCADE_RUN_STATUS_RUNNING"

    for cid_s, cont_obj in list(_chatgpt_continuations.items()):
        item = all_items_by_id.get(cid_s)
        if not item or not isinstance(cont_obj, dict):
            continue
        c_turns = cont_obj.get("turns") or []
        if isinstance(c_turns, list) and c_turns and cid_s.startswith("6"):
            extra_steps = len(c_turns) * 2 + sum(
                len(t.get("toolCalls") or []) for t in c_turns if isinstance(t, dict)
            )
            item["stepCount"] = int(item.get("stepCount") or 1) + extra_steps
        c_upd = float(cont_obj.get("updatedAt") or 0.0)
        if c_upd > float(item.get("lastModifiedEpoch") or 0.0):
            item["lastModifiedEpoch"] = c_upd
            item["recencyEpoch"] = max(float(item.get("recencyEpoch") or 0.0), c_upd)
            item["relativeTime"] = format_relative_time(item["recencyEpoch"], now)

    for cid_s, act_obj in list(_chatgpt_active_turns.items()):
        item = all_items_by_id.get(cid_s)
        if not item or not isinstance(act_obj, dict):
            continue
        act_upd = float(act_obj.get("updatedAt") or now)
        item["isRunning"] = True
        item["status"] = "CASCADE_RUN_STATUS_RUNNING"
        item["lastModifiedEpoch"] = max(float(item.get("lastModifiedEpoch") or 0.0), act_upd)
        item["recencyEpoch"] = max(float(item.get("recencyEpoch") or 0.0), act_upd)
        item["relativeTime"] = "now"
        item["stepCount"] = (
            int(item.get("stepCount") or 1)
            + 1
            + len(act_obj.get("toolCalls") or [])
            + (1 if (act_obj.get("content") or act_obj.get("thinking")) else 0)
        )

    if live_quota.get("limitReached") and not quota_alert:
        reset_hm = str(live_quota.get("resetTimeHm") or "sau ít phút")
        quota_alert = {
            "active": True,
            "title": "Bạn đã hết lượt sử dụng Codex và Công việc",
            "subtitle": f"Thêm credit hoặc nâng cấp gói — hoặc chờ mức sử dụng được đặt lại vào {reset_hm}",
            "resetTimeLabel": reset_hm,
        }
    elif not live_quota.get("limitReached"):
        quota_alert = {
            "active": False,
            "title": "",
            "subtitle": "",
            "resetTimeLabel": "",
        }

    # Build pinnedConversations in the exact order of pinned_ids
    pinned_conversations: list[dict] = []
    for pid_tid in pinned_ids:
        if pid_tid in all_items_by_id:
            pinned_conversations.append(all_items_by_id[pid_tid])

    # Build project groups in official ChatGPT PC order
    ordered_proj_metas = sorted(projects_meta.values(), key=lambda x: int(x.get("position") or 99))
    project_groups_map: dict[str, dict] = {}
    for pm in ordered_proj_metas:
        pid_s = pm["id"]
        project_groups_map[pid_s] = {
            "id": pid_s,
            "name": pm["name"],
            "folderPath": pm.get("folderPath") or "",
            "position": pm.get("position", 0),
            "sourceKind": "work",
            "totalCount": 0,
            "conversations": [],
        }

    # Add extra groups for Cloud ChatGPT ("Trò chuyện") and Other Workspaces
    project_groups_map["chatgpt-cloud-chat"] = {
        "id": "chatgpt-cloud-chat",
        "name": "Trò chuyện ChatGPT",
        "folderPath": "ChatGPT Cloud",
        "position": 90,
        "sourceKind": "chat",
        "totalCount": 0,
        "conversations": [],
    }
    project_groups_map["chatgpt-other-workspaces"] = {
        "id": "chatgpt-other-workspaces",
        "name": "Không gian làm việc khác",
        "folderPath": str(HOME),
        "position": 95,
        "sourceKind": "work",
        "totalCount": 0,
        "conversations": [],
    }

    for tid_s, item in all_items_by_id.items():
        # Match ChatGPT PC sidebar behavior: pinned items appear in "Đã ghim", non-pinned items appear under their project
        if tid_s in pinned_set:
            continue
        pid_s = item["projectId"]
        if pid_s not in project_groups_map:
            project_groups_map[pid_s] = {
                "id": pid_s,
                "name": item.get("projectName") or pid_s,
                "folderPath": item.get("folderPath") or "",
                "position": 92,
                "sourceKind": item.get("sourceKind") or "work",
                "totalCount": 0,
                "conversations": [],
            }
        project_groups_map[pid_s]["totalCount"] += 1
        project_groups_map[pid_s]["conversations"].append(item)

    official_pids = {pm["id"] for pm in ordered_proj_metas}
    final_projects: list[dict] = []
    for pid_s, pgroup in sorted(project_groups_map.items(), key=lambda kv: int(kv[1].get("position") or 99)):
        pgroup["conversations"].sort(key=lambda x: -float(x.get("recencyEpoch") or x.get("lastModifiedEpoch") or 0.0))
        pgroup["conversations"] = pgroup["conversations"][:200]
        if pgroup["totalCount"] > 0 or pid_s in official_pids:
            final_projects.append(pgroup)

    out_data = {
        "updatedAt": int(now),
        "defaultProjectId": "01a0b8c2-f8cd-7b81-bf3a-290e3eedee39",
        "defaultProjectName": "BUSINESS",
        "host": {
            "id": "chatgpt-pc",
            "name": "ChatGPT PC (Codex Desktop)",
            "online": CODEX_DIR.is_dir(),
            "defaultProjectId": "01a0b8c2-f8cd-7b81-bf3a-290e3eedee39",
            "defaultProjectName": "BUSINESS",
            "defaultModel": "gpt-6.1-sol:ultra",
            "defaultModelLabel": "GPT-6.1 Sol Ultra",
            "permissionLabel": "Toàn quyền tiếp cận",
        },
        "models": get_chatgpt_models(),
        "pinnedConversations": pinned_conversations,
        "projects": final_projects,
        "quotaAlert": quota_alert,
        "quota": live_quota,
        "totalConversations": len(all_items_by_id),
    }
    _chatgpt_overview_cache["at"] = now
    _chatgpt_overview_cache["sig"] = sig
    _chatgpt_overview_cache["data"] = out_data
    return out_data



def _clean_codex_user_prompt(raw_text: str) -> str:
    """Strip Codex IDE wrapper boilerplate while preserving the user's actual request."""
    s = str(raw_text or "").strip()
    if not s:
        return ""
    for marker in ("## My request for Codex:", "## My request:", "<USER_REQUEST>"):
        pos = s.find(marker)
        if pos >= 0:
            after = s[pos + len(marker):].strip()
            if marker == "<USER_REQUEST>":
                end_pos = after.find("</USER_REQUEST>")
                if end_pos >= 0:
                    after = after[:end_pos].strip()
            if after:
                return _sanitize_companion_text(after)
    return _sanitize_companion_text(s)


def is_chatgpt_conversation(cid: str) -> bool:
    """Return True if cid belongs to ChatGPT PC (Codex Desktop) rather than Antigravity IDE."""
    if not cid or not re.fullmatch(r"[0-9a-fA-F-]{36}", cid):
        return False
    if cid in _chatgpt_known_cids or cid in _chatgpt_optimistic_convs:
        return True
    if (CONV_DIR / f"{cid}.db").exists() or (BRAIN_DIR / cid).exists():
        return False
    try:
        build_chatgpt_overview()
        if cid in _chatgpt_known_cids:
            return True
    except Exception:
        pass
    return False


_chatgpt_cloud_conv_cache: dict[str, dict] = {}


def _fetch_chatgpt_cloud_conversation_messages(
    cid: str, catalog_upd_epoch: float, folder_path: str = ""
) -> tuple[list[dict], bool, float]:
    """Fetch and parse structured trajectory from ChatGPT backend-api/conversation/<cid> for TPP / Cloud threads."""
    now = time.time()
    is_viewed = cid in _viewed_overrides and (now - float(_viewed_overrides.get(cid) or 0.0)) < 120.0
    if not is_viewed:
        with _ws_lock:
            for c in _ws_clients:
                if c.get("cid") == cid:
                    is_viewed = True
                    break
    cached = _chatgpt_cloud_conv_cache.get(cid)
    if cached is None and not is_viewed and (now - float(catalog_upd_epoch or 0.0)) >= 180.0:
        disk_conv = COMPANION_REMOTE_VAULT_DIR / "conv" / f"{cid}.json"
        if disk_conv.is_file():
            try:
                d_obj = json.loads(disk_conv.read_text(encoding="utf-8", errors="replace"))
                d_msgs = d_obj.get("messages") if isinstance(d_obj, dict) else None
                if (
                    isinstance(d_msgs, list)
                    and d_msgs
                    and not str(d_msgs[0].get("id") or "").startswith("cg_cloud_")
                ):
                    d_mod = float(d_obj.get("lastModifiedEpoch") or catalog_upd_epoch or 0.0)
                    if abs(d_mod - float(catalog_upd_epoch or 0.0)) < 5.0 or d_mod >= float(catalog_upd_epoch or 0.0):
                        cached = {
                            "at": now,
                            "upd": float(catalog_upd_epoch or 0.0),
                            "messages": d_msgs,
                            "is_running": bool(d_obj.get("isRunning")),
                            "last_mod": d_mod,
                        }
                        _chatgpt_cloud_conv_cache[cid] = cached
            except Exception:
                pass
    if cached:
        same_upd = abs(float(cached.get("upd") or 0.0) - float(catalog_upd_epoch or 0.0)) < 0.05
        is_hot = (
            is_viewed
            or bool(cached.get("is_running"))
            or (now - max(float(catalog_upd_epoch or 0.0), float(cached.get("last_mod") or 0.0))) < 180.0
        )
        ttl = 2.0 if is_hot else 600.0
        if same_upd and (now - float(cached.get("at") or 0.0)) < ttl:
            return copy.deepcopy(cached["messages"]), bool(cached["is_running"]), float(cached["last_mod"])

    auth_file = CODEX_DIR / "auth.json"
    if not auth_file.is_file():
        if cached:
            return copy.deepcopy(cached["messages"]), bool(cached["is_running"]), float(cached["last_mod"])
        return [], False, catalog_upd_epoch

    try:
        auth = json.loads(auth_file.read_text(encoding="utf-8", errors="replace"))
        tokens = auth.get("tokens") if isinstance(auth, dict) and isinstance(auth.get("tokens"), dict) else {}
        acc_tok = str(tokens.get("access_token") or auth.get("access_token") or "").strip()
        acc_id = str(tokens.get("account_id") or auth.get("account_id") or "").strip()
        if not acc_tok:
            return [], False, catalog_upd_epoch

        headers = {
            "Authorization": f"Bearer {acc_tok}",
            "User-Agent": "CodexDesktop/1.0",
            "Accept": "application/json",
        }
        if acc_id:
            headers["ChatGPT-Account-Id"] = acc_id
        req = urllib.request.Request(f"https://chatgpt.com/backend-api/conversation/{cid}", headers=headers)
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
        if not isinstance(data, dict):
            return [], False, catalog_upd_epoch

        mapping = data.get("mapping") if isinstance(data.get("mapping"), dict) else {}
        cur_node_id = data.get("current_node")
        chain: list[dict] = []
        seen_nodes: set[str] = set()
        while cur_node_id and cur_node_id in mapping and cur_node_id not in seen_nodes:
            seen_nodes.add(str(cur_node_id))
            node_obj = mapping[cur_node_id]
            if isinstance(node_obj, dict):
                chain.append(node_obj)
                cur_node_id = node_obj.get("parent")
            else:
                break
        chain.reverse()

        last_mod = _norm_codex_epoch(data.get("update_time") or data.get("create_time")) or catalog_upd_epoch or now
        async_st = data.get("async_status")
        is_running = str(async_st or "").lower() in ("running", "in_progress", "inprogress", "1")

        messages: list[dict] = []
        cur_asst: dict | None = None
        step_idx = 0

        def _flush_asst():
            nonlocal cur_asst
            if not cur_asst:
                return
            if (
                cur_asst.get("content")
                or cur_asst.get("thinking")
                or cur_asst.get("toolCalls")
                or cur_asst.get("media")
            ):
                messages.append(cur_asst)
            cur_asst = None

        for node in chain:
            m = node.get("message")
            if not isinstance(m, dict):
                continue
            author = m.get("author") if isinstance(m.get("author"), dict) else {}
            role = str(author.get("role") or "").strip().lower()
            t_name = str(author.get("name") or "").strip()
            content = m.get("content") if isinstance(m.get("content"), dict) else {}
            ctype = str(content.get("content_type") or "").strip()
            m_status = str(m.get("status") or "finished_successfully").strip().lower()
            ct_epoch = _norm_codex_epoch(m.get("create_time") or m.get("update_time")) or last_mod
            if ct_epoch > last_mod:
                last_mod = ct_epoch
            ts_ms = int(ct_epoch * 1000)

            if role == "system" or ctype in ("user_editable_context", "model_editable_context"):
                continue

            if role == "user":
                if ctype not in ("text", "multimodal_text"):
                    continue
                _flush_asst()
                parts = content.get("parts") or []
                txt_parts: list[str] = []
                if isinstance(parts, list):
                    for pt in parts:
                        if isinstance(pt, str) and pt.strip():
                            txt_parts.append(pt)
                        elif isinstance(pt, dict) and pt.get("text"):
                            txt_parts.append(str(pt["text"]))
                cleaned_u = _clean_codex_user_prompt("\n".join(txt_parts))
                if cleaned_u:
                    messages.append({
                        "id": str(m.get("id") or f"cgu_{step_idx}"),
                        "idx": step_idx,
                        "role": "user",
                        "content": cleaned_u,
                        "timestamp": ts_ms,
                    })
                    step_idx += 1
                continue

            if role == "assistant":
                if cur_asst is None:
                    cur_asst = {
                        "id": str(m.get("id") or f"cga_{step_idx}"),
                        "idx": step_idx,
                        "role": "assistant",
                        "content": "",
                        "thinking": "",
                        "thinkingSeconds": 2,
                        "toolCalls": [],
                        "completed": m_status not in ("in_progress", "running", "pending"),
                        "timestamp": ts_ms,
                    }
                    step_idx += 1
                else:
                    cur_asst["timestamp"] = max(int(cur_asst.get("timestamp") or 0), ts_ms)
                    if m_status in ("in_progress", "running", "pending"):
                        cur_asst["completed"] = False

                if m_status in ("in_progress", "running", "pending"):
                    is_running = True

                if ctype == "thoughts":
                    t_arr = content.get("thoughts") or []
                    t_lines: list[str] = []
                    if isinstance(t_arr, list):
                        for tobj in t_arr:
                            if isinstance(tobj, dict):
                                s_txt = str(tobj.get("summary") or "").strip()
                                c_txt = str(tobj.get("content") or "").strip()
                                if s_txt and c_txt and s_txt != c_txt:
                                    t_lines.append(f"**{s_txt}**\n{c_txt}")
                                elif c_txt or s_txt:
                                    t_lines.append(c_txt or s_txt)
                    if t_lines:
                        joined_t = _sanitize_companion_text("\n\n".join(t_lines))
                        prev_t = cur_asst.get("thinking") or ""
                        cur_asst["thinking"] = f"{prev_t}\n\n{joined_t}".strip() if prev_t else joined_t

                elif ctype == "reasoning_recap":
                    recap_txt = str(content.get("content") or "").strip()
                    if recap_txt:
                        m_min = re.search(r"(\d+)\s*m", recap_txt)
                        m_sec = re.search(r"(\d+)\s*s", recap_txt)
                        dur_s = (int(m_min.group(1)) * 60 if m_min else 0) + (int(m_sec.group(1)) if m_sec else 0)
                        if dur_s > 0:
                            cur_asst["thinkingSeconds"] = dur_s
                        if not cur_asst.get("thinking"):
                            cur_asst["thinking"] = _sanitize_companion_text(recap_txt)

                elif ctype == "code":
                    raw_code = str(content.get("text") or "").strip()
                    if raw_code:
                        short_cmd = raw_code
                        m_pwsh = re.search(r'pwsh\.exe"\s+-Command\s+(.*)$', raw_code, flags=re.DOTALL)
                        if m_pwsh:
                            short_cmd = m_pwsh.group(1).strip()
                            if len(short_cmd) >= 2 and short_cmd[0] in ("'", '"') and short_cmd[-1] == short_cmd[0]:
                                short_cmd = short_cmd[1:-1]
                        tc_name = "run_command"
                        sum_label = short_cmd.splitlines()[0][:95] if short_cmd else "Thực thi lệnh"
                        if raw_code.startswith("{"):
                            try:
                                j_obj = json.loads(raw_code)
                                if isinstance(j_obj, dict):
                                    j_args = j_obj.get("args") if isinstance(j_obj.get("args"), dict) else {}
                                    j_title = str(
                                        j_args.get("title")
                                        or j_args.get("completion_summary")
                                        or j_obj.get("path")
                                        or ""
                                    ).strip()
                                    if j_title:
                                        tc_name = "browser_action"
                                        sum_label = f"Trình duyệt: {j_title[:85]}"
                                    if j_args.get("code"):
                                        short_cmd = str(j_args["code"]).strip()
                            except Exception:
                                pass
                        cur_asst["toolCalls"].append({
                            "stepIdx": step_idx,
                            "name": tc_name,
                            "command": short_cmd,
                            "path": folder_path,
                            "summary": sum_label,
                            "status": "running" if m_status in ("in_progress", "running") else "success",
                            "output": "",
                        })
                        step_idx += 1

                elif ctype in ("text", "multimodal_text"):
                    parts = content.get("parts") or []
                    txt_parts = []
                    if isinstance(parts, list):
                        for pt in parts:
                            if isinstance(pt, str) and pt.strip():
                                txt_parts.append(pt)
                            elif isinstance(pt, dict) and pt.get("text"):
                                txt_parts.append(str(pt["text"]))
                    msg_txt = _sanitize_companion_text("\n".join(txt_parts).strip())
                    if msg_txt:
                        prev_c = cur_asst.get("content") or ""
                        cur_asst["content"] = f"{prev_c}\n\n{msg_txt}".strip() if prev_c else msg_txt

            elif role == "tool":
                out_txt = str(content.get("text") or "").strip()
                if not out_txt and isinstance(content.get("parts"), list):
                    out_txt = "\n".join(str(x) for x in content["parts"] if isinstance(x, str) and x.strip()).strip()
                if out_txt and cur_asst and cur_asst.get("toolCalls"):
                    clipped = _clip_companion_text(out_txt, 6000)
                    attached = False
                    for tc in reversed(cur_asst["toolCalls"]):
                        if not tc.get("output"):
                            tc["output"] = clipped
                            tc["status"] = "success"
                            attached = True
                            break
                    if not attached:
                        last_tc = cur_asst["toolCalls"][-1]
                        last_tc["output"] = _clip_companion_text(f"{last_tc.get('output', '')}\n{clipped}".strip(), 6000)

        _flush_asst()
        _chatgpt_cloud_conv_cache[cid] = {
            "at": now,
            "upd": float(catalog_upd_epoch or 0.0),
            "messages": copy.deepcopy(messages),
            "is_running": is_running,
            "last_mod": last_mod,
        }
        return messages, is_running, last_mod
    except Exception:
        if cached:
            return copy.deepcopy(cached["messages"]), bool(cached["is_running"]), float(cached["last_mod"])
        return [], False, catalog_upd_epoch


def read_chatgpt_conversation_detail(cid: str, limit_steps: int = 1500) -> dict:
    """Read structured conversation trajectory for a ChatGPT PC (Codex Desktop) thread from thread_history_1.sqlite, rollout JSONL, or ChatGPT backend-api."""
    if not re.fullmatch(r"[0-9a-fA-F-]{36}", cid):
        raise ValueError("Invalid conversation ID")

    now = time.time()
    th_mtime = _codex_db_effective_mtime(CODEX_HISTORY_DB)
    st_mtime = _codex_db_effective_mtime(CODEX_STATE_DB)
    cat_mtime = _codex_db_effective_mtime(CODEX_CATALOG_DB)

    cg_ov = build_chatgpt_overview()
    conv_meta: dict | None = None
    for p_item in cg_ov.get("pinnedConversations") or []:
        if p_item.get("id") == cid:
            conv_meta = p_item
            break
    if not conv_meta:
        for proj in cg_ov.get("projects") or []:
            for c_item in proj.get("conversations") or []:
                if c_item.get("id") == cid:
                    conv_meta = c_item
                    break
            if conv_meta:
                break

    meta_upd = float((conv_meta or {}).get("lastModifiedEpoch") or 0.0)
    meta_run = bool((conv_meta or {}).get("isRunning"))
    _load_chatgpt_continuations()
    opt_entry = _chatgpt_optimistic_convs.get(cid)
    opt_sig = (opt_entry.get("createdAt"), opt_entry.get("prompt")) if opt_entry else None
    cont_entry = _chatgpt_continuations.get(cid)
    cont_sig = (
        (round(float(cont_entry.get("updatedAt") or 0.0), 2), len(cont_entry.get("turns") or []))
        if isinstance(cont_entry, dict)
        else None
    )
    act_entry = _chatgpt_active_turns.get(cid)
    act_sig = (int(act_entry.get("seq") or 0), str(act_entry.get("status") or "")) if isinstance(act_entry, dict) else None
    raw_pin_ov = _chatgpt_pinned_overrides.get(cid)
    pin_ov_val = raw_pin_ov[0] if isinstance(raw_pin_ov, tuple) else raw_pin_ov
    cache_sig = (
        "chatgpt",
        SNAPSHOT_SCHEMA_V,
        round(th_mtime, 6),
        round(st_mtime, 6),
        round(cat_mtime, 6),
        round(meta_upd, 2),
        meta_run,
        limit_steps,
        pin_ov_val,
        opt_sig,
        cont_sig,
        act_sig,
    )
    cached = _conv_detail_cache.get(cid)
    if (
        cached
        and cached.get("sig") == cache_sig
        and not opt_entry
        and not act_entry
        and (now - float(cached.get("at") or 0.0)) < 1.5
    ):
        return cached["data"]

    title = str((conv_meta or {}).get("title") or "Phiên làm việc ChatGPT PC")
    project_id = str((conv_meta or {}).get("projectId") or "01a0b8c2-f8cd-7b81-bf3a-290e3eedee39")
    project_name = str((conv_meta or {}).get("projectName") or "BUSINESS")
    folder_path = _clean_win_path((conv_meta or {}).get("folderPath") or "")
    is_pinned = bool((conv_meta or {}).get("pinned"))
    if pin_ov_val is not None:
        is_pinned = bool(pin_ov_val)
    source_kind = str((conv_meta or {}).get("sourceKind") or "work")
    raw_source_kind = str((conv_meta or {}).get("rawSourceKind") or "vscode")
    model_name = str((conv_meta or {}).get("model") or "gpt-6.1-sol")
    effort_name = str((conv_meta or {}).get("reasoningEffort") or "ultra")
    rollout_path_str = ""

    if CODEX_STATE_DB.is_file():
        try:
            with contextlib.closing(
                sqlite3.connect(f"file:{CODEX_STATE_DB.as_posix()}?mode=ro", uri=True, timeout=2.0)
            ) as con_st:
                row = con_st.execute(
                    "SELECT title, name, cwd, project_id, model, reasoning_effort, rollout_path FROM threads WHERE id = ?",
                    (cid,),
                ).fetchone()
                if row:
                    if not (conv_meta and conv_meta.get("title")):
                        raw_t = str(row[1] or row[0] or title).strip()
                        title = raw_t.splitlines()[0][:85] if raw_t else title
                    folder_path = _clean_win_path(row[2] or folder_path)
                    if row[4]:
                        model_name = str(row[4]).strip()
                    if row[5]:
                        effort_name = str(row[5]).strip()
                    if row[6]:
                        rollout_path_str = str(row[6]).strip()
        except Exception:
            pass

    messages: list[dict] = []
    is_running = meta_run
    has_error = False
    error_message = ""
    last_mod_epoch = float((conv_meta or {}).get("lastModifiedEpoch") or time.time())

    # 1. Primary source: thread_turns + thread_items in thread_history_1.sqlite (indexed by thread_id)
    if CODEX_HISTORY_DB.is_file():
        try:
            with contextlib.closing(
                sqlite3.connect(f"file:{CODEX_HISTORY_DB.as_posix()}?mode=ro", uri=True, timeout=3.0)
            ) as con_th:
                turn_rows = con_th.execute(
                    """
                    SELECT turn_id, status, started_at, completed_at, duration_ms, error_json, rollout_ordinal
                    FROM thread_turns
                    WHERE thread_id = ?
                    ORDER BY rollout_ordinal ASC
                    """,
                    (cid,),
                ).fetchall()
                item_rows = con_th.execute(
                    """
                    SELECT turn_id, item_id, rollout_ordinal, item_type, item_json
                    FROM thread_items
                    WHERE thread_id = ?
                    ORDER BY rollout_ordinal ASC
                    """,
                    (cid,),
                ).fetchall()

            turn_meta_by_id: dict[str, dict] = {}
            for tr_id, tr_st, tr_start, tr_end, tr_dur, tr_err, tr_ord in turn_rows:
                st_norm = _norm_codex_epoch(tr_start) or last_mod_epoch
                end_norm = _norm_codex_epoch(tr_end) or st_norm
                if end_norm > last_mod_epoch:
                    last_mod_epoch = end_norm
                turn_meta_by_id[str(tr_id)] = {
                    "status": str(tr_st or "completed").lower(),
                    "startedAt": st_norm,
                    "completedAt": end_norm,
                    "durationMs": int(tr_dur or 0),
                    "errorJson": str(tr_err or "").strip(),
                    "ordinal": int(tr_ord or 0),
                }
                if str(tr_st or "").lower() in ("running", "in_progress", "inprogress", "pending"):
                    if meta_run or (now - max(st_norm, last_mod_epoch)) < 300.0:
                        is_running = True

            # Group items into user / assistant messages
            cur_asst: dict | None = None
            cur_turn_id = ""
            step_idx = 0

            def _flush_cur_asst(turn_id_for_flush: str):
                nonlocal cur_asst, has_error, error_message
                if not cur_asst:
                    return
                t_info = turn_meta_by_id.get(turn_id_for_flush) or {}
                err_raw = t_info.get("errorJson") or ""
                if err_raw and not cur_asst.get("_err_appended"):
                    err_txt = err_raw
                    try:
                        eobj = json.loads(err_raw)
                        if isinstance(eobj, dict) and eobj.get("message"):
                            err_txt = str(eobj["message"]).strip()
                    except Exception:
                        pass
                    has_error = True
                    error_message = err_txt
                    warn_block = f"\n\n> ⚠️ **Cảnh báo từ ChatGPT PC**: {err_txt}"
                    cur_asst["content"] = (str(cur_asst.get("content") or "").strip() + warn_block).strip()
                    cur_asst["_err_appended"] = True
                cur_asst.pop("_err_appended", None)
                if cur_asst.get("content") or cur_asst.get("thinking") or cur_asst.get("toolCalls") or cur_asst.get("media"):
                    messages.append(cur_asst)
                cur_asst = None

            for turn_id_raw, _item_id, r_ord, itype, ijson_str in item_rows:
                turn_id_s = str(turn_id_raw or "")
                if cur_turn_id and turn_id_s != cur_turn_id:
                    _flush_cur_asst(cur_turn_id)
                cur_turn_id = turn_id_s

                t_info = turn_meta_by_id.get(turn_id_s) or {}
                ts_sec = t_info.get("startedAt") or last_mod_epoch
                ts_ms = int(ts_sec * 1000)

                try:
                    d = json.loads(ijson_str) if ijson_str else {}
                except Exception:
                    d = {}
                if not isinstance(d, dict):
                    continue

                if itype == "userMessage":
                    _flush_cur_asst(turn_id_s)
                    raw_parts = d.get("content") or []
                    txt_parts: list[str] = []
                    u_media: list[dict] = []
                    if isinstance(raw_parts, list):
                        for part in raw_parts:
                            if not isinstance(part, dict):
                                continue
                            ptype = str(part.get("type") or "")
                            if ptype in ("text", "input_text") and part.get("text"):
                                txt_parts.append(str(part["text"]))
                            elif ptype in ("image", "local_image", "input_image"):
                                img_url = str(part.get("url") or part.get("image_url") or part.get("path") or "").strip()
                                if img_url.startswith("file:///"):
                                    local_p = urllib.parse.unquote(img_url.replace("file:///", ""))
                                else:
                                    local_p = img_url
                                if local_p:
                                    u_media.append({
                                        "name": Path(local_p).name or "image.png",
                                        "mimeType": mimetypes.guess_type(local_p)[0] or "image/png",
                                        "uri": local_p,
                                        "url": f"/api/ag-companion/media?path={urllib.parse.quote(local_p, safe='')}",
                                    })
                    cleaned_u = _clean_codex_user_prompt("\n".join(txt_parts))
                    if cleaned_u or u_media:
                        u_msg: dict = {
                            "id": f"cg_u_{r_ord}",
                            "idx": step_idx,
                            "role": "user",
                            "content": cleaned_u,
                            "timestamp": ts_ms,
                        }
                        if u_media:
                            u_msg["media"] = u_media
                        messages.append(u_msg)
                        step_idx += 1
                    continue

                # Ensure assistant message container exists for current turn
                if cur_asst is None:
                    t_dur_sec = max(1, min(180, int((t_info.get("durationMs") or 3000) // 1000)))
                    cur_asst = {
                        "id": f"cg_a_{r_ord}",
                        "idx": step_idx,
                        "role": "assistant",
                        "content": "",
                        "thinking": "",
                        "thinkingSeconds": t_dur_sec,
                        "toolCalls": [],
                        "completed": t_info.get("status", "completed") not in ("running", "in_progress", "inprogress", "pending"),
                        "timestamp": int((t_info.get("completedAt") or ts_sec) * 1000),
                    }
                    step_idx += 1

                if itype == "reasoning":
                    sum_arr = d.get("summary") or []
                    r_lines = [str(x).strip() for x in sum_arr if str(x).strip()] if isinstance(sum_arr, list) else []
                    if not r_lines and isinstance(d.get("text"), str) and d["text"].strip():
                        r_lines = [d["text"].strip()]
                    if r_lines:
                        joined_r = _sanitize_companion_text("\n".join(r_lines))
                        prev_r = cur_asst.get("thinking") or ""
                        cur_asst["thinking"] = f"{prev_r}\n\n{joined_r}".strip() if prev_r else joined_r

                elif itype == "agentMessage":
                    msg_txt = _sanitize_companion_text(str(d.get("text") or "").strip())
                    if msg_txt:
                        prev_c = cur_asst.get("content") or ""
                        cur_asst["content"] = f"{prev_c}\n\n{msg_txt}".strip() if prev_c else msg_txt

                elif itype == "commandExecution":
                    cmd_str = str(d.get("command") or "").strip()
                    # Clean PowerShell wrapper prefix if present for readability
                    short_cmd = cmd_str
                    m_ps = re.search(r"-Command\s+(['\"])([\s\S]*)\1$", cmd_str)
                    if m_ps:
                        short_cmd = m_ps.group(2).strip()
                    actions = d.get("commandActions") or []
                    sum_label = short_cmd.splitlines()[0][:90] if short_cmd else "Chạy lệnh Terminal"
                    if isinstance(actions, list) and actions and isinstance(actions[0], dict):
                        act_type = str(actions[0].get("type") or "")
                        act_cmd = str(actions[0].get("command") or short_cmd)
                        if act_type:
                            sum_label = f"{act_type}: {act_cmd[:80]}"
                    out_str = _clip_companion_text(str(d.get("aggregatedOutput") or ""), 6000)
                    exit_code = d.get("exitCode")
                    st_raw = str(d.get("status") or "completed").lower()
                    tc_status = (
                        "running"
                        if st_raw in ("running", "in_progress", "inprogress")
                        else ("failed" if (exit_code not in (None, 0) or st_raw == "failed") else "success")
                    )
                    cur_asst["toolCalls"].append({
                        "stepIdx": int(r_ord or step_idx),
                        "name": "run_command",
                        "command": short_cmd,
                        "path": _clean_win_path(d.get("cwd") or folder_path),
                        "summary": sum_label,
                        "status": tc_status,
                        "output": out_str,
                    })

                elif itype == "fileChange":
                    changes = d.get("changes") or []
                    paths_changed: list[str] = []
                    diff_preview: list[str] = []
                    if isinstance(changes, list):
                        for ch in changes[:10]:
                            if isinstance(ch, dict):
                                cp = str(ch.get("path") or ch.get("filePath") or "").strip()
                                kind = str(ch.get("kind") or "edit").strip()
                                if cp:
                                    paths_changed.append(cp)
                                    diff_preview.append(f"[{kind}] {cp}")
                                if ch.get("diff"):
                                    diff_preview.append(str(ch["diff"])[:1500])
                    first_path = paths_changed[0] if paths_changed else ""
                    cur_asst["toolCalls"].append({
                        "stepIdx": int(r_ord or step_idx),
                        "name": "edit_file",
                        "command": "",
                        "path": first_path,
                        "summary": f"Cập nhật {len(paths_changed)} tệp: {', '.join(Path(p).name for p in paths_changed[:3])}" if paths_changed else "Cập nhật tệp",
                        "status": "success",
                        "output": _clip_companion_text("\n".join(diff_preview), 4000),
                    })

                elif itype in ("mcpToolCall", "webSearch", "subAgentActivity", "imageView", "imageGeneration"):
                    t_name = str(d.get("tool") or d.get("name") or itype)
                    t_sum = str(d.get("summary") or d.get("query") or d.get("prompt") or t_name)[:100]
                    t_out = _clip_companion_text(json.dumps(d.get("result") or d.get("output") or d, ensure_ascii=False), 3000)
                    cur_asst["toolCalls"].append({
                        "stepIdx": int(r_ord or step_idx),
                        "name": itype,
                        "command": "",
                        "path": str(d.get("path") or ""),
                        "summary": f"{itype}: {t_sum}",
                        "status": "success",
                        "output": t_out,
                    })

            if cur_turn_id:
                _flush_cur_asst(cur_turn_id)

            # Also check if the very last turn in turn_rows had an error even without thread_items
            if turn_rows:
                last_tr = turn_rows[-1]
                last_err_raw = str(last_tr[5] or "").strip()
                if last_err_raw and not has_error:
                    err_txt = last_err_raw
                    try:
                        eobj = json.loads(last_err_raw)
                        if isinstance(eobj, dict) and eobj.get("message"):
                            err_txt = str(eobj["message"]).strip()
                    except Exception:
                        pass
                    has_error = True
                    error_message = err_txt
                    messages.append({
                        "id": f"cg_err_{last_tr[6]}",
                        "idx": step_idx,
                        "role": "assistant",
                        "content": f"> ⚠️ **Cảnh báo từ ChatGPT PC**: {err_txt}",
                        "thinking": "",
                        "thinkingSeconds": 0,
                        "toolCalls": [],
                        "completed": True,
                        "timestamp": int(_norm_codex_epoch(last_tr[3] or last_tr[2] or last_mod_epoch) * 1000),
                    })
        except Exception:
            pass

    # 2. Fallback to rollout JSONL file if thread_items was empty
    if not messages and rollout_path_str:
        r_path = Path(rollout_path_str)
        if r_path.is_file():
            try:
                raw_codex = _read_codex_rollout_jsonl(r_path) or []
                for idx_m, m in enumerate(raw_codex):
                    role = "user" if m.get("role") == "user" else "assistant"
                    txt = _clean_codex_user_prompt(str(m.get("text") or "")) if role == "user" else _sanitize_companion_text(str(m.get("text") or ""))
                    tcs = []
                    for idx_t, tc in enumerate(m.get("tools") or []):
                        tcs.append({
                            "stepIdx": idx_m * 10 + idx_t,
                            "name": str(tc.get("name") or "tool"),
                            "command": str(tc.get("input") or ""),
                            "path": "",
                            "summary": str(tc.get("input") or tc.get("name") or "tool")[:100],
                            "status": "success",
                            "output": "",
                        })
                    messages.append({
                        "id": f"roll_{idx_m}",
                        "idx": idx_m,
                        "role": role,
                        "content": txt,
                        "thinking": _sanitize_companion_text(str(m.get("thinking") or "")),
                        "thinkingSeconds": 2 if m.get("thinking") else 0,
                        "toolCalls": tcs,
                        "completed": True,
                        "timestamp": int(last_mod_epoch * 1000),
                    })
            except Exception:
                pass

    # 2.5. Fallback to thread_timeline_ledger in codex.db / codex-dev.db (voice & hybrid sessions)
    if not messages:
        for db_p in (CODEX_CATALOG_DB, CODEX_CATALOG_DEV_DB):
            if not db_p.is_file():
                continue
            try:
                with contextlib.closing(
                    sqlite3.connect(f"file:{db_p.as_posix()}?mode=ro", uri=True, timeout=2.0)
                ) as con_l:
                    l_rows = con_l.execute(
                        "SELECT sequence, payload_json FROM thread_timeline_ledger WHERE thread_id = ? ORDER BY sequence ASC",
                        (cid,),
                    ).fetchall()
                for seq_i, p_json in l_rows:
                    p_obj = json.loads(p_json) if p_json else {}
                    if isinstance(p_obj, dict) and p_obj.get("type") == "transcript-segment" and p_obj.get("text"):
                        role_s = "user" if str(p_obj.get("role") or "") == "user" else "assistant"
                        occ_ms = int(p_obj.get("occurredAtMs") or int(last_mod_epoch * 1000))
                        messages.append({
                            "id": f"tl_{seq_i}",
                            "idx": len(messages),
                            "role": role_s,
                            "content": _sanitize_companion_text(str(p_obj["text"]).strip()),
                            "thinking": "",
                            "thinkingSeconds": 0,
                            "toolCalls": [],
                            "completed": True,
                            "timestamp": occ_ms,
                        })
                if messages:
                    break
            except Exception:
                pass

    # 3. Live fetch from ChatGPT backend-api/conversation/<cid> for TPP / Cloud threads (e.g. Phiên AI / BUSINESS g-p-... sessions)
    if not messages and (raw_source_kind == "chatgpt" or source_kind == "chat" or cid.startswith("6")):
        cloud_msgs, cloud_running, cloud_mod = _fetch_chatgpt_cloud_conversation_messages(
            cid, last_mod_epoch, folder_path=folder_path
        )
        if cloud_msgs:
            messages = cloud_msgs
            if cloud_running:
                is_running = True
            if cloud_mod > last_mod_epoch:
                last_mod_epoch = cloud_mod

    # 3.5. Merge persisted follow-up turns from _chatgpt_continuations (for TPP / Cloud 6af... sessions or CLI continuations)
    if isinstance(cont_entry, dict):
        cont_turns = cont_entry.get("turns") or []
        if isinstance(cont_turns, list):
            for t_idx, t_obj in enumerate(cont_turns):
                if not isinstance(t_obj, dict):
                    continue
                t_prompt = str(t_obj.get("prompt") or "").strip()
                t_start = float(t_obj.get("startedAt") or last_mod_epoch)
                t_end = float(t_obj.get("completedAt") or t_start)
                if t_end > last_mod_epoch:
                    last_mod_epoch = t_end
                # Avoid duplicating if thread_history_1.sqlite already recorded this exact user prompt
                already_recorded = any(
                    m.get("role") == "user" and str(m.get("content") or "").strip() == t_prompt
                    for m in messages[-6:]
                )
                if already_recorded:
                    continue
                if t_prompt:
                    messages.append({
                        "id": f"cg_cont_u_{t_idx}",
                        "idx": len(messages),
                        "role": "user",
                        "content": t_prompt,
                        "timestamp": int(t_start * 1000),
                    })
                t_content = _sanitize_companion_text(str(t_obj.get("content") or "").strip())
                t_think = _sanitize_companion_text(str(t_obj.get("thinking") or "").strip())
                t_tcs = copy.deepcopy(t_obj.get("toolCalls") or []) if isinstance(t_obj.get("toolCalls"), list) else []
                t_err = str(t_obj.get("error") or "").strip()
                if t_err and not t_content:
                    t_content = f"> ⚠️ **Cảnh báo từ ChatGPT PC**: {t_err}"
                    has_error = True
                    error_message = t_err
                if t_content or t_think or t_tcs:
                    messages.append({
                        "id": f"cg_cont_a_{t_idx}",
                        "idx": len(messages),
                        "role": "assistant",
                        "content": t_content,
                        "thinking": t_think,
                        "thinkingSeconds": max(1, min(180, int(max(1.0, t_end - t_start)))),
                        "toolCalls": t_tcs,
                        "completed": True,
                        "timestamp": int(t_end * 1000),
                    })

    # 3.6. Merge live active turn from _chatgpt_active_turns (real-time streaming from codex exec --json)
    if isinstance(act_entry, dict):
        is_running = True
        act_start = float(act_entry.get("startedAt") or now)
        act_upd = float(act_entry.get("updatedAt") or now)
        if act_upd > last_mod_epoch:
            last_mod_epoch = act_upd
        act_prompt = str(act_entry.get("prompt") or "").strip()
        if act_prompt and not any(
            m.get("role") == "user" and str(m.get("content") or "").strip() == act_prompt
            for m in messages[-4:]
        ):
            messages.append({
                "id": f"cg_act_u_{int(act_start * 1000)}",
                "idx": len(messages),
                "role": "user",
                "content": act_prompt,
                "timestamp": int(act_start * 1000),
            })
        act_think = _sanitize_companion_text(str(act_entry.get("thinking") or "").strip())
        act_content = _sanitize_companion_text(str(act_entry.get("content") or "").strip())
        act_tcs = copy.deepcopy(act_entry.get("toolCalls") or []) if isinstance(act_entry.get("toolCalls"), list) else []
        if messages and messages[-1].get("role") == "assistant" and not messages[-1].get("completed"):
            last_a = messages[-1]
            if act_think and len(act_think) >= len(str(last_a.get("thinking") or "")):
                last_a["thinking"] = act_think
            if act_content and len(act_content) >= len(str(last_a.get("content") or "")):
                last_a["content"] = act_content
            if act_tcs and len(act_tcs) >= len(last_a.get("toolCalls") or []):
                last_a["toolCalls"] = act_tcs
            last_a["thinkingSeconds"] = max(1, int(now - act_start))
            last_a["timestamp"] = int(act_upd * 1000)
        elif act_think or act_content or act_tcs:
            messages.append({
                "id": f"cg_act_a_{int(act_start * 1000)}",
                "idx": len(messages),
                "role": "assistant",
                "content": act_content,
                "thinking": act_think,
                "thinkingSeconds": max(1, int(now - act_start)),
                "toolCalls": act_tcs,
                "completed": False,
                "timestamp": int(act_upd * 1000),
            })

    # 4. Final fallback if offline / unavailable
    if not messages:
        messages.append({
            "id": f"cg_cloud_{cid}",
            "idx": 0,
            "role": "assistant",
            "content": (
                f"### 💬 {title}\n\n"
                f"Đây là phiên làm việc thuộc dự án **{project_name}** đã được đồng bộ danh mục trên **ChatGPT PC**.\n\n"
                f"- **Mã phiên**: `{cid}`\n"
                f"- **Cập nhật gần nhất**: `{format_relative_time(last_mod_epoch)}`\n"
                f"- Anh có thể nhắn tiếp bên dưới để giao việc vào **ChatGPT PC (Codex)**."
            ),
            "thinking": "",
            "thinkingSeconds": 0,
            "toolCalls": [],
            "completed": True,
            "timestamp": int(last_mod_epoch * 1000),
        })

    # Merge optimistic prompt if user just sent a message from web/mobile
    if opt_entry:
        opt_prompt = str(opt_entry.get("prompt") or "").strip()
        if opt_prompt and not any(m.get("role") == "user" and str(m.get("content") or "").strip() == opt_prompt for m in messages[-4:]):
            messages.append({
                "id": f"cg_opt_u_{int(time.time() * 1000)}",
                "idx": len(messages),
                "role": "user",
                "content": opt_prompt,
                "timestamp": int(float(opt_entry.get("createdAt") or time.time()) * 1000),
            })
            is_running = True

    result = {
        "schemaVersion": SNAPSHOT_SCHEMA_V,
        "id": cid,
        "provider": "chatgpt",
        "sourceKind": source_kind,
        "title": title,
        "projectId": project_id,
        "projectName": project_name,
        "folderPath": folder_path,
        "model": model_name,
        "reasoningEffort": effort_name,
        "status": "CASCADE_RUN_STATUS_RUNNING" if is_running else "CASCADE_RUN_STATUS_IDLE",
        "isRunning": is_running,
        "hasError": has_error,
        "errorMessage": error_message,
        "pinned": is_pinned,
        "stepCount": max(1, len(messages) + sum(len(m.get("toolCalls") or []) for m in messages if isinstance(m, dict))),
        "lastModifiedEpoch": last_mod_epoch,
        "lastModifiedTime": datetime.datetime.fromtimestamp(last_mod_epoch, tz=datetime.timezone.utc).isoformat(),
        "messages": messages,
    }
    _conv_detail_cache[cid] = {"sig": cache_sig, "at": now, "data": result}
    return result


def _find_codex_exe() -> str | None:
    """Locate the latest codex.exe binary from OpenAI Codex Desktop or PATH."""
    try:
        bins = sorted(
            (Path(os.environ.get("LOCALAPPDATA", "")) / "OpenAI" / "Codex" / "bin").glob("*/codex.exe"),
            key=lambda x: x.stat().st_mtime,
            reverse=True,
        )
        if bins:
            return str(bins[0])
    except Exception:
        pass
    try:
        wapps = sorted(
            Path(r"C:\Program Files\WindowsApps").glob("OpenAI.Codex_*/app/resources/codex.exe"),
            key=lambda x: x.stat().st_mtime,
            reverse=True,
        )
        if wapps:
            return str(wapps[0])
    except Exception:
        pass
    w = shutil.which("codex.exe") or shutil.which("codex")
    return str(w) if w else None


def _has_local_codex_thread(cid: str) -> bool:
    """Return True if cid exists in state_5.sqlite :: threads with a local rollout."""
    if not cid or not CODEX_STATE_DB.is_file():
        return False
    try:
        with contextlib.closing(
            sqlite3.connect(f"file:{CODEX_STATE_DB.as_posix()}?mode=ro", uri=True, timeout=1.5)
        ) as con_st:
            row = con_st.execute("SELECT rollout_path FROM threads WHERE id = ?", (cid,)).fetchone()
            if row and row[0]:
                return True
    except Exception:
        pass
    return False


def _parse_codex_exec_items_to_state(
    items_by_id: dict[str, dict], item_order: list[str], cwd: str
) -> tuple[str, str, list[dict]]:
    """Convert live JSONL items from `codex exec --json` into (thinking, content, toolCalls)."""
    thinking_parts: list[str] = []
    content_parts: list[str] = []
    tool_calls: list[dict] = []

    for idx_i, iid in enumerate(item_order):
        item = items_by_id.get(iid)
        if not isinstance(item, dict):
            continue
        itype = str(item.get("type") or "").strip()
        if itype == "reasoning":
            r_txt = str(item.get("text") or "").strip()
            if not r_txt and isinstance(item.get("summary"), list):
                r_txt = "\n".join(str(x).strip() for x in item["summary"] if str(x).strip())
            if r_txt:
                thinking_parts.append(r_txt)
        elif itype in ("agent_message", "agentMessage"):
            m_txt = str(item.get("text") or "").strip()
            if m_txt:
                content_parts.append(m_txt)
        elif itype in ("command_execution", "commandExecution"):
            cmd_str = str(item.get("command") or "").strip()
            short_cmd = cmd_str
            m_ps = re.search(r"-Command\s+(['\"])([\s\S]*)\1$", cmd_str)
            if m_ps:
                short_cmd = m_ps.group(2).strip()
            sum_label = short_cmd.splitlines()[0][:90] if short_cmd else "Chạy lệnh Terminal"
            out_str = _clip_companion_text(
                str(item.get("aggregated_output") or item.get("aggregatedOutput") or ""), 6000
            )
            exit_code = item.get("exit_code") if "exit_code" in item else item.get("exitCode")
            st_raw = str(item.get("status") or "in_progress").lower()
            tc_status = (
                "running"
                if st_raw in ("running", "in_progress", "inprogress", "pending")
                else ("failed" if (exit_code not in (None, 0) or st_raw == "failed") else "success")
            )
            tool_calls.append({
                "stepIdx": idx_i + 1,
                "name": "run_command",
                "command": short_cmd,
                "path": cwd,
                "summary": sum_label,
                "status": tc_status,
                "output": out_str,
            })
        elif itype in ("file_change", "fileChange"):
            changes = item.get("changes") or []
            paths_changed: list[str] = []
            diff_preview: list[str] = []
            if isinstance(changes, list):
                for ch in changes[:10]:
                    if isinstance(ch, dict):
                        cp = str(ch.get("path") or ch.get("filePath") or "").strip()
                        kind = str(ch.get("kind") or "update").strip()
                        if cp:
                            paths_changed.append(cp)
                            diff_preview.append(f"[{kind}] {cp}")
                        if ch.get("diff"):
                            diff_preview.append(str(ch["diff"])[:1500])
            first_path = paths_changed[0] if paths_changed else ""
            tool_calls.append({
                "stepIdx": idx_i + 1,
                "name": "edit_file",
                "command": "",
                "path": first_path,
                "summary": (
                    f"Cập nhật {len(paths_changed)} tệp: {', '.join(Path(p).name for p in paths_changed[:3])}"
                    if paths_changed
                    else "Cập nhật tệp"
                ),
                "status": "success",
                "output": _clip_companion_text("\n".join(diff_preview), 4000),
            })
        elif itype in ("mcp_tool_call", "mcpToolCall", "web_search", "webSearch"):
            t_name = str(item.get("tool") or item.get("name") or itype)
            t_sum = str(item.get("query") or item.get("summary") or t_name)[:100]
            t_out = _clip_companion_text(
                json.dumps(item.get("result") or item.get("output") or item, ensure_ascii=False), 3000
            )
            st_raw = str(item.get("status") or "completed").lower()
            tool_calls.append({
                "stepIdx": idx_i + 1,
                "name": itype,
                "command": "",
                "path": cwd,
                "summary": f"{t_name}: {t_sum}",
                "status": "running" if st_raw in ("running", "in_progress") else "success",
                "output": t_out,
            })

    return (
        "\n\n".join(thinking_parts).strip(),
        "\n\n".join(content_parts).strip(),
        tool_calls,
    )


def _stream_codex_exec_process(
    cid: str,
    proc: subprocess.Popen,
    turn_entry: dict,
    cwd: str,
    is_local_codex_thread: bool,
) -> None:
    """Stream JSONL events from a running `codex exec --json` process into _chatgpt_active_turns and persist on completion."""
    items_by_id: dict[str, dict] = {}
    item_order: list[str] = []
    last_push_ts = 0.0

    try:
        if proc.stdout is not None:
            for raw_line in iter(proc.stdout.readline, b""):
                if not raw_line:
                    break
                line = raw_line.decode("utf-8", "replace").strip()
                if not line or not line.startswith("{"):
                    continue
                try:
                    ev = json.loads(line)
                except Exception:
                    continue
                if not isinstance(ev, dict):
                    continue
                ev_type = str(ev.get("type") or "").strip()
                now_ts = time.time()

                if ev_type == "thread.started":
                    started_tid = str(ev.get("thread_id") or "").strip()
                    if started_tid and re.fullmatch(r"[0-9a-fA-F-]{36}", started_tid):
                        turn_entry["backingTid"] = started_tid
                        if not is_local_codex_thread:
                            _load_chatgpt_continuations()
                            with _chatgpt_cont_lock:
                                c_obj = _chatgpt_continuations.setdefault(
                                    cid, {"backingTid": started_tid, "cwd": cwd, "updatedAt": now_ts, "turns": []}
                                )
                                c_obj["backingTid"] = started_tid
                                c_obj["cwd"] = cwd
                                c_obj["updatedAt"] = now_ts
                            _save_chatgpt_continuations()

                elif ev_type in ("item.started", "item.updated", "item.completed"):
                    item_obj = ev.get("item")
                    if isinstance(item_obj, dict):
                        iid = str(item_obj.get("id") or f"item_{len(item_order)}")
                        if iid not in items_by_id:
                            item_order.append(iid)
                        items_by_id[iid] = item_obj
                        th_s, ct_s, tc_l = _parse_codex_exec_items_to_state(items_by_id, item_order, cwd)
                        turn_entry["thinking"] = th_s
                        turn_entry["content"] = ct_s
                        turn_entry["toolCalls"] = tc_l
                        turn_entry["updatedAt"] = now_ts
                        turn_entry["seq"] = int(turn_entry.get("seq") or 0) + 1
                        if ev_type == "item.completed" or (now_ts - last_push_ts) >= 0.6:
                            last_push_ts = now_ts
                            _conv_detail_cache.pop(cid, None)
                            _chatgpt_overview_cache["at"] = 0.0
                            trigger_immediate_ws_sync(cid)

                elif ev_type in ("turn.failed", "error"):
                    err_obj = ev.get("error")
                    err_msg = (
                        str(err_obj.get("message") or "")
                        if isinstance(err_obj, dict)
                        else str(ev.get("message") or "")
                    ).strip()
                    if err_msg:
                        turn_entry["error"] = err_msg
                        turn_entry["updatedAt"] = now_ts
                        turn_entry["seq"] = int(turn_entry.get("seq") or 0) + 1

        proc.wait(timeout=10)
    except Exception as exc:
        if not turn_entry.get("content") and not turn_entry.get("error"):
            turn_entry["error"] = str(exc)
    finally:
        try:
            if proc.poll() is None:
                proc.kill()
        except Exception:
            pass

    end_ts = time.time()
    if proc.returncode not in (0, None) and not turn_entry.get("content") and not turn_entry.get("error"):
        try:
            err_b = proc.stderr.read() if proc.stderr else b""
            err_tail = err_b.decode("utf-8", "replace").strip()[-350:]
            if err_tail:
                turn_entry["error"] = err_tail
        except Exception:
            pass

    # Persist completed turn into _chatgpt_continuations so 6af... TPP threads (and local threads if needed) retain history permanently
    if turn_entry.get("prompt") and (
        turn_entry.get("content") or turn_entry.get("thinking") or turn_entry.get("toolCalls") or turn_entry.get("error")
    ):
        _load_chatgpt_continuations()
        with _chatgpt_cont_lock:
            c_obj = _chatgpt_continuations.setdefault(
                cid,
                {
                    "backingTid": str(turn_entry.get("backingTid") or ""),
                    "cwd": cwd,
                    "updatedAt": end_ts,
                    "turns": [],
                },
            )
            if turn_entry.get("backingTid"):
                c_obj["backingTid"] = str(turn_entry["backingTid"])
            c_obj["cwd"] = cwd
            c_obj["updatedAt"] = end_ts
            turns_list = c_obj.setdefault("turns", [])
            turns_list.append({
                "prompt": str(turn_entry.get("prompt") or ""),
                "startedAt": float(turn_entry.get("startedAt") or end_ts),
                "completedAt": end_ts,
                "status": "failed" if turn_entry.get("error") else "completed",
                "thinking": str(turn_entry.get("thinking") or ""),
                "content": str(turn_entry.get("content") or ""),
                "toolCalls": turn_entry.get("toolCalls") or [],
                "error": str(turn_entry.get("error") or ""),
            })
        _save_chatgpt_continuations()

    if _chatgpt_active_turns.get(cid) is turn_entry:
        _chatgpt_active_turns.pop(cid, None)
    _chatgpt_optimistic_convs.pop(cid, None)
    _conv_detail_cache.pop(cid, None)
    _chatgpt_overview_cache["at"] = 0.0
    trigger_immediate_ws_sync(cid)


def _run_chatgpt_turn_worker(
    codex_exe: str,
    cid: str,
    clean_txt: str,
    slug: str,
    effort: str,
    cwd: str,
    is_local_codex_thread: bool,
    turn_entry: dict,
) -> None:
    """Background worker that executes a follow-up turn for either a local Codex thread (01a...) or a ChatGPT TPP thread (6af...)."""
    creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
    _load_chatgpt_continuations()
    cont_obj = _chatgpt_continuations.get(cid) if isinstance(_chatgpt_continuations.get(cid), dict) else {}
    backing_tid = str((cont_obj or {}).get("backingTid") or "").strip()

    if is_local_codex_thread:
        argv = [
            codex_exe,
            "--no-daemon",
            "exec",
            "resume",
            "--json",
            "--skip-git-repo-check",
            "-m",
            slug,
            "-c",
            f"model_reasoning_effort={effort}",
            cid,
            "-",
        ]
        stdin_payload = clean_txt
    elif backing_tid and _has_local_codex_thread(backing_tid):
        turn_entry["backingTid"] = backing_tid
        argv = [
            codex_exe,
            "--no-daemon",
            "exec",
            "resume",
            "--json",
            "--skip-git-repo-check",
            "-m",
            slug,
            "-c",
            f"model_reasoning_effort={effort}",
            backing_tid,
            "-",
        ]
        stdin_payload = clean_txt
    else:
        # First follow-up on a ChatGPT Cloud / TPP thread (e.g. 6af03efb-...): hydrate recent context + run in project cwd
        ctx_blocks: list[str] = []
        try:
            cloud_msgs, _, _ = _fetch_chatgpt_cloud_conversation_messages(cid, 0.0, folder_path=cwd)
            for m in (cloud_msgs or [])[-6:]:
                if not isinstance(m, dict):
                    continue
                r_lbl = "Người dùng" if m.get("role") == "user" else "Trợ lý ChatGPT PC"
                c_body = str(m.get("content") or "").strip()
                if len(c_body) > 2500:
                    c_body = c_body[:2500] + "..."
                tcs = m.get("toolCalls") or []
                tc_note = f" (đã thực thi {len(tcs)} bước công cụ)" if tcs else ""
                if c_body:
                    ctx_blocks.append(f"[{r_lbl}{tc_note}]:\n{c_body}")
        except Exception:
            pass
        if ctx_blocks:
            stdin_payload = (
                f"[Ngữ cảnh phiên làm việc ChatGPT PC trước đó (ID: {cid}, Thư mục: {cwd})]:\n\n"
                + "\n\n---\n\n".join(ctx_blocks)
                + "\n\n[Kết thúc ngữ cảnh trước đó]\n\n"
                + f"## My request for Codex:\n{clean_txt}"
            )
        else:
            stdin_payload = clean_txt
        argv = [
            codex_exe,
            "--no-daemon",
            "exec",
            "--json",
            "-C",
            cwd,
            "--skip-git-repo-check",
            "-m",
            slug,
            "-c",
            f"model_reasoning_effort={effort}",
            "-",
        ]

    try:
        proc = subprocess.Popen(
            argv,
            cwd=cwd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=creation_flags,
        )
        if proc.stdin is not None:
            proc.stdin.write(stdin_payload.encode("utf-8"))
            proc.stdin.close()
            proc.stdin = None
        _stream_codex_exec_process(cid, proc, turn_entry, cwd, is_local_codex_thread)
    except Exception as exc:
        turn_entry["error"] = str(exc)
        if _chatgpt_active_turns.get(cid) is turn_entry:
            _chatgpt_active_turns.pop(cid, None)
        _conv_detail_cache.pop(cid, None)
        trigger_immediate_ws_sync(cid)


def dispatch_chatgpt_send_message(cid: str, text: str, model_id: str = "", cmd_id: str = "") -> dict:
    """Execute a user message in an existing ChatGPT PC conversation (supports both local 01a... threads and cloud/TPP 6af... threads)."""
    ckpt = _get_cmd_effect_checkpoint(cmd_id) if cmd_id else {}
    if ckpt.get("checkpoint") == "prompt_sent" and ckpt.get("conversationId") == cid:
        return {
            "ok": True,
            "conversationId": cid,
            "method": str(ckpt.get("method") or "codex_exec_stream"),
            "app": str(ckpt.get("app") or "ChatGPT PC"),
            "provider": "chatgpt",
            "replayedFromCheckpoint": True,
        }
    codex_exe = _find_codex_exe()
    if not codex_exe:
        return {"ok": False, "conversationId": cid, "error": "Không tìm thấy bộ thực thi codex.exe trên máy PC."}
    clean_txt = text.strip()
    if not clean_txt:
        return {"ok": False, "conversationId": cid, "error": "Nội dung tin nhắn không được để trống."}

    cg_ov = build_chatgpt_overview()
    conv_meta: dict | None = None
    for p_item in cg_ov.get("pinnedConversations") or []:
        if p_item.get("id") == cid:
            conv_meta = p_item
            break
    if not conv_meta:
        for proj in cg_ov.get("projects") or []:
            for c_item in proj.get("conversations") or []:
                if c_item.get("id") == cid:
                    conv_meta = c_item
                    break
            if conv_meta:
                break

    cwd = _clean_win_path((conv_meta or {}).get("folderPath") or "")
    if not cwd or not os.path.isdir(cwd):
        pid_m = str((conv_meta or {}).get("projectId") or "01a0b8c2-f8cd-7b81-bf3a-290e3eedee39")
        for proj in cg_ov.get("projects") or []:
            if proj.get("id") == pid_m and proj.get("folderPath") and os.path.isdir(str(proj["folderPath"])):
                cwd = str(proj["folderPath"])
                break
    if not cwd or not os.path.isdir(cwd):
        cwd = r"C:\BUSINESS" if os.path.isdir(r"C:\BUSINESS") else str(HOME)

    slug = str((conv_meta or {}).get("model") or "gpt-6.1-sol").strip()
    effort = str((conv_meta or {}).get("reasoningEffort") or "ultra").strip()
    if ":" in str(model_id or ""):
        parts = str(model_id).split(":", 1)
        slug = parts[0].strip() or slug
        effort = parts[1].strip() or effort
    elif model_id and model_id.startswith("gpt-"):
        slug = model_id.strip()

    is_local_thread = _has_local_codex_thread(cid)
    now_epoch = time.time()
    turn_entry = {
        "cid": cid,
        "backingTid": cid if is_local_thread else "",
        "prompt": clean_txt,
        "startedAt": now_epoch,
        "updatedAt": now_epoch,
        "thinking": "",
        "content": "",
        "toolCalls": [],
        "status": "running",
        "error": "",
        "seq": 1,
    }
    _chatgpt_active_turns[cid] = turn_entry
    _chatgpt_optimistic_convs[cid] = {
        "id": cid,
        "prompt": clean_txt,
        "createdAt": now_epoch,
        "expiresAt": now_epoch + 90.0,
    }
    _chatgpt_known_cids.add(cid)
    _conv_detail_cache.pop(cid, None)
    _chatgpt_overview_cache["at"] = 0.0
    trigger_immediate_ws_sync(cid)

    threading.Thread(
        target=_run_chatgpt_turn_worker,
        args=(codex_exe, cid, clean_txt, slug, effort, cwd, is_local_thread, turn_entry),
        daemon=True,
    ).start()

    method_name = "codex_exec_resume" if is_local_thread else "codex_tpp_continuation"
    if cmd_id:
        _save_cmd_effect_checkpoint(
            cmd_id,
            {"checkpoint": "prompt_sent", "conversationId": cid, "method": method_name, "app": "ChatGPT PC"},
        )
    return {
        "ok": True,
        "conversationId": cid,
        "method": method_name,
        "app": "ChatGPT PC",
        "provider": "chatgpt",
    }


def dispatch_chatgpt_new_conversation(
    project_id: str,
    prompt: str,
    model_id: str = "",
    title: str = "",
    cmd_id: str = "",
) -> dict:
    """Create a new conversation in ChatGPT PC (Codex Desktop) under the selected project root and stream its execution."""
    ckpt = _get_cmd_effect_checkpoint(cmd_id) if cmd_id else {}
    if ckpt.get("checkpoint") == "prompt_sent" and ckpt.get("conversationId"):
        return {
            "ok": True,
            "conversationId": str(ckpt.get("conversationId")),
            "projectId": str(ckpt.get("projectId") or project_id),
            "title": str(ckpt.get("title") or title or "Phiên ChatGPT PC mới"),
            "app": str(ckpt.get("app") or "ChatGPT PC"),
            "provider": "chatgpt",
            "replayedFromCheckpoint": True,
        }
    codex_exe = _find_codex_exe()
    if not codex_exe:
        return {"ok": False, "projectId": project_id, "error": "Không tìm thấy bộ thực thi codex.exe trên máy PC."}

    cg_ov = build_chatgpt_overview()
    cwd = r"C:\BUSINESS"
    eff_pid = project_id or "01a0b8c2-f8cd-7b81-bf3a-290e3eedee39"
    for p in cg_ov.get("projects") or []:
        if p.get("id") == eff_pid and p.get("folderPath") and os.path.isdir(str(p["folderPath"])):
            cwd = str(p["folderPath"])
            break
    if not os.path.isdir(cwd):
        cwd = str(HOME)

    slug = "gpt-6.1-sol"
    effort = "ultra"
    if ":" in str(model_id or ""):
        parts = str(model_id).split(":", 1)
        slug = parts[0].strip() or slug
        effort = parts[1].strip() or effort
    elif model_id and model_id.startswith("gpt-"):
        slug = model_id.strip()

    clean_prompt = prompt.strip() or "Xin chào"
    auto_title = title.strip() or ((clean_prompt.splitlines() or [""])[0][:70] if clean_prompt else "Phiên ChatGPT PC mới")
    creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)

    argv = [
        codex_exe,
        "--no-daemon",
        "exec",
        "--json",
        "-C",
        cwd,
        "--skip-git-repo-check",
        "-m",
        slug,
        "-c",
        f"model_reasoning_effort={effort}",
        "-",
    ]
    try:
        proc = subprocess.Popen(
            argv,
            cwd=cwd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=creation_flags,
        )
        if proc.stdin is not None:
            proc.stdin.write(clean_prompt.encode("utf-8"))
            proc.stdin.close()
            proc.stdin = None
    except Exception as exc:
        return {"ok": False, "projectId": eff_pid, "error": f"Không khởi tạo được phiên ChatGPT PC: {exc}"}

    tid_holder: list[str] = [""]
    tid_event = threading.Event()

    def _wait_for_thread_started_and_stream() -> None:
        tid_found = ""
        try:
            if proc.stdout is not None:
                for raw_line in iter(proc.stdout.readline, b""):
                    if not raw_line:
                        break
                    line = raw_line.decode("utf-8", "replace").strip()
                    if '"thread.started"' in line:
                        try:
                            tid_found = str(json.loads(line).get("thread_id") or "").strip()
                        except Exception:
                            pass
                        if re.fullmatch(r"[0-9a-fA-F-]{36}", tid_found):
                            tid_holder[0] = tid_found
                            tid_event.set()
                            break
        except Exception:
            pass
        if not tid_event.is_set():
            tid_event.set()
            return
        now_e = time.time()
        turn_entry = _chatgpt_active_turns.get(tid_found)
        if not turn_entry:
            turn_entry = {
                "cid": tid_found,
                "backingTid": tid_found,
                "prompt": clean_prompt,
                "startedAt": now_e,
                "updatedAt": now_e,
                "thinking": "",
                "content": "",
                "toolCalls": [],
                "status": "running",
                "error": "",
                "seq": 1,
            }
            _chatgpt_active_turns[tid_found] = turn_entry
        _stream_codex_exec_process(tid_found, proc, turn_entry, cwd, is_local_codex_thread=True)

    threading.Thread(target=_wait_for_thread_started_and_stream, daemon=True).start()
    tid_event.wait(timeout=18.0)
    tid = tid_holder[0]
    if not re.fullmatch(r"[0-9a-fA-F-]{36}", tid):
        try:
            err_b = proc.stderr.read() if proc.stderr else b""
            err_tail = err_b.decode("utf-8", "replace").strip()[-300:]
        except Exception:
            err_tail = "Quá thời gian khởi tạo phiên"
        return {"ok": False, "projectId": eff_pid, "error": f"ChatGPT PC từ chối tạo phiên mới: {err_tail}"}

    now_epoch = time.time()
    if tid not in _chatgpt_active_turns:
        _chatgpt_active_turns[tid] = {
            "cid": tid,
            "backingTid": tid,
            "prompt": clean_prompt,
            "startedAt": now_epoch,
            "updatedAt": now_epoch,
            "thinking": "",
            "content": "",
            "toolCalls": [],
            "status": "running",
            "error": "",
            "seq": 1,
        }
    _chatgpt_optimistic_convs[tid] = {
        "id": tid,
        "title": auto_title,
        "projectId": eff_pid,
        "prompt": clean_prompt,
        "model": slug,
        "effort": effort,
        "createdAt": now_epoch,
        "expiresAt": now_epoch + 90.0,
    }
    _chatgpt_known_cids.add(tid)
    _chatgpt_overview_cache["at"] = 0.0
    trigger_immediate_ws_sync(tid)
    if cmd_id:
        _save_cmd_effect_checkpoint(
            cmd_id,
            {"checkpoint": "prompt_sent", "conversationId": tid, "projectId": eff_pid, "title": auto_title, "app": "ChatGPT PC"},
        )
    return {
        "ok": True,
        "conversationId": tid,
        "projectId": eff_pid,
        "title": auto_title,
        "app": "ChatGPT PC",
        "provider": "chatgpt",
    }


def dispatch_chatgpt_toggle_pin(cid: str, pinned: bool) -> dict:
    """Pin or unpin a conversation in ChatGPT PC (.codex-global-state.json + state_5.sqlite)."""
    _chatgpt_pinned_overrides[cid] = (bool(pinned), time.time())
    if CODEX_GLOBAL_STATE_FILE.is_file():
        try:
            gs = json.loads(CODEX_GLOBAL_STATE_FILE.read_text(encoding="utf-8", errors="replace"))
            if isinstance(gs, dict):
                cur_list = [str(x).strip() for x in (gs.get("pinned-thread-ids") or []) if str(x).strip()]
                if pinned and cid not in cur_list:
                    cur_list.insert(0, cid)
                elif not pinned and cid in cur_list:
                    cur_list = [x for x in cur_list if x != cid]
                gs["pinned-thread-ids"] = cur_list
                tmp_gs = CODEX_GLOBAL_STATE_FILE.with_name(".codex-global-state.json.ag_tmp")
                tmp_gs.write_text(json.dumps(gs, ensure_ascii=False), encoding="utf-8")
                os.replace(tmp_gs, CODEX_GLOBAL_STATE_FILE)
        except Exception:
            pass
    _chatgpt_overview_cache["at"] = 0.0
    _conv_detail_cache.pop(cid, None)
    return {"ok": True, "conversationId": cid, "pinned": bool(pinned), "provider": "chatgpt"}



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
        "chatgpt": build_chatgpt_overview(),
        "generatedAt": int(now * 1000),
        "selfHosted": True,
    }


def read_local_conversation_detail(cid: str, cfg: dict, limit_steps: int = 180) -> dict:
    if is_chatgpt_conversation(cid):
        return read_chatgpt_conversation_detail(cid, limit_steps=max(limit_steps, 1500))
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
                    APP_CONFIG["activeSessions"] = dict(_active_sessions)
                    save_config(APP_CONFIG)
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
            APP_CONFIG["activeSessions"] = dict(_active_sessions)
            save_config(APP_CONFIG)
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
                APP_CONFIG["activeSessions"] = {}
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
                    APP_CONFIG["activeSessions"] = {}
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
            app_target = str(body.get("app") or body.get("provider") or "").strip().lower()
            if cid and (app_target == "chatgpt" or is_chatgpt_conversation(cid)):
                res_pin = dispatch_chatgpt_toggle_pin(cid, pinned)
                threading.Thread(target=trigger_immediate_ws_sync, args=(cid,), daemon=True).start()
                self._send_json(res_pin)
                return
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
                app_target = str(body.get("app") or body.get("appId") or body.get("provider") or "").strip().lower()
                if app_target == "chatgpt" or model_raw.lower().startswith("gpt-"):
                    if not prompt and not media_raw:
                        return {"ok": False, "error": "Vui lòng nhập nội dung giao việc cho ChatGPT PC."}, 400
                    res_cg = dispatch_chatgpt_new_conversation(
                        proj_id,
                        prompt or "Phân tích tệp đính kèm",
                        model_id=model_raw,
                        title=title_in,
                        cmd_id=cmd_id_local,
                    )
                    return res_cg, (200 if res_cg.get("ok") else 502)
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
                app_target = str(body.get("app") or body.get("appId") or body.get("provider") or "").strip().lower()
                if app_target == "chatgpt" or is_chatgpt_conversation(cid):
                    res_cg = dispatch_chatgpt_send_message(
                        cid,
                        text or "Phân tích tệp đính kèm",
                        model_id=model_raw,
                        cmd_id=cmd_id_local,
                    )
                    return res_cg, (200 if res_cg.get("ok") else 502)

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
