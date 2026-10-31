# 贡献者别名合并

## 实现
- [x] `tool/fetch_contributors.mjs`：别名表支持把多个 GitHub 账号归到同一登录名；lsy-404 与 wuyilingwei 都显示为「暝行镌无」并链接 @lsy-404，合并后提交数相加参与排序。
- [x] 更新 `test/contributors.test.js` 中旧别名（武乙凌薇）的预期为新契约，不新增用例。
- [x] 运行 `node tool/fetch_contributors.mjs` 重新生成 `src/shared/contributors.json`。

## 验证
- [x] 运行贡献者测试。

## 交付
- [x] 在独立分支提交，由主流程合并。
