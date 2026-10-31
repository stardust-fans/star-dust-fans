# 发现

- [歌词页专辑顺序] -> [检查上游 albums.json] -> [目录按 slug 字母序输出，现页面直接沿用，导致新专辑不在前面；LRC 站首页按发行日期倒序。改为前端按 `year`（YYYY-MM-DD）排序，缺日期的排在末尾。]
- [专辑封面] -> [catalog 中 cover 为 `new URL(album.cover, SITE)`，请求 https://lrc.leisiyu.dev/albums/ELOHIM.webp] -> [404：VuePress 把封面打包成带哈希的资源，原路径不可直接引用。改为构建时从固定提交的 raw 仓库 `docs/albums/*.webp` 下载并自托管。上游 87 张封面合计约 10.8 MB，均为 `/albums/<name>.webp`。]
- [LRC 域名] -> [LRC 仓库 0e46818 已将规范地址迁到 lrc.leisiyu.dev，`curl -I` 返回 200] -> [旧域名仍由同一 Worker 服务，但站内链接与 source_url 改用规范地址。]
- [歌姬分布] -> [统计 108 张专辑的 vocal] -> [星尘 60、海伊 33、洛天依 29、诗岸 29、赤羽 25、乐正绫 20、苍穹 19、言和 12、牧心 9、乐正龙牙 5；星尘另有 星尘Infinity / 星尘Minus / 永夜Minus / Minus 等写法，沿用原正则归入星尘。]
- [站点最新列表版式] -> [对照 VideosView（#96）与 FanartView] -> [搜索 + 排序（默认「最新」）工具栏、`card-grid` 卡片网格、`SongPagination` 共享分页；同人页用胶囊标签筛选。歌词页按此重做。]
- [「最早」排序首位出现 1970-01-01] -> [查 LRC `generate_md.py`] -> [上游以 `1970-01-01` 表示发行日期不适用（「单曲」合集），站点显示为「不适用」；歌词页同样处理，目录数据保持原样。]
- [全站测试] -> [`npx vitest run`] -> [贡献者测试属于 Worker 项目，需要 workerd；npm ci 后 9 个文件 101 项全部通过。]
