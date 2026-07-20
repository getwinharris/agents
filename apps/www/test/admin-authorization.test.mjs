import assert from 'node:assert/strict';
import test from 'node:test';
import {
	authorizeAdminApiRequest,
	authorizeAdminRequest,
	isAuthorizedAdminAccount,
	isSameOriginAdminRequest,
	parseAdminGithubUserIds,
} from '../src/server/admin-authorization.mjs';

test('parses opaque GitHub provider IDs without numeric coercion', () => {
	const authorization = parseAdminGithubUserIds('123, 9007199254740993,123');
	assert.equal(authorization.valid, true);
	assert.equal(authorization.size, 2);
	assert.equal(authorization.hasGithubUserId('123'), true);
	assert.equal(authorization.hasGithubUserId('9007199254740993'), true);
	assert.equal(authorization.hasGithubUserId('9007199254740992'), false);
});

test('fails closed for missing or malformed configuration', () => {
	for (const value of [undefined, '', ' ', '0', '-1', '1.2', '12x', '123,', ',123']) {
		const authorization = parseAdminGithubUserIds(value);
		assert.equal(authorization.valid, false, String(value));
		assert.equal(authorization.size, 0);
		assert.equal(authorization.hasGithubUserId('123'), false);
	}
});

test('keeps parsed authorization membership encapsulated and immutable', () => {
	const authorization = parseAdminGithubUserIds('123');
	assert.equal(Object.isFrozen(authorization), true);
	assert.equal('ids' in authorization, false);
	assert.throws(() => {
		authorization.hasGithubUserId = () => true;
	}, TypeError);
	assert.equal(authorization.hasGithubUserId('123'), true);
	assert.equal(authorization.hasGithubUserId('456'), false);
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
	assert.equal(
		isAuthorizedAdminAccount(account, { valid: false, hasGithubUserId: () => true }),
		false,
	);
	assert.equal(isAuthorizedAdminAccount(null, parseAdminGithubUserIds('9007199254740993')), false);
});

test('returns canonical request authorization results without leaking identity details', () => {
	const authorization = parseAdminGithubUserIds('123');
	const account = { providers: [{ name: 'github', id: '123' }] };

	assert.deepEqual(authorizeAdminRequest(null, authorization), {
		ok: false,
		status: 401,
		error: 'authentication_required',
	});
	assert.deepEqual(authorizeAdminRequest(account, parseAdminGithubUserIds('456')), {
		ok: false,
		status: 403,
		error: 'admin_forbidden',
	});
	assert.deepEqual(authorizeAdminRequest(account, authorization), {
		ok: true,
		status: 200,
		error: null,
	});
});

test('keeps canonical request authorization results immutable and reusable', () => {
	const authorization = parseAdminGithubUserIds('123');
	const first = authorizeAdminRequest(null, authorization);
	const second = authorizeAdminRequest(null, authorization);
	assert.equal(first, second);
	assert.equal(Object.isFrozen(first), true);
	assert.throws(() => {
		first.error = 'admin_forbidden';
	}, TypeError);
	assert.equal(authorizeAdminRequest(null, authorization).error, 'authentication_required');
});

test('accepts only the exact HTTPS Admin origin', () => {
	assert.equal(isSameOriginAdminRequest(undefined, 'admin.bapx.in'), false);
	assert.equal(isSameOriginAdminRequest('https://admin.bapx.in', 'admin.bapx.in'), true);
	assert.equal(isSameOriginAdminRequest('http://admin.bapx.in', 'admin.bapx.in'), false);
	assert.equal(isSameOriginAdminRequest('https://admin.bapx.in.evil.example', 'admin.bapx.in'), false);
	assert.equal(isSameOriginAdminRequest('not a url', 'admin.bapx.in'), false);
});

test('applies authentication, Admin entitlement, and same-origin checks in order', () => {
	const authorization = parseAdminGithubUserIds('123');
	const admin = { providers: [{ name: 'github', id: '123' }] };
	const nonAdmin = { providers: [{ name: 'github', id: '456' }] };

	assert.equal(
		authorizeAdminApiRequest(null, authorization, {
			mutation: true,
			origin: 'https://evil.example',
			host: 'admin.bapx.in',
		}).error,
		'authentication_required',
	);
	assert.equal(
		authorizeAdminApiRequest(nonAdmin, authorization, {
			mutation: true,
			origin: 'https://evil.example',
			host: 'admin.bapx.in',
		}).error,
		'admin_forbidden',
	);
	assert.deepEqual(
		authorizeAdminApiRequest(admin, authorization, {
			mutation: true,
			host: 'admin.bapx.in',
		}),
		{ ok: false, status: 403, error: 'cross_origin_forbidden' },
	);
	assert.deepEqual(
		authorizeAdminApiRequest(admin, authorization, {
			mutation: true,
			origin: 'https://evil.example',
			host: 'admin.bapx.in',
		}),
		{ ok: false, status: 403, error: 'cross_origin_forbidden' },
	);
	assert.deepEqual(
		authorizeAdminApiRequest(admin, authorization, {
			mutation: true,
			origin: 'https://admin.bapx.in',
			host: 'admin.bapx.in',
		}),
		{ ok: true, status: 200, error: null },
	);
	assert.deepEqual(
		authorizeAdminApiRequest(admin, authorization, {
			mutation: false,
			origin: 'https://evil.example',
			host: 'admin.bapx.in',
		}),
		{ ok: true, status: 200, error: null },
	);
});
