import type { GoogleChatConversationRef } from '@bapX/google-chat';
import { importPKCS8, SignJWT } from 'jose';

const CHAT_BOT_SCOPE = 'https://www.googleapis.com/auth/chat.bot';

export interface GoogleChatClientOptions {
	clientEmail: string;
	privateKey: string;
	tokenUri?: string;
	apiBaseUrl?: string;
	fetch?: typeof globalThis.fetch;
}

interface GoogleChatMessage {
	name: string;
	thread?: { name: string };
}

export interface GoogleChatClient {
	postMessage(ref: GoogleChatConversationRef, text: string): Promise<GoogleChatMessage>;
}

export function createGoogleChatClient(options: GoogleChatClientOptions): GoogleChatClient {
	const fetcher = options.fetch ?? globalThis.fetch;
	const tokenUri = validateHttpsUrl(
		options.tokenUri ?? 'https://oauth2.googleapis.com/token',
		'tokenUri',
	);
	const apiBaseUrl = validateHttpsUrl(
		options.apiBaseUrl ?? 'https://chat.googleapis.com',
		'apiBaseUrl',
	);
	let accessToken: { value: string; expiresAt: number } | undefined;
	let signingKey: Awaited<ReturnType<typeof importPKCS8>> | undefined;

	return {
		async postMessage(ref, text) {
			if (!/^spaces\/[^/]+$/.test(ref.space)) {
				throw new Error('Google Chat space is invalid.');
			}
			if (ref.thread !== undefined) {
				const match = /^(spaces\/[^/]+)\/threads\/[^/]+$/.exec(ref.thread);
				if (!match || match[1] !== ref.space) {
					throw new Error('Google Chat thread must belong to its space.');
				}
			}
			if (typeof text !== 'string' || text.length === 0) {
				throw new Error('Google Chat message text is required.');
			}
			const token = await getAccessToken();
			const endpoint = new URL(
				`/v1/${ref.space}/messages`,
				apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`,
			);
			const body: { text: string; thread?: { name: string } } = { text };
			if (ref.thread !== undefined) {
				endpoint.searchParams.set('messageReplyOption', 'REPLY_MESSAGE_OR_FAIL');
				body.thread = { name: ref.thread };
			}
			const response = await fetcher(endpoint, {
				method: 'POST',
				headers: {
					authorization: `Bearer ${token}`,
					'content-type': 'application/json',
				},
				body: JSON.stringify(body),
			});
			if (!response.ok) {
				throw new Error(`Google Chat message request failed with ${response.status}.`);
			}
			const result: unknown = await response.json();
			if (!isRecord(result) || typeof result.name !== 'string') {
				throw new Error('Google Chat returned an invalid message response.');
			}
			const thread = isRecord(result.thread) ? result.thread : undefined;
			return {
				name: result.name,
				...(thread && typeof thread.name === 'string' ? { thread: { name: thread.name } } : {}),
			};
		},
	};

	async function getAccessToken(): Promise<string> {
		if (accessToken && accessToken.expiresAt > Date.now() + 60_000) {
			return accessToken.value;
		}
		signingKey ??= await importPKCS8(normalizePrivateKey(options.privateKey), 'RS256');
		const assertion = await new SignJWT({ scope: CHAT_BOT_SCOPE })
			.setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
			.setIssuer(options.clientEmail)
			.setAudience(tokenUri)
			.setIssuedAt()
			.setExpirationTime('1h')
			.sign(signingKey);
		const response = await fetcher(tokenUri, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
				assertion,
			}),
		});
		if (!response.ok) {
			throw new Error(`Google OAuth request failed with ${response.status}.`);
		}
		const result: unknown = await response.json();
		if (
			!isRecord(result) ||
			typeof result.access_token !== 'string' ||
			typeof result.expires_in !== 'number' ||
			!Number.isFinite(result.expires_in)
		) {
			throw new Error('Google OAuth returned an invalid access token response.');
		}
		accessToken = {
			value: result.access_token,
			expiresAt: Date.now() + Math.max(0, result.expires_in) * 1000,
		};
		return accessToken.value;
	}
}

function normalizePrivateKey(value: string): string {
	if (!value) throw new Error('Google service-account private key is required.');
	return value.includes('\\n') ? value.replaceAll('\\n', '\n') : value;
}

function validateHttpsUrl(value: string, field: string): string {
	const url = new URL(value);
	if (
		url.protocol !== 'https:' ||
		url.username !== '' ||
		url.password !== '' ||
		url.search !== '' ||
		url.hash !== ''
	) {
		throw new Error(`Google ${field} is invalid.`);
	}
	return url.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
