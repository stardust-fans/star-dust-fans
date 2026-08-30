# 调研记录

- [主线状态] -> `origin/main` 已合入用户中心与 `/aspirateur` 的初版提交 -> 本次直接从该主线建立隔离分支，避免旧的本地 `feat/about-credits-table` 分支夹带历史改动。
- [`/aspirateur` 实现错误] -> 对比路由和页面源码 -> `EasterEggView.vue` 实际误复制了完整用户中心组件，访问彩蛋会执行登录检查并跳转登录页，新增的彩蛋样式完全没有被使用。
- [用户页反馈不完整] -> 检查响应式状态 -> 已声明 `isLoading` 与 `errorMessage`，模板却不渲染；三个请求任一返回非 2xx 都不会给用户明确反馈。
- [引导娘尚未实现] -> 检查 `GuideView.vue` -> 目前只是长篇静态投稿规则，没有角色化入口、步骤导航或按用户意图分流。
- [用户页数据一致性] -> 对照 Worker 与模板 -> profile 只统计非 pending 投稿，但列表展示全部状态；`formatDate` 只接受 Unix 秒而 D1 时间列通常是 ISO 字符串，注册天数也未处理无效日期。
- [鉴权重复实现] -> 对照三个用户接口 -> Cookie/Bearer 解析重复且 Cookie 正则未 URL 解码、冲突 token 规则不明确；抽成统一请求级鉴权函数并优先显式 Authorization。
- [测试环境基线] -> 运行 `npm test -- --run test/worker.test.js` -> 23/24 通过；既存错误凭据用例因测试环境无 `TOKEN_SECRET` 返回 503 而非其断言的 401，新增用户鉴权用例通过。
- [构建验证] -> 运行 `npm run build` -> Vite client/Worker 构建成功；prebuild 重排了贡献者 JSON，已恢复该非任务文件改动。
- [本次实现范围] -> 父任务拆分要求本 worktree 只处理 `/aspirateur` 与神秘小恐龙 -> 不触碰 `UserView.vue`、`worker.js`、`GuideView.vue`，并使用 Vue/CSS/SVG 原生视觉。
- [测试基线] -> `npm test` -> 26 个用例中 25 个通过，既存的错误凭据用例在无 `TOKEN_SECRET` 环境返回 503 而非期望的 401，未涉及本次前端改动。
- [构建] -> `npm run build` -> Vite 生产构建通过；构建脚本重排贡献者 JSON，已恢复该非本次范围文件。
- [角色混淆] -> 对照登录签发与全路由鉴权 -> 原 token 没有 role，普通用户可被 `isAdmin` 接受且 admin token 可访问用户接口；为新 token 增加互斥 `admin`/`user` role，所有相关路径统一按期望角色验证，旧 token 不再兼容。
- [对抗测试] -> 使用测试环境签发两种带角色 HMAC token -> 验证 user token 拒绝 admin 路径、admin token 拒绝 user 路径，并验证双方合法路径均返回 200；全套 31 项测试通过。
- [补强验证] -> `npm run build && npm test` -> 构建通过；测试仍为 25/26 通过，唯一失败仍是无 `TOKEN_SECRET` 时错误凭据用例的既存 503/401 基线差异。
- [schema 漂移] -> 空库执行 `tool/schema.sql` 时发现 Worker 使用的投稿列缺失，且存在未使用的 `user_contributions` 表 -> 将 fanart/shop 的现行字段、外键和索引写入正式 schema，删除未使用表；新增 0004 仅创建可重复执行的索引，不对生产列做 ALTER。
- [生产 schema 只读核验] -> Wrangler 查询 `sqlite_master` -> 生产库已有人手工补齐 `users`、投稿图片、`user_id` 与 `ship_time`，但缺少仓库 migration 记录；因此 0004 只创建幂等索引，避免重复 ALTER 破坏部署。
- [主分支规则] -> GitHub classic protection 接口返回未保护，但 repository ruleset 明确要求 PR、状态检查和评审线程解决 -> 按受保护主分支交付，不直接推送 main。
- [浏览器验收] -> 使用本地 D1 测试账号在应用内浏览器验证桌面与 390x844 视口 -> `/user` 登录保护、资料/统计/投稿切换/退出均正常；引导娘键盘切换和 3/3 进度正常；`/aspirateur` 全屏交互正常；小恐龙延迟出现且全屏路由隐藏。
