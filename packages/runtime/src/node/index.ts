/**
 * Node-specific entry point for `@bapX/runtime`. Exports the `local()`
 * sandbox factory for use in `defineAgent(() => ({ sandbox: local(...) }))`,
 * and the built-in `sqlite()` persistence adapter.
 *
 * Import platform-agnostic types (`BapxEventContext`, `PersistenceAdapter`, etc.)
 * from `@bapX/runtime`.
 */
export { sqlite } from './agent-execution-store.ts';
export { type LocalSandboxOptions, local } from './local.ts';
