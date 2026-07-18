import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('resolveOperatingSurface()', () => {
	it('returns customer-scoped copy when the hostname is agents.bapx.in', async () => {
		let surfaceModule;
		try {
			surfaceModule = await import('../admin/src/lib/operating-surface.mjs');
		} catch {}

		assert.ok(surfaceModule, 'the shared operating-surface resolver must exist');
		assert.deepEqual(surfaceModule.resolveOperatingSurface('agents.bapx.in'), {
			kind: 'agents',
			label: 'Agents',
			projectScope: 'your business workspace',
			showAdminPullRequests: false,
		});
	});

	it('returns bapX-wide copy when the hostname is admin.bapx.in', async () => {
		const { resolveOperatingSurface } = await import('../admin/src/lib/operating-surface.mjs');

		assert.deepEqual(resolveOperatingSurface('admin.bapx.in'), {
			kind: 'admin',
			label: 'Admin',
			projectScope: 'projects in /root/bapx.in',
			showAdminPullRequests: true,
		});
	});
});
