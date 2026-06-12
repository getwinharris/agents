import { describe, expect, it } from 'vitest';
import { createTools } from '../src/agent.ts';
import { createNoopSessionEnv } from './fixtures/session-env.ts';

describe('createTools()', () => {
	it('rejects an edit when oldText is empty', async () => {
		const env = createNoopSessionEnv({ readFile: async () => 'file content' });
		const edit = createTools(env).find((tool) => tool.name === 'edit');

		await expect(
			edit?.execute('call', { path: 'a.txt', oldText: '', newText: 'inserted' }),
		).rejects.toThrow('oldText must be a non-empty string');
	});
});
