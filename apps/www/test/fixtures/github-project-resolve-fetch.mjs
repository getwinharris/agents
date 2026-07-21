import fs from 'node:fs';

const logFile = process.env.BAPX_TEST_GITHUB_FETCH_LOG;

function record(entry) {
	if (!logFile) return;
	fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`, 'utf8');
}

globalThis.fetch = async (input, init = {}) => {
	const url = String(input);
	record({ url, method: init.method || 'GET' });

	if (url.endsWith('/app/installations/67890/access_tokens')) {
		return {
			ok: true,
			status: 201,
			async json() {
				return {
					token: 'installation-token',
					expires_at: new Date(Date.now() + 3_600_000).toISOString(),
					permissions: { metadata: 'read' },
				};
			},
		};
	}

	if (url.endsWith('/repos/submitted-owner/submitted-repository')) {
		return {
			ok: true,
			status: 200,
			async json() {
				return {
					id: 24680,
					full_name: 'Canonical-Owner/Canonical-Repository',
					owner: { type: 'Organization' },
					default_branch: 'trunk',
					visibility: 'private',
					private: true,
					archived: false,
				};
			},
		};
	}

	return {
		ok: false,
		status: 404,
		async json() { return { message: 'Not Found' }; },
	};
};
