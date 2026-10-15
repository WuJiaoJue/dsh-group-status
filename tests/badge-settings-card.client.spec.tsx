// @vitest-environment jsdom
/**
 * 插件详情页配置卡片的契约。
 *
 * 分两层：
 *  1. `ALL_BADGE_FIELDS` / `isDraftEnabled` —— 卡片自己的纯逻辑（字段的文本 ↔ 值转换），
 *     用**真**实现测：非法草稿必须被 `parse` 判掉（否则模型会把畸形值写下去），缺失值必须
 *     读成默认「显示」。
 *  2. `BadgeSettingsCard` —— 卡片的接线：它把官方 `SettingsForm` / `SettingsFormModel` /
 *     `Switch` 拼起来，本 spec 用**契约等价**的桩替换它们（那个包的 bundle 依赖宿主应用
 *     预载的整棵依赖闭包，独立仓库跑不起来——见 `vitest.config.ts` 头部），断言"哪件东西
 *     拿到了什么 props / 点了之后调了谁"。官方组件内部的草稿状态机属于 DSH 的职责，由实机
 *     核验，不在这里复刻。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { zh } from '../src/client/locales.ts'
import { ALL_BADGE_FIELDS, isDraftEnabled, showCompletedField } from '../src/client/badge-field.ts'
import { BadgeSettingsCard } from '../src/client/BadgeSettingsCard.tsx'

/** 文案取值器：直接用中文词典，断言里就不必抄一份字符串。 */
const t = (key: keyof typeof zh): string => zh[key]

/** 桩实例登记处（`vi.hoisted` 保证 mock 工厂运行时它已存在）。 */
const stub = vi.hoisted(() => ({
  models: [] as {
    scope: unknown
    specs: readonly unknown[]
    edits: [string, string][]
    saves: number
    discards: number
    disposed: number
    shell: Record<string, unknown>
    field: Record<string, unknown>
    push(shell?: Record<string, unknown>, field?: Record<string, unknown>): void
  }[],
}))

/**
 * 桩掉官方组件包。`SettingsForm` / `Switch` 按公开契约复刻（不可用只出一行、只读提示、
 * 失败行、保存禁用规则、`button[role=switch]`）；`SettingsFormModel` 退化成记录器——
 * 只记下"卡片把哪些字段/动作接了上去"，状态机本身不在这里。
 */
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement } = await import('react')

  /**
   * 官方 `SettingsFormModel` 的记录器替身：公开面（`shell()` / `field(name)` /
   * `actions()` / `bind()` / `dispose()`）与官方一致，状态由测试用 `push()` 直接摆。
   */
  class FakeSettingsFormModel {
    scope: unknown
    specs: readonly unknown[]
    edits: [string, string][] = []
    saves = 0
    discards = 0
    disposed = 0
    shellState: Record<string, unknown> = {
      available: true, writable: true, dirty: false, invalid: false, saving: false, failed: false,
    }
    fieldState: Record<string, unknown> = { text: 'true', overridden: false, invalid: false }
    private readonly stores: { refresh: () => void }[] = []

    constructor(scope: unknown, specs: readonly unknown[]) {
      this.scope = scope
      this.specs = specs
      stub.models.push(this)
    }

    bind(project: () => unknown): { getSnapshot: () => unknown, subscribe: (fn: () => void) => () => void } {
      let snapshot = project()
      const listeners = new Set<() => void>()
      const store = {
        refresh: () => {
          snapshot = project()
          for (const listener of [...listeners]) listener()
        },
      }
      this.stores.push(store)
      return {
        getSnapshot: () => snapshot,
        subscribe: (listener: () => void) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
      }
    }

    shell(): Record<string, unknown> { return this.shellState }

    field(_name: string): Record<string, unknown> { return this.fieldState }

    actions(): { edit: (field: string, text: string) => void, resetField: () => void, save: () => void, discard: () => void } {
      return {
        edit: (field: string, text: string) => { this.edits.push([field, text]) },
        resetField: () => undefined,
        save: () => { this.saves += 1 },
        discard: () => { this.discards += 1 },
      }
    }

    dispose(): void { this.disposed += 1 }

    /** 桩的状态机入口：改状态后通知已绑定的 store，模拟官方模型的 publish。 */
    push(shell: Record<string, unknown> = {}, field: Record<string, unknown> = {}): void {
      Object.assign(this.shellState, shell)
      Object.assign(this.fieldState, field)
      for (const store of this.stores) store.refresh()
    }
  }

  interface ShellLike {
    available: boolean
    writable: boolean
    dirty: boolean
    invalid: boolean
    saving: boolean
    failed: boolean
  }

  return {
    SettingsFormModel: FakeSettingsFormModel,
    Switch: ({ checked, onChange, label, disabled }: {
      checked: boolean
      onChange: (next: boolean) => void
      label: string
      disabled?: boolean | undefined
    }) => createElement('button', {
      type: 'button',
      role: 'switch',
      'aria-checked': checked,
      'aria-label': label,
      disabled: disabled === true,
      onClick: () => { onChange(!checked) },
    }),
    SettingsForm: ({ labels, state, onSave, children }: {
      labels: Record<string, string>
      state: ShellLike
      onSave: () => void
      children: ReactNode
    }) => (state.available
      ? createElement('div', null,
        state.writable ? null : createElement('p', { role: 'status' }, labels.readOnly),
        children,
        createElement('div', null,
          state.failed ? createElement('p', { role: 'status' }, labels.saveFailed) : null,
          createElement('button', {
            type: 'button',
            disabled: !state.dirty || state.invalid || state.saving,
            onClick: onSave,
          }, state.saving ? labels.saving : labels.save)))
      : createElement('p', { role: 'status' }, labels.unavailable)),
  }
})

/** 官方 `SettingsFormScope` 的最小假体：卡片只把它交给模型，本 spec 只关心写入没发生。 */
function createScope() {
  return {
    getSnapshot: () => ({ status: 'ready' as const, value: {}, base: {}, user: {}, writable: true, revision: 1 }),
    subscribe: () => () => undefined,
    mutate: vi.fn(async () => true),
  }
}

const scope = createScope()
const saveButton = (): HTMLElement => screen.getByRole('button', { name: zh['settings.save'] })
const toggle = (): HTMLElement => screen.getByRole('switch', { name: zh['settings.badge.showCompleted'] })
const model = () => stub.models[stub.models.length - 1]!

afterEach(() => {
  cleanup()
  stub.models.length = 0
})

describe('showCompletedField', () => {
  it('formats only an explicit false as the off draft', () => {
    expect(showCompletedField.field).toBe('showCompletedInBadge')
    expect(showCompletedField.format(false)).toBe('false')
    expect(showCompletedField.format(true)).toBe('true')
    // 缺失 / 非法存储值一律读成默认「显示」——与 schema 默认同源。
    expect(showCompletedField.format(undefined)).toBe('true')
    expect(showCompletedField.format(null)).toBe('true')
    expect(showCompletedField.format('no')).toBe('true')
  })

  it('parses the two boolean literals and rejects every other draft', () => {
    expect(showCompletedField.parse('true')).toEqual({ kind: 'set', value: true })
    expect(showCompletedField.parse('false')).toEqual({ kind: 'set', value: false })
    // 非法草稿必须被拒（模型据此把字段标为 invalid 并挡住保存）。
    expect(showCompletedField.parse('')).toBeUndefined()
    expect(showCompletedField.parse('yes')).toBeUndefined()
    expect(showCompletedField.parse('1')).toBeUndefined()
  })

  it('reads the draft text without confusing it with the stored value', () => {
    expect(isDraftEnabled('true')).toBe(true)
    expect(isDraftEnabled('false')).toBe(false)
    // 非 'false' 的文本按「开」渲染；这类草稿会被 parse 挡在保存之外。
    expect(isDraftEnabled('')).toBe(true)
  })
})

describe('BadgeSettingsCard', () => {
  it('renders the official frame around the badge field', () => {
    render(<BadgeSettingsCard scope={scope} t={t} />)

    expect(screen.getByRole('heading', { level: 3, name: zh['settings.badge.section'] })).toBeTruthy()
    expect(screen.getByText(zh['settings.badge.showCompleted'])).toBeTruthy()
    expect(screen.getByText(zh['settings.badge.showCompletedHint'])).toBeTruthy()
    expect(saveButton()).toHaveProperty('disabled', true)
  })

  it('hands the field specs and the host scope to the official model', () => {
    render(<BadgeSettingsCard scope={scope} t={t} />)

    expect(model().scope).toBe(scope)
    expect(model().specs).toEqual(ALL_BADGE_FIELDS)
  })

  it('stages a boolean draft through the model instead of writing', () => {
    render(<BadgeSettingsCard scope={scope} t={t} />)

    fireEvent.click(toggle())
    expect(model().edits).toEqual([['showCompletedInBadge', 'false']])
    expect(scope.mutate).not.toHaveBeenCalled()
  })

  it('writes only from the frame save control', () => {
    render(<BadgeSettingsCard scope={scope} t={t} />)

    // 没有草稿时保存不可点；有草稿才放行，并交给模型的 save。
    act(() => { model().push({ dirty: true }) })
    fireEvent.click(saveButton())
    expect(model().saves).toBe(1)
  })

  it('reflects the draft text in the switch', () => {
    render(<BadgeSettingsCard scope={scope} t={t} />)

    expect(toggle().getAttribute('aria-checked')).toBe('true')
    act(() => { model().push({}, { text: 'false' }) })
    expect(toggle().getAttribute('aria-checked')).toBe('false')
  })

  it('disables the switch on a read-only deployment and shows the notice', () => {
    render(<BadgeSettingsCard scope={scope} t={t} />)

    act(() => { model().push({ writable: false, dirty: true }) })
    expect(toggle()).toHaveProperty('disabled', true)
    expect(screen.getByText(zh['settings.readOnly'])).toBeTruthy()
  })

  it('blocks the save while the draft is invalid and reports a failed save', () => {
    render(<BadgeSettingsCard scope={scope} t={t} />)

    act(() => { model().push({ dirty: true, invalid: true }) })
    expect(saveButton()).toHaveProperty('disabled', true)

    act(() => { model().push({ invalid: false, failed: true }) })
    expect(screen.getByText(zh['settings.saveFailed'])).toBeTruthy()
  })

  it('says so instead of rendering the field while the namespace is not served', () => {
    render(<BadgeSettingsCard scope={scope} t={t} />)

    act(() => { model().push({ available: false }) })
    expect(screen.getByText(zh['settings.unavailable'])).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('disposes the model with the card', () => {
    const { unmount } = render(<BadgeSettingsCard scope={scope} t={t} />)
    const created = model()
    unmount()
    expect(created.disposed).toBe(1)
  })
})
