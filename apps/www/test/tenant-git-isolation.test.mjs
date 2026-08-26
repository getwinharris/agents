import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createPlatformStore, tenantGitEnv } from '../src/server/platform-store.mjs';

// A customer workspace is a git repository on the operator's host. Git reads
// /etc/gitconfig and $HOME/.gitconfig before the repository's own config, and
// the operator's global config carries a working credential helper for the
// operator's GitHub account plus the operator's name and email.
//
// Without isolation, a push from a customer's workspace authenticates as the
// operator and is authored as the operator. These tests hold that boundary.

describe('Customer workspaces do not inherit operator git credentials', () => {
	let workspaceRoot;
	let fakeHome;
	let userRoot;

	before(async () => {
		workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-git-iso-'));
		fs.writeFileSync(path.join(workspaceRoot, 'OKF.md'), '# Test OKF\n');

		// Stand in for /root/.gitconfig: an operator global config with a
		// credential helper and identity, exactly as found on the live host.
		fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-operator-home-'));
		fs.writeFileSync(path.join(fakeHome, '.gitconfig'), [
			'[user]',
			'\tname = operator',
			'\temail = operator@example.test',
			'[credential "https://github.com"]',
			'\thelper = "!printf \'username=operator\\npassword=operator-secret-token\\n\'"',
			'',
		].join('\n'));

		const store = createPlatformStore({ workspaceRoot });
		const { account } = await store.loginWithGitHub({
			id: '3001',
			login: 'tenant-git-user',
			name: 'Tenant Git User',
			email: 'tenant-git@example.test',
		});
		userRoot = path.join(workspaceRoot, 'users', account.username);
	});

	after(() => {
		fs.rmSync(workspaceRoot, { recursive: true, force: true });
		fs.rmSync(fakeHome, { recursive: true, force: true });
	});

	it('provisions the workspace as a git repository', () => {
		assert.ok(fs.existsSync(path.join(userRoot, '.git')), 'workspace must be a git repository');
	});

	// The core claim. Run git with HOME pointed at the operator config, exactly
	// as a process on the live host would see /root/.gitconfig.
	//
	// Isolated, git finds no helper at all and — with prompting disabled — fails
	// rather than producing a credential. That failure IS the pass condition.
	it('cannot obtain any credential for github.com from inside the workspace', () => {
		let output = '';
		let failed = false;
		try {
			output = execFileSync('git', ['credential', 'fill'], {
				cwd: userRoot,
				input: 'protocol=https\nhost=github.com\n\n',
				env: tenantGitEnv({ HOME: fakeHome }),
				encoding: 'utf8',
				stdio: ['pipe', 'pipe', 'pipe'],
			});
		} catch (error) {
			failed = true;
			output = `${error.stdout || ''}${error.stderr || ''}`;
		}
		assert.ok(failed, 'git must not be able to produce a credential here');
		assert.doesNotMatch(output, /operator-secret-token/, 'operator token must never appear');
		assert.match(output, /terminal prompts disabled/, 'it must fail closed, not prompt or fall back');
	});

	// Non-vacuity: a plain `git init` repository — what this code did before
	// hardening — does leak the operator's credential and identity from the same
	// directory tree. If this ever stops leaking, the tests above prove nothing.
	it('a plain git init repository leaks the operator credential and identity', () => {
		const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-plain-repo-'));
		try {
			const env = { ...process.env, HOME: fakeHome, GIT_CONFIG_GLOBAL: path.join(fakeHome, '.gitconfig') };
			execFileSync('git', ['init', '--quiet'], { cwd: plain, env, stdio: 'ignore' });
			const leaked = execFileSync('git', ['credential', 'fill'], {
				cwd: plain,
				input: 'protocol=https\nhost=github.com\n\n',
				env,
				encoding: 'utf8',
			});
			assert.match(leaked, /operator-secret-token/, 'the unhardened path is expected to leak');
			const who = execFileSync('git', ['config', 'user.email'], { cwd: plain, env, encoding: 'utf8' }).trim();
			assert.equal(who, 'operator@example.test', 'unhardened repos author as the operator');
		} finally {
			fs.rmSync(plain, { recursive: true, force: true });
		}
	});

	it('does not author commits as the operator', () => {
		const env = tenantGitEnv({ HOME: fakeHome });
		const name = execFileSync('git', ['config', 'user.name'], { cwd: userRoot, env, encoding: 'utf8' }).trim();
		const email = execFileSync('git', ['config', 'user.email'], { cwd: userRoot, env, encoding: 'utf8' }).trim();
		assert.notEqual(name, 'operator', 'commits must not be authored as the operator');
		assert.notEqual(email, 'operator@example.test');
		assert.match(email, /@users\.noreply\.bapx\.in$/, 'workspace identity must be a bapX no-reply address');
	});

	// Repo-local config is the second line of defence: it must hold even if a
	// caller forgets the hardened environment.
	it('neutralises the inherited helper in the repository config itself', () => {
		const env = tenantGitEnv({ HOME: fakeHome });
		const helper = execFileSync('git', ['config', '--local', '--get-all', 'credential.helper'], {
			cwd: userRoot, env, encoding: 'utf8',
		}).trim();
		assert.equal(helper, '', 'repo-local helper must be reset to empty');
	});
});
