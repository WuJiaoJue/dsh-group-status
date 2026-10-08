<div align="center">

# workspace-folder-status — live status on collapsed folders

[中文](./README.md) | **English**

</div>

> In the DSH sidebar, **folding a workspace group hides every session status inside it** (running, approvals, …). This plugin gives the collapsed folder row its own aggregated status: **yellow = pending approval, spinner = running, green = completed-unread**, with a count and hover details. Expanded groups are untouched — child rows carry their own statuses.

---

## Usage

Fold any group that has live sessions; an aggregated badge appears after the folder name:

| Badge | Meaning |
|---|---|
| 🟡 + count | Pending approvals / plan reviews / questions inside (warning color, same as rows) |
| 🌀 + count | Running sessions inside, incl. running subagents (StateDot ongoing spinner) |
| 🟢 + count | Only completed-unread inside (`done` success color) |
| (none) | Everything idle — identical to stock behavior |

Priority matches the row language: **pending > running > done**. Hovering the folder appends the same detail lines under path/creation time, e.g. `1 Approval · 2 Running`.

> Real screenshots TBD (to be added after on-page verification). The badge reuses DSH's native `StateDot`, so colors always match the rows.

---

## Features

- **Visible when folded**: the aggregate only shows while collapsed; expanded groups defer to per-row statuses.
- **Zero config**: no settings, works out of the box; same source of truth as row statuses (`pending > running > done`, blanks/archives skipped).
- **Accessible**: the badge carries `role="img"` plus a localized `aria-label`.
- **No stock files touched**: all customization lives in this fork; the profile patch is two lines.

---

## Why option A

Option B (keep live rows visible under a folded group) was also prototyped. A won:

| | A (aggregate badge, current) | B (keep live rows) |
|---|---|---|
| Meaning of "folded" | Unchanged — fully hidden | Changed — leaks rows |
| Sidebar length | Unchanged | Grows with live groups |
| Information | Counts + hover details | Full rows |
| Implementation | Badge on the folder row | Derivation-logic change |

A has the smallest impact on existing habits: it only annotates the previously opaque folder.

---

## Quick start

### Install into DSH

This package is a fork override: it registers the same slots as the stock `dsh-client-ui-workspace` and disables the stock row.

```sh
dsh plugin --profile web add "file:/home/wujue/workspace/dsh-plugins/workspace-folder-status"
# Takes effect after restarting dsh web (the whole sidebar package is swapped)
```

Verify: fold a group with running/pending sessions → badge appears after the folder name → hover for details.

### Roll back

```sh
dsh plugin --profile web remove "@local/workspace-folder-status"
# Both patch lines are withdrawn together; the stock row comes back. Restart to apply.
```

---

## Maintainer notes

- **Fork base**: `@deepseek-ai/dsh-client-ui-workspace 0.2.0-rc.2`, full copy, 3 marked changes in `lib/client.js` (`workspace-folder-status fork`):
  1. `summarizeGroupStatus()` + `deriveGroups()`: aggregate over all members even when collapsed;
  2. `groupLiveBadge()` / `groupLiveLabel()`: badge on folded folder rows;
  3. `WorkspaceHoverContent`: detail lines for folded groups.
- **Rebasing on upgrades**: diff stock old vs new → re-apply the 3 changes → commit (note the base version) → reinstall + restart. Tag with the base, e.g. `v0.2.0-rc.2-fork1`.
- **Known limitation**: aggregation shares the expanded derivation, so huge groups (hundreds of sessions) cost one extra full traverse per status change — same order as expanded rendering, acceptable.

## License

MIT (inherited from upstream).
