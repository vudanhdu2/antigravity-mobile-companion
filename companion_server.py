#!/usr/bin/env python3
"""
Antigravity Mobile Companion — Self-Hosted Local Bridge (100% Data Privacy)
===========================================================================
Điều khiển trực tiếp ứng dụng Antigravity Desktop đang mở trên máy PC của bạn
từ Điện thoại / Máy tính bảng qua mạng Wi-Fi LAN, Tailscale VPN hoặc 4G/5G
(Cloudflare Quick Tunnel miễn phí) kèm khóa bảo mật mã PIN 6 số & Phiên Token.

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
ANTIGRAVITY_DIR = HOME / ".gemini" / "antigravity"
SUMMARIES_DB = ANTIGRAVITY_DIR / "conversation_summaries.db"
CONV_DIR = ANTIGRAVITY_DIR / "conversations"
BRAIN_DIR = ANTIGRAVITY_DIR / "brain"
ANNOTATIONS_DIR = ANTIGRAVITY_DIR / "annotations"
PROJECTS_DIR = HOME / ".gemini" / "config" / "projects"
COMPANION_DATA_DIR = ANTIGRAVITY_DIR / "companion_selfhost"
UPLOADS_DIR = COMPANION_DATA_DIR / "uploads"
BIN_DIR = COMPANION_DATA_DIR / "bin"
CONFIG_FILE = COMPANION_DATA_DIR / "config.json"

WEB_DIR = Path(__file__).resolve().parent / "web"
DEFAULT_PORT = int(os.environ.get("AG_COMPANION_PORT", "8046"))
HOST_NAME = socket.gethostname() or "my-antigravity-pc"
SERVICE = "/exa.language_server_pb.LanguageServerService/"
ZERO_UUID = "00000000-0000-0000-0000-000000000000"
AG_SETTLED = (3, 4, 5, 6, 7, 12)

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
    {"id": "MODEL_PLACEHOLDER_M318", "label": "Gemini 3.8 Flash (High)", "name": "Gemini 3.8 Flash", "tier": "High", "tag": "Fast", "cliModel": "flash", "remainingFraction": 1.0},
    {"id": "MODEL_PLACEHOLDER_M26", "label": "Claude Opus 4.6 (Thinking)", "name": "Claude Opus 4.6", "tier": "Thinking", "tag": "Opus", "cliModel": "pro", "remainingFraction": 1.0},
    {"id": "MODEL_PLACEHOLDER_M35", "label": "Claude Sonnet 4.6 (Thinking)", "name": "Claude Sonnet 4.6", "tier": "Thinking", "tag": "Sonnet", "cliModel": "pro", "remainingFraction": 1.0},
]

_state_lock = threading.RLock()
_tunnel_lock = threading.Lock()
_tunnel_state: dict = {
    "running": False,
    "url": "",
    "process": None,
    "error": "",
    "startedAt": 0,
}

# Quản lý bảo mật phiên, chống brute-force và nhật ký truy cập
_auth_lock = threading.RLock()
_failed_attempts: dict[str, list[float]] = {}  # ip -> [timestamps]
_locked_ips: dict[str, float] = {}             # ip -> unlock_epoch
_active_sessions: dict[str, dict] = {}         # token -> {ip, ua, createdAt, lastSeen, via}
_security_audit_log: list[dict] = []           # [{ts, event, ip, detail, level}]
_optimistic_convs: dict[str, dict] = {}
_user_cfg_cache: dict = {"at": 0.0, "cfg": None}

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
# 1. BỘ TẠO MÃ QR SVG 100% OFFLINE (ZERO-DATA-LEAK, KHÔNG GỌI SERVER NGOÀI)
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
# 2. CẤU HÌNH BẢO MẬT MÃ PIN, CHÍNH SÁCH MẠNG & ĐỊA CHỈ LAN / TAILSCALE
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
# 3. KẾT NỐI TRỰC TIẾP VỚI ỨNG DỤNG ANTIGRAVITY DESKTOP TRÊN MÁY (CONNECT RPC)
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
    return "chinh", "Antigravity (Chính)"


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

        # Ưu tiên psutil nếu có sẵn (nhanh <20ms)
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
                    # netstat -ano -p tcp nhanh gấp 20 lần Get-NetTCPConnection
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
        cfg["plannerConfig"]["planModel"] = model_id
    return cfg


# ============================================================================
# 4. ĐỌC DỮ LIỆU HỘI THOẠI (TRANSCRIPT.JSONL + SQLITE PROTOBUF FALLBACK)
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
    try:
        return datetime.datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()
    except Exception:
        return 0.0


def format_relative_time(epoch: float, now: float | None = None) -> str:
    now = now or time.time()
    if epoch <= 0:
        return "vừa xong"
    diff = max(0, int(now - epoch))
    if diff < 60:
        return "vừa xong"
    if diff < 3600:
        return f"{diff // 60} phút"
    if diff < 86400:
        return f"{diff // 3600} giờ"
    return f"{diff // 86400} ngày"


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
    out: dict[str, dict] = {}
    if not ANNOTATIONS_DIR.is_dir():
        return out
    for f in ANNOTATIONS_DIR.glob("*.pbtxt"):
        cid = f.stem
        try:
            txt = f.read_text(encoding="utf-8", errors="replace")
            pinned = bool(re.search(r"\bpinned:\s*true\b", txt))
            m_title = re.search(r'\btitle:\s*"((?:[^"\\]|\\.)*)"', txt)
            title = m_title.group(1) if m_title else ""
            out[cid] = {"pinned": pinned, "title": title}
        except Exception:
            continue
    return out


def build_local_overview(cfg: dict) -> dict:
    now = time.time()
    instances = discover_local_antigravity_instances()
    ann_map = load_annotations_map()
    pinned_map: dict = cfg.get("pinned", {})
    custom_convs: dict = cfg.get("customConvs", {})

    live_summaries: dict = {}
    models_list = list(DEFAULT_MODELS)
    account_email = ""
    account_tier = ""

    for inst in instances:
        res = inst.rpc("GetAllCascadeTrajectories", {})
        if isinstance(res, dict) and isinstance(res.get("trajectorySummaries"), dict):
            live_summaries.update(res["trajectorySummaries"])
        us = (inst.rpc("GetUserStatus") or {}).get("userStatus") or {}
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
                    parsed_m.append({
                        "id": m_id,
                        "label": lbl,
                        "name": lbl.split("(")[0].strip(),
                        "tier": "High" if "High" in lbl else ("Low" if "Low" in lbl else "Pro"),
                        "tag": str(c.get("tagTitle") or ""),
                        "cliModel": "flash" if "flash" in lbl.lower() else "pro",
                        "remainingFraction": float(((c.get("quotaInfo") or {}).get("remainingFraction")) or 1.0),
                    })
            if parsed_m:
                models_list = parsed_m

    projects_map: dict[str, dict] = {}
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
        ann = ann_map.get(cid) or {}
        final_title = str(live.get("summary") or ann.get("title") or title or f"Phiên {cid[:8]}").strip()
        pid = str(project_id or ((live.get("trajectoryMetadata") or {}).get("projectId")) or "local-workspace")
        folder_path = ""
        try:
            uris = json.loads(ws_uris_str or "[]")
            if uris:
                folder_path = uri_to_path(uris[0])
        except Exception:
            pass
        proj_name = Path(folder_path).name if folder_path else (pid if pid != "local-workspace" else f"Antigravity ({HOST_NAME})")
        mod_epoch = max(parse_iso_epoch(str(last_mod_str or "")), parse_iso_epoch(str(live.get("lastModifiedTime") or "")))
        t_jsonl = BRAIN_DIR / cid / ".system_generated" / "logs" / "transcript.jsonl"
        is_running = "RUNNING" in str(live.get("status") or status or "") or bool(not_fully_idle)
        if t_jsonl.exists():
            try:
                mt = t_jsonl.stat().st_mtime
                mod_epoch = max(mod_epoch, mt)
                if (now - mt) < 8.0:
                    is_running = True
            except OSError:
                pass
        opt = _optimistic_convs.get(cid)
        if opt and (now - float(opt.get("createdAt") or 0)) < 15.0:
            is_running = True
            mod_epoch = max(mod_epoch, float(opt.get("createdAt") or now))
        is_pinned = bool(pinned_map[cid]) if cid in pinned_map else bool(ann.get("pinned", False))
        item = {
            "id": cid,
            "title": final_title,
            "workspaceTag": folder_path,
            "projectId": pid,
            "projectName": proj_name,
            "stepCount": int(live.get("stepCount") or step_count or 0),
            "lastModifiedEpoch": mod_epoch or now,
            "relativeTime": format_relative_time(mod_epoch or now, now),
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
                "folderPath": folder_path or str(HOME),
                "totalCount": 0,
                "conversations": [],
            }
        projects_map[pid]["totalCount"] += 1
        projects_map[pid]["conversations"].append(item)

    for cid, c_conv in custom_convs.items():
        if cid in seen_cids or not isinstance(c_conv, dict):
            continue
        pid = str(c_conv.get("projectId") or "local-workspace")
        proj_name = str(c_conv.get("projectName") or f"Antigravity ({HOST_NAME})")
        mod_epoch = float(c_conv.get("lastModifiedEpoch") or now)
        is_pinned = bool(pinned_map.get(cid, c_conv.get("pinned", False)))
        is_running = bool(c_conv.get("isRunning", False)) and ((now - mod_epoch) < 120.0)
        item = {
            "id": cid,
            "title": str(c_conv.get("title") or f"Phiên {cid[:8]}"),
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
                "folderPath": str(c_conv.get("folderPath") or HOME),
                "totalCount": 0,
                "conversations": [],
            }
        projects_map[pid]["totalCount"] += 1
        projects_map[pid]["conversations"].insert(0, item)

    projects_out = list(projects_map.values())
    if not projects_out:
        projects_out.append({
            "id": "local-workspace",
            "name": f"Antigravity ({HOST_NAME})",
            "folderPath": str(HOME),
            "totalCount": 0,
            "conversations": [],
        })

    return {
        "host": {
            "name": HOST_NAME,
            "online": len(instances) > 0,
            "accountEmail": account_email,
            "accountTier": account_tier,
            "instances": [
                {"id": i.name, "name": HOST_NAME, "label": f"{i.label} (PID {i.pid})", "pid": i.pid, "online": True}
                for i in instances
            ] or [{"id": "local-pc", "name": HOST_NAME, "label": f"Máy PC ({HOST_NAME})", "pid": 0, "online": False}],
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
            # Đọc tối đa 2MB cuối file để tốc độ phản hồi luôn <5ms ngay cả với phiên dài
            f_size = source_jsonl.stat().st_size
            with source_jsonl.open("rb") as fb:
                if f_size > 2 * 1024 * 1024:
                    fb.seek(f_size - 2 * 1024 * 1024)
                    fb.readline()  # bỏ dòng bị cắt dở đầu đoạn seek
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

    # Fallback đọc từ SQLite <cid>.db nếu không có transcript.jsonl
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

    title = str((ann_map.get(cid) or {}).get("title") or saved_custom.get("title") or "")
    proj_id = str(saved_custom.get("projectId") or "local-workspace")
    status_db = ""
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
                    proj_id = str(row[1] or proj_id)
                    status_db = str(row[2] or "")
                    not_idle_db = int(row[3] or 0)
        except Exception:
            pass

    is_running = (
        any_running_step
        or "RUNNING" in status_db
        or bool(not_idle_db)
        or bool(saved_custom.get("isRunning", False))
    )
    if t_jsonl.exists():
        try:
            if (time.time() - t_jsonl.stat().st_mtime) < 8.0:
                is_running = True
        except OSError:
            pass

    is_pinned = bool(pinned_map[cid]) if cid in pinned_map else bool((ann_map.get(cid) or {}).get("pinned", False))

    return {
        "id": cid,
        "title": title or f"Phiên {cid[:8]}",
        "projectId": proj_id,
        "projectName": str(saved_custom.get("projectName") or f"Antigravity ({HOST_NAME})"),
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
    # Lưu vào cả thư mục brain/<cid>/.user_uploaded (chuẩn của Antigravity IDE) và UPLOADS_DIR dự phòng
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
        # Không cho phép upload file có đuôi nhạy cảm/thực thi
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
# 5. CLOUDFLARE QUICK TUNNEL (ĐIỀU KHIỂN QUA 4G/5G KHÔNG CẦN MỞ PORT MODEM)
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


def start_cloudflare_quick_tunnel(local_port: int) -> dict:
    with _tunnel_lock:
        proc = _tunnel_state.get("process")
        if _tunnel_state.get("running") and proc and proc.poll() is None and _tunnel_state.get("url"):
            return {"ok": True, "running": True, "url": _tunnel_state["url"]}

        _tunnel_state["error"] = ""
        try:
            cf_bin = ensure_cloudflared_binary()
        except Exception as e:
            _tunnel_state["error"] = f"Không tải được cloudflared: {e}"
            return {"ok": False, "running": False, "error": _tunnel_state["error"]}

        cmd = [str(cf_bin), "tunnel", "--no-autoupdate", "--url", f"http://127.0.0.1:{local_port}"]
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                creationflags=NO_WINDOW,
            )
        except Exception as e:
            _tunnel_state["error"] = str(e)
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
            _tunnel_state["running"] = False

        threading.Thread(target=_reader, daemon=True).start()
        found_event.wait(timeout=18.0)
        if _tunnel_state["url"]:
            append_security_audit("TUNNEL_STARTED", "127.0.0.1", f"Đã bật Cloudflare Quick Tunnel: {_tunnel_state['url']}", "info")
            return {"ok": True, "running": True, "url": _tunnel_state["url"]}
        return {"ok": False, "running": proc.poll() is None, "error": "Đang khởi tạo đường hầm Cloudflare, vui lòng thử lại sau vài giây."}


def stop_cloudflare_quick_tunnel() -> dict:
    with _tunnel_lock:
        proc = _tunnel_state.get("process")
        if proc and proc.poll() is None:
            try:
                proc.terminate()
            except Exception:
                pass
        _tunnel_state["running"] = False
        _tunnel_state["url"] = ""
        _tunnel_state["process"] = None
        append_security_audit("TUNNEL_STOPPED", "127.0.0.1", "Đã ngắt đường hầm 4G/5G Cloudflare Quick Tunnel", "warn")
        return {"ok": True, "running": False, "url": ""}


# ============================================================================
# 6. HTTP SERVER BẢO MẬT CAO (CHỐNG BRUTE-FORCE, SESSION TOKEN, SANDBOX)
# ============================================================================

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = os.name != "nt"


class CompanionRequestHandler(http.server.BaseHTTPRequestHandler):
    server_version = "AntigravityCompanionSelfHost/2.0"

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
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
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
            # Tái sử dụng session nếu cùng IP + UA còn hạn
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
        candidate = (qs.get("pin") or qs.get("token") or [""])[0].strip()
        if not candidate:
            auth = str(self.headers.get("Authorization") or "").strip()
            if auth.lower().startswith("bearer "):
                candidate = auth[7:].strip()
            else:
                candidate = str(self.headers.get("X-Companion-Session") or self.headers.get("X-Companion-Pin") or "").strip()

        if not candidate:
            return False, 401, "Vui lòng nhập mã PIN 6 số để kết nối."

        # Kiểm tra nếu là Session Token đã cấp (`ags_...`)
        if candidate.startswith("ags_"):
            with _auth_lock:
                for tok, info in list(_active_sessions.items()):
                    if hmac.compare_digest(tok, candidate):
                        if (time.time() - float(info.get("lastSeen") or 0)) <= SESSION_TTL_SEC:
                            info["lastSeen"] = time.time()
                            return True, 200, ""
                        _active_sessions.pop(tok, None)
            return False, 401, "Phiên bảo mật đã hết hạn hoặc mã PIN đã được đổi mới."

        # Kiểm tra mã PIN 6 số bằng hmac.compare_digest chống timing attack
        if hmac.compare_digest(candidate.encode("utf-8"), expected_pin.encode("utf-8")):
            with _auth_lock:
                _failed_attempts.pop(client_ip, None)
            return True, 200, ""

        rem = self._record_auth_failure(client_ip, via)
        if rem == 0:
            return False, 429, f"Bạn đã nhập sai {MAX_FAILED_ATTEMPTS} lần. IP {client_ip} bị khóa tạm 5 phút."
        return False, 401, f"Mã PIN bảo mật không chính xác (còn {rem} lần thử)."

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._send_security_headers()
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlsplit(self.path)
        path = parsed.path

        if self._is_lan_blocked():
            self._send_json({"ok": False, "error": "Truy cập qua mạng LAN đang được khóa bởi chủ máy PC."}, 403)
            return

        # Phục vụ giao diện Web Mobile tĩnh + Font + Icon 3D
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
            self._send_json({
                "ok": True,
                "host": HOST_NAME,
                "port": port,
                "pin": pin,
                "allowLan": bool(APP_CONFIG.get("allowLan", True)),
                "clientIp": client_ip,
                "clientVia": via,
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
            self._send_json({
                "ok": True,
                "host": HOST_NAME,
                "allowLan": bool(APP_CONFIG.get("allowLan", True)),
                "tunnelRunning": bool(_tunnel_state.get("running") and _tunnel_state.get("url")),
                "clientIp": client_ip,
                "clientVia": via,
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

        # Cho phép đăng nhập đổi PIN -> Session Token qua POST /api/ag-companion/auth-session
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
            self._send_json({"ok": True, "conversationId": cid, "pinned": pinned})
            return

        if path == "/api/ag-companion/cancel":
            cid = str(body.get("conversationId") or "").strip()
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
            self._send_json({"ok": True, "conversationId": cid, "cancelled": cancelled})
            return

        if path == "/api/ag-companion/new":
            prompt = str(body.get("prompt") or body.get("text") or "").strip()
            title_in = str(body.get("title") or "").strip()
            media_raw = body.get("media") if isinstance(body.get("media"), list) else []
            proj_id = str(body.get("projectId") or "").strip()
            model_raw = str(body.get("model") or "").strip()
            cli_model = "flash" if "flash" in model_raw.lower() else "pro"
            if not prompt and not media_raw:
                self._send_json({"ok": False, "error": "Vui lòng nhập nội dung giao việc hoặc đính kèm ảnh/tài liệu."}, 400)
                return

            instances = discover_local_antigravity_instances(force=True)
            inst = instances[0] if instances else None
            real_cid = ""
            dispatched_to_ide = False
            auto_title = title_in or (prompt.split("\n")[0][:70] if prompt else "Phiên giao việc kèm Media")

            # 1. Ưu tiên tạo qua Connect RPC (StartCascade + SendUserCascadeMessage) siêu tốc <30ms
            if inst is not None:
                eff_proj = proj_id if (proj_id and proj_id != "local-workspace") else "e3009192-6136-4652-a8f6-1f1238312ad6"
                try:
                    sc = inst.rpc(
                        "StartCascade",
                        {
                            "source": "CORTEX_TRAJECTORY_SOURCE_CASCADE_CLIENT",
                            "trajectoryType": "CORTEX_TRAJECTORY_TYPE_CASCADE",
                            "projectEnvConfig": {"projectId": eff_proj, "defaultProjectEnvironment": {}},
                        },
                        timeout=12,
                    )
                    real_cid = str((sc or {}).get("cascadeId") or "").strip()
                except Exception:
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
                    dispatched_to_ide = True

                    def _bg_start_send() -> None:
                        try:
                            inst.rpc("UpdateConversationAnnotations", {"cascadeId": real_cid, "annotations": {"title": auto_title}}, timeout=5)
                        except Exception:
                            pass
                        cfg_u = get_cached_user_config(inst, real_cid, None, model_id=model_raw)
                        if cfg_u:
                            payload_rpc: dict = {"cascadeId": real_cid, "items": [{"text": full_prompt}], "cascadeConfig": cfg_u}
                            if cascade_media:
                                payload_rpc["media"] = cascade_media
                            if inst.rpc("SendUserCascadeMessage", payload_rpc, timeout=25) is not None:
                                return
                        try:
                            inst.call_agentapi("send-message", real_cid, full_prompt)
                        except Exception:
                            pass

                    threading.Thread(target=_bg_start_send, daemon=True).start()
                    self._send_json({"ok": True, "conversationId": real_cid, "dispatchedToIde": True, "media": ui_media})
                    return

                # 2. Dự phòng qua agentapi new-conversation
                try:
                    temp_cid = str(uuid.uuid4())
                    ui_media, _, file_notes = save_and_prepare_media(inst, temp_cid, media_raw)
                    full_prompt = prompt or "Phân tích media đính kèm"
                    if file_notes:
                        full_prompt = f"{full_prompt}\n\n[Đính kèm từ Web/Mobile]:\n" + "\n".join(file_notes)
                    res = inst.call_agentapi(
                        "new-conversation",
                        f"--model={cli_model}",
                        full_prompt,
                        project_id=proj_id if proj_id and proj_id != "local-workspace" else "",
                    )
                    new_c = ((res.get("response") or {}).get("newConversation")) or {}
                    if new_c.get("conversationId"):
                        real_cid = str(new_c["conversationId"])
                        dispatched_to_ide = True
                        self._send_json({"ok": True, "conversationId": real_cid, "dispatchedToIde": True, "media": ui_media})
                        return
                except Exception:
                    pass

            # 3. Lưu yêu cầu cục bộ nếu Antigravity Desktop chưa mở
            real_cid = str(uuid.uuid4())
            ui_media, _, _ = save_and_prepare_media(None, real_cid, media_raw)
            now_ms = int(time.time() * 1000)
            u_msg: dict = {"id": f"u_{now_ms}", "role": "user", "content": prompt or "Phân tích media đính kèm", "timestamp": now_ms}
            if ui_media:
                u_msg["media"] = ui_media
            conv_obj = {
                "id": real_cid,
                "title": auto_title,
                "projectId": proj_id or "local-workspace",
                "projectName": f"Antigravity ({HOST_NAME})",
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
            self._send_json({"ok": True, "conversationId": real_cid, "dispatchedToIde": False, "media": ui_media})
            return

        if path == "/api/ag-companion/send":
            cid = str(body.get("conversationId") or "").strip()
            text = str(body.get("text") or body.get("prompt") or "").strip()
            model_raw = str(body.get("model") or "").strip()
            media_raw = body.get("media") if isinstance(body.get("media"), list) else []
            if not cid or (not text and not media_raw):
                self._send_json({"ok": False, "error": "Thiếu mã phiên (conversationId) hoặc nội dung tin nhắn."}, 400)
                return

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

            dispatched = False
            if inst is not None:
                dispatched = True

                def _bg_send_existing() -> None:
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
                            return
                    try:
                        inst.call_agentapi("send-message", cid, full_text)
                    except Exception:
                        pass

                threading.Thread(target=_bg_send_existing, daemon=True).start()

            now_ms = int(now_ep * 1000)
            u_msg = {"id": f"u_{now_ms}", "role": "user", "content": text or "Đính kèm media", "timestamp": now_ms}
            if ui_media:
                u_msg["media"] = ui_media
            c_conv = APP_CONFIG.setdefault("customConvs", {}).setdefault(cid, {"id": cid, "messages": []})
            c_conv.setdefault("messages", []).append(u_msg)
            c_conv["isRunning"] = dispatched
            c_conv["lastModifiedEpoch"] = now_ep
            save_config(APP_CONFIG)
            self._send_json({"ok": True, "conversationId": cid, "dispatchedToIde": dispatched, "media": ui_media})
            return

        self._send_json({"ok": False, "error": "Unsupported endpoint"}, 404)


# ============================================================================
# 7. KHỞI CHẠY SERVER & IN HƯỚNG DẪN KẾT NỐI TRỰC QUAN
# ============================================================================

APP_CONFIG: dict = {}


def main() -> None:
    global APP_CONFIG
    parser = argparse.ArgumentParser(description="Antigravity Mobile Companion (Self-Host 100% Privacy)")
    parser.add_argument("--port", type=int, default=0, help="Cổng lắng nghe (mặc định: 8046, tự chọn cổng trống nếu bận)")
    parser.add_argument("--strict-port", action="store_true", help="Bắt buộc dùng đúng cổng --port, không tự chuyển cổng")
    parser.add_argument("--pin", type=str, default="", help="Mã PIN (4-12 chữ số) bảo vệ truy cập từ điện thoại")
    parser.add_argument("--tunnel", action="store_true", help="Bật ngay Cloudflare Quick Tunnel (4G/5G miễn phí)")
    parser.add_argument("--localhost-only", action="store_true", help="Khóa truy cập Wi-Fi LAN (chỉ cho phép Localhost + Cloudflare Tunnel)")
    parser.add_argument("--no-browser", action="store_true", help="Không tự mở trình duyệt trên PC")
    args = parser.parse_args()

    APP_CONFIG = load_or_create_config(custom_pin=args.pin or None, custom_port=args.port or None)
    preferred_port = int(args.port or APP_CONFIG.get("port") or DEFAULT_PORT)
    listen_port = preferred_port if args.strict_port else find_available_port(preferred_port)
    APP_CONFIG["port"] = listen_port
    if args.localhost_only:
        APP_CONFIG["allowLan"] = False
    save_config(APP_CONFIG)

    pin_code = str(APP_CONFIG["pin"])
    ips = get_lan_and_tailscale_ips()

    lan_url = f"http://{ips['lan_ip']}:{listen_port}/?pin={pin_code}"
    local_url = f"http://127.0.0.1:{listen_port}/?pin={pin_code}"

    append_security_audit("SERVER_STARTED", "127.0.0.1", f"Khởi động Self-Host Companion trên cổng {listen_port}", "info")

    print("=" * 74)
    print("  ANTIGRAVITY MOBILE COMPANION v2.0 — SELF-HOSTED (100% DATA PRIVACY)")
    print("=" * 74)
    print(f"  * Máy trạm (Host PC)  : {HOST_NAME}")
    print(f"  * Vùng dữ liệu Local  : {ANTIGRAVITY_DIR}")
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
        print("  * Mẹo 4G/5G           : Bấm nút [QR & Bảo Mật 4G/5G] trên giao diện Web")
        print("                          hoặc chạy kèm cờ --tunnel để điều khiển khi ra ngoài.")
    print("=" * 74)

    bind_host = "127.0.0.1" if args.localhost_only else "0.0.0.0"
    srv = ThreadingHTTPServer((bind_host, listen_port), CompanionRequestHandler)

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
