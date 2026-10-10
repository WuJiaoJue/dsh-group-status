<div align="center">

# dsh-group-status — 收起的分组也看得见活

**中文** | [English](./README.en.md)

</div>

> DSH 侧栏里，**分组一收起，里面会话的状态（进行中、待审批……）就全看不见了**。这个插件让收起的文件夹行自己长出聚合状态：**黄点待审批、转圈进行中、绿点已完成**，带数字，悬停看明细——展开后保持原样，子行自带状态，不重复。

---

## 使用方法

把任意有活会话的分组收起来，文件夹名后面会出现聚合徽标：

| 徽标 | 含义 |
|---|---|
| 黄点 + 数字 | 组内有待审批 / 计划待审 / 待回答（warning 色，和行内一致） |
| 转圈 + 数字 | 组内有进行中（含运行中的子智能体，StateDot ongoing 转圈动画） |
| 绿点 + 数字 | 组内只有已完成未读时显示（`done` 成功色） |
| （无） | 组内全空闲时徽标消失，和原来一模一样 |

优先级和行内保持一致：**待审批 > 进行中 > 已完成**。鼠标悬停在文件夹行上，hover 卡在原路径、创建时间下面追加同样的明细行，例如 `1 待审批 · 2 进行中`。

> 真机截图待补（已在页面验证通过后贴）。徽标用的就是 DSH 原生的 `StateDot`，颜色和行内完全一致，不会走样。

---

## 特性一览

- **收起可见**：聚合状态只在分组收起时出现；展开后子行自带状态，徽标自动让位。
- **零配置**：没有设置项，装上即用；行为与行内状态同源（`pending > running > done`，跳过空白与已归档）。
- **无障碍**：徽标带 `role="img"` + 中文 `aria-label`（如 `1 等待审批 · 2 进行中`），读屏可用。
- **本体零改动**：官方包文件不动；定制全部在这一个 fork 包里，profile 补丁只有两行。

---

## 快速开始

### 安装到 DSH

本包是一个 fork 覆盖包：注册与官方 `dsh-client-ui-workspace` 相同的槽位，并把官方行 disable。安装：

```sh
dsh plugin --profile web add "link:/home/wujue/workspace/dsh-plugins/dsh-group-status"
# 重启 dsh web 后生效（侧栏整包替换，需重新生成浏览器模块）
```

验证：找一个有进行中/待审批会话的分组 → 收起 → 文件夹名后出现徽标 → 悬停看明细。

### 回滚

```sh
dsh plugin --profile web remove "dsh-group-status"
# 补丁两条一起撤，官方行自动回来，重启生效
```

---

## 技术文档（给维护者）

- **Fork 基线**：`@deepseek-ai/dsh-client-ui-workspace 0.2.0-rc.2`，全包复制，仅 3 处改动（`lib/client.js` 内以 `dsh-group-status fork` 标记）：
  1. `summarizeGroupStatus()` + `deriveGroups()`：收起时也对全量成员算聚合计数；
  2. `groupLiveBadge()` / `groupLiveLabel()`：`ProjectRowItem` 在收起且有活时画徽标；
  3. `WorkspaceHoverContent`：收起时追加状态明细行。
- **升级 rebase**：diff 官方新旧版 → 把 3 处合过去 → commit（信息里写清基线版本）→ 重装重启。建议 tag 带基线，如 `v0.2.0-rc.2-fork1`。

### 升级检查清单

当上游 `@deepseek-ai/dsh-client-ui-workspace` 发布新版本时：

1. **Diff 官方新旧版**：
   ```sh
   diff -u node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js lib/client.js
   ```

2. **合并 3 处改动**（搜索 `[dsh-group-status fork]` 标记）：
   - `summarizeGroupStatus()` + `deriveGroups()`（约 line 469）
   - `groupLiveBadge()` / `groupLiveLabel()`（约 line 1291, 1305）
   - `WorkspaceHoverContent` 的 `status` prop（约 line 1446）

3. **验证 slot 名称**：检查以下 slot 是否改名：
   - `sidebar.workspaces`
   - `sidebar.workspaces.session.menu.item`
   - `sidebar.workspaces.session.row.action`
   - `shell.overlay`
   - `conversation.hero.workspace`

4. **验证组件签名**：检查以下组件的 props 是否变化：
   - `ProjectRowItem`（group, containsCurrentDescendant, onToggle, onCreate, actions, drag, home, newShortcut, t）
   - `WorkspaceHoverContent`（label, cwd, createdAt, status, t）

5. **重装重启**：
   ```sh
   dsh plugin --profile web remove dsh-group-status
   dsh plugin --profile web add "link:/home/wujue/workspace/dsh-plugins/dsh-group-status"
   # 重启 dsh web
   ```

6. **验证功能**：
   - 找一个有进行中/待审批会话的分组 → 收起 → 徽标出现
   - 悬停看明细
   - 展开后徽标消失（子行自带状态）
   - 检查浏览器 console 无报错

- **已知限制**：聚合计数与展开态共用同一份派生，超大分组（数百会话）每次状态变更多一次全量 traverse，和展开渲染同量级，可接受。

## 许可

MIT（沿用上游）。
