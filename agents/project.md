# star-dust-fans 项目索引
> 最后更新：2026-09-12

## 项目目标

面向“星尘”VOCALOID 社群的非官方粉丝站，提供歌曲、日报、同人、量贩、星图、账号与投稿管理等功能，并在不破坏既有星图视觉语言的前提下加入轻量、可发现但不打扰的角色彩蛋。

## 技术栈

- Vue 3 + Vue Router + Vite 公开站与管理端
- Cloudflare Workers + D1 后端
- Vitest 与 Cloudflare Workers 测试池
- Workers Static Assets 静态资源

## 模块结构

| 路径 | 职责 |
| :-- | :-- |
| `src/public/` | 公开站页面、组件、样式与交互；`/omew` 嵌入网站专属 OMEW 实例 |
| `src/admin/` | 管理后台 |
| `src/shared/` | 前后台共享 API、常量与格式化函数 |
| `worker.js` | Worker API、D1 数据访问与 Static Assets SPA 深链接回退 |
| `test/` | 单元与 Worker 集成测试 |
| `static/` | 公开静态资源 |

## 当前任务

- [OMEW 生产 SSO 接入](037_[Feature]_OMEW生产SSO接入/)
