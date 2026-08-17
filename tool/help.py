import json
import requests
import time
import sys

with open("test.json", "r", encoding="utf-8") as f:
    data = json.load(f)

# 正确解析：外层是列表，里面是 {"results": [...]}
if isinstance(data, list) and len(data) > 0 and "results" in data[0]:
    songs = data[0]["results"]
    print(f"📊 从 results 中加载了 {len(songs)} 首歌曲")
else:
    songs = data
    print(f"📊 加载了 {len(songs)} 首歌曲")

# 过滤出 cover_url 为空的
need_update = [s for s in songs if isinstance(s, dict) and not s.get("cover_url")]
print(f"📊 需要更新 cover_url 的歌曲: {len(need_update)} 首")

if not need_update:
    print("所有歌曲已有 cover_url，无需更新")
    sys.exit(0)

# 登录
print("🔐 登录中...")
login_resp = requests.post("http://localhost:8787/api/admin/verify", json={
    "username": "bayuep",
    "password": "lhs880528"
})
login_data = login_resp.json()
if not login_data.get("success"):
    print("❌ 登录失败")
    sys.exit(1)

token = login_data["token"]
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
print("✅ 登录成功")

print("开始更新...")
updated = 0
failed = 0

for i, song in enumerate(need_update, 1):
    bvid = song.get("bvid")
    if not bvid:
        print(f"[{i}/{len(need_update)}] 跳过：没有 bvid 字段")
        failed += 1
        continue

    print(f"[{i}/{len(need_update)}] {bvid} ...", end=" ", flush=True)

    try:
        resp = requests.get(
            f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}",
            headers={"User-Agent": "Mozilla/5.0", "Referer": "https://www.bilibili.com/"}
        )
        bili_data = resp.json()
        cover_url = bili_data.get("data", {}).get("pic", "").replace("http://", "https://")

        if not cover_url:
            print("❌ 获取封面失败")
            failed += 1
            continue

        update_resp = requests.put(
            f"http://localhost:8787/api/admin/songs/{song['id']}",
            headers=headers,
            json={"cover_url": cover_url}
        )
        if update_resp.status_code == 200:
            print(f"✅ {cover_url[:40]}...")
            updated += 1
        else:
            print(f"❌ {update_resp.text}")
            failed += 1

    except Exception as e:
        print(f"❌ {e}")
        failed += 1

    time.sleep(0.5)

print(f"\n完成：更新 {updated}，失败 {failed}")