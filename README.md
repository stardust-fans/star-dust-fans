# 星尘粉丝站 (star-dust-fans)

VOCALOID 中文虚拟歌姬「星尘」的非官方粉丝站，运行在 stardustinfinity.top。
- [![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
- 网站链接：https://stardustinfinity.top/
## 功能

- 歌曲库：收录歌曲信息与统计数据快照，附加圈内人工评价标记（殿堂曲 / 传说曲 / 国家队 / 众神下凡 / 自定义标签）
- 同人作品展示
- 周边量贩信息
- 社群日报
- 管理后台：歌曲 / 日报 / 同人 / 量贩内容管理，多管理员账号，操作审计日志

## 技术栈

- 运行时：[Cloudflare Workers](https://developers.cloudflare.com/workers/)，ES modules，无后端框架
- 数据库：[Cloudflare D1](https://developers.cloudflare.com/d1/)
- 前端：[Vue 3](https://vuejs.org/) + [Vite](https://vitejs.dev/)（`@cloudflare/vite-plugin`），两个独立构建入口——公开站与管理后台，均使用 hash 路由
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

## OpenID Connect

星尘站可作为标准 OIDC 身份提供方。客户端必须使用 Authorization Code + PKCE (`S256`)；redirect URI 采用精确匹配。

当前阶段只允许预注册的第一方客户端，不开放动态客户端注册，也不把无授权确认界面的配置用于第三方应用。

运行时需要提供以下值：

- `OIDC_ISSUER`：固定 HTTPS issuer，例如 `https://stardustinfinity.top`；它可以作为非秘密部署变量。
- `OIDC_CLIENTS`：客户端 JSON 数组，包含 `client_id`、`client_name`、`redirect_uris`、`token_endpoint_auth_method`，以及使用 confidential client 时的 `client_secret`；必须作为 Worker secret。
- `OIDC_SIGNING_JWKS`：包含至少一个 RS256 私钥的 JWK Set；必须作为 Worker secret。第一把密钥用于签名，所有公钥通过 JWKS 端点发布。

不要把这些值写入 `wrangler.jsonc`、源码或日志。发现文档位于 `/.well-known/openid-configuration`，公开密钥位于 `/.well-known/jwks.json`。

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

## CI/CD

GitHub Actions 在 Pull Request 上自动构建、测试，并在评论中给出预览部署链接与数据库变更提示；合并到 `main` 后自动应用 D1 迁移并部署到生产环境。

## 声明

- 本站为爱好者自发维护的非官方项目，与「星尘」官方及所属公司“北京福托科技开发有限责任公司”无隶属关系。
- 在此，感谢各位热爱我们，维护网站的各位吸尘器亦或者是开发者，在此非常感谢你们提供的贡献，每一段代码都是她的影子
