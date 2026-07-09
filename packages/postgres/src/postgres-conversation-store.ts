import type { ConversationStreamStore } from '@bapX/runtime/adapter';
import { defineSqlConversationStreamStore } from '@bapX/runtime/adapter';
import type { PostgresParameter, PostgresRunner } from './postgres-adapter.ts';

export function createPgConversationStreamStore(runner: PostgresRunner): ConversationStreamStore {
	return defineSqlConversationStreamStore({
		placeholder: (index) => `$${index}`,
		lockClause: 'FOR UPDATE',
		insertIgnorePrefix: 'INSERT',
		insertIgnoreSuffix: 'ON CONFLICT (path) DO NOTHING',
		supportsReturning: true,
		query: (sql, params) => runner.query(sql, params as PostgresParameter[]),
		transaction: (fn) =>
			runner.transaction((tx) =>
				fn({ query: (sql, params) => tx.query(sql, params as PostgresParameter[]) }),
			),
	});
}
