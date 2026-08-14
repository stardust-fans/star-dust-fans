# 星尘粉丝站 (star-dust-fans)

VOCALOID 中文虚拟歌姬「星尘」的非官方粉丝站，运行在 stardustinfinity.top。

## 功能

- 歌曲库：收录歌曲信息与统计数据快照，附加圈内人工评价标记（殿堂曲 / 传说曲 / 国家队 / 众神下凡 / 自定义标签）
- 同人作品展示
- 周边量贩信息
- 社群日报
- 管理后台：歌曲 / 日报 / 同人 / 量贩内容管理，多管理员账号，操作审计日志

## 技术栈

- 运行时：[Cloudflare Workers](https://developers.cloudflare.com/workers/)，单文件 `worker.js`，无框架
- 数据库：[Cloudflare D1](https://developers.cloudflare.com/d1/)
- 前端：[Vue 3](https://vuejs.org/) + [Vite](https://vitejs.dev/)（`@cloudflare/vite-plugin`），两个独立构建入口——公开站与管理后台，均使用 hash 路由
- 静态资源：Workers Static Assets
- 认证：HMAC-SHA256 签名 token + PBKDF2-HMAC-SHA256 密码哈希
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

## 目录结构

| 路径 | 说明 |
| :-- | :-- |
| `worker.js` | 唯一后端入口：API 路由、鉴权、D1 读写、审计日志 |
| `src/public/` | 公开站 Vue 应用 |
| `src/admin/` | 管理后台 Vue 应用 |
| `src/shared/` | 公开站与后台共用的格式化 / 常量 / API 封装 |
| `tool/` | 本机辅助脚本（B 站信息抓取、密码哈希生成等），不参与线上构建 |
| `migrations/` | D1 数据库迁移脚本 |

## CI/CD

GitHub Actions 在 Pull Request 上自动构建、测试，并在评论中给出预览部署链接与数据库变更提示；合并到 `main` 后自动应用 D1 迁移并部署到生产环境。

## 声明

本站为爱好者自发维护的非官方项目，与「星尘」官方及所属公司无隶属关系。
