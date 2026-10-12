<div align="center">

<img src="icon.svg" width="72" alt="dsh-group-status"/>

# dsh-group-status — live status on collapsed folders

[中文](./README.md) | **English**

[![version](https://img.shields.io/badge/version-0.2.0--rc.2--fork1-0EA5E9)](https://github.com/WuJiaoJue/dsh-group-status)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![DSH](https://img.shields.io/badge/DeepSeek%20Harness-0.2.0--rc.2-4D6BFE)](https://github.com/deepseek-ai/deepseek-harness)

</div>

> In the DSH sidebar, **folding a workspace group takes every session status inside down with it** — running, approvals, reviews, all gone. This plugin gives the collapsed folder row its own aggregated badge: **yellow = pending approval, spinner = running, green = completed**, plus clock and review icons fed by other plugins, with a count and hover details. Expanded groups are untouched — child rows carry their own statuses.

---

## Preview

**Collapsed folder rows carry the aggregate badge** — `dsh-group-status` has one running session (spinner); `dsh-gitea-dispatch` has one waiting-for-answer plus one running (yellow dot + icon + count `2`):

<p align="center">
<img src="docs/media/screenshot-folders.png" width="272" alt="Two collapsed sidebar groups: dsh-group-status showing a spinner, dsh-gitea-dispatch showing a yellow dot, a review icon and the count 2"/>
</p>

**Hover for details** — the hover card appends aggregated detail lines under the path and creation time:

<p align="center">
<img src="docs/media/screenshot-hover.png" width="300" alt="Hover card: 1 Waiting for answer · 1 Running"/>
</p>

> The badge reuses DSH's native `StateDot`, so colors stay identical to the session rows. Both images are real screenshots.

---

## How to use

Fold any group that has live sessions; a badge appears after the folder name:

| Glyph | Meaning | Color |
|---|---|---|
| Yellow dot | Pending approval / plan review / answer inside | warning (same as rows) |
| Spinner | Running sessions inside, incl. running subagents | ongoing (`StateDot` animation) |
| Clock | Scheduled tasks inside (data from dsh-later) | purple · orange (≤5 min) · red (overdue) |
| List-pen | Sessions waiting for a PR review (data from dsh-gitea-dispatch) | amber · red (overdue) |

Rules:

- **Completed never reaches the badge**: `done` (completed-unread) is the child row's business — a folded row only hints at "needs you" and "running", so a group with nothing but completed sessions shows no badge at all. (Decision from `6db1fd3`: completed belongs to the session row, not the folder hint.)
- **The count** = approvals + running + sessions with scheduled tasks + sessions waiting for review (**completed excluded**). Whenever a badge renders it carries the count, including a single-session `1`.
- **Hover details**: the folder row's hover card appends lines in the order `approval · plan review · answer · running · subagents · waiting review · scheduled tasks · completed`, e.g. `1 Waiting for answer · 1 Running`.
- **Expanding defers to the rows**: the aggregate badge only renders while collapsed; expanded groups keep their per-row statuses with no duplication.
- **Accessible**: the badge is `role="img"` with a localized `aria-label` (e.g. `1 Waiting for answer · 1 Running`) and the same text as its `title`.

---

## Feature overview

- **Visible when folded**: the aggregate only exists while collapsed; an expanded sidebar is pixel-identical to stock.
- **Same source of truth as rows**: priority, colors and wording all reuse the row derivation and `StateDot`; blank and archived sessions are skipped.
- **Cross-plugin aggregation** (optional): scheduled tasks from dsh-later, waiting PR reviews from dsh-gitea-dispatch — works fine with neither installed.
- **Zero config**: no settings, works out of the box.
- **No stock files touched**: not a single file of the published `dsh-client-ui-workspace` is modified; all changes live in this repo's source, and the profile patch is two lines (add this package, disable the stock row).
- **Localized**: follows the DSH UI language (中文 / English) by reusing the stock locale keys; only `status.waitingReview` and `status.scheduled` are new.

---

## Cross-plugin status (optional)

### Consumer: how this plugin reads others

When sessions inside a group have scheduled tasks or wait on a PR review, the badge gains one icon each. This plugin does **not** poll anything itself — it asks the publishing plugin for a summary:

| Publisher | Provides | Consumer entry point |
|---|---|---|
| [dsh-later](https://github.com/WuJiaoJue/dsh-later) | `useScheduleSummary()`: session id → `{ count, pausedCount, nextAt, state }` | `require('dsh-later/client')` |
| dsh-gitea-dispatch | `useWaitingSummary()`: session id → `{ prNumber, state }` | `require('dsh-gitea-dispatch/client')` |

- When either plugin is **absent or disabled, the integration degrades silently**: no icon, everything else keeps working, no errors and no idle polling.
- This repo declares both external modules in `package.json` under `dsh.client.external`.

### Publisher: exposing your own summary

A plugin that wants to publish its state for others copies the skeleton in [`src/client/cross-plugin-summary.ts`](src/client/cross-plugin-summary.ts): `createSummaryStore` (a subscribable store) + `createSummaryRegistry` (heals late-registered stores) + `summarizeGroup` / `mapEquals` / `entryFor` / `normalizeSessionId` (folding and id normalization).

> ⚠️ **Copy it, do not import it.** Cross-plugin value imports do not resolve in this project — measured, the error is `Could not resolve "dsh-group-status"`: other plugins do not depend on this package, a client bundle is a self-contained closure factory, and the bundle-purity gate only rejects the `@deepseek-ai/*` prefix, so a cross-plugin import does not even get its dedicated diagnostic.

The working shape is: copy the template into the provider → the provider calls `registry.setStore(store)` and re-exports `registry.useSummary` from its client entry → the consumer then uses it through `require('<provider>/client')`. Every improvement to the template is locked by `tests/cross-plugin-summary.node.test.mjs`.

---

## Quick start

### Install into DSH

This package is a **fork override**: it registers the same slots as the stock `dsh-client-ui-workspace` and disables the stock row (patch in `cordis.patch.yml`). Build artifacts are committed, so installing from GitHub needs no local build:

```bash
dsh plugin --profile web add "github:WuJiaoJue/dsh-group-status"
# Takes effect after restarting dsh web (the whole sidebar package is swapped)
```

For local development, link a checkout and rebuild as you edit `src/`:

```bash
git clone https://github.com/WuJiaoJue/dsh-group-status.git
cd dsh-group-status
pnpm install && pnpm build

dsh plugin --profile web add "link:$PWD"
# restart dsh web
```

> Dev tip: `pnpm watch` rebuilds on every `src/` change — but the sidebar is swapped as a whole, so **a dsh web restart is still required**.

### Verify

1. Fold a group with running / pending sessions → a badge appears after the folder name;
2. Hover the folder row → the detail lines appear (matching the badge's wording);
3. Expand the group → the badge disappears and child rows show their own statuses;
4. No errors in the browser console.

### Roll back

```bash
dsh plugin --profile web remove dsh-group-status
# Both patch lines are withdrawn together; the stock row comes back. Restart to apply.
```

---

## Compatibility

| Item | Value |
|---|---|
| DSH core | `0.2.0-rc.2` |
| peer dependency | `@deepseek-ai/cordis ~4.0.4` |
| Upstream base | `@deepseek-ai/dsh-client-ui-workspace 0.2.0-rc.2` (source vendored into `src/`) |
| Install shape | fork override: same slots registered, stock row disabled via `cordis.patch.yml` |
| Optional partners | dsh-later (schedule summary), dsh-gitea-dispatch (waiting-review summary) |

Every upstream generation requires a manual rebase — see the [upgrade runbook](./docs/upgrading.md). If upstream renames a slot, changes a component signature or the context contract, this package will not follow on its own.

---

## Development

```sh
pnpm install
pnpm build        # tsc typecheck + tsdown bundle → lib/
pnpm watch        # rebuild on src/ changes (a dsh web restart is still required)
pnpm test         # = test:node (node --test, 12 cases) + test:spec (vitest + jsdom, 96 cases)
pnpm test:spec    # the upstream spec suite only
```

`tests/` is a copy of the upstream suite plus this repository's own [tests/group-status.client.spec.ts](tests/group-status.client.spec.ts), which covers the fold aggregation itself (counts, priority, cross-plugin sources, blank/archived skipping).

Seven further upstream specs only run inside the DSH monorepo: they either need `dsh-client-test-runtime`'s deep imports of **unpublished sources**, or take runtime values out of a published `…/client` bundle whose closure expects the host app to preload its whole dependency set. They are explicitly skipped at the top of [vitest.config.ts](vitest.config.ts) with the reason spelled out per group — **do not light them up with stubs**; that would only test the stub.

---

## Known limitations

- **Upstream bumps need a manual rebase**: the upstream source is vendored (`src/`, `tests/`) and this is not a stable public API; slot names, component signatures and context contracts may shift under it. Steps are in the [upgrade runbook](./docs/upgrading.md).
- **One extra full traversal while collapsed**: aggregation shares the expanded derivation, so huge groups (hundreds of sessions) cost one extra traverse per status change — same order as expanded rendering, acceptable.
- **It produces no status itself**: the cross-plugin icons depend entirely on the summary APIs published by dsh-later / dsh-gitea-dispatch. Without them you simply lose those two icons.
- **The count is coarser than the details**: scheduled tasks are counted per *session*, not per task; the exact task count lives in dsh-later's own UI.
- **Collapsed sidebar only**: this plugin only adds an aggregate display — it does not touch the session state machine or the per-row badge predicates.

---

## Technical documentation

Developer and maintainer material, kept out of this README:

- [Upstream upgrade runbook](./docs/upgrading.md) — where the baseline came from, what changed locally, how to rebase and verify on the next upstream release
- [Cross-plugin summary template](./src/client/cross-plugin-summary.ts) — the provider-side skeleton itself; its header is the design note and carries the measured "copy, do not import" evidence

## License

MIT (inherited from the upstream `@deepseek-ai/dsh-client-ui-workspace`).

---

<div align="center">

<img src="icon.svg" width="48" alt="dsh-group-status"/>

</div>
