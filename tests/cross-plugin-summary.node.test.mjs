/**
 * 跨插件摘要模板的单测（`node --test` 可直接跑）。
 *
 * 为什么单独用 `.node.test.mjs`：本仓库既有的 `tests/*.client.spec.tsx` **没有可用
 * runner**（package.json 没有 test 脚本、也没装 vitest），等于从来没被执行过。这份
 * 模板的每条改进都必须**可复现地**证明，而不是靠读代码宣布，所以走 `node --test`。
 *
 * 被测对象是 tsc 产物 `lib/types/client/cross-plugin-summary.js`（先 `npm run types`）。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createSummaryRegistry,
  createSummaryStore,
  defaultCanPoll,
  entryFor,
  mapEquals,
  normalizeSessionId,
  summarizeGroup,
} from '../lib/types/client/cross-plugin-summary.js'

/** 让已排入微任务队列的 promise 链跑完（fetch 是 3 段 then）。 */
const flush = async () => {
  for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setImmediate(resolve))
}

/** 可控定时器：不真的睡时间，可手动触发。 */
function makeTimers() {
  let seq = 0
  const timeouts = new Map()
  const intervals = new Map()
  return {
    timers: {
      setTimeout: (fn, ms) => {
        const id = (seq += 1)
        timeouts.set(id, { fn, ms })
        return id
      },
      clearTimeout: (id) => {
        timeouts.delete(id)
      },
      setInterval: (fn, ms) => {
        const id = (seq += 1)
        intervals.set(id, { fn, ms })
        return id
      },
      clearInterval: (id) => {
        intervals.delete(id)
      },
    },
    intervalCount: () => intervals.size,
    intervalDelays: () => [...intervals.values()].map((entry) => entry.ms),
    timeoutDelays: () => [...timeouts.values()].map((entry) => entry.ms),
    fireIntervals: () => {
      for (const { fn } of [...intervals.values()]) fn()
    },
    fireTimeouts: () => {
      const pending = [...timeouts.values()]
      timeouts.clear()
      for (const { fn } of pending) fn()
    },
  }
}

/** 模拟 React 的 useSyncExternalStore：取值 + 记录订阅，重"渲染"就是再调一次。 */
function makeFakeReact() {
  const calls = []
  const impl = (subscribe, getSnapshot) => {
    calls.push({ subscribe, getSnapshot })
    return getSnapshot()
  }
  return { impl, calls, renders: () => calls.length }
}

const entry = (prNumber, deadline) => ({ prNumber, state: 'waiting', deadline })

/* ================================================================== *
 * 1. 内容等价不再每次轮询都通知（旧草稿：11 次轮询 → 11 次通知）
 * ================================================================== */
test('轮询 11 次、内容完全相同 → 只通知 1 次（旧草稿是 11 次）', async () => {
  const { timers, fireIntervals, intervalDelays } = makeTimers()
  let polls = 0
  const store = createSummaryStore({
    fetch: async () => {
      polls += 1
      // 每次都是全新对象，但内容逐字段相同 —— 真实端点 JSON.parse 就是这个形态
      return new Map([['session-a', entry(15, 1_700_000_000_000)]])
    },
    equals: mapEquals((a, b) => a.prNumber === b.prNumber && a.state === b.state && a.deadline === b.deadline),
    intervalMs: 20,
    timers,
  })
  let notified = 0
  store.subscribe(() => {
    notified += 1
  })

  await flush() // 首次立即拉取 → 应当通知 1 次
  assert.equal(polls, 1)
  assert.equal(notified, 1, '首帧拉到数据应通知一次')
  assert.deepEqual(intervalDelays(), [20], '应装上 20ms 轮询')

  // 每次都要 flush：store 有 in-flight 去重（同一时刻只发一个请求，这是对的），
  // 同步连发 10 次 interval 只会真的发出 1 个请求。
  for (let i = 0; i < 10; i += 1) {
    fireIntervals()
    await flush()
  }
  assert.equal(polls, 11, '共 11 次轮询')
  assert.equal(notified, 1, '内容没变 → 后 10 次轮询一次都不该通知')

  store.dispose()
})

test('内容变化时才通知', async () => {
  const { timers, fireIntervals } = makeTimers()
  let pr = 15
  const store = createSummaryStore({
    fetch: async () => new Map([['session-a', entry(pr, 1_700_000_000_000)]]),
    equals: mapEquals((a, b) => a.prNumber === b.prNumber && a.state === b.state && a.deadline === b.deadline),
    intervalMs: 20,
    timers,
  })
  let notified = 0
  store.subscribe(() => {
    notified += 1
  })

  await flush()
  assert.equal(notified, 1)

  pr = 16 // 内容真的变了
  fireIntervals()
  await flush()
  assert.equal(notified, 2, '内容变化必须通知')

  pr = 16 // 再轮询一次，内容不变
  fireIntervals()
  await flush()
  assert.equal(notified, 2, '内容不变不得再通知')

  store.dispose()
})

test('mapEquals：内容比较语义', () => {
  const eq = mapEquals()
  assert.equal(eq(undefined, undefined), true)
  assert.equal(eq(undefined, new Map()), false)
  assert.equal(eq(new Map([['a', 1]]), new Map([['a', 1]])), true, '不同引用、相同内容 → 等价')
  assert.equal(eq(new Map([['a', 1]]), new Map([['a', 2]])), false)
  assert.equal(eq(new Map([['a', 1]]), new Map([['a', 1], ['b', 2]])), false, '条目数不同')
  assert.equal(eq(new Map([['a', 1]]), new Map([['b', 1]])), false, '键不同')
})

/* ================================================================== *
 * 2. 迟到的 store 自愈（旧草稿：传 undefined 后永远 undefined）
 * ================================================================== */
test('登记表：store 迟到时 hook 先返回 undefined，登记后立即拿到快照', async () => {
  const { impl } = makeFakeReact()
  const registry = createSummaryRegistry({ useSyncExternalStoreImpl: impl })

  // 消费方先渲染：provider 还没 apply
  assert.equal(registry.getStore(), undefined)
  assert.equal(registry.useSummary(), undefined, 'store 未登记 → undefined')

  // provider 后 apply
  const { timers } = makeTimers()
  const store = createSummaryStore({
    fetch: async () => new Map([['session-a', entry(15, Number.MAX_SAFE_INTEGER)]]),
    equals: mapEquals(),
    intervalMs: 0,
    timers,
  })
  registry.setStore(store)
  await flush()

  assert.equal(registry.useSummary()?.get('session-a')?.prNumber, 15, '登记后必须能拿到快照')
  store.dispose()
})

test('登记表：同一 store 重复登记不重复通知；撤销回到 undefined', () => {
  const { impl } = makeFakeReact()
  const registry = createSummaryRegistry({ useSyncExternalStoreImpl: impl })
  let notified = 0
  const unsubscribe = registry.subscribe(() => {
    notified += 1
  })

  const fake = { getSnapshot: () => undefined, subscribe: () => () => undefined, reload: () => undefined, dispose: () => undefined }
  registry.setStore(fake)
  registry.setStore(fake)
  assert.equal(notified, 1, '同一 store 重复登记不重复通知')

  registry.setStore(undefined)
  assert.equal(notified, 2)
  assert.equal(registry.getStore(), undefined)

  unsubscribe()
  registry.setStore(fake)
  assert.equal(notified, 2, '退订后不再通知')
  registry.setStore(undefined)
})

/* ================================================================== *
 * 3. 可见性门控（旧草稿：后台标签页照样轮询）
 * ================================================================== */
test('canPoll 为假时不发请求；恢复后继续', async () => {
  const { timers, fireIntervals } = makeTimers()
  let visible = false
  let polls = 0
  const store = createSummaryStore({
    fetch: async () => {
      polls += 1
      return new Map([['a', 1]])
    },
    equals: mapEquals(),
    intervalMs: 20,
    canPoll: () => visible,
    immediate: false,
    timers,
  })

  fireIntervals()
  await flush()
  assert.equal(polls, 0, '不可见时不得请求')

  visible = true
  fireIntervals()
  await flush()
  assert.equal(polls, 1, '可见后恢复请求')

  store.dispose()
})

test('defaultCanPoll 读 document.visibilityState；无 document 时视为可见', () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document')
  try {
    assert.equal(defaultCanPoll(), true, 'Node 无 document → 可见')
    Object.defineProperty(globalThis, 'document', { value: { visibilityState: 'hidden' }, configurable: true })
    assert.equal(defaultCanPoll(), false, 'hidden → 不允许轮询')
    Object.defineProperty(globalThis, 'document', { value: { visibilityState: 'visible' }, configurable: true })
    assert.equal(defaultCanPoll(), true)
  } finally {
    if (saved === undefined) delete globalThis.document
    else Object.defineProperty(globalThis, 'document', saved)
  }
})

/* ================================================================== *
 * 4. 失败保留上一份快照（不抹界面）
 * ================================================================== */
test('fetch 返回 undefined / 抛错 → 保留上一份且不通知', async () => {
  const { timers, fireIntervals } = makeTimers()
  let mode = 'ok'
  const store = createSummaryStore({
    fetch: async () => {
      if (mode === 'throw') throw new Error('network down')
      if (mode === 'empty') return undefined
      return new Map([['a', 1]])
    },
    equals: mapEquals(),
    intervalMs: 20,
    timers,
  })
  let notified = 0
  store.subscribe(() => {
    notified += 1
  })

  await flush()
  assert.equal(store.getSnapshot()?.get('a'), 1)
  assert.equal(notified, 1)

  for (const bad of ['throw', 'empty']) {
    mode = bad
    fireIntervals()
    await flush()
    assert.equal(store.getSnapshot()?.get('a'), 1, `${bad} 不得清空快照`)
    assert.equal(notified, 1, `${bad} 不得通知`)
  }

  store.dispose()
})

/* ================================================================== *
 * 5. scheduleNext：派生状态按本地时钟精确定时翻转（旧草稿只能等下一个 interval）
 * ================================================================== */
test('scheduleNext：按返回的延时装一次性定时器，到点通知并重排', async () => {
  const { timers, timeoutDelays, fireTimeouts } = makeTimers()
  const store = createSummaryStore({
    fetch: async () => new Map([['a', 1]]),
    equals: mapEquals(),
    intervalMs: 0,
    scheduleNext: () => 5_000,
    timers,
  })
  let notified = 0
  store.subscribe(() => {
    notified += 1
  })

  await flush()
  assert.equal(notified, 1)
  assert.deepEqual(timeoutDelays(), [5_000], '应按 scheduleNext 精确装 5s 定时器')

  fireTimeouts()
  assert.equal(notified, 2, '到点必须通知（让消费方按本地时钟重算）')
  assert.deepEqual(timeoutDelays(), [5_000], '通知后应重排下一次')

  store.dispose()
  assert.deepEqual(timeoutDelays(), [], 'dispose 应清掉状态定时器')
})

/* ================================================================== *
 * 6. dispose
 * ================================================================== */
test('dispose：清定时器、停通知、不再请求', async () => {
  const { timers, intervalCount, fireIntervals } = makeTimers()
  let polls = 0
  const store = createSummaryStore({
    fetch: async () => {
      polls += 1
      return new Map([['a', 1]])
    },
    equals: mapEquals(),
    intervalMs: 20,
    timers,
  })
  let notified = 0
  store.subscribe(() => {
    notified += 1
  })

  await flush()
  assert.equal(intervalCount(), 1)
  store.dispose()
  assert.equal(intervalCount(), 0, 'dispose 应清掉轮询定时器')

  const before = polls
  fireIntervals()
  await flush()
  assert.equal(polls, before, 'dispose 后不得再请求')
  assert.equal(notified, 1, 'dispose 后不得再通知')
})

/* ================================================================== *
 * 7. 折叠：rank/stateOf 真正做掉抽象（旧草稿只回 {sessions, entries}）
 * ================================================================== */
test('summarizeGroup：折叠出 sessions / entries / 最高优先级 state', () => {
  const summary = new Map([
    ['session-a', { prNumber: 10, state: 'waiting' }],
    ['webhook-b', { prNumber: 11, state: 'overdue' }],
  ])
  const rank = (state) => (state === 'overdue' ? 1 : 0)

  const all = summarizeGroup(summary, ['session-a', 'session-b', 'session-zzz'], {
    stateOf: (e) => e.state,
    rank,
  })
  assert.equal(all.sessions, 2)
  assert.deepEqual(all.entries.map((e) => e.prNumber), [10, 11])
  assert.equal(all.state, 'overdue', 'overdue 优先于 waiting')

  const one = summarizeGroup(summary, ['session-a'], { stateOf: (e) => e.state, rank })
  assert.equal(one.sessions, 1)
  assert.equal(one.state, 'waiting')

  const none = summarizeGroup(summary, ['session-nope'], { stateOf: (e) => e.state, rank })
  assert.equal(none.sessions, 0)
  assert.deepEqual(none.entries, [])
  assert.equal(none.state, undefined)

  assert.equal(summarizeGroup(undefined, ['session-a']).sessions, 0)
  assert.equal(summarizeGroup(summary, ['session-a']).state, undefined, '未给 stateOf 时不猜状态')
})

test('entryFor / normalizeSessionId：三种 id 口径都能命中同一份摘要', () => {
  assert.equal(normalizeSessionId('session-abc'), 'abc')
  assert.equal(normalizeSessionId('webhook-abc'), 'abc')
  assert.equal(normalizeSessionId('abc'), 'abc')

  const hostKeyed = new Map([['session-uuid-1', { prNumber: 7 }]])
  assert.equal(entryFor(hostKeyed, 'session-uuid-1')?.prNumber, 7, '宿主 id 直接命中')
  assert.equal(entryFor(hostKeyed, 'uuid-1')?.prNumber, 7, '归一化 id 命中')

  const wireKeyed = new Map([['uuid-2', { prNumber: 8 }]])
  assert.equal(entryFor(wireKeyed, 'session-uuid-2')?.prNumber, 8, '旧口径（wire key）也命中')

  const webhookKeyed = new Map([['webhook-uuid-3', { prNumber: 9 }]])
  assert.equal(entryFor(webhookKeyed, 'session-uuid-3')?.prNumber, 9, 'webhook 前缀形态也命中')

  assert.equal(entryFor(hostKeyed, 'session-nope'), undefined)
  assert.equal(entryFor(hostKeyed, ''), undefined)
  assert.equal(entryFor(undefined, 'session-uuid-1'), undefined)
})
