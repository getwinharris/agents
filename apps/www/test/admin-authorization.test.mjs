import assert from 'node:assert/strict';
import test from 'node:test';
import {
	isAuthorizedAdminAccount,
	parseAdminGithubUserIds,
} from '../src/server/admin-authorization.mjs';

test('parses opaque GitHub provider IDs without numeric coercion', () => {
	const authorization = parseAdminGithubUserIds('123, 9007199254740993,123');
	assert.equal(authorization.valid, true);
	assert.deepEqual([...authorization.ids], ['123', '9007199254740993']);
});

test('fails closed for missing or malformed configuration', () => {
	for (const value of [undefined, '', ' ', '0', '-1', '1.2', '12x', '123,', ',123']) {
		const authorization = parseAdminGithubUserIds(value);
		assert.equal(authorization.valid, false, String(value));
		assert.equal(authorization.ids.size, 0);
	}
});

test('authorizes only an exact linked GitHub provider ID', () => {
	const authorization = parseAdminGithubUserIds('9007199254740993');
	assert.equal(
		isAuthorizedAdminAccount(
			{
				id: 'account-id',
				username: 'mutable-login',
				providers: [
					{ name: 'google', id: '9007199254740993' },
					{ name: 'github', id: '9007199254740993', login: 'renamed-login' },
				],
			},
			authorization,
		),
		true,
	);
});

test('rejects near matches, mutable identity fields, and invalid authorization state', () => {
	const account = {
		id: '9007199254740993',
		username: '9007199254740993',
		email: '9007199254740993@example.com',
		providers: [{ name: 'github', id: '90071992547409930', login: '9007199254740993' }],
	};
	assert.equal(isAuthorizedAdminAccount(account, parseAdminGithubUserIds('9007199254740993')), false);
	assert.equal(isAuthorizedAdminAccount(account, { valid: false, ids: new Set(['90071992547409930']) }), false);
	assert.equal(isAuthorizedAdminAccount(null, parseAdminGithubUserIds('9007199254740993')), false);
});
