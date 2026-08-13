#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
B站视频信息分析工具
用法: python bili_analyze.py <B站视频链接或BV号>
示例: python bili_analyze.py https://www.bilibili.com/video/BV1As411k7hR
      python bili_analyze.py BV1As411k7hR
"""

import re
import sys
import json
from datetime import datetime
from urllib.parse import urlparse, parse_qs

import requests

# 颜色输出（可选）
class Colors:
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    CYAN = '\033[96m'
    RED = '\033[91m'
    BOLD = '\033[1m'
    END = '\033[0m'

def extract_bvid(input_str):
    """从输入中提取BV号"""
    # 如果直接是BV号
    if re.match(r'^BV[a-zA-Z0-9]{10}$', input_str):
        return input_str

    # 从URL中提取
    # 匹配 https://www.bilibili.com/video/BVxxxxx
    match = re.search(r'BV[a-zA-Z0-9]{10}', input_str)
    if match:
        return match.group(0)

    # 从短链接 b23.tv 或 其他格式
    match = re.search(r'BV[a-zA-Z0-9]{10}', input_str)
    if match:
        return match.group(0)

    return None

def fetch_video_info(bvid):
    """调用B站API获取视频信息"""
    url = f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}"

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com/',
    }

    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()

        data = response.json()

        if data['code'] != 0:
            print(f"{Colors.RED}❌ API返回错误: {data.get('message', '未知错误')}{Colors.END}")
            return None

        return data['data']

    except requests.exceptions.RequestException as e:
        print(f"{Colors.RED}❌ 网络请求失败: {e}{Colors.END}")
        return None
    except json.JSONDecodeError as e:
        print(f"{Colors.RED}❌ JSON解析失败: {e}{Colors.END}")
        return None

def format_duration(seconds):
    """格式化视频时长"""
    if not seconds:
        return '未知'
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"

def format_timestamp(ts):
    """格式化时间戳"""
    if not ts:
        return '未知'
    dt = datetime.fromtimestamp(ts)
    return dt.strftime('%Y-%m-%d %H:%M:%S')

def print_video_info(data):
    """美化打印视频信息"""
    print(f"\n{Colors.BOLD}{Colors.CYAN}{'='*60}{Colors.END}")
    print(f"{Colors.BOLD}📺 B站视频信息分析{Colors.END}")
    print(f"{Colors.CYAN}{'='*60}{Colors.END}\n")

    # 基本信息
    print(f"{Colors.BOLD}📌 标题:{Colors.END}")
    print(f"   {data.get('title', '未知')}\n")

    print(f"{Colors.BOLD}🔗 BV号:{Colors.END}  {data.get('bvid', '未知')}")
    print(f"{Colors.BOLD}🆔 AV号:{Colors.END}  {data.get('aid', '未知')}")

    # 时长
    duration = data.get('duration', 0)
    print(f"{Colors.BOLD}⏱️  时长:{Colors.END}    {format_duration(duration)}")

    # 发布时间
    pubdate = data.get('pubdate', 0)
    print(f"{Colors.BOLD}📅 发布时间:{Colors.END} {format_timestamp(pubdate)}")

    # 观看数据
    stat = data.get('stat', {})
    print(f"\n{Colors.BOLD}📊 数据统计:{Colors.END}")
    print(f"   播放: {stat.get('view', 0):,}")
    print(f"   弹幕: {stat.get('danmaku', 0):,}")
    print(f"   评论: {stat.get('reply', 0):,}")
    print(f"   点赞: {stat.get('like', 0):,}")
    print(f"   收藏: {stat.get('favorite', 0):,}")
    print(f"   投币: {stat.get('coin', 0):,}")
    print(f"   分享: {stat.get('share', 0):,}")

    # UP主信息
    owner = data.get('owner', {})
    print(f"\n{Colors.BOLD}👤 UP主:{Colors.END}")
    print(f"   名称: {owner.get('name', '未知')}")
    print(f"   UID:  {owner.get('mid', '未知')}")

    # 封面
    pic = data.get('pic', '')
    print(f"\n{Colors.BOLD}🖼️  封面:{Colors.END}")
    print(f"   {pic}")

    # 标签（tid）
    tid = data.get('tid', 0)
    tname = data.get('tname', '')
    print(f"\n{Colors.BOLD}🏷️  分区:{Colors.END}  {tname} (TID: {tid})")

    # 简介
    desc = data.get('desc', '')
    if desc:
        print(f"\n{Colors.BOLD}📝 简介:{Colors.END}")
        # 截断显示，避免太长
        desc_lines = desc.split('\n')
        if len(desc_lines) > 5:
            desc = '\n'.join(desc_lines[:5]) + f"\n... (共{len(desc_lines)}行)"
        print(f"   {desc}")

    # 输出JSON格式（方便后续处理）
    print(f"\n{Colors.CYAN}{'='*60}{Colors.END}")
    print(f"{Colors.BOLD}📋 JSON 格式（可直接复制）:{Colors.END}")

    # 构建结构化数据
    output = {
        'bvid': data.get('bvid'),
        'aid': data.get('aid'),
        'title': data.get('title'),
        'description': data.get('desc', ''),
        'cover_url': data.get('pic'),
        'duration': data.get('duration'),
        'pubdate': data.get('pubdate'),
        'pubdate_str': format_timestamp(pubdate),
        'owner_name': owner.get('name'),
        'owner_mid': owner.get('mid'),
        'type': data.get('tname'),
        'tid': data.get('tid'),
        'stats': {
            'view': stat.get('view', 0),
            'like': stat.get('like', 0),
            'coin': stat.get('coin', 0),
            'favorite': stat.get('favorite', 0),
            'reply': stat.get('reply', 0),
            'danmaku': stat.get('danmaku', 0),
            'share': stat.get('share', 0),
        }
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))

    print(f"\n{Colors.CYAN}{'='*60}{Colors.END}")

    return output

def main():
    if len(sys.argv) < 2:
        print(f"{Colors.RED}❌ 请提供B站视频链接或BV号{Colors.END}")
        print(f"\n用法: {sys.argv[0]} <B站视频链接或BV号>")
        print(f"示例: {sys.argv[0]} https://www.bilibili.com/video/BV1As411k7hR")
        print(f"      {sys.argv[0]} BV1As411k7hR")
        sys.exit(1)

    input_str = sys.argv[1]

    # 提取BV号
    bvid = extract_bvid(input_str)
    if not bvid:
        print(f"{Colors.RED}❌ 无法从输入中提取BV号: {input_str}{Colors.END}")
        sys.exit(1)

    print(f"{Colors.GREEN}✅ 识别到BV号: {bvid}{Colors.END}")

    # 获取视频信息
    data = fetch_video_info(bvid)
    if not data:
        sys.exit(1)

    # 打印分析结果
    print_video_info(data)

if __name__ == '__main__':
    main()