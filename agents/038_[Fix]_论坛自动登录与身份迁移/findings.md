# 技术发现

## 初始状态

- 远端 `main` 已改用标准 OIDC：`/omew` 直接加载专属论坛，主站 Worker 提供 OIDC Provider，并由 OMEW 在嵌入页面内启动授权流程。
- 旧分支任务记录仅保证新建 OIDC 身份优先使用 `preferred_username`；其结论明确已有绑定继续保留原 actor，因此不满足本次已有 `sso-` 用户名迁移要求。
- 原工作目录检出旧的 `codex/omew-site-session` 分支；本任务已从最新 `origin/main` 创建独立 `codex/forum-auto-login` worktree，避免在过时身份桥上继续开发。

## Star Dust 会话契约

- 最新 `main` 的论坛入口不再发送站点私有 token；OMEW 以 `required` OIDC 模式启动 Authorization Code + PKCE，并由主站 `/oauth/authorize` 直接读取已有 `authToken` 会话。因此已登录用户进入论坛时无需再次输入凭据。
- 主站 `preferred_username` 与 `name` 均来自 `users.username`，已经提供 OMEW 将 `sso-` actor 改名所需的权威值；Star Dust 无需新增身份字段或恢复旧 iframe 消息桥。
- 未登录用户必须进入主站登录页并在登录后回到原授权请求，这属于统一登录流程；“自动登录”不应绕过主站认证创建匿名论坛身份。
- `/omew` 原先没有 `requiresAuth`，匿名访问会先看到 OMEW 的“登录 / 注册”按钮，造成论坛仍像拥有独立登录入口。将该路由纳入现有主站认证 guard 后，匿名用户先在主站登录，成功后回到 `/omew`，已登录用户则继续由 OIDC 无感授权。

## 线上数据盘点

- 专属 `stardust-omew` D1 当前仅有 1 个历史 `sso-` 内部 localpart；对应 `oidc_identities.username` 已是普通主站用户名，缺失别名数与仍带前缀的可见用户名数均为 0。
- 该身份的 OIDC subject 在 Star Dust `users` 表中解析到相同普通用户名，已确认来源与目标别名一致。
- 因为旧 localpart 已被 D1 与多个 Durable Object 用作稳定关联键，迁移应统一所有用户可见投影读取 `oidc_identities.username`，不应跨独立存储强改内部主键。该方案迁移已有显示身份，同时保留全部历史内容关系。

## OMEW 实现结论

- 专属实例由既有 `SSO_MODE=required` 与 `EMBED_ORIGIN` 共同推导会话锁定，不增加额外部署开关；无论坛会话时立即发起 OIDC，不再显示独立登录/注册入口。
- 会话锁定时前端移除登出菜单，服务端 `/api/auth/logout` 同时返回 `LOGOUT_DISABLED`，避免仅隐藏按钮仍可绕过。
- OIDC 回调和 refresh 都会回填 username alias；管理用户、全局封禁、成员详情与据点管理统一显示 alias。内部 actor 继续用于授权和内容关联，不作为用户名展示。
- OMEW 全量测试 75 个文件、494 项通过；类型检查、构建与 Worker deploy dry-run 通过。

## 调试记录

- [新 worktree 首次测试无法找到 `vitest`] -> [尝试直接调用原工作目录的 Vitest] -> [配置依赖仍按新 worktree 解析而失败；在新 worktree 执行锁文件约束的 `npm ci` 后继续验证]
- [本地页面加载歌曲接口报告 `no such table: songs`] -> [检查当前测试目标] -> [新 worktree 的本地 D1 尚未应用无关歌曲迁移；论坛路由 guard 已在浏览器中先于 iframe 正确跳到 `/login?return_to=/omew`，该空库错误不影响本次认证验收]
