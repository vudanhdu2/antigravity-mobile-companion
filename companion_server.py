#!/usr/bin/env python3
"""
Antigravity Mobile Companion — Self-Hosted Local Bridge (100% Data Privacy)
===========================================================================
Điều khiển trực tiếp ứng dụng Antigravity Desktop đang mở trên máy PC của bạn
từ Điện thoại / Máy tính bảng qua mạng Wi-Fi LAN, Tailscale VPN hoặc 4G/5G
(Cloudflare Quick Tunnel miễn phí) kèm khóa bảo mật mã PIN.

Cam kết Bảo mật (Zero-Data-Leak):
- 100% dữ liệu hội thoại (transcript.jsonl, summaries.db), mã nguồn dự án và
  ảnh/file đính kèm chỉ nằm trên ổ cứng máy tính của bạn.
- Không gửi bất kỳ lịch sử chat hay code nào lên máy chủ trung gian.
- Mã CSRF nội bộ của language_server chỉ giao tiếp qua loopback 127.0.0.1.
"""
from __future__ import annotations

import argparse
import base64
import datetime
import hashlib
import http.server
import json
import mimetypes
import os
import random
import re
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
HOME = Path.home()
ANTIGRAVITY_DIR = HOME / ".gemini" / "antigravity"
SUMMARIES_DB = ANTIGRAVITY_DIR / "conversation_summaries.db"
CONV_DIR = ANTIGRAVITY_DIR / "conversations"
BRAIN_DIR = ANTIGRAVITY_DIR / "brain"
ANNOTATIONS_DIR = ANTIGRAVITY_DIR / "annotations"
COMPANION_DATA_DIR = ANTIGRAVITY_DIR / "companion_selfhost"
UPLOADS_DIR = COMPANION_DATA_DIR / "uploads"
BIN_DIR = COMPANION_DATA_DIR / "bin"
CONFIG_FILE = COMPANION_DATA_DIR / "config.json"

WEB_DIR = Path(__file__).resolve().parent / "web"
PORT = int(os.environ.get("AG_COMPANION_PORT", "8046"))
HOST_NAME = socket.gethostname() or "my-antigravity-pc"
WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
SERVICE = "/exa.language_server_pb.LanguageServerService/"
ZERO_UUID = "00000000-0000-0000-0000-000000000000"

_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE

DEFAULT_MODELS = [
    {"id": "MODEL_PLACEHOLDER_M417", "label": "Gemini 4 Argon (High)", "name": "Gemini 4 Argon", "tier": "High", "tag": "New", "cliModel": "pro", "remainingFraction": 1.0},
    {"id": "MODEL_PLACEHOLDER_M318", "label": "Gemini 3.8 Flash (High)", "name": "Gemini 3.8 Flash", "tier": "High", "tag": "Fast", "cliModel": "flash", "remainingFraction": 1.0},
    {"id": "MODEL_PLACEHOLDER_M26", "label": "Claude Opus 4.6 (Thinking)", "name": "Claude Opus 4.6", "tier": "Thinking", "tag": "Opus", "cliModel": "pro", "remainingFraction": 1.0},
    {"id": "MODEL_PLACEHOLDER_M35", "label": "Claude Sonnet 4.6 (Thinking)", "name": "Claude Sonnet 4.6", "tier": "Thinking", "tag": "Sonnet", "cliModel": "pro", "remainingFraction": 1.0},
]

_ws_lock = threading.Lock()
_ws_clients: list[dict] = []
_state_lock = threading.RLock()
_tunnel_lock = threading.Lock()
_tunnel_state: dict = {
    "running": False,
    "url": "",
    "process": None,
    "error": "",
    "startedAt": 0,
}


# ============================================================================
# 1. CẤU HÌNH BẢO MẬT MÃ PIN & ĐỊA CHỈ MẠNG LAN / TAILSCALE
# ============================================================================

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
        cfg["pin"] = f"{random.randint(100000, 999999)}"
    if custom_port:
        cfg["port"] = int(custom_port)
    elif not cfg.get("port"):
        cfg["port"] = PORT
    cfg.setdefault("pinned", {})
    cfg.setdefault("customConvs", {})
    CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
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


# ============================================================================
# 2. KẾT NỐI TRỰC TIẾP VỚI ỨNG DỤNG ANTIGRAVITY DESKTOP TRÊN MÁY (LOCAL RPC)
# ============================================================================

def uri_to_path(uri: str) -> str:
    if not uri or not str(uri).startswith("file:"):
        return ""
    p = urllib.parse.unquote(urllib.parse.urlparse(str(uri)).path)
    if re.match(r"^/[A-Za-z]:", p):
        p = p[1:2].upper() + p[2:]
    return p.replace("/", "\\") if os.name == "nt" else p


class LocalAgInstance:
    def __init__(self, pid: int, exe: str, csrf: str, ports: list[int], label: str = "Antigravity Desktop"):
        self.pid = pid
        self.exe = exe
        self.csrf = csrf
        self.ports = ports
        self.label = label
        self.grpc_port: int | None = None
        self.https_port: int | None = None

    def rpc(self, method: str, body: dict | None = None, timeout: int = 12) -> dict | None:
        payload = body if body is not None else {"metadata": {"ideName": "antigravity", "extensionName": "antigravity", "locale": "en"}}
        candidates = ([self.https_port] if self.https_port else []) + [p for p in self.ports if p != self.https_port]
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=_SSL_CTX))
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

    def call_agentapi(self, *args: str, project_id: str = "", timeout: int = 90) -> dict:
        candidates = ([self.grpc_port] if self.grpc_port else []) + [p for p in self.ports if p != self.grpc_port]
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


def discover_local_antigravity_instances(force: bool = False) -> list[LocalAgInstance]:
    now = time.time()
    if not force and _instances_cache["list"] and (now - _instances_cache["at"]) < 15.0:
        return _instances_cache["list"]

    procs: list[dict] = []
    ports_by_pid: dict[int, list[int]] = {}

    if os.name == "nt":
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
                timeout=15,
                creationflags=NO_WINDOW,
            )
            raw = (r.stdout or "").strip()
            if raw:
                d = json.loads(raw)
                procs = d if isinstance(d, list) else [d]
        except Exception:
            procs = []

        if procs:
            pids_str = ",".join(str(p.get("ProcessId")) for p in procs if p.get("ProcessId"))
            if pids_str:
                ps_ports = (
                    f"Get-NetTCPConnection -State Listen | Where-Object {{ @({pids_str}) -contains $_.OwningProcess }} | "
                    "Select-Object LocalPort, OwningProcess | ConvertTo-Json -Compress"
                )
                try:
                    r2 = subprocess.run(
                        ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_ports],
                        capture_output=True,
                        text=True,
                        encoding="utf-8",
                        errors="replace",
                        timeout=15,
                        creationflags=NO_WINDOW,
                    )
                    raw2 = (r2.stdout or "").strip()
                    if raw2:
                        d2 = json.loads(raw2)
                        conns = d2 if isinstance(d2, list) else [d2]
                        for c in conns:
                            pid_val = int(c.get("OwningProcess") or 0)
                            port_val = int(c.get("LocalPort") or 0)
                            if pid_val and port_val:
                                ports_by_pid.setdefault(pid_val, []).append(port_val)
                except Exception:
                    pass

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
            inst = LocalAgInstance(pid=pid, exe=exe, csrf=m.group(1), ports=ports)
            if inst.rpc("GetUserStatus", timeout=4) is not None:
                instances.append(inst)

    _instances_cache["at"] = now
    _instances_cache["list"] = instances
    return instances


# ============================================================================
# 3. ĐỌC DỮ LIỆU HỘI THOẠI & TRANSCRIPT TRỰC TIẾP TRÊN Ổ CỨNG LOCAL
# ============================================================================

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


def build_local_overview(cfg: dict) -> dict:
    now = time.time()
    instances = discover_local_antigravity_instances()
    pinned_map: dict = cfg.get("pinned", {})
    custom_convs: dict = cfg.get("customConvs", {})

    live_summaries: dict = {}
    models_list = list(DEFAULT_MODELS)
    for inst in instances:
        res = inst.rpc("GetAllCascadeTrajectories", {})
        if isinstance(res, dict) and isinstance(res.get("trajectorySummaries"), dict):
            live_summaries.update(res["trajectorySummaries"])
        us = (inst.rpc("GetUserStatus") or {}).get("userStatus") or {}
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
        final_title = str(live.get("summary") or title or f"Phiên {cid[:8]}").strip()
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
                if (now - mt) < 10.0:
                    is_running = True
            except OSError:
                pass
        is_pinned = bool(pinned_map.get(cid, False))
        item = {
            "id": cid,
            "title": final_title,
            "workspaceTag": "",
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
        is_running = bool(c_conv.get("isRunning", False)) and ((now - mod_epoch) < 180.0)
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
            "instances": [
                {"id": f"inst-{i.pid}", "name": HOST_NAME, "label": f"{i.label} (PID {i.pid})", "pid": i.pid, "online": True}
                for i in instances
            ] or [{"id": "local-pc", "name": HOST_NAME, "label": f"Máy PC ({HOST_NAME})", "pid": 0, "online": True}],
        },
        "models": models_list,
        "pinnedConversations": pinned_items,
        "projects": projects_out,
        "generatedAt": int(now * 1000),
        "selfHosted": True,
    }


def read_local_conversation_detail(cid: str, cfg: dict, limit_steps: int = 180) -> dict:
    pinned_map = cfg.get("pinned", {})
    custom_convs = cfg.get("customConvs", {})
    saved_custom = custom_convs.get(cid) if isinstance(custom_convs.get(cid), dict) else {}

    t_jsonl = BRAIN_DIR / cid / ".system_generated" / "logs" / "transcript.jsonl"
    messages: list[dict] = []

    if t_jsonl.exists():
        try:
            lines = t_jsonl.read_text(encoding="utf-8", errors="replace").splitlines()
            for idx, raw_line in enumerate(lines[-limit_steps:]):
                if not raw_line.strip():
                    continue
                try:
                    step = json.loads(raw_line)
                except Exception:
                    continue
                stype = str(step.get("type") or "")
                ts_epoch = parse_iso_epoch(str(step.get("created_at") or "")) or time.time()
                ts_ms = int(ts_epoch * 1000)
                if stype == "USER_INPUT":
                    content = str(step.get("content") or "").strip()
                    media_arr = []
                    for m in step.get("media") or []:
                        if isinstance(m, dict) and m.get("uri"):
                            u_path = str(m["uri"]).replace("file:///", "")
                            media_arr.append({
                                "name": Path(u_path).name,
                                "mimeType": str(m.get("mime_type") or "image/png"),
                                "uri": u_path,
                                "url": f"/api/ag-companion/media?path={urllib.parse.quote(u_path, safe='')}",
                            })
                    msg_obj: dict = {
                        "id": f"step_u_{step.get('step_index', idx)}",
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
                    tcs = []
                    for tc in step.get("tool_calls") or []:
                        if isinstance(tc, dict):
                            tcs.append({
                                "id": str(tc.get("id") or f"tc_{idx}"),
                                "name": str(tc.get("name") or "tool"),
                                "category": "command" if "command" in str(tc.get("name") or "").lower() else "read",
                                "summary": str(tc.get("name") or "Tool call"),
                                "status": str(step.get("status") or "DONE"),
                            })
                    if content or thinking or tcs:
                        messages.append({
                            "id": f"step_a_{step.get('step_index', idx)}",
                            "role": "assistant",
                            "content": content,
                            "thinking": thinking,
                            "thinkingSeconds": max(1, len(thinking) // 180) if thinking else 0,
                            "toolCalls": tcs,
                            "completed": str(step.get("status") or "DONE") == "DONE",
                            "timestamp": ts_ms,
                        })
        except Exception:
            pass

    if saved_custom and isinstance(saved_custom.get("messages"), list):
        for cm in saved_custom["messages"]:
            if isinstance(cm, dict) and str(cm.get("id") or "").startswith(("u_", "a_")):
                messages.append(cm)

    is_running = bool(saved_custom.get("isRunning", False))
    if t_jsonl.exists():
        try:
            if (time.time() - t_jsonl.stat().st_mtime) < 10.0:
                is_running = True
        except OSError:
            pass

    return {
        "id": cid,
        "title": str(saved_custom.get("title") or f"Phiên {cid[:8]}"),
        "projectId": str(saved_custom.get("projectId") or "local-workspace"),
        "projectName": str(saved_custom.get("projectName") or f"Antigravity ({HOST_NAME})"),
        "status": "CASCADE_RUN_STATUS_RUNNING" if is_running else "CASCADE_RUN_STATUS_IDLE",
        "isRunning": is_running,
        "pinned": bool(pinned_map.get(cid, False)),
        "stepCount": len(messages),
        "messages": messages,
    }


def save_uploaded_media(cid: str, media_list: list | None) -> tuple[list[dict], list[str]]:
    if not media_list or not isinstance(media_list, list):
        return [], []
    safe_cid = re.sub(r"[^a-zA-Z0-9_.-]", "_", str(cid or "general"))
    dest_dir = UPLOADS_DIR / safe_cid
    dest_dir.mkdir(parents=True, exist_ok=True)
    ui_items: list[dict] = []
    saved_paths: list[str] = []

    for idx, item in enumerate(media_list[:10]):
        if not isinstance(item, dict):
            continue
        orig_name = str(item.get("name") or f"media_{idx + 1}.png").strip()
        safe_name = re.sub(r"[^a-zA-Z0-9_.-]", "_", orig_name)
        mime_type = str(item.get("mimeType") or "").strip().lower()
        data_url = str(item.get("dataUrl") or item.get("base64") or "").strip()
        if not data_url:
            continue
        b64_str = data_url.split(",", 1)[1].strip() if data_url.startswith("data:") and "," in data_url else data_url
        if not mime_type:
            mime_type = mimetypes.guess_type(safe_name)[0] or "application/octet-stream"
        try:
            pad = (-len(b64_str)) % 4
            raw_bytes = base64.b64decode(b64_str + ("=" * pad))
        except Exception:
            continue
        fpath = dest_dir / f"{int(time.time() * 1000)}_{idx}_{safe_name}"
        fpath.write_bytes(raw_bytes)
        posix_path = fpath.as_posix()
        saved_paths.append(posix_path)
        ui_items.append({
            "name": orig_name,
            "mimeType": mime_type,
            "uri": posix_path,
            "url": f"/api/ag-companion/media?path={urllib.parse.quote(posix_path, safe='')}",
            "size": len(raw_bytes),
        })
    return ui_items, saved_paths


# ============================================================================
# 4. CLOUDFLARE QUICK TUNNEL (ĐIỀU KHIỂN QUA 4G/5G KHÔNG CẦN MỞ PORT MODEM)
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

    req = urllib.request.Request(dl_url, headers={"User-Agent": "Antigravity-Mobile-Companion/1.0"})
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
        return {"ok": True, "running": False, "url": ""}


# ============================================================================
# 5. HTTP & WEBSOCKET SERVER (PORT 8046)
# ============================================================================

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class CompanionRequestHandler(http.server.BaseHTTPRequestHandler):
    server_version = "AntigravityCompanionSelfHost/1.0"

    def log_message(self, fmt: str, *args) -> None:
        return

    def _send_cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Companion-Pin")

    def _send_json(self, obj: dict, status: int = 200) -> None:
        raw = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self._send_cors()
        self.end_headers()
        self.wfile.write(raw)

    def _check_pin(self, parsed_url: urllib.parse.SplitResult) -> bool:
        expected_pin = str(APP_CONFIG.get("pin") or "").strip()
        if not expected_pin:
            return True
        qs = urllib.parse.parse_qs(parsed_url.query)
        q_pin = (qs.get("pin") or qs.get("token") or [""])[0].strip()
        if q_pin == expected_pin:
            return True
        auth = str(self.headers.get("Authorization") or "").strip()
        if auth.lower().startswith("bearer "):
            auth = auth[7:].strip()
        if auth == expected_pin:
            return True
        h_pin = str(self.headers.get("X-Companion-Pin") or "").strip()
        return h_pin == expected_pin

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._send_cors()
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlsplit(self.path)
        path = parsed.path

        # Phục vụ giao diện Web Mobile tĩnh
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
                self._send_cors()
                self.end_headers()
                self.wfile.write(raw)
                return
            self._send_json({"ok": False, "error": "Không tìm thấy web/index.html"}, 404)
            return

        if path == "/api/ag-companion/auth-check":
            ok = self._check_pin(parsed)
            self._send_json({"ok": ok, "host": HOST_NAME}, 200 if ok else 401)
            return

        if not self._check_pin(parsed):
            self._send_json({"ok": False, "error": "Mã PIN bảo mật không chính xác", "requirePin": True}, 401)
            return

        if path == "/api/ag-companion/connection-info":
            ips = get_lan_and_tailscale_ips()
            port = int(APP_CONFIG.get("port") or PORT)
            pin = str(APP_CONFIG.get("pin") or "")
            lan_url = f"http://{ips['lan_ip']}:{port}/?pin={pin}"
            ts_url = f"http://{ips['tailscale_ip']}:{port}/?pin={pin}" if ips["tailscale_ip"] else ""
            tun_url = f"{_tunnel_state['url']}/?pin={pin}" if _tunnel_state.get("url") else ""
            self._send_json({
                "ok": True,
                "host": HOST_NAME,
                "port": port,
                "pin": pin,
                "lanIp": ips["lan_ip"],
                "lanUrl": lan_url,
                "tailscaleIp": ips["tailscale_ip"],
                "tailscaleUrl": ts_url,
                "tunnelRunning": bool(_tunnel_state.get("running") and _tunnel_state.get("url")),
                "tunnelBaseUrl": _tunnel_state.get("url") or "",
                "tunnelUrl": tun_url,
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
            raw_p = (qs.get("path") or [""])[0]
            fpath = Path(raw_p)
            if fpath.is_file():
                data = fpath.read_bytes()
                mime = mimetypes.guess_type(fpath.name)[0] or "application/octet-stream"
                self.send_response(200)
                self.send_header("Content-Type", mime)
                self.send_header("Content-Length", str(len(data)))
                self._send_cors()
                self.end_headers()
                self.wfile.write(data)
                return
            self._send_json({"ok": False, "error": "File not found"}, 404)
            return

        self._send_json({"ok": False, "error": "Not found"}, 404)

    def do_POST(self) -> None:
        parsed = urllib.parse.urlsplit(self.path)
        path = parsed.path

        if not self._check_pin(parsed):
            self._send_json({"ok": False, "error": "Mã PIN bảo mật không chính xác", "requirePin": True}, 401)
            return

        length = int(self.headers.get("Content-Length") or 0)
        body_raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            body = json.loads(body_raw.decode("utf-8", errors="replace"))
        except Exception:
            body = {}

        if path == "/api/ag-companion/tunnel-toggle":
            enable = bool(body.get("enable", True))
            if enable:
                res = start_cloudflare_quick_tunnel(int(APP_CONFIG.get("port") or PORT))
            else:
                res = stop_cloudflare_quick_tunnel()
            pin = str(APP_CONFIG.get("pin") or "")
            res["tunnelUrl"] = f"{res.get('url')}/?pin={pin}" if res.get("url") else ""
            self._send_json(res)
            return

        if path == "/api/ag-companion/pin":
            cid = str(body.get("conversationId") or "").strip()
            pinned = bool(body.get("pinned", True))
            if cid:
                APP_CONFIG.setdefault("pinned", {})[cid] = pinned
                save_config(APP_CONFIG)
            self._send_json({"ok": True, "conversationId": cid, "pinned": pinned})
            return

        if path == "/api/ag-companion/new":
            prompt = str(body.get("prompt") or body.get("text") or "").strip()
            media_raw = body.get("media") if isinstance(body.get("media"), list) else []
            proj_id = str(body.get("projectId") or "").strip()
            model_raw = str(body.get("model") or "pro").lower()
            cli_model = "flash" if "flash" in model_raw else "pro"

            temp_cid = str(uuid.uuid4())
            ui_media, saved_paths = save_uploaded_media(temp_cid, media_raw)
            full_prompt = prompt
            if saved_paths:
                files_note = "\n".join(f"- `{p}`" for p in saved_paths)
                full_prompt = f"{prompt}\n\n[Đính kèm file/ảnh tại máy local]:\n{files_note}".strip()

            instances = discover_local_antigravity_instances(force=True)
            real_cid = temp_cid
            dispatched_to_ide = False
            if instances:
                try:
                    res = instances[0].call_agentapi(
                        "new-conversation",
                        f"--model={cli_model}",
                        full_prompt,
                        project_id=proj_id if proj_id and proj_id != "local-workspace" else "",
                    )
                    new_c = ((res.get("response") or {}).get("newConversation")) or {}
                    if new_c.get("conversationId"):
                        real_cid = str(new_c["conversationId"])
                        dispatched_to_ide = True
                except Exception:
                    pass

            now_ms = int(time.time() * 1000)
            u_msg: dict = {"id": f"u_{now_ms}", "role": "user", "content": prompt or "Phân tích media đính kèm", "timestamp": now_ms}
            if ui_media:
                u_msg["media"] = ui_media
            conv_obj = {
                "id": real_cid,
                "title": (prompt.split("\n")[0][:70] if prompt else "Phiên mới từ Mobile"),
                "projectId": proj_id or "local-workspace",
                "projectName": f"Antigravity ({HOST_NAME})",
                "isRunning": dispatched_to_ide,
                "status": "CASCADE_RUN_STATUS_RUNNING" if dispatched_to_ide else "CASCADE_RUN_STATUS_IDLE",
                "lastModifiedEpoch": time.time(),
                "messages": [u_msg],
            }
            if not dispatched_to_ide:
                conv_obj["messages"].append({
                    "id": f"a_{now_ms + 1}",
                    "role": "assistant",
                    "content": "⚠️ Đã lưu yêu cầu trên máy của bạn, nhưng hiện chưa thấy cửa sổ **Antigravity Desktop** nào đang mở. Hãy mở ứng dụng Antigravity trên PC và gửi lại nhé!",
                    "completed": True,
                    "timestamp": now_ms + 1,
                })
            APP_CONFIG.setdefault("customConvs", {})[real_cid] = conv_obj
            save_config(APP_CONFIG)
            self._send_json({"ok": True, "conversationId": real_cid, "dispatchedToIde": dispatched_to_ide, "media": ui_media})
            return

        if path == "/api/ag-companion/send":
            cid = str(body.get("conversationId") or "").strip()
            text = str(body.get("text") or body.get("prompt") or "").strip()
            media_raw = body.get("media") if isinstance(body.get("media"), list) else []
            ui_media, saved_paths = save_uploaded_media(cid, media_raw)
            full_text = text
            if saved_paths:
                files_note = "\n".join(f"- `{p}`" for p in saved_paths)
                full_text = f"{text}\n\n[Đính kèm file/ảnh tại máy local]:\n{files_note}".strip()

            instances = discover_local_antigravity_instances(force=True)
            dispatched = False
            if instances and cid:
                for inst in instances:
                    try:
                        inst.call_agentapi("send-message", cid, full_text)
                        dispatched = True
                        break
                    except Exception:
                        continue

            now_ms = int(time.time() * 1000)
            u_msg = {"id": f"u_{now_ms}", "role": "user", "content": text or "Đính kèm media", "timestamp": now_ms}
            if ui_media:
                u_msg["media"] = ui_media
            c_conv = APP_CONFIG.setdefault("customConvs", {}).setdefault(cid, {"id": cid, "messages": []})
            c_conv.setdefault("messages", []).append(u_msg)
            c_conv["isRunning"] = dispatched
            c_conv["lastModifiedEpoch"] = time.time()
            save_config(APP_CONFIG)
            self._send_json({"ok": True, "conversationId": cid, "dispatchedToIde": dispatched, "media": ui_media})
            return

        self._send_json({"ok": False, "error": "Unsupported endpoint"}, 404)


# ============================================================================
# 6. KHỞI CHẠY SERVER & IN HƯỚNG DẪN KẾT NỐI TRỰC QUAN
# ============================================================================

APP_CONFIG: dict = {}


def main() -> None:
    global APP_CONFIG
    parser = argparse.ArgumentParser(description="Antigravity Mobile Companion (Self-Host 100% Privacy)")
    parser.add_argument("--port", type=int, default=PORT, help="Cổng lắng nghe (mặc định: 8046)")
    parser.add_argument("--pin", type=str, default="", help="Mã PIN 6 số bảo vệ truy cập từ điện thoại")
    parser.add_argument("--tunnel", action="store_true", help="Bật ngay Cloudflare Quick Tunnel (4G/5G miễn phí)")
    parser.add_argument("--no-browser", action="store_true", help="Không tự mở trình duyệt trên PC")
    args = parser.parse_args()

    APP_CONFIG = load_or_create_config(custom_pin=args.pin or None, custom_port=args.port)
    listen_port = int(APP_CONFIG["port"])
    pin_code = str(APP_CONFIG["pin"])
    ips = get_lan_and_tailscale_ips()

    lan_url = f"http://{ips['lan_ip']}:{listen_port}/?pin={pin_code}"
    local_url = f"http://127.0.0.1:{listen_port}/?pin={pin_code}"

    print("=" * 72)
    print("  🛡️  ANTIGRAVITY MOBILE COMPANION — SELF-HOSTED (100% DATA PRIVACY)")
    print("=" * 72)
    print(f"  • Máy trạm (Host PC) : {HOST_NAME}")
    print(f"  • Mã PIN Bảo Mật     : {pin_code}")
    print(f"  • Mở trên PC này     : {local_url}")
    print(f"  • Mở qua Wi-Fi LAN   : {lan_url}")
    if ips["tailscale_ip"]:
        print(f"  • Mở qua Tailscale   : http://{ips['tailscale_ip']}:{listen_port}/?pin={pin_code}")

    if args.tunnel:
        print("  • Đang khởi tạo đường hầm 4G/5G Cloudflare Quick Tunnel...")
        tun = start_cloudflare_quick_tunnel(listen_port)
        if tun.get("url"):
            print(f"  • Mở qua 4G/5G (Mọi nơi): {tun['url']}/?pin={pin_code}")
        else:
            print(f"  • Lưu ý Tunnel       : {tun.get('error')}")
    else:
        print("  • Mẹo 4G/5G          : Bấm nút [🌐 Bật 4G/5G Tunnel] trên giao diện Web")
        print("                         hoặc chạy kèm cờ --tunnel để điều khiển khi ra ngoài.")
    print("=" * 72)

    srv = ThreadingHTTPServer(("0.0.0.0", listen_port), CompanionRequestHandler)

    if not args.no_browser:
        def _open_ui() -> None:
            time.sleep(1.0)
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
