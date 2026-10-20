# 星尘粉丝站 (star-dust-fans)

VOCALOID 中文虚拟歌姬「星尘」的非官方粉丝站，运行在 stardustinfinity.top。
- [![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
- 网站链接：https://stardustinfinity.top/
## 功能

- 歌曲库：分页浏览，按标题、BV 号或 UP 主搜索，支持发布日期和播放量排序；收录歌曲信息与统计数据快照，评价标记和自定义标签均可选
- 同人作品展示
- 周边量贩信息
- 社群日报
- 管理后台：歌曲 / 日报 / 同人 / 量贩内容管理，多管理员账号，操作审计日志

## 技术栈

- 运行时：[Cloudflare Workers](https://developers.cloudflare.com/workers/)，ES modules，无后端框架
- 数据库：[Cloudflare D1](https://developers.cloudflare.com/d1/)
- 前端：[Vue 3](https://vuejs.org/) + [Vite](https://vitejs.dev/)（`@cloudflare/vite-plugin`），两个独立构建入口——公开站使用 history 路由，管理后台使用 hash 路由
- 静态资源：Workers Static Assets
- 认证：本地 HMAC 会话、PBKDF2-HMAC-SHA256 密码哈希，以及 RS256 OpenID Connect Provider
- 测试：[Vitest](https://vitest.dev/) + `@cloudflare/vitest-pool-workers`

## 本地开发

```bash
npm install

# 创建 .dev.vars，写入本地密钥（至少需要 TOKEN_SECRET，用于管理员 token 签名）
npm run dev          # vite dev server，前端热更新
npm run dev:worker   # wrangler dev，真实 Worker 运行时
npm test              # 运行测试
npm run build          # 构建前端产物到 dist/
npm run deploy         # wrangler deploy 部署 Worker
```

数据库结构定义见 `tool/schema.sql`；增量迁移脚本在 `migrations/`，通过 `wrangler d1 migrations apply` 应用。

## OpenID Connect、SAML 与 SCIM

星尘站是共享身份系统的协议提供方。OIDC 使用 Authorization Code + PKCE (`S256`) 和精确 redirect URI 匹配，并实际提供：Refresh Token 轮换与重放检测、RP-Initiated Logout、PAR、JAR/JARM、DPoP、Device Authorization、CIBA、Token Introspection、Revocation、动态客户端注册，以及 `private_key_jwt` 客户端认证。动态客户端的 PUT 更新支持公开 JWK 轮换。

SAML 2.0 入口提供 IdP 元数据、HTTP-Redirect/HTTP-POST SSO、带 XML Signature 的 assertion、Redirect binding 请求签名校验和 SLO。HTTP-POST AuthnRequest 只在对应服务提供方明确关闭“必须签名请求”时接受；需要签名请求的服务提供方应使用已登记 JWK 的 Redirect binding。SCIM 2.0 提供 Bearer 保护的 Users/Groups、过滤、分页、PATCH、ETag/If-Match、软删除和标准 discovery 端点。

运行时需要提供以下值：

- `OIDC_ISSUER`：固定 HTTPS issuer，例如 `https://stardustinfinity.top`；它可以作为非秘密部署变量。
- `OIDC_CLIENTS`：客户端 JSON 数组，包含 `client_id`、`client_name`、`redirect_uris`、`post_logout_redirect_uris`、`token_endpoint_auth_method`、`grant_types`、`response_types`、`scope`、可选 `jwks`/`require_signed_request_object`，以及 confidential client 的 `client_secret`；必须作为 Worker secret。
- `OIDC_SIGNING_JWKS`：至少一个 RS256 私钥的 JWK Set；必须作为 Worker secret。第一把密钥签发 ID Token/JARM，所有公钥通过 JWKS 端点发布，轮换时保留旧公钥直到现有令牌过期。
- `OIDC_INITIAL_ACCESS_TOKEN`：启用动态注册时使用的初始 Bearer token；必须作为 Worker secret。不配置时注册端点不会出现在 discovery 文档中。
- `SAML_ENTITY_ID`、`SAML_BASE_URL`、`SAML_SIGNING_JWK`、`SAML_SIGNING_CERT`、`SAML_SERVICE_PROVIDERS`：SAML IdP 的 entity ID、端点基址、RSA 私钥、证书和服务提供方 JSON；私钥/证书/服务提供方配置必须作为 Worker secret。
- `SAML_ALLOW_UNSIGNED_REQUESTS`：仅在已知的内部服务提供方需要接受未签名请求时设置为 `true`；生产环境默认关闭。
- `SCIM_BEARER_TOKEN`：SCIM 管理端点的专用 Bearer token；必须作为 Worker secret，不能复用 OIDC 或管理员 token。

不要把这些值写入 `wrangler.jsonc`、源码或日志。OIDC discovery 位于 `/.well-known/openid-configuration`，公开密钥位于 `/.well-known/jwks.json`，SAML 元数据位于 `/saml/metadata`，SCIM discovery 位于 `/scim/v2/ServiceProviderConfig`。

## 一些....小故事？

- 其实，这个站点域名是在2026年8月12日也就是星尘十周年时候购买的，原本的服务器还在黑龙江省绥化市肇东市部署
- 我没想到会有一群闲的慌的（划掉）真的支持我的站点，于是就这个样子了
- 所以说，我们不会把这个项目直接扔掉，永远不会。

## 目录结构

| 路径 | 说明 |
| :-- | :-- |
| `worker.js` | 后端入口：API 路由、鉴权、D1 读写、审计日志 |
| `src/worker/` | Worker 后端协议模块 |
| `src/public/` | 公开站 Vue 应用 |
| `src/admin/` | 管理后台 Vue 应用 |
| `src/shared/` | 公开站与后台共用的格式化 / 常量 / API 封装 |
| `tool/` | 本机辅助脚本（B 站信息抓取、密码哈希生成等），不参与线上构建 |
| `migrations/` | D1 数据库迁移脚本 |

## 附件上传（R2 直传）

投稿页的附件（zip / psd / mp4 …，最多 3 个，每个 ≤ **500MB**）按三级策略上传，前一级不可用时自动降级：

| 顺序 | 路径 | 说明 |
| :-- | :-- | :-- |
| 1 | **R2 直传** | Worker 只签发预签名 PUT 地址（`POST /api/upload-attachment/presign`），文件由浏览器**直接** PUT 到 `https://<account>.r2.cloudflarestorage.com`。字节不经过 Worker，因此不受 Worker 请求体（100MB）与内存（128MB）限制 |
| 2 | 分片上传 | 没配直传凭据（`presign` 返回 501）或直传失败时，>20MB 的文件按 8MB 分片经 Worker 上传（R2 multipart） |
| 3 | 单请求 | ≤20MB 的文件仍走原来的 `POST /api/upload-attachment` |

上传完成后调用 `POST /api/upload-attachment/confirm` 确认对象确实落桶，再把 `{ url, name, size }` 写进作品记录。

### 启用直传

1. Cloudflare 控制台 → **R2 → Manage R2 API Tokens → Create API token**，权限选 *Object Read & Write*，拿到 **Access Key ID** 与 **Secret Access Key**。
2. 把凭据设为 Worker secret（不要写进 `wrangler.jsonc`）：

   ```bash
   npx wrangler secret put R2_ACCESS_KEY_ID
   npx wrangler secret put R2_SECRET_ACCESS_KEY
   ```

   本地开发写进 `.dev.vars` 即可。
3. 给存储桶配 CORS（浏览器直传必须），仓库里的 `cors.json` 可直接用：

   ```bash
   npx wrangler r2 bucket cors set stardust-uploads --file cors.json
   ```

   > `cors.json` 必须是 R2 API 的 `{"rules":[…]}` 格式（不是 AWS S3 的 `CORSRules`，wrangler 会直接报错）；非交互环境加 `--force`。

`R2_ACCOUNT_ID` 与 `R2_BUCKET_NAME` 是公开变量，已写在 `wrangler.jsonc` 的 `vars` 里。没配凭据时前端自动走分片上传，功能不受影响。

### 读取附件

`/attachments/*` 由 Worker 从 R2 读取（已加入 `run_worker_first`），支持 `HEAD` 与 `Range`（视频可拖动进度），附件带 `immutable` 长缓存。

## CI/CD

GitHub Actions 在 Pull Request 上自动构建、测试，并在评论中给出预览部署链接与数据库变更提示；合并到 `main` 后自动应用 D1 迁移并部署到生产环境。

## 声明

- 本站为爱好者自发维护的非官方项目，与「星尘」官方及所属公司“北京福托科技开发有限责任公司”无隶属关系。
- 在此，感谢各位热爱我们，维护网站的各位吸尘器亦或者是开发者，在此非常感谢你们提供的贡献，每一段代码都是她的影子
