import { beforeEach } from 'vitest'

/**
 * jsdom keeps one `localStorage` for a whole spec file, and the viewing store
 * hydrates from it (`persist: 'dsh.workspace.view.v5'` — see
 * `src/client/stores.ts`). Every spec builds its own store, so without this the
 * previous test's saved order mode / per-account order arrives as hydrated state
 * and the assertion sees an earlier test's data.
 */
beforeEach(() => {
  localStorage.clear()
})
