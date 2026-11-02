# star-dust-fans 任务追踪
> 准则版本: v0.3.0

## 任务列表

| 编号 | 任务名称 | 任务描述 | 变更动机 | 状态 |
| :--: | :------: | :------: | :------: | :--: |
| 031 | [Feature] 用户页与角色彩蛋优化 | 完善 `/user` 与 `/aspirateur`，加入神秘星尘小恐龙和星尘引导娘，并完成测试与实际页面验收 | 汇总接龙中的三个粉丝站优化需求，补齐现有实现缺陷 | completed |
| 032 | [Feature] 星尘引导娘 | 将静态投稿规则改造成角色化双路线引导、可完成进度与无障碍键盘导航 | 让同人作者和量贩商更快找到对应规则与投稿入口 | completed |
| 033 | [BugFix] 修复量贩发车状态显示 | 统一量贩审核、公开列表、详情页和用户中心的 waiting/shipped 状态语义 | 量贩审核通过后会从公开列表消失，列表可见条目又无法打开详情 | completed |
| 034 | [Feature] 嵌入 OMEW 自部署入口 | 更新站点代码，在公开站新增 OMEW 子页面并嵌入 Overture 自部署向导（已废弃） | 初始需求的临时方案，后续被网站专属实例要求取代 | cancelled |
| 035 | [Feature] 网站专属 OMEW 实例与共享用户设置 | 原方案通过 OMEW 专用短时 token 和 iframe 消息桥接星尘用户身份（已废弃） | Rosmontis 改为要求身份桥接位于星尘站并使用通用 SSO，专用协议不再适用 | cancelled |
| 036 | [Feature] 标准OIDC身份提供方 | 将星尘站现有 OMEW 专用 token 桥接替换为标准 OIDC Provider，供 OMEW、EdgeSonic 与后续网站共用 | 身份桥接应由星尘站拥有，消费端不应保留星尘专用协议 | completed |
| 037 | [Feature] OMEW 生产 SSO 接入 | 配置主站 OIDC issuer，并让主站 OMEW 入口通过标准授权流程自动登录专属实例 | 完成已实现协议的生产配置与真实入口闭环 | completed |
| 038 | [Fix] 论坛自动登录与身份迁移 | 让论坛沿用星尘站会话自动登录，禁用论坛登出，并将既有 `sso-` 用户名迁移为站点用户名 | 论坛身份必须与主站保持同一登录生命周期和可读用户名 | completed |
| 039 | [Fix] 统一 SSO 用户名规则 | 新账号统一 ASCII 规则；旧账号保留原名至下次登录，由用户确认候选并改名 | 避免主站接受的用户名在 OMEW 首次 SSO 登录时不可用 | completed |
| 040 | [Feature] OAuth 昵称字段 | 通过 OIDC discovery、ID Token、UserInfo 提供标准 nickname | 让站内昵称在 OAuth SSO 中可供消费端使用 | running |
| 041 | [Feature] 歌曲分页搜索与可选标签 | 前后台歌曲列表按页加载并搜索，明确标签可选并验证无标签保存 | 歌曲库需要分页和搜索，投稿及管理标签不应成为必选项 | completed |
| 042 | [Feature] LRC歌词页改版 | 歌词页重做：封面瀑布流、搜索与歌姬筛选、按发行日期排序，默认选中星尘；卡片默认显示可用购买与价格，完整信息与单曲下载收进展开；封面随构建自托管，LRC 地址迁到 lrc.leisiyu.dev（第一、二轮已随 stardust-fans/star-dust-fans#105 合并；详情弹窗待发布） | Rosmontis 要求按最新排布重新设计 LRC 界面并默认选中星尘 | running |
| 043 | [Feature] 贡献者别名合并 | 贡献者名单将 lsy-404 与 wuyilingwei 合并为一行，署名「暝行镌无」，链接 @lsy-404 | Rosmontis 要求两个账号统一署名 | completed |
| 044 | [Refactor] 管理员Env存储 | 管理员账号、角色和权限采用可写 Workers Secret（草稿 PR 已交付，生产配置待就绪） | 复用 EdgeSonic env 存储模式 | completed |
| 045 | [Feature] 多权限组读写授权 | 支持多个权限组和模块 read/write，统一 UI 与后端授权 | 用户要求可组合权限且隐藏无权入口 | running |
