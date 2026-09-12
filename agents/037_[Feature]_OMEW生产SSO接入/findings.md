# OMEW 生产 SSO 接入调研

- 主站已经提供标准 OIDC Provider，但生产环境仅保留旧 OMEW 桥接 secret，缺少 issuer、客户端注册和签名密钥，因此 discovery 返回 503。
- `stardust-omew` 当前线上版本仍是旧桥接实现，标准 OIDC 路由尚未部署；专属配置已固定 `medium5` 并采用单据点模式。
- 主站用户会话由 `stardustinfinity.top` 的 `authToken` cookie 提供，Provider 授权端点可直接复用；未登录授权请求会安全回到主站登录页。
- 自动登录由主站入口发起 OIDC Authorization Code + PKCE 流程，OMEW 只保留通用 Client 能力，不新增站点专用交换协议。
- 生产客户端使用精确回调 `https://omew.stardustinfinity.top/api/auth/oidc/callback`，退出回调为 `https://omew.stardustinfinity.top/api/auth/logout/complete`。
- 真实浏览器导航带有 `Sec-Fetch-Mode: navigate`，Workers Static Assets 默认先返回 SPA；若不配置 `run_worker_first`，`/oauth/authorize` 会被前端兜底路由改写为首页。所有 API、OIDC、SAML 与 SCIM 路径必须明确先进入 Worker。
