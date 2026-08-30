# 调研记录

- [主线状态] -> `origin/main` 已合入用户中心与 `/aspirateur` 的初版提交 -> 本次直接从该主线建立隔离分支，避免旧的本地 `feat/about-credits-table` 分支夹带历史改动。
- [`/aspirateur` 实现错误] -> 对比路由和页面源码 -> `EasterEggView.vue` 实际误复制了完整用户中心组件，访问彩蛋会执行登录检查并跳转登录页，新增的彩蛋样式完全没有被使用。
- [用户页反馈不完整] -> 检查响应式状态 -> 已声明 `isLoading` 与 `errorMessage`，模板却不渲染；三个请求任一返回非 2xx 都不会给用户明确反馈。
- [引导娘尚未实现] -> 检查 `GuideView.vue` -> 目前只是长篇静态投稿规则，没有角色化入口、步骤导航或按用户意图分流。
- [用户页数据一致性] -> 对照 Worker 与模板 -> profile 只统计非 pending 投稿，但列表展示全部状态；`formatDate` 只接受 Unix 秒而 D1 时间列通常是 ISO 字符串，注册天数也未处理无效日期。
- [鉴权重复实现] -> 对照三个用户接口 -> Cookie/Bearer 解析重复且 Cookie 正则未 URL 解码、冲突 token 规则不明确；抽成统一请求级鉴权函数并优先显式 Authorization。
- [测试环境基线] -> 运行 `npm test -- --run test/worker.test.js` -> 23/24 通过；既存错误凭据用例因测试环境无 `TOKEN_SECRET` 返回 503 而非其断言的 401，新增用户鉴权用例通过。
- [构建验证] -> 运行 `npm run build` -> Vite client/Worker 构建成功；prebuild 重排了贡献者 JSON，已恢复该非任务文件改动。
