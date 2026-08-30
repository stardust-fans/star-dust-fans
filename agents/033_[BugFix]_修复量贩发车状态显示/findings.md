# 调研记录

- [审核后消失] -> 检查 `/api/admin/pending/:type/:id` -> fanart 与 shop 都被统一更新为 `published`，但公开 `/api/shop` 只查询 `waiting`/`shipped`，导致通过审核的量贩不显示。
- [详情 404] -> 检查 `/api/shop/:id` -> 详情只查询 `published`，与公开列表允许的 `waiting`/`shipped` 完全相反。
- [正确状态机] -> 对照后台量贩表单和卡片 -> 现有产品语义已明确采用 `pending → waiting → shipped`，不需要新增兼容状态。
- [后台新增同样不可用] -> 检查 `/api/admin/shop` POST -> SQL 声明 10 个占位符却只绑定 7 个参数，同时 bilibili/闲鱼列顺序与绑定顺序相反；收敛为表单实际提交的 7 列并对齐顺序。
- [浏览器复验] -> 本地登录后检查用户中心、公开量贩列表和详情 -> `waiting` 均显示“等待发车”，列表条目可正常进入 `/shop/:id`，不再 404。
