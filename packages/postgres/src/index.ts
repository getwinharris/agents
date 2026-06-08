/**
 * @flue/postgres — Postgres persistence adapter for Flue.
 *
 * Provides a {@link PersistenceAdapter} backed by PostgreSQL. Uses the
 * `postgres` (porsager) driver for async, connection-pooled access.
 *
 * @example
 * ```ts
 * // src/db.ts
 * import { postgres } from '@flue/postgres';
 * export default postgres('postgresql://localhost/mydb');
 * ```
 */

export { postgres } from './postgres-adapter.ts';
export type { PostgresOptions } from './postgres-adapter.ts';
