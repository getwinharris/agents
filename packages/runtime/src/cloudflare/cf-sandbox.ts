/** Wraps a @cloudflare/sandbox instance (from getSandbox()) into SessionEnv. */
import { abortErrorFor } from '../abort.ts';
import type { SandboxApi } from '../sandbox.ts';
import { createSandboxSessionEnv } from '../sandbox.ts';
import type { SessionEnv } from '../types.ts';

export async function cfSandboxToSessionEnv(
	sandbox: any,
	cwd: string = '/workspace',
): Promise<SessionEnv> {
	const api: SandboxApi = {
		async readFile(path: string): Promise<string> {
			const file = await sandbox.readFile(path);
			return file.content;
		},

		async readFileBuffer(path: string): Promise<Uint8Array> {
			const file = await sandbox.readFile(path, { encoding: 'base64' });
			const binary = atob(file.content);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) {
				bytes[i] = binary.charCodeAt(i);
			}
			return bytes;
		},

		async writeFile(path: string, content: string | Uint8Array): Promise<void> {
			if (typeof content === 'string') {
				await sandbox.writeFile(path, content);
			} else {
				let binary = '';
				for (const byte of content) {
					binary += String.fromCharCode(byte);
				}
				const b64 = btoa(binary);
				await sandbox.writeFile(path, b64, { encoding: 'base64' });
			}
		},

		async stat(path: string) {
			const quoted = `'${path.replace(/'/g, "'\\''")}'`;
			// `stat -L` follows symlinks so isFile/isDirectory/size/mtime match
			// fs.stat semantics on the node target; the second (non-following)
			// stat reports whether the path itself is a symlink.
			const result = await sandbox.exec(
				`stat -L -c '%s/%Y/%F' ${quoted} && stat -c '%F' ${quoted}`,
			);
			if (!result.success) {
				throw new Error(`stat failed for ${path}: ${result.stderr}`);
			}
			const [target = '', self = ''] = (result.stdout ?? '').trim().split('\n');
			const [size = '0', mtime = '0', type = ''] = target.split('/');
			return {
				isFile: type.includes('regular'),
				isDirectory: type === 'directory',
				isSymbolicLink: self.trim() === 'symbolic link',
				size: parseInt(size, 10),
				mtime: new Date(parseInt(mtime, 10) * 1000),
			};
		},

		async readdir(path: string): Promise<string[]> {
			// NUL-separated `find` includes dotfiles (unlike plain `ls`) and
			// survives filenames containing newlines.
			const result = await sandbox.exec(
				`find '${path.replace(/'/g, "'\\''")}' -mindepth 1 -maxdepth 1 -printf '%f\\0'`,
			);
			if (!result.success) {
				throw new Error(`readdir failed for ${path}: ${result.stderr}`);
			}
			return result.stdout.split('\0').filter((s: string) => s.length > 0);
		},

		async exists(path: string): Promise<boolean> {
			const result = await sandbox.exists(path);
			return result.exists;
		},

		async mkdir(path: string, opts?: { recursive?: boolean }): Promise<void> {
			await sandbox.mkdir(path, opts);
		},

		async rm(path: string, opts?: { recursive?: boolean; force?: boolean }): Promise<void> {
			if (opts?.recursive || opts?.force) {
				const flags = `-${opts.recursive ? 'r' : ''}${opts.force ? 'f' : ''}`;
				const result = await sandbox.exec(`rm ${flags} '${path.replace(/'/g, "'\\''")}'`);
				if (!result.success) {
					throw new Error(`rm failed for ${path}: ${result.stderr}`);
				}
			} else {
				await sandbox.deleteFile(path);
			}
		},

		async exec(
			command: string,
			execOpts?: {
				cwd?: string;
				env?: Record<string, string>;
				timeout?: number;
				signal?: AbortSignal;
			},
		): Promise<{ stdout: string; stderr: string; exitCode: number }> {
			// The Cloudflare sandbox API has no signal param, so we rely on
			// `timeout` for deadline enforcement and only observe `signal`
			// before and after the remote call.
			const externalSignal = execOpts?.signal;
			if (externalSignal?.aborted) throw abortErrorFor(externalSignal);

			const timeoutMs = typeof execOpts?.timeout === 'number' ? execOpts.timeout * 1000 : undefined;
			const result = await sandbox.exec(command, {
				cwd: execOpts?.cwd,
				env: execOpts?.env,
				timeout: timeoutMs,
			});

			if (externalSignal?.aborted) throw abortErrorFor(externalSignal);

			return {
				stdout: result.stdout ?? '',
				stderr: result.stderr ?? '',
				exitCode: result.exitCode ?? (result.success ? 0 : 1),
			};
		},
	};

	return createSandboxSessionEnv(api, cwd);
}
