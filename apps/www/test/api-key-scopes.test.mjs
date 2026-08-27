import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, beforeEach } from 'node:test';
import { createApiKeyStore, KEY_KINDS } from '../src/server/api-gateway.mjs';

// A key handed to an application so it can call models must not also let that
// application drive the business's agents through MCP. These tests hold that
// separation, including for keys issued before scopes existed.

describe('API key scopes', () => {
	let workspaceRoot;
	let store;

	beforeEach(() => {
		workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-scope-'));
		store = createApiKeyStore({ workspaceRoot });
	});

	it('issues the two kinds with distinguishable prefixes', () => {
		const models = store.issue('acct-1', 'app', 'models');
		const mcp = store.issue('acct-1', 'claude', 'mcp');
		assert.ok(models.secret.startsWith(KEY_KINDS.models.prefix), 'models key prefix');
		assert.ok(mcp.secret.startsWith(KEY_KINDS.mcp.prefix), 'mcp key prefix');
		assert.notEqual(KEY_KINDS.models.prefix, KEY_KINDS.mcp.prefix);
		assert.equal(models.key.scope, 'models');
		assert.equal(mcp.key.scope, 'mcp');
	});

	it('refuses an unknown scope rather than issuing an unscoped key', () => {
		assert.throws(() => store.issue('acct-1', 'x', 'everything'), /Unknown key scope/);
	});

	it('accepts each key only on its own surface', () => {
		const models = store.issue('acct-1', 'app', 'models').secret;
		const mcp = store.issue('acct-1', 'claude', 'mcp').secret;

		assert.equal(store.verify(models, 'models').accountId, 'acct-1');
		assert.equal(store.verify(mcp, 'mcp').accountId, 'acct-1');

		// The core claim: neither key crosses over.
		assert.equal(store.verify(models, 'mcp').scopeMismatch, true, 'a models key must not reach MCP');
		assert.equal(store.verify(mcp, 'models').scopeMismatch, true, 'an MCP key must not reach /v1');
	});

	// A rejected attempt must not look like legitimate use in the UI.
	it('does not record lastUsedAt for a wrong-scope attempt', () => {
		const models = store.issue('acct-1', 'app', 'models');
		store.verify(models.secret, 'mcp');
		assert.equal(store.list('acct-1')[0].lastUsedAt, null, 'a refused attempt is not a use');
		store.verify(models.secret, 'models');
		assert.notEqual(store.list('acct-1')[0].lastUsedAt, null, 'a real use is recorded');
	});

	// Keys written before scopes existed carry no scope field. They were issued
	// for /v1, which was the only surface, so they must stay models-only —
	// never silently widened to MCP.
	it('treats a pre-scope key as models-only', () => {
		const legacy = store.issue('acct-1', 'old', 'models');
		const file = path.join(workspaceRoot, 'data', 'platform', 'collections', 'api-keys.json');
		const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
		delete stored.keys[0].scope;
		fs.writeFileSync(file, JSON.stringify(stored));

		assert.equal(store.verify(legacy.secret, 'models').accountId, 'acct-1', 'legacy keys keep working on /v1');
		assert.equal(store.verify(legacy.secret, 'mcp').scopeMismatch, true, 'legacy keys must not be widened to MCP');
	});

	it('rejects a garbage token on both surfaces', () => {
		assert.equal(store.verify('not-a-key', 'models'), null);
		assert.equal(store.verify('bapx_sk_wrong', 'mcp'), null);
		assert.equal(store.verify('', 'models'), null);
	});

	it('keeps revocation per key, so revoking one scope leaves the other working', () => {
		const models = store.issue('acct-1', 'app', 'models');
		const mcp = store.issue('acct-1', 'claude', 'mcp');
		assert.equal(store.revoke('acct-1', models.key.id), true);
		assert.equal(store.verify(models.secret, 'models'), null, 'revoked key is dead');
		assert.equal(store.verify(mcp.secret, 'mcp').accountId, 'acct-1', 'the other key survives');
	});
});
