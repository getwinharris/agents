interface DurableObjectNamespace {
	idFromName(name: string): object;
	get(id: object): { fetch(input: Request): Promise<Response> };
}

export async function fetchCloudflareDurableObject(
	namespace: DurableObjectNamespace,
	name: string,
	request: Request,
	options: { retry?: boolean } = {},
): Promise<Response> {
	let attempt = 0;
	while (true) {
		try {
			return await namespace.get(namespace.idFromName(name)).fetch(request.clone());
		} catch (error) {
			attempt++;
			if (!options.retry || attempt >= 3 || !isRetryableDurableObjectError(error)) throw error;
			await new Promise((resolve) =>
				setTimeout(resolve, Math.floor(Math.random() * 100 * 2 ** (attempt - 1))),
			);
		}
	}
}

function isRetryableDurableObjectError(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) return false;
	const typed = error as { overloaded?: unknown; retryable?: unknown };
	return typed.retryable === true && typed.overloaded !== true;
}
