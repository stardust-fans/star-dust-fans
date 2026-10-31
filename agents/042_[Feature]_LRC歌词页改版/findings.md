# 发现

- [歌词页专辑顺序] -> [检查上游 albums.json] -> [目录按 slug 字母序输出，现页面直接沿用，导致新专辑不在前面；LRC 站首页按发行日期倒序。改为前端按 `year`（YYYY-MM-DD）排序，缺日期的排在末尾。]
- [专辑封面] -> [catalog 中 cover 为 `new URL(album.cover, SITE)`，请求 https://lrc.leisiyu.dev/albums/ELOHIM.webp] -> [404：VuePress 把封面打包成带哈希的资源，原路径不可直接引用。改为构建时从固定提交的 raw 仓库 `docs/albums/*.webp` 下载并自托管。上游 87 张封面合计约 10.8 MB，均为 `/albums/<name>.webp`。]
- [LRC 域名] -> [LRC 仓库 0e46818 已将规范地址迁到 lrc.leisiyu.dev，`curl -I` 返回 200] -> [旧域名仍由同一 Worker 服务，但站内链接与 source_url 改用规范地址。]
- [歌姬分布] -> [统计 108 张专辑的 vocal] -> [星尘 60、海伊 33、洛天依 29、诗岸 29、赤羽 25、乐正绫 20、苍穹 19、言和 12、牧心 9、乐正龙牙 5；星尘另有 星尘Infinity / 星尘Minus / 永夜Minus / Minus 等写法，沿用原正则归入星尘。]
- [站点最新列表版式] -> [对照 VideosView（#96）与 FanartView] -> [搜索 + 排序（默认「最新」）工具栏、`card-grid` 卡片网格、`SongPagination` 共享分页；同人页用胶囊标签筛选。歌词页按此重做。]
- [「最早」排序首位出现 1970-01-01] -> [查 LRC `generate_md.py`] -> [上游以 `1970-01-01` 表示发行日期不适用（「单曲」合集），站点显示为「不适用」；歌词页同样处理，目录数据保持原样。]
- [全站测试] -> [`npx vitest run`] -> [贡献者测试属于 Worker 项目，需要 workerd；npm ci 后 9 个文件 101 项全部通过。]
- [推送 main] -> [`git push origin main`] -> [仓库规则拒绝：必须经 PR 且 build-and-deploy 检查通过；不尝试绕过，交由 Rosmontis 决定是否开 PR。]
- [瀑布流方案] -> [对比 CSS `display: grid-lanes`、CSS columns 与 JS 组件] -> [grid-lanes 仅 Safari 26.4 发布，Chrome/Firefox 未支持（web-features explorer、MDN）；columns 会把阅读顺序改成纵向；选用 `@yeger/vue-masonry-wall` 6.1.4（2026-06 仍在发布，peer vue ^3.5.19）。其实现在 items 变化时整列重排、单项高度变化不重排，按首次高度分列，因此构建期用 `image-size` 记录封面宽高。]
- [购买字段格式] -> [统计 108 张专辑] -> [形如 `[淘宝 店名](链接) ￥75/￥120`、`78￥`、缺链接的 `[淘宝 行星图书馆]`、裸链接、`￥52 已完售`、`通贩不可用`、`随专辑附赠`；解析出 148 条，其中 80 条可购买，覆盖 69 张专辑。可购买 = 有渠道名且备注不含 不可用/完售/售罄/停售/未开售/尚未开始。]
- [Windows 下重建 LRC 数据报 EPERM] -> [dev 服务器监听 static/data/lrc 时执行 build:lrc] -> [rename 被占用目录拒绝，旧目录已被删；停掉 dev 服务器后重建成功。CI 为 Linux 不受影响。]
- [build_lrc 导入 src/shared/constants.js] -> [运行时出现 MODULE_TYPELESS_PACKAGE_JSON 警告] -> [package.json 无 "type": "module"；改为在脚本内保留同值常量并注明与 LRC_URL 一致。]
