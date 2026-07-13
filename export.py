#!/usr/bin/env python3
"""心跳墙 exporter —— 纯转换器。

只读复用 ~/code/agent-cockpit 的现成数据（data.js + cc_sessions.py），
按 registry.json 白名单映射成公开的「活动，而非内容」心跳流，写
data/heartbeats.json。严禁改动 agent-cockpit 目录下任何文件（本脚本
从不对该目录写入）。

设计要点：
- 白名单：只有 registry.json 里登记的居民会产生心跳，其余数据源一律丢弃。
- 不编造时间戳：launchd 只给"现在是否在跑"，没有历史时间戳，所以只在
  pid 非空的瞬间打一个"此刻在跑"的心跳（时间戳=真实采集时刻），并与旧
  heartbeats.json 合并累积，让这类心跳能撑过 48h 窗口，而不是每次重跑
  就把之前捕捉到的真实心跳弄丢。CC 会话 / openclaw cron 有真实历史时间
  戳（文件 mtime / last_run_at_ms），直接换算即可。
- 隐私闸门：写文件前对整个序列化输出做正则扫描，命中任何一条一律拒绝
  写出，非零退出码，宁可断更不可泄漏。
- 单个数据源解析失败只跳过该源，不让整次导出崩掉。
"""
import argparse
import glob
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone

HOME = os.path.expanduser("~")
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
COCKPIT_DIR = os.path.join(HOME, "code", "agent-cockpit")
DATA_JS = os.path.join(COCKPIT_DIR, "data.js")
REGISTRY_PATH = os.path.join(PROJECT_DIR, "registry.json")
OUT_PATH = os.path.join(PROJECT_DIR, "data", "heartbeats.json")

WINDOW_HOURS = 48
MAX_BEATS = 200
ACTIVE_WINDOW_SEC = 20 * 60  # "20 分钟内有跳" 也算 active_now

# --- 隐私闸门：命中任意一条就拒绝写出 -------------------------------------
FORBIDDEN_PATTERNS = [
    re.compile(r"/Users/"),
    re.compile(r"@gmail"),
    re.compile(r"@qq"),
    re.compile(r"huang", re.IGNORECASE),
    re.compile(r"sk-[A-Za-z0-9]"),
    re.compile(r"xoxb"),
    re.compile(r"api[_-]?key", re.IGNORECASE),
    re.compile(r"ou_[a-z0-9]"),
    re.compile(r"feishu\.cn"),
    re.compile(r"https?://"),
]


def privacy_scan(serialized: str):
    """返回命中列表 [(pattern, matched_text), ...]，空列表=干净。"""
    hits = []
    for pat in FORBIDDEN_PATTERNS:
        m = pat.search(serialized)
        if m:
            hits.append((pat.pattern, m.group(0)))
    return hits


def iso(epoch_seconds) -> str:
    return (
        datetime.fromtimestamp(float(epoch_seconds), tz=timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )


def parse_iso(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def warn(msg: str):
    print(f"[export] {msg}", file=sys.stderr)


# --- 数据源 1：CC 会话（子进程隔离，一个源炸了不连累其它源） --------------
def beats_from_cc_sessions(resident):
    if resident is None:
        return []
    code = (
        "import sys, json\n"
        f"sys.path.insert(0, {COCKPIT_DIR!r})\n"
        "import cc_sessions as m\n"
        "print(json.dumps(m.list_sessions(48)))\n"
    )
    p = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True, text=True, timeout=30,
    )
    if p.returncode != 0:
        raise RuntimeError(f"cc_sessions subprocess failed: {p.stderr.strip()[:300]}")
    data = json.loads(p.stdout)
    status_map = {"working": "running", "needs_input": "running", "stalled": "done", "idle": "done"}
    out = []
    for s in data.get("sessions", []):
        mtime = s.get("mtime")
        raw_status = s.get("status")
        status = status_map.get(raw_status)
        if mtime is None or status is None:
            continue
        # 只取 agent/category/status/时间戳——绝不带 title/cwd/last_action/cc_project 等内容字段
        out.append({
            "agent": resident["agent"],
            "category": resident["category"],
            "status": status,
            "started_at": iso(mtime),
            "duration_s": None,
            "title": None,
        })
    return out


# --- 数据源 2：openclaw cron（真实 last_run_at_ms） ------------------------
def beats_from_cron(cockpit, cron_name_to_resident):
    status_map = {"ok": "done", "error": "failed"}
    out = []
    for j in (cockpit.get("openclaw_cron") or []):
        if not isinstance(j, dict):
            continue
        resident = cron_name_to_resident.get(j.get("name"))
        if resident is None or not j.get("enabled"):
            continue
        last_ms = j.get("last_run_at_ms")
        status = status_map.get(j.get("last_run_status"))
        if last_ms is None or status is None:
            continue
        out.append({
            "agent": resident["agent"],
            "category": resident["category"],
            "status": status,
            "started_at": iso(last_ms / 1000.0),
            "duration_s": None,
            "title": None,
        })
    return out


# --- 数据源 3：launchd（只有"此刻是否在跑"，没有历史时间戳） --------------
def beats_from_launchd(cockpit, label_to_resident, now_iso):
    out = []
    seen_agents = set()
    for item in (cockpit.get("launchd") or []):
        if not isinstance(item, dict):
            continue
        resident = label_to_resident.get(item.get("label"))
        if resident is None:
            continue
        if item.get("pid") is None:
            continue  # 没在跑=没有真实时间戳可用，跳过，绝不编造"上次何时跑的"
        if resident["agent"] in seen_agents:
            continue  # 同一居民多个 label 同时在跑，只打一条心跳
        seen_agents.add(resident["agent"])
        out.append({
            "agent": resident["agent"],
            "category": resident["category"],
            "status": "running",
            "started_at": now_iso,
            "duration_s": None,
            "title": None,
        })
    return out


def load_registry():
    with open(REGISTRY_PATH, encoding="utf-8") as f:
        return json.load(f)


def load_cockpit_data():
    text = open(DATA_JS, encoding="utf-8").read()
    prefix = "window.COCKPIT_DATA = "
    if not text.startswith(prefix):
        raise ValueError("data.js 格式不符合预期（前缀不匹配），拒绝解析")
    body = text[len(prefix):].strip()
    if body.endswith(";"):
        body = body[:-1]
    return json.loads(body)


def load_old_heartbeats():
    try:
        with open(OUT_PATH, encoding="utf-8") as f:
            old = json.load(f)
        beats = old.get("heartbeats")
        if isinstance(beats, list):
            return beats
    except Exception:
        pass
    return []


def dedup_key(b):
    return (b.get("agent"), b.get("category"), b.get("status"), b.get("started_at"))


def build_heartbeats(registry, inject_leak_for_selftest=False):
    residents = registry["residents"]
    cc_resident = next((r for r in residents if r["sources"].get("cc_sessions")), None)
    cron_name_to_resident = {}
    label_to_resident = {}
    for r in residents:
        for name in r["sources"].get("cron_names", []):
            cron_name_to_resident[name] = r
        for label in r["sources"].get("launchd_labels", []):
            label_to_resident[label] = r

    # data.js 整体读失败就退化成空 dict：cron/launchd 两路会自然各自跳过。
    try:
        cockpit = load_cockpit_data()
    except Exception as e:
        warn(f"data.js 读取失败，cron/launchd 两路本轮跳过: {type(e).__name__}: {e}")
        cockpit = {}

    now = datetime.now(timezone.utc)
    now_iso_str = now.isoformat(timespec="seconds").replace("+00:00", "Z")
    # launchd 的"此刻在跑"用 data.js 自己的采集时刻，而不是本脚本运行时刻，
    # 因为 pid 这个观测事实本来就是在那一刻拍下的。data.js 读不到时退化用 now。
    launchd_now_iso = now_iso_str
    gen = cockpit.get("generated_at") if isinstance(cockpit, dict) else None
    if isinstance(gen, dict) and gen.get("epoch"):
        try:
            launchd_now_iso = iso(gen["epoch"])
        except Exception:
            pass

    new_beats = []
    for label, fn in (
        ("cc_sessions", lambda: beats_from_cc_sessions(cc_resident)),
        ("openclaw_cron", lambda: beats_from_cron(cockpit, cron_name_to_resident)),
        ("launchd", lambda: beats_from_launchd(cockpit, label_to_resident, launchd_now_iso)),
    ):
        try:
            new_beats.extend(fn())
        except Exception as e:
            warn(f"数据源 {label} 解析失败，本轮跳过该源: {type(e).__name__}: {e}")

    old_beats = load_old_heartbeats()

    if inject_leak_for_selftest:
        # 仅供 --selftest-privacy-gate 使用：故意塞一条含真实路径的假心跳，
        # 证明闸门会拒绝写出。绝不在正常导出路径调用。
        new_beats.append({
            "agent": "泛音", "category": "造物", "status": "running",
            "started_at": now_iso_str, "duration_s": None,
            "title": "/Users/max/secret-fake-leak-for-selftest",
        })

    seen = set()
    merged = []
    for b in new_beats + old_beats:
        k = dedup_key(b)
        if k in seen:
            continue
        seen.add(k)
        merged.append(b)

    cutoff = now - timedelta(hours=WINDOW_HOURS)
    kept = []
    for b in merged:
        sa = b.get("started_at")
        if not sa:
            continue
        try:
            if parse_iso(sa) < cutoff:
                continue
        except Exception:
            continue
        kept.append(b)
    kept.sort(key=lambda b: b["started_at"], reverse=True)
    kept = kept[:MAX_BEATS]

    # residents 名册：附最近一跳时间 + 最近一跳状态（给首页绿点用）
    residents_out = []
    for r in residents:
        latest = next((b for b in kept if b["agent"] == r["agent"]), None)
        residents_out.append({
            "agent": r["agent"],
            "emoji": r["emoji"],
            "role": r["role"],
            "category": r["category"],
            "last_beat_at": latest["started_at"] if latest else None,
            "last_status": latest["status"] if latest else None,
        })

    beats_24h_cutoff = now - timedelta(hours=24)
    beats_24h = sum(1 for b in kept if parse_iso(b["started_at"]) >= beats_24h_cutoff)
    active_now = 0
    for r in residents_out:
        if r["last_beat_at"] is None:
            continue
        is_running = r["last_status"] == "running"
        is_recent = (now - parse_iso(r["last_beat_at"])).total_seconds() <= ACTIVE_WINDOW_SEC
        if is_running or is_recent:
            active_now += 1
    last_beat_at = kept[0]["started_at"] if kept else None

    output = {
        "v": 0,
        "generated_at": now_iso_str,
        "home": registry["home"],
        "residents": residents_out,
        "stats": {
            "beats_24h": beats_24h,
            "active_now": active_now,
            "last_beat_at": last_beat_at,
        },
        "heartbeats": kept,
    }
    return output


def write_output(output: dict):
    serialized = json.dumps(output, ensure_ascii=False, indent=2)
    hits = privacy_scan(serialized)
    if hits:
        warn("隐私闸门拒绝写出，命中以下规则:")
        for pattern, matched in hits:
            warn(f"  - 规则 {pattern!r} 命中: {matched!r}")
        return False
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    tmp = OUT_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(serialized)
        f.write("\n")
    os.replace(tmp, OUT_PATH)
    return True


def git_push_if_changed():
    def run(*args):
        return subprocess.run(list(args), cwd=PROJECT_DIR, capture_output=True, text=True)

    add = run("git", "add", "data/heartbeats.json")
    if add.returncode != 0:
        warn(f"git add 失败: {add.stderr.strip()}")
        return False
    diff = run("git", "diff", "--cached", "--quiet")
    if diff.returncode == 0:
        print("[export] 内容无变化，跳过 commit/push")
        return True
    commit = run("git", "commit", "-m", "beat")
    if commit.returncode != 0:
        warn(f"git commit 失败: {commit.stderr.strip()}")
        return False
    push = run("git", "push")
    if push.returncode != 0:
        warn(f"git push 失败: {push.stderr.strip()}")
        return False
    print("[export] 已 commit+push")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--push", action="store_true", help="有变化才 git add+commit+push")
    ap.add_argument("--selftest-privacy-gate", action="store_true",
                     help="故意注入一条含 /Users/ 的假心跳，验证闸门会拒绝写出；不落盘、不影响真实数据")
    args = ap.parse_args()

    registry = load_registry()

    if args.selftest_privacy_gate:
        output = build_heartbeats(registry, inject_leak_for_selftest=True)
        serialized = json.dumps(output, ensure_ascii=False, indent=2)
        hits = privacy_scan(serialized)
        if hits:
            print("[selftest] 闸门按预期拒绝了泄漏数据，命中:")
            for pattern, matched in hits:
                print(f"  - 规则 {pattern!r} 命中: {matched!r}")
            print("[selftest] PASS（未写入任何文件）")
            sys.exit(0)
        else:
            print("[selftest] FAIL：闸门没有拦住注入的 /Users/ 泄漏！", file=sys.stderr)
            sys.exit(1)

    output = build_heartbeats(registry)
    ok = write_output(output)
    if not ok:
        sys.exit(1)
    print(f"[export] 写入 {OUT_PATH}：residents={len(output['residents'])} "
          f"heartbeats={len(output['heartbeats'])} active_now={output['stats']['active_now']}")

    if args.push:
        if not git_push_if_changed():
            sys.exit(1)


if __name__ == "__main__":
    main()
