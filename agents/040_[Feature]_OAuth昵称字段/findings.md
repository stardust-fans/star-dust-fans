# 调研与决策

- 主站注册与设置接口已有 users.display_name，用户设置页可修改昵称；无需新增数据库列或重复昵称接口。
- OIDC profileClaims 已供所有 ID Token 和 UserInfo 使用，name 使用 display_name 或 username，preferred_username 使用 username；只缺标准 nickname 及 discovery claims_supported 声明。
- nickname 与 name 共享站内显示名称，受 profile scope 控制；username、sub 与既有邮箱边界保持原语义。未设置昵称时使用用户名，与站内显示行为一致。
- 参考：https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims 和 https://developers.cloudflare.com/workers/best-practices/workers-best-practices/。
- 初次 git fetch 被沙箱禁止写入 FETCH_HEAD，提升权限后成功；远端任务基点 cbe0967。
- 管理工具创建的工作区路径不符合全局目录规则，未写入代码，保留原状；重新通过 git worktree add 在规则指定路径准备任务分支。
- 初次查找 src/auth 失败，Worker 实际协议模块位于 src/worker，已更正路径。
- 回归测试首次运行 5 失败、11 通过，全部失败均由 discovery 或 profile claims 缺少 nickname 引起，证实测试能捕获本次缺陷。
- profileClaims 为授权码、refresh、设备授权、CIBA 和 UserInfo 的共同输出路径，一处扩展即可保持各协议流程一致。
