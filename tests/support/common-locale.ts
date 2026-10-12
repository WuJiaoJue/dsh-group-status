/**
 * Stand-in for `@deepseek-ai/dsh-client-locale/src/locales/{en,zh}.ts`.
 *
 * The published locale package ships **type declarations only** for the two
 * dictionaries (`lib/types/locales/en.d.ts` / `zh.d.ts`) — there is no runtime
 * file to import, so the upstream specs' deep import cannot resolve outside
 * the DSH monorepo. `vitest.config.ts` aliases both specifiers here.
 *
 * Both dictionaries are intentionally empty: every spec builds its expected
 * strings through the same translator it hands the component, so a missing
 * *common*-namespace key degrades symmetrically (key name on both sides)
 * instead of inventing a translation that could mask a real regression.
 */
export const en: Record<string, string> = {}
export const zh: Record<string, string> = {}
