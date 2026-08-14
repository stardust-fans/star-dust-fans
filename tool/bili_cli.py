#!/usr/bin/env python3
"""本机 B 站抓取 + 直接提交到本站后台的 CLI 工具。

背景：B 站接口会拦截本项目 Cloudflare Workers 的服务器出口（见 agents/decisions.md），
后台"添加歌曲"已改为纯手动录入。这个工具跑在本机（不受那个封锁影响），批量抓取后直接
用后台管理员账号调用 /api/admin/songs 提交，替代一首首手动打开浏览器录入。

依赖：requests, Pillow（均为常见库，本机已确认可用）。

用法：
    python3 tool/bili_cli.py configure                      # 交互式配置站点地址与管理员账号密码
    python3 tool/bili_cli.py add --bvid BV1xxx BV1yyy        # 按 BV 号添加
    python3 tool/bili_cli.py add --search "星尘 原创"          # 按关键词搜索添加
    python3 tool/bili_cli.py add --uid 123456                # 按 UP 主 UID 添加其投稿
    python3 tool/bili_cli.py add --favlist 123456            # 按收藏夹 ID 添加
    python3 tool/bili_cli.py update                          # 刷新站内全部歌曲的播放数据
    python3 tool/bili_cli.py update --bvid BV1xxx             # 只刷新指定歌曲

已存在的 bvid（含隐藏/标记状态）自动跳过，不会重复添加或报错中断。
"""
import argparse
import getpass
import hashlib
import io
import json
import os
import re
import sys
import time
import urllib.parse
from pathlib import Path

import requests

try:
    from PIL import Image
except ImportError:
    print("❌ 缺少 Pillow，先运行: pip3 install Pillow", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "tool" / ".bili_cli_config.json"

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
BILI_HEADERS = {"User-Agent": UA, "Referer": "https://www.bilibili.com/"}
REQUEST_DELAY = 0.34  # 与 tool/bili_analyze.py、10lightyears/scripts/fetch_bilibili_meta.py 一致的限速节奏

# 与 src/shared/constants.js 保持一致，改动需同步改那边
MASTERPIECE_VIEW_THRESHOLD = 100_000
LEGEND_VIEW_THRESHOLD = 1_000_000

MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
    26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
    20, 34, 44, 52,
]


def sleep_politely():
    time.sleep(REQUEST_DELAY)


# ===== 配置 =====

def load_config():
    if not CONFIG_PATH.exists():
        print("❌ 尚未配置，先运行: python3 tool/bili_cli.py configure", file=sys.stderr)
        sys.exit(1)
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    config["site_url"] = os.environ.get("BILI_CLI_SITE_URL", config.get("site_url", ""))
    config["username"] = os.environ.get("BILI_CLI_USERNAME", config.get("username", ""))
    config["password"] = os.environ.get("BILI_CLI_PASSWORD", config.get("password", ""))
    return config


def cmd_configure(_args):
    print("配置本地 CLI 工具（写入 tool/.bili_cli_config.json，已在 .gitignore，不会被提交）\n")
    default_url = "https://stardustinfinity.top"
    site_url = input(f"站点地址 [{default_url}]: ").strip() or default_url
    username = input("管理员用户名: ").strip()
    password = getpass.getpass("管理员密码（不会回显）: ")
    if not username or not password:
        print("❌ 用户名和密码不能为空", file=sys.stderr)
        sys.exit(1)

    config = {"site_url": site_url.rstrip("/"), "username": username, "password": password}
    CONFIG_PATH.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    os.chmod(CONFIG_PATH, 0o600)
    print(f"\n✅ 已写入 {CONFIG_PATH}")


# ===== WBI 签名（搜索 / UP 主投稿列表需要，算法见 bilibili-API-collect 社区文档） =====

def get_wbi_keys():
    r = requests.get("https://api.bilibili.com/x/web-interface/nav", headers=BILI_HEADERS, timeout=10)
    wbi_img = r.json()["data"]["wbi_img"]
    img_key = wbi_img["img_url"].rsplit("/", 1)[-1].split(".")[0]
    sub_key = wbi_img["sub_url"].rsplit("/", 1)[-1].split(".")[0]
    return img_key, sub_key


def get_mixin_key(orig):
    return "".join(orig[i] for i in MIXIN_KEY_ENC_TAB)[:32]


def wbi_sign(params, img_key, sub_key):
    mixin_key = get_mixin_key(img_key + sub_key)
    params = dict(params)
    params["wts"] = round(time.time())
    params = dict(sorted(params.items()))
    query = urllib.parse.urlencode(params)
    params["w_rid"] = hashlib.md5((query + mixin_key).encode()).hexdigest()
    return params


def strip_html(text):
    return re.sub(r"<[^>]+>", "", text or "")


class BiliRiskControl(Exception):
    """B 站接口触发风控/反爬（返回非 JSON 挑战页，或 code=-352 等风控错误码）。"""


def safe_bili_json(response, context):
    try:
        data = response.json()
    except ValueError:
        raise BiliRiskControl(f"{context}：接口返回非 JSON（疑似风控挑战页），过一会再试")
    if data.get("code") == -352:
        raise BiliRiskControl(f"{context}：触发风控校验失败（code -352），过一会再试，不要短时间内反复调用")
    return data


# ===== B 站数据源 =====

def fetch_video_detail(bvid):
    """单视频完整信息，字段与 tool/bili_analyze.py 一致。"""
    url = f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}"
    r = requests.get(url, headers=BILI_HEADERS, timeout=15)
    data = safe_bili_json(r, bvid)
    if data.get("code") != 0:
        raise RuntimeError(f"{bvid}: {data.get('message', '未知错误')}")
    d = data["data"]
    owner = d.get("owner") or {}
    stat = d.get("stat") or {}
    return {
        "bvid": d.get("bvid"),
        "title": d.get("title") or "",
        "description": d.get("desc") or "",
        "cover_url": (d.get("pic") or "").replace("http://", "https://"),
        "duration": d.get("duration") or 0,
        "pubdate": d.get("pubdate") or 0,
        "owner_name": owner.get("name") or "",
        "owner_mid": owner.get("mid"),
        "stats": {
            "view": stat.get("view", 0),
            "like": stat.get("like", 0),
            "coin": stat.get("coin", 0),
            "favorite": stat.get("favorite", 0),
            "reply": stat.get("reply", 0),
            "danmaku": stat.get("danmaku", 0),
            "share": stat.get("share", 0),
        },
    }


def discover_by_search(keyword, limit):
    img_key, sub_key = get_wbi_keys()
    bvids = []
    page = 1
    while len(bvids) < limit:
        sleep_politely()
        params = wbi_sign({"search_type": "video", "keyword": keyword, "page": page}, img_key, sub_key)
        r = requests.get("https://api.bilibili.com/x/web-interface/wbi/search/type",
                          params=params, headers=BILI_HEADERS, timeout=15)
        try:
            data = safe_bili_json(r, "搜索")
        except BiliRiskControl as e:
            print(f"⚠️ {e}", file=sys.stderr)
            break
        if data.get("code") != 0:
            print(f"⚠️ 搜索接口返回错误: {data.get('message')}", file=sys.stderr)
            break
        results = (data.get("data") or {}).get("result") or []
        if not results:
            break
        for item in results:
            bvid = item.get("bvid")
            if bvid:
                bvids.append(bvid)
            if len(bvids) >= limit:
                break
        page += 1
        if page > 20:  # 硬上限，避免关键词太宽泛时无限翻页
            break
    return bvids[:limit]


def discover_by_uid(mid, limit):
    img_key, sub_key = get_wbi_keys()
    bvids = []
    page = 1
    ps = 30
    while len(bvids) < limit:
        sleep_politely()
        params = wbi_sign({"mid": mid, "ps": ps, "pn": page, "order": "pubdate"}, img_key, sub_key)
        r = requests.get("https://api.bilibili.com/x/space/wbi/arc/search",
                          params=params, headers=BILI_HEADERS, timeout=15)
        try:
            data = safe_bili_json(r, "UP 主投稿列表")
        except BiliRiskControl as e:
            print(f"⚠️ {e}", file=sys.stderr)
            break
        if data.get("code") != 0:
            print(f"⚠️ UP 主投稿接口返回错误: {data.get('message')}", file=sys.stderr)
            break
        vlist = (((data.get("data") or {}).get("list") or {}).get("vlist")) or []
        if not vlist:
            break
        for item in vlist:
            bvid = item.get("bvid")
            if bvid:
                bvids.append(bvid)
            if len(bvids) >= limit:
                break
        page += 1
        if page > 50:
            break
    return bvids[:limit]


def discover_by_favlist(media_id, limit):
    bvids = []
    page = 1
    ps = 20
    while len(bvids) < limit:
        sleep_politely()
        params = {"media_id": media_id, "pn": page, "ps": ps, "platform": "web"}
        r = requests.get("https://api.bilibili.com/x/v3/fav/resource/list",
                          params=params, headers=BILI_HEADERS, timeout=15)
        try:
            data = safe_bili_json(r, "收藏夹")
        except BiliRiskControl as e:
            print(f"⚠️ {e}", file=sys.stderr)
            break
        if data.get("code") != 0:
            print(f"⚠️ 收藏夹接口返回错误: {data.get('message')}", file=sys.stderr)
            break
        medias = (data.get("data") or {}).get("medias") or []
        if not medias:
            break
        for item in medias:
            bvid = item.get("bvid")
            if bvid:
                bvids.append(bvid)
            if len(bvids) >= limit:
                break
        has_more = ((data.get("data") or {}).get("has_more"))
        page += 1
        if not has_more or page > 50:
            break
    return bvids[:limit]


def fetch_cover_webp_base64(cover_url, max_width=480, quality=82):
    sleep_politely()
    r = requests.get(cover_url, headers={"User-Agent": UA}, timeout=15)
    r.raise_for_status()
    img = Image.open(io.BytesIO(r.content)).convert("RGB")
    if img.width > max_width:
        ratio = max_width / img.width
        img = img.resize((max_width, round(img.height * ratio)))
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=quality)
    import base64
    return base64.b64encode(buf.getvalue()).decode("ascii")


def compute_tiers(view_count):
    return {
        "is_masterpiece": view_count >= MASTERPIECE_VIEW_THRESHOLD,
        "is_legend": view_count >= LEGEND_VIEW_THRESHOLD,
    }


# ===== 本站后台 API =====

class SiteClient:
    def __init__(self, base_url, username, password):
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.token = None

    def login(self):
        r = requests.post(f"{self.base_url}/api/admin/verify",
                           json={"username": self.username, "password": self.password}, timeout=15)
        data = r.json()
        if not data.get("success"):
            raise RuntimeError(f"登录失败: {data.get('error', '未知错误')}")
        self.token = data["token"]

    def _headers(self):
        return {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}

    def list_songs(self):
        r = requests.get(f"{self.base_url}/api/songs", timeout=15)
        r.raise_for_status()
        return r.json()

    def create_song(self, payload):
        r = requests.post(f"{self.base_url}/api/admin/songs", json=payload, headers=self._headers(), timeout=30)
        return r.status_code, r.json()

    def update_song(self, song_id, payload):
        r = requests.put(f"{self.base_url}/api/admin/songs/{song_id}", json=payload,
                          headers=self._headers(), timeout=30)
        return r.status_code, r.json()


def build_add_payload(detail, with_cover=True):
    tiers = compute_tiers(detail["stats"]["view"])
    payload = {
        "bvid": detail["bvid"],
        "title": strip_html(detail["title"]),
        "description": strip_html(detail["description"]),
        "duration": detail["duration"],
        "pubdate": detail["pubdate"],
        "owner": {"name": detail["owner_name"], "mid": detail["owner_mid"], "face": None},
        "stats": detail["stats"],
        "special_tags": [],
        "collaboration_details": None,
        "status": "published",
        "flag_reason": None,
        **tiers,
        "is_national_team": False,
        "is_gods_descend": False,
    }
    if with_cover and detail.get("cover_url"):
        try:
            payload["cover"] = fetch_cover_webp_base64(detail["cover_url"])
        except Exception as e:
            print(f"  ⚠️ 封面抓取失败（{e}），将不带封面提交", file=sys.stderr)
    return payload


# ===== 命令 =====

def cmd_add(args):
    config = load_config()
    client = SiteClient(config["site_url"], config["username"], config["password"])
    client.login()
    print(f"✅ 已登录 {config['site_url']}（{config['username']}）")

    if args.bvid:
        bvids = args.bvid
    elif args.search:
        print(f"🔍 搜索「{args.search}」...")
        bvids = discover_by_search(args.search, args.limit)
    elif args.uid:
        print(f"🔍 拉取 UID {args.uid} 的投稿列表...")
        bvids = discover_by_uid(args.uid, args.limit)
    elif args.favlist:
        print(f"🔍 拉取收藏夹 {args.favlist}...")
        bvids = discover_by_favlist(args.favlist, args.limit)
    else:
        print("❌ 需要指定 --bvid / --search / --uid / --favlist 之一", file=sys.stderr)
        sys.exit(1)

    bvids = list(dict.fromkeys(bvids))  # 保序去重
    if not bvids:
        print("没有找到任何视频")
        return
    print(f"共 {len(bvids)} 个候选：{', '.join(bvids[:10])}{' ...' if len(bvids) > 10 else ''}")

    existing = {s["bvid"] for s in client.list_songs()}
    todo = [b for b in bvids if b not in existing]
    skipped_existing = len(bvids) - len(todo)
    if skipped_existing:
        print(f"跳过 {skipped_existing} 个已存在的 bvid")
    if not todo:
        print("没有新视频需要添加")
        return

    if not args.yes:
        confirm = input(f"确认添加以上 {len(todo)} 首歌曲？[y/N] ").strip().lower()
        if confirm != "y":
            print("已取消")
            return

    added = failed = 0
    for i, bvid in enumerate(todo, 1):
        print(f"[{i}/{len(todo)}] {bvid} ...", end=" ", flush=True)
        try:
            sleep_politely()
            detail = fetch_video_detail(bvid)
            payload = build_add_payload(detail)
            status, resp = client.create_song(payload)
            if status == 409:
                print("已存在，跳过")
            elif 200 <= status < 300:
                print(f"✅ {detail['title'][:30]}")
                added += 1
            else:
                print(f"❌ {resp.get('error', status)}")
                failed += 1
        except Exception as e:
            print(f"❌ {e}")
            failed += 1

    print(f"\n完成：新增 {added}，失败 {failed}，跳过 {skipped_existing}")


def cmd_update(args):
    config = load_config()
    client = SiteClient(config["site_url"], config["username"], config["password"])
    client.login()
    print(f"✅ 已登录 {config['site_url']}（{config['username']}）")

    songs = client.list_songs()
    if args.bvid:
        wanted = set(args.bvid)
        songs = [s for s in songs if s["bvid"] in wanted]
        missing = wanted - {s["bvid"] for s in songs}
        if missing:
            print(f"⚠️ 站内没有这些 bvid，跳过：{', '.join(missing)}", file=sys.stderr)

    if not songs:
        print("没有需要更新的歌曲")
        return

    print(f"共 {len(songs)} 首歌曲待刷新播放数据")
    updated = failed = 0
    for i, song in enumerate(songs, 1):
        bvid = song["bvid"]
        print(f"[{i}/{len(songs)}] {bvid} ...", end=" ", flush=True)
        try:
            sleep_politely()
            detail = fetch_video_detail(bvid)
            tiers = compute_tiers(detail["stats"]["view"])
            payload = {
                "title": strip_html(detail["title"]),
                "description": strip_html(detail["description"]),
                "duration": detail["duration"],
                "pubdate": detail["pubdate"],
                "owner": {"name": detail["owner_name"], "mid": detail["owner_mid"], "face": None},
                "stats": detail["stats"],
                "special_tags": song.get("special_tags") or [],
                "collaboration_details": song.get("collaboration_details"),
                "status": song.get("status", "published"),
                "flag_reason": None,
                "is_national_team": song.get("is_national_team", False),
                "is_gods_descend": song.get("is_gods_descend", False),
                **tiers,
            }
            if not args.no_cover:
                try:
                    payload["cover"] = fetch_cover_webp_base64(detail["cover_url"])
                except Exception as e:
                    print(f"(封面刷新失败: {e}) ", end="", flush=True)
            status, resp = client.update_song(song["id"], payload)
            if 200 <= status < 300:
                view = detail["stats"]["view"]
                tag = "🌟传说曲" if tiers["is_legend"] else ("🏆殿堂曲" if tiers["is_masterpiece"] else "")
                print(f"✅ 播放 {view:,} {tag}")
                updated += 1
            else:
                print(f"❌ {resp.get('error', status)}")
                failed += 1
        except Exception as e:
            print(f"❌ {e}")
            failed += 1

    print(f"\n完成：更新 {updated}，失败 {failed}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("configure", help="配置站点地址与管理员账号密码").set_defaults(func=cmd_configure)

    p_add = sub.add_parser("add", help="发现并添加新歌曲")
    src = p_add.add_mutually_exclusive_group(required=True)
    src.add_argument("--bvid", nargs="+", metavar="BV...", help="按 BV 号列表添加")
    src.add_argument("--search", metavar="关键词", help="按关键词搜索添加")
    src.add_argument("--uid", type=int, metavar="UID", help="按 UP 主 UID 添加其投稿")
    src.add_argument("--favlist", type=int, metavar="MEDIA_ID", help="按收藏夹 ID 添加")
    p_add.add_argument("--limit", type=int, default=30, help="search/uid/favlist 模式下最多取多少个候选（默认 30）")
    p_add.add_argument("--yes", action="store_true", help="跳过确认提示，直接提交")
    p_add.set_defaults(func=cmd_add)

    p_update = sub.add_parser("update", help="刷新已有歌曲的播放数据（不传 --bvid 则刷新全部）")
    p_update.add_argument("--bvid", nargs="+", metavar="BV...", help="只刷新指定 bvid")
    p_update.add_argument("--no-cover", action="store_true", help="不重新抓取封面，只更新数字")
    p_update.set_defaults(func=cmd_update)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
