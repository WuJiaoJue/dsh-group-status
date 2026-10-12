# 更新日志

本文件记录面向使用者的重要变更。细粒度提交历史见 git log。

## 未发布

## 0.2.0-rc.2-fork1

- **feat** 折叠分组聚合徽标：收起的文件夹行显示进行中（转圈）、待审批（黄点）、已完成（绿点）的聚合状态，带数字与悬停明细。
- **feat** 跨插件聚合（可选）：接入 dsh-later 定时任务（时钟图标）与 dsh-gitea-dispatch 等待评审（列表笔图标），未安装时静默降级。
- **feat** 设置项 `showCompletedInBadge`：可关闭折叠徽标上的「已完成」绿点，默认开启。
- **feat** 无障碍：徽标带 `role="img"` + 本地化 `aria-label`，悬停 `title` 同文案。
- **refactor** 拆分 `badge-settings` / `group-status` 模块，新增 `GroupBadge` 组件。
- **refactor** 上游 `tree.ts` / `Rows.tsx` 代码下沉，侧栏展开态与官方版本逐像素一致。
- **docs** 中英双语 README + 上游升级手册 + 跨插件摘要模板说明。
- **test** 上游 spec 本地可跑（vitest + jsdom），新增折叠聚合用例（计数、待处理类互斥、子智能体、空白/归档跳过、跨插件来源）。
