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
CC_PROJECTS_DIR = os.path.join(HOME, ".claude", "projects")
REGISTRY_PATH = os.path.join(PROJECT_DIR, "registry.json")
OUT_PATH = os.path.join(PROJECT_DIR, "data", "heartbeats.json")

WINDOW_HOURS = 48
MAX_BEATS = 200
ACTIVE_WINDOW_SEC = 20 * 60  # "20 分钟内有跳" 也算 active_now

# 电量诚实边界:这套 JSONL 只有 CC 会话(泛音)的 token，OpenClaw 那几支拿不到。
# 所以电表只统计工作坊一支，UI 必须标注范围，绝不冒充全家总电耗。
ENERGY_SCOPE_NOTE = "电表暂时只装在工作坊(泛音·Claude Code)一支，管家和外勤那几支的电还没接进来"

# 荣誉柜(vibe-trophy 终身成就):缓存和快照放 ~/.config,不进公开 repo。
# 扫描一次约 10s,所以带 TTL,平时白拿缓存;解锁是稀罕事,6 小时新鲜度足够。
TROPHY_TOOL = os.path.join(HOME, "Documents", "vibe-trophy", "vibe-trophy.js")
TROPHY_CACHE = os.path.join(HOME, ".config", "heartbeat-wall", "trophies-cache.json")
TROPHY_STATE = os.path.join(HOME, ".config", "heartbeat-wall", "trophy-state.json")
TROPHY_TTL_SEC = 6 * 3600

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


def local_today_start_utc():
    """本地(机器时区)今日 00:00，换算成 UTC 的 tz-aware datetime。
    机器时区即整套系统的作息基准，用它当"今日"边界最诚实一致。"""
    now_local = datetime.now().astimezone()
    start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    return start_local.astimezone(timezone.utc)


# --- 电量:今日 CC token 消耗（只有工作坊/泛音这一支有 token 数据） ---------
def energy_today():
    """扫 ~/.claude/projects 下今日改动过的会话文件，按 message.id 去重累加 usage。
    读法参照 vibe-trophy(in/out/cache_creation/cache_read 四路)。
    诚实要点:
      - 只统计 CC 会话(=泛音),OpenClaw 那几支的 token 拿不到，范围写进 scope_note。
      - message.id 去重:同一条 assistant 消息在 JSONL 里常重复出现多次(实测 ~3x),
        不去重会把电耗虚报好几倍。
      - 只算今日(本地 00:00 起)且时间戳在今日窗口内的消息。
    失败返回 None，让整次导出不受影响。"""
    today_start = local_today_start_utc()
    cutoff = today_start.timestamp()
    files = glob.glob(os.path.join(CC_PROJECTS_DIR, "*", "*.jsonl"))
    seen_ids = set()
    tin = tout = tcc = tcr = 0
    sessions = set()
    for path in files:
        try:
            if os.path.getmtime(path) < cutoff:
                continue  # 今日没动过的文件不可能有今日消息，跳过省时
        except OSError:
            continue
        try:
            with open(path, encoding="utf-8", errors="ignore") as fh:
                for line in fh:
                    line = line.strip()
                    if not line.startswith("{"):
                        continue
                    try:
                        o = json.loads(line)
                    except Exception:
                        continue
                    if o.get("type") != "assistant":
                        continue
                    ts = o.get("timestamp")
                    if not ts:
                        continue
                    try:
                        if parse_iso(ts) < today_start:
                            continue
                    except Exception:
                        continue
                    msg = o.get("message") or {}
                    mid = msg.get("id")
                    if mid is not None:
                        if mid in seen_ids:
                            continue
                        seen_ids.add(mid)
                    u = msg.get("usage") or {}
                    tin += int(u.get("input_tokens") or 0)
                    tout += int(u.get("output_tokens") or 0)
                    tcc += int(u.get("cache_creation_input_tokens") or 0)
                    tcr += int(u.get("cache_read_input_tokens") or 0)
                    sessions.add(os.path.splitext(os.path.basename(path))[0])
        except OSError:
            continue
    total = tin + tout + tcc + tcr
    return {
        "source": "cc",
        "scope": "workshop",
        "scope_note": ENERGY_SCOPE_NOTE,
        "day_start": today_start.isoformat().replace("+00:00", "Z"),
        "tokens_today": total,            # 总吞吐(含缓存复用),口径同 vibe-trophy
        "fresh_today": tin + tout + tcc,  # 不含 cache_read 的"新鲜处理"量
        "input_today": tin,
        "output_today": tout,
        "cache_creation_today": tcc,
        "cache_read_today": tcr,
        "sessions_today": len(sessions),
    }


# --- 电表细分：每个居民今日 token（某某房间的电费） ------------------------
def _cc_token_sum(recursive):
    """今日 CC token 汇总。recursive=True 连子代理嵌套会话一起算
    （=泛音派出去的手脚烧的电也算主人头上，Max 2026-07-14 拍板"算"）。"""
    today_start = local_today_start_utc()
    cutoff = today_start.timestamp()
    if recursive:
        files = glob.glob(os.path.join(CC_PROJECTS_DIR, "**", "*.jsonl"), recursive=True)
    else:
        files = glob.glob(os.path.join(CC_PROJECTS_DIR, "*", "*.jsonl"))
    seen = set()
    tot = 0
    for path in files:
        try:
            if os.path.getmtime(path) < cutoff:
                continue
        except OSError:
            continue
        try:
            with open(path, encoding="utf-8", errors="ignore") as fh:
                for line in fh:
                    line = line.strip()
                    if not line.startswith("{"):
                        continue
                    try:
                        o = json.loads(line)
                    except Exception:
                        continue
                    if o.get("type") != "assistant":
                        continue
                    ts = o.get("timestamp")
                    if not ts:
                        continue
                    try:
                        if parse_iso(ts) < today_start:
                            continue
                    except Exception:
                        continue
                    msg = o.get("message") or {}
                    mid = msg.get("id")
                    if mid is not None:
                        if mid in seen:
                            continue
                        seen.add(mid)
                    u = msg.get("usage") or {}
                    tot += (int(u.get("input_tokens") or 0) + int(u.get("output_tokens") or 0)
                            + int(u.get("cache_creation_input_tokens") or 0)
                            + int(u.get("cache_read_input_tokens") or 0))
        except OSError:
            continue
    return tot


def _openclaw_token_sum(agent_dir):
    """今日某 OpenClaw agent 的 token 汇总（message.usage 四路，兼容 in/out/cacheWrite/cacheRead 别名）。"""
    base = os.path.expanduser(os.path.join("~", ".openclaw", "agents", agent_dir, "sessions"))
    today_start = local_today_start_utc()
    cutoff = today_start.timestamp()
    tot = 0
    for path in glob.glob(os.path.join(base, "*.jsonl")):
        if ".trajectory." in path:
            continue
        try:
            if os.path.getmtime(path) < cutoff:
                continue
        except OSError:
            continue
        try:
            with open(path, encoding="utf-8", errors="ignore") as fh:
                for line in fh:
                    line = line.strip()
                    if not line.startswith("{"):
                        continue
                    try:
                        o = json.loads(line)
                    except Exception:
                        continue
                    if o.get("type") != "message":
                        continue
                    ts = o.get("timestamp")
                    if not ts:
                        continue
                    try:
                        if parse_iso(ts) < today_start:
                            continue
                    except Exception:
                        continue
                    u = (o.get("message") or {}).get("usage") or {}
                    tot += (int(u.get("input_tokens") or u.get("input") or 0)
                            + int(u.get("output_tokens") or u.get("output") or 0)
                            + int(u.get("cache_creation_input_tokens") or u.get("cacheWrite") or 0)
                            + int(u.get("cache_read_input_tokens") or u.get("cacheRead") or 0))
        except OSError:
            continue
    return tot


def energy_by_resident(residents):
    """每个居民今日 token（细分到各屋的电费）。
    泛音=CC 全量含子代理；有 openclaw_agent 的走该 agent 的 OpenClaw 会话。
    没有 token 源的居民不进列表（诚实：那间屋还没接上电表）。"""
    out = []
    for r in residents:
        toks = None
        prov = None
        if r["sources"].get("cc_sessions"):
            toks = _cc_token_sum(recursive=True)
            prov = "claude"
        elif r["sources"].get("openclaw_agent"):
            toks = _openclaw_token_sum(r["sources"]["openclaw_agent"])
            prov = "openclaw"
        if toks is None:
            continue
        out.append({"agent": r["agent"], "emoji": r["emoji"], "tokens": toks, "provider": prov})
    out.sort(key=lambda x: x["tokens"], reverse=True)
    return out


# --- 成就:今日真实心跳聚合出的里程碑（全部真数，零编造） ------------------
_ACHIEVE_DONE = {
    "造物": ("🔧", "工作坊交付", "件活"),
    "占卜": ("🔮", "起卦推演", "卦"),
    "备份": ("🗄️", "记忆归档", "次"),
    "管家": ("🫖", "打理家务", "桩"),
    "情报": ("📡", "情报回传", "份"),
    "采集": ("📊", "数据入库", "网"),
    "瞭望": ("🛰️", "巡夜瞭望", "轮"),
    "外勤": ("📱", "外勤跑腿", "趟"),
    "牧场": ("🐄", "巡视牧场", "轮"),
    "值守": ("🔔", "应门值守", "次"),
}


def trophies_block(local_tz):
    """荣誉柜:vibe-trophy 终身成就 + 今日解锁 diff。

    - 缓存过期才真跑扫描;失败抛异常由调用方降级(整块置 None,前端不渲染)
    - "今日解锁"=对比上次快照新增的解锁,当天累积,跨天清零;
      首次建快照时不把全部存量当"今日解锁"
    - 隐藏成就没解锁就不出门,不剧透
    """
    fresh = os.path.exists(TROPHY_CACHE) and (time.time() - os.path.getmtime(TROPHY_CACHE) < TROPHY_TTL_SEC)
    if not fresh:
        os.makedirs(os.path.dirname(TROPHY_CACHE), exist_ok=True)
        p = subprocess.run(
            ["node", TROPHY_TOOL, "--json=" + TROPHY_CACHE],
            capture_output=True, text=True, timeout=180,
        )
        if p.returncode != 0 or not os.path.exists(TROPHY_CACHE):
            raise RuntimeError(f"vibe-trophy 扫描失败: {p.stderr.strip()[:200]}")

    with open(TROPHY_CACHE, encoding="utf-8") as f:
        data = json.load(f)
    ach = data.get("achievements", [])
    unlocked_names = [a["name"] for a in ach if a.get("ok")]

    today_key = datetime.now(local_tz).strftime("%Y-%m-%d")
    state = {}
    if os.path.exists(TROPHY_STATE):
        try:
            with open(TROPHY_STATE, encoding="utf-8") as f:
                state = json.load(f)
        except Exception:
            state = {}
    prev = set(state.get("unlocked", []))
    today_new = list(state.get("today_new", [])) if state.get("date") == today_key else []
    if prev:
        for n in unlocked_names:
            if n not in prev and n not in today_new:
                today_new.append(n)
    with open(TROPHY_STATE, "w", encoding="utf-8") as f:
        json.dump({"date": today_key, "unlocked": unlocked_names, "today_new": today_new},
                  f, ensure_ascii=False)

    badges = []
    for a in ach:
        if a.get("hidden") and not a.get("ok"):
            continue  # 未解锁的隐藏成就不剧透
        b = {"icon": a["icon"], "name": a["name"], "tier": a.get("tier"),
             "g": a.get("g"), "ok": bool(a.get("ok")), "desc": a.get("desc")}
        if a.get("ok"):
            b["val"] = a.get("val")
        else:
            b["cur"], b["max"] = a.get("cur"), a.get("max")
        badges.append(b)

    return {
        "source": "vibe-trophy",
        "scanned_at": data.get("generated_at"),
        "unlocked": data.get("unlocked"),
        "total": data.get("total"),
        "today_new": [b for b in badges if b["name"] in today_new],
        "badges": badges,
        "note": "终身成就,vibe-trophy 从本地日志实算,只算人类会话;今日解锁有才显示",
    }


def achievements_today(kept_beats, today_start, local_tz):
    """从今日真实心跳聚合里程碑。只发非零项，数字全来自 heartbeats 计数。"""
    from collections import Counter
    today = []
    for b in kept_beats:
        try:
            t = parse_iso(b["started_at"])
        except Exception:
            continue
        if t >= today_start:
            today.append((b, t))

    done_by_cat = Counter()
    failed_total = 0
    night_times = []
    for b, t in today:
        if b["status"] == "done":
            done_by_cat[b["category"]] += 1
        elif b["status"] == "failed":
            failed_total += 1
        if t.astimezone(local_tz).hour < 6:  # 本地凌晨 0–6 点
            night_times.append(t)

    ach = []
    # 头条:今日心跳总数
    if today:
        ach.append({"icon": "❤️", "label": "今日心跳", "value": f"{len(today)} 下"})
    # 各工种今日完成量(按完成数从多到少)
    for cat, n in done_by_cat.most_common():
        if cat in _ACHIEVE_DONE:
            icon, label, unit = _ACHIEVE_DONE[cat]
            ach.append({"icon": icon, "label": label, "value": f"{n} {unit}"})
    # 夜班:凌晨还亮着灯
    if night_times:
        span_h = (max(night_times) - min(night_times)).total_seconds() / 3600.0
        if span_h >= 1:
            ach.append({"icon": "🌙", "label": "夜班时长", "value": f"{int(span_h)} 小时"})
        else:
            ach.append({"icon": "🌙", "label": "凌晨还亮着灯", "value": f"{len(night_times)} 次"})
    # 翻车又爬起(失败也是勋章)
    if failed_total:
        ach.append({"icon": "🛠️", "label": "翻车又爬起", "value": f"{failed_total} 次"})
    return ach


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


# --- 数据源 4：OpenClaw agent 会话（Watcher/Mobile，真实消息时间戳） --------
# 直读 ~/.openclaw/agents/<agent>/sessions/*.jsonl 的消息时间戳，和 CC 会话同构。
# 只诚实标 "done"（最近活动过）——OpenClaw 侧无法可靠判定"此刻在跑"，绝不臆造 running。
def beats_from_openclaw_sessions(resident):
    agent_dir = resident["sources"].get("openclaw_agent")
    if not agent_dir:
        return []
    base = os.path.expanduser(os.path.join("~", ".openclaw", "agents", agent_dir, "sessions"))
    cutoff = datetime.now(timezone.utc).timestamp() - WINDOW_HOURS * 3600
    out = []
    for path in glob.glob(os.path.join(base, "*.jsonl")):
        if ".trajectory." in path:
            continue
        try:
            if os.path.getmtime(path) < cutoff:
                continue  # 今日窗口外的会话文件不必读
        except OSError:
            continue
        last_ts = None
        try:
            with open(path, encoding="utf-8", errors="ignore") as fh:
                for line in fh:
                    line = line.strip()
                    if not line.startswith("{"):
                        continue
                    try:
                        o = json.loads(line)
                    except Exception:
                        continue
                    if o.get("type") != "message":
                        continue
                    ts = o.get("timestamp")
                    if ts:
                        last_ts = ts
        except OSError:
            continue
        if not last_ts:
            continue
        try:
            t = parse_iso(last_ts).timestamp()
        except Exception:
            continue
        if t < cutoff:
            continue
        out.append({
            "agent": resident["agent"],
            "category": resident["category"],
            "status": "done",
            "started_at": iso(t),
            "duration_s": None,
            "title": None,
        })
    return out


# --- 数据源 5：launchd 日志 mtime（cron 居民"最近活动过"的真实运行痕迹）----
# 日志路径运行时从 launchctl 反查（不写进公开 registry），只 stat mtime（从不读内容）。
# 排除常驻守护进程（gateway）——它一直在写日志，会把"底座在跑"误当"居民在干活"。
_LAUNCHD_LOG_EXCLUDE = {"ai.openclaw.gateway"}


def beats_from_launchd_logs(label_to_resident):
    uid = os.getuid()
    best = {}  # agent -> (mtime, resident)
    for label, resident in label_to_resident.items():
        if label in _LAUNCHD_LOG_EXCLUDE:
            continue
        try:
            p = subprocess.run(
                ["launchctl", "print", f"gui/{uid}/{label}"],
                capture_output=True, text=True, timeout=8,
            )
        except Exception:
            continue
        logpath = None
        for line in p.stdout.splitlines():
            s = line.strip()
            if s.startswith("stdout path = "):
                logpath = s[len("stdout path = "):].strip()
                break
        if not logpath:
            continue
        try:
            mtime = os.path.getmtime(os.path.expanduser(logpath))
        except OSError:
            continue
        a = resident["agent"]
        if a not in best or mtime > best[a][0]:
            best[a] = (mtime, resident)
    cutoff = datetime.now(timezone.utc).timestamp() - WINDOW_HOURS * 3600
    out = []
    for a, (mtime, resident) in best.items():
        if mtime < cutoff:
            continue  # 超过 48h 窗口=确实很久没跑，诚实保持暗着，不强行点亮
        out.append({
            "agent": resident["agent"],
            "category": resident["category"],
            "status": "done",
            "started_at": iso(mtime),
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

    openclaw_session_residents = [r for r in residents if r["sources"].get("openclaw_agent")]

    def _openclaw_sessions_all():
        acc = []
        for r in openclaw_session_residents:
            acc.extend(beats_from_openclaw_sessions(r))
        return acc

    new_beats = []
    for label, fn in (
        ("cc_sessions", lambda: beats_from_cc_sessions(cc_resident)),
        ("openclaw_cron", lambda: beats_from_cron(cockpit, cron_name_to_resident)),
        ("openclaw_sessions", _openclaw_sessions_all),
        ("launchd", lambda: beats_from_launchd(cockpit, label_to_resident, launchd_now_iso)),
        ("launchd_logs", lambda: beats_from_launchd_logs(label_to_resident)),
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
    windowed = []
    for b in merged:
        sa = b.get("started_at")
        if not sa:
            continue
        try:
            if parse_iso(sa) < cutoff:
                continue
        except Exception:
            continue
        windowed.append(b)
    windowed.sort(key=lambda b: b["started_at"], reverse=True)
    # feed 截断到 MAX_BEATS，但居民"最近一跳"用未截断的窗口全量算，
    # 否则活跃居民(泛音)的几百跳会把稀疏居民的孤零心跳挤出榜，害它显示"没消息"。
    kept = windowed[:MAX_BEATS]

    # residents 名册：附最近一跳时间 + 最近一跳状态（给首页绿点用）
    residents_out = []
    for r in residents:
        latest = next((b for b in windowed if b["agent"] == r["agent"]), None)
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

    # 电量(今日 CC token)与今日成就：各自容错，炸了只置空/空数组不连累导出。
    now_local = datetime.now().astimezone()
    today_start = now_local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    local_tz = now_local.tzinfo
    try:
        energy = energy_today()
    except Exception as e:
        warn(f"电量统计失败，本轮置空: {type(e).__name__}: {e}")
        energy = None
    # 电表细分（加法式，不动上面的 workshop 口径字段，供各屋电费 UI 用）
    if energy is not None:
        try:
            br = energy_by_resident(residents)
            energy["by_resident"] = br
            energy["whole_house_tokens"] = sum(x["tokens"] for x in br)
            energy["scope_note_v2"] = (
                "细分到各屋：泛音（工作坊，含它派出去的子代理）+管家/情报/外勤已接表，"
                "其余几间还没接上；跨模型 token 只是吞吐量，不等价电费"
            )
        except Exception as e:
            warn(f"电表细分失败，本轮跳过: {type(e).__name__}: {e}")
    try:
        achievements = achievements_today(kept, today_start, local_tz)
    except Exception as e:
        warn(f"今日成就聚合失败，本轮置空: {type(e).__name__}: {e}")
        achievements = []
    try:
        trophies = trophies_block(local_tz)
    except Exception as e:
        warn(f"荣誉柜读取失败，本轮不渲染: {type(e).__name__}: {e}")
        trophies = None

    output = {
        "v": 0,
        "generated_at": now_iso_str,
        "home": registry["home"],
        "residents": residents_out,
        "stats": {
            "beats_24h": beats_24h,
            "active_now": active_now,
            "last_beat_at": last_beat_at,
            "energy": energy,
            "achievements_today": achievements,
            "trophies": trophies,
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
