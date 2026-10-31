# 进度

- `git fetch origin --prune` + `git merge --ff-only origin/main`：main 快进到 a9fc0fe。
- `git switch -c feat/lrc-lyrics-redesign`。
- `curl -sI https://lrc.leisiyu.dev/` → 200；`/albums/ELOHIM.webp` → 404。
- `npm ci`：安装 126 个包。
- 改 `tool/build_lrc.mjs`：封面 schema、下载到 `covers/`、`LRC_URL`；`npm run build:lrc` → 108 张专辑、960 首歌词、87 张封面（493ee71）。
- 改 `src/shared/SongPagination.vue`（unit/label）、`src/shared/constants.js`（LRC_URL）、`src/public/views/LyricsView.vue`（重写）、`AboutView.vue`、`FanartView.vue`/`ShopView.vue`/`DailyView.vue`（序号）、`README.md`。
- `git merge --no-ff worktree-agent-a66bd2cd475e813f8`：并入贡献者别名提交 3ce46f0。
- `npx vite build` → 成功；`npx vitest run` → 9 files / 101 tests passed。
- 浏览器 http://localhost:5173/lyrics：默认星尘 69 张、最新在前、搜索「碎屑」1 条、空结果提示、第 2/9 页、375px scrollWidth=375；/about 显示「暝行镌无 @lsy-404」。
