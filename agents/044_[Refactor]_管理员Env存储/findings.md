# 调研结果

- PR 已合并，起始 main add6b69。
- EdgeSonic 参考：worker/src/endpoints/edgesonic/cf.ts、permissions.ts。已核对 Cloudflare 官方 Secrets API。
- IRIS workspace 列表没有当前仓库。
- 远端 ruleset：pull_request 和 build-and-deploy 必需；传统 protection 端点返回 404。
- 首次适配前测试失败于旧 admins fixture；后续 CRUD 测试失败于复用已消费的 Response；两项均已修正。
- 最终测试：10 个文件、117 项全部通过。构建成功，既有 Live2D 库发出模块及体积提示。
- 初始化工具检查：JSON 可解析、PBKDF2 哈希、超级管理员角色、短密码拒绝均通过。
- 技术取舍见 ../044.md。
