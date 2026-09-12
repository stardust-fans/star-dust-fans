# OMEW 生产 SSO 接入进度

- 2026-09-12：完成两个 Worker、custom domain、secret 名称、版本与 OMEW 待执行 D1 migration 的只读盘点。
- 2026-09-12：确认保留 StarDust 作为集成拥有方，通过标准 OIDC 入口完成嵌入式自动登录。
- 2026-09-12：生成并直接写入 Provider 签名密钥与 OMEW confidential client，未在本地、仓库或日志持久化密钥值。
- 2026-09-12：OIDC discovery、公开 JWKS、PAR、OMEW required 模式、主站登录回跳与 `medium5` 单据点线上探针通过；旧专用桥接 secret 已删除。
- 2026-09-12：PR 合并并由生产工作流完成部署；Edge 未保存主站登录凭据，最终已登录回调留待现有用户会话复验。
- 2026-09-12：IAB 真实导航发现 `/oauth/authorize` 被 Static Assets 当作 SPA 深链接；补充 `run_worker_first` 后重新验证，浏览器已正确进入带完整 `return_to` 的主站登录页。
