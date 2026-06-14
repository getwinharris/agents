import type { Env, Handler } from 'hono';
import type {
	JsonObject,
	JsonValue,
	SalesforceMarketingCloudBatch,
	SalesforceMarketingCloudChannelOptions,
	SalesforceMarketingCloudEvent,
	SalesforceMarketingCloudVerification,
} from './index.ts';

const DEFAULT_BODY_LIMIT = 1024 * 1024;
const DEFAULT_HANDLER_TIMEOUT_MS = 2500;
const MAX_BATCH_SIZE = 1000;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export function createSalesforceMarketingCloudEventsHandler<E extends Env>(
	options: SalesforceMarketingCloudChannelOptions<E>,
): Handler<E> {
	const bodyLimit = options.bodyLimit ?? DEFAULT_BODY_LIMIT;
	const handlerTimeoutMs = options.handlerTimeoutMs ?? DEFAULT_HANDLER_TIMEOUT_MS;
	if (!Number.isSafeInteger(bodyLimit) || bodyLimit <= 0) {
		throw new TypeError('Salesforce Marketing Cloud bodyLimit must be a positive integer.');
	}
	if (
		!Number.isSafeInteger(handlerTimeoutMs) ||
		handlerTimeoutMs <= 0 ||
		handlerTimeoutMs > DEFAULT_HANDLER_TIMEOUT_MS
	) {
		throw new TypeError('Salesforce Marketing Cloud handlerTimeoutMs must be between 1 and 2500.');
	}
	const key =
		options.signatureKey === undefined ? undefined : importSigningKey(options.signatureKey);

	return (c) => {
		const deadlineAt = Date.now() + handlerTimeoutMs;
		return runRoute(async () => {
			const request = c.req.raw;
			if (!isJsonRequest(request)) return response(415);

			const contentLength = request.headers.get('content-length');
			if (contentLength !== null && !/^\d+$/.test(contentLength)) return response(400);
			if (contentLength !== null && Number(contentLength) > bodyLimit) return response(413);

			const body = await readBody(request, bodyLimit);
			if (body.type === 'too-large') return response(413);
			if (body.type === 'invalid') return response(400);

			let rawBody: string;
			try {
				rawBody = decoder.decode(body.value);
			} catch {
				return response(400);
			}

			const signatureValue = request.headers.get('x-sfmc-ens-signature');
			if (signatureValue === null) {
				if (!options.verification) return response(401);
				const verification = parseVerification(rawBody);
				if (!verification) return response(401);
				if (options.callbackId !== undefined && verification.callbackId !== options.callbackId) {
					return response(403);
				}
				if (Date.now() >= deadlineAt) return response(500);
				await options.verification({ c, verification });
				return response(200);
			}

			const signature = parseSignature(signatureValue);
			if (!signature || !key) return response(401);
			if (!(await verifySignature(await key, body.value, signature))) {
				return response(401);
			}

			const batch = parseBatch(rawBody);
			if (!batch) return response(400);
			if (Date.now() >= deadlineAt) return response(500);
			return serializeHandlerResult(await options.events({ c, batch }));
		}, handlerTimeoutMs);
	};
}

function parseVerification(rawBody: string): SalesforceMarketingCloudVerification | undefined {
	let value: unknown;
	try {
		value = JSON.parse(rawBody);
	} catch {
		return undefined;
	}
	if (!isPlainObject(value)) return undefined;
	const keys = Object.keys(value);
	if (
		keys.length !== 2 ||
		!keys.includes('callbackId') ||
		!keys.includes('verificationKey') ||
		!isNonEmptyString(value.callbackId) ||
		!isNonEmptyString(value.verificationKey)
	) {
		return undefined;
	}
	return {
		callbackId: value.callbackId,
		verificationKey: value.verificationKey,
	};
}

function parseBatch(rawBody: string): SalesforceMarketingCloudBatch | undefined {
	let value: unknown;
	try {
		value = JSON.parse(rawBody);
	} catch {
		return undefined;
	}
	if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BATCH_SIZE) {
		return undefined;
	}
	const events: SalesforceMarketingCloudEvent[] = [];
	for (const item of value) {
		const event = normalizeEvent(item);
		if (!event) return undefined;
		events.push(event);
	}
	return { events, rawBody };
}

function normalizeEvent(value: unknown): SalesforceMarketingCloudEvent | undefined {
	if (!isPlainObject(value) || !isJsonObject(value)) return undefined;
	if (!isNonEmptyString(value.eventCategoryType)) return undefined;
	if (
		typeof value.timestampUTC !== 'number' ||
		!Number.isSafeInteger(value.timestampUTC) ||
		value.timestampUTC < 0
	) {
		return undefined;
	}
	return {
		eventCategoryType: value.eventCategoryType,
		timestampUTC: value.timestampUTC,
		...(isNonEmptyString(value.compositeId) ? { compositeId: value.compositeId } : {}),
		...(isMarketingCloudId(value.mid) ? { mid: value.mid } : {}),
		...(isMarketingCloudId(value.eid) ? { eid: value.eid } : {}),
		...(isPlainObject(value.info) && isJsonObject(value.info) ? { info: value.info } : {}),
		raw: value,
	};
}

function isMarketingCloudId(value: unknown): value is number | string {
	if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0;
	return isNonEmptyString(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

async function importSigningKey(signatureKey: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'raw',
		encoder.encode(signatureKey),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['verify'],
	);
}

async function verifySignature(
	key: CryptoKey,
	body: Uint8Array,
	signature: Uint8Array,
): Promise<boolean> {
	try {
		return await crypto.subtle.verify(
			'HMAC',
			key,
			copyArrayBuffer(signature),
			copyArrayBuffer(body),
		);
	} catch {
		return false;
	}
}

function parseSignature(value: string): Uint8Array | undefined {
	if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) return undefined;
	try {
		const decoded = atob(value);
		if (decoded.length !== 32) return undefined;
		return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
	} catch {
		return undefined;
	}
}

async function runRoute(route: () => Promise<Response>, timeoutMs: number): Promise<Response> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	const routePromise = Promise.resolve()
		.then(route)
		.catch(() => response(500));
	const timeoutPromise = new Promise<Response>((resolve) => {
		timeout = setTimeout(() => resolve(response(500)), timeoutMs);
	});
	const outcome = await Promise.race([routePromise, timeoutPromise]);
	if (timeout !== undefined) clearTimeout(timeout);
	return outcome;
}

function serializeHandlerResult(value: unknown): Response {
	if (value instanceof Response) return value;
	if (value === undefined) return response(200);
	if (!isJsonValue(value)) return response(500);
	return Response.json(value);
}

function isJsonRequest(request: Request): boolean {
	return (
		request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ===
		'application/json'
	);
}

async function readBody(
	request: Request,
	bodyLimit: number,
): Promise<{ type: 'success'; value: Uint8Array } | { type: 'too-large' } | { type: 'invalid' }> {
	if (!request.body) return { type: 'success', value: new Uint8Array() };
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > bodyLimit) {
				void reader.cancel();
				return { type: 'too-large' };
			}
			chunks.push(value);
		}
	} catch {
		return { type: 'invalid' };
	} finally {
		reader.releaseLock();
	}
	const body = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return { type: 'success', value: body };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return (
		value !== null &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}

function isJsonObject(value: Record<string, unknown>): value is JsonObject {
	return Object.values(value).every((item) => isJsonValue(item));
}

function isJsonValue(value: unknown, seen = new Set<object>()): value is JsonValue {
	if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
	if (typeof value === 'number') return Number.isFinite(value);
	if (typeof value !== 'object' || seen.has(value)) return false;
	if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) return false;
	seen.add(value);
	try {
		return Array.isArray(value)
			? value.every((item) => isJsonValue(item, seen))
			: Object.values(value).every((item) => isJsonValue(item, seen));
	} finally {
		seen.delete(value);
	}
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);
	return copy.buffer;
}

function response(status: number): Response {
	return new Response(null, { status });
}
