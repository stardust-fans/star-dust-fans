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
- `git push origin main` → rejected（Changes must be made through a pull request；Required status check "build-and-deploy"）。
- `npm install -D @yeger/vue-masonry-wall@6.1.4 image-size@2.0.4`：新增 3 个包。
- 改 `tool/build_lrc.mjs`：署名/购买字段 schema、`parseLinks`/`parseOffers`、封面宽高；`npm run build:lrc` → 148 条购买信息（80 条可购买）、106 条发布链接。
- 重写 `src/public/views/LyricsView.vue`（瀑布流、默认购买与价格、完整信息展开）；还原 `src/shared/SongPagination.vue`。
- `npx vite build` → 成功；`npx vitest run` → 9 files / 101 tests passed。
- 浏览器：星尘 69 张、3 列瀑布流、51 张卡片显示购买渠道；「全部」108 张；搜索「平行四界」26 张；375px 单列无横向滚动；无失败请求。
- `git push -u origin feat/lrc-lyrics-redesign`；`gh pr create` → https://github.com/stardust-fans/star-dust-fans/pull/105（base main）。
- 新增 `src/public/components/LyricsAlbumDialog.vue`、`src/shared/lrc.js`；`LyricsView.vue` 改为按钮打开弹窗；`npx vite build` 成功，`npx vitest run` 9 files / 101 tests passed；浏览器验证弹窗打开/Esc/遮罩关闭与 375px 宽度。
