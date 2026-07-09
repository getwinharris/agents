import type {
	WebhookChange,
	WebhookContact,
	WebhookConversation,
	WebhookEntry,
	WebhookError,
	WebhookMessage,
	WebhookMessageContact,
	WebhookMetadata,
	WebhookPayload,
	WebhookPricing,
	WebhookReferral,
	WebhookStatus,
	WebhookValue,
} from '@whatsapp-cloudapi/types/webhook';
import type { Context, Env, Handler } from 'hono';
import { InvalidWhatsAppConversationKeyError, InvalidWhatsAppInputError } from './errors.ts';
import { createWhatsAppVerificationHandler, createWhatsAppWebhookHandler } from './webhook.ts';

export { InvalidWhatsAppConversationKeyError, InvalidWhatsAppInputError } from './errors.ts';

/**
 * Provider-shaped WhatsApp Cloud API webhook payload types, re-exported from
 * the community-maintained `@whatsapp-cloudapi/types` package. Field names,
 * nesting, and discriminants match Meta's documented wire shape.
 */
export type {
	WebhookChange,
	WebhookContact,
	WebhookConversation,
	WebhookEntry,
	WebhookError,
	WebhookMessage,
	WebhookMessageContact,
	WebhookMetadata,
	WebhookPayload,
	WebhookPricing,
	WebhookReferral,
	WebhookStatus,
	WebhookValue,
};

/** Provider-native WhatsApp Cloud API webhook payload. */
export type WhatsAppWebhookPayload = WebhookPayload;

export type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue };

export interface ChannelRoute<E extends Env = Env> {
	readonly method: string;
	readonly path: string;
	readonly handler: Handler<E>;
}

/** Ingress configuration for verified WhatsApp Business Cloud webhooks. */
export interface WhatsAppChannelOptions<E extends Env = Env> {
	/** Meta app secret used to verify exact POST request bytes. */
	appSecret: string;
	/** User-chosen token configured for Meta's GET verification handshake. */
	verifyToken: string;
	/** Maximum POST body size in bytes. Defaults to 3 * 1024 * 1024. */
	bodyLimit?: number;
	/** Receives one verified, provider-native delivery with all batched changes preserved. */
	webhook(input: WhatsAppWebhookHandlerInput<E>): WhatsAppHandlerResult;
}

/** Stable WhatsApp destination suitable for a Bapx agent-instance id. */
export type WhatsAppConversationRef =
	| {
			type: 'individual';
			businessAccountId: string;
			phoneNumberId: string;
			destination:
				| {
						type: 'phone-number';
						phoneNumber: string;
				  }
				| {
						type: 'user-id';
						userId: string;
				  };
	  }
	| {
			type: 'group';
			businessAccountId: string;
			phoneNumberId: string;
			groupId: string;
	  };

type WhatsAppHandlerValue = undefined | JsonValue | Response;

/**
 * Returning nothing produces an empty `200`. JSON-compatible values become
 * JSON responses, and Hono or Fetch responses pass through unchanged.
 */
export type WhatsAppHandlerResult = WhatsAppHandlerValue | Promise<WhatsAppHandlerValue>;

/** Input delivered to the verified WhatsApp webhook callback. */
export interface WhatsAppWebhookHandlerInput<E extends Env = Env> {
	c: Context<E>;
	/** Provider-native payload after exact-body signature verification. */
	payload: WhatsAppWebhookPayload;
}

/** Verified WhatsApp ingress and canonical destination identity helpers. */
export interface WhatsAppChannel<E extends Env = Env> {
	readonly routes: readonly ChannelRoute<E>[];
	/** Serializes a canonical namespaced identifier. It is not an authorization capability. */
	conversationKey(ref: WhatsAppConversationRef): string;
	/** Parses only canonical keys produced by `conversationKey()`. */
	parseConversationKey(id: string): WhatsAppConversationRef;
}

/**
 * Creates GET verification and POST delivery routes for verified WhatsApp
 * Business Cloud webhooks.
 *
 * The GET route answers Meta's `hub.challenge` handshake. The POST route
 * verifies the exact request bytes with the app secret and forwards Meta's
 * provider-native webhook payload unmodified. Filtering deliveries by
 * business account or phone number (`metadata.phone_number_id`) is application
 * policy. The channel is stateless and does not deduplicate message ids or
 * retries.
 */
export function createWhatsAppChannel<E extends Env = Env>(
	options: WhatsAppChannelOptions<E>,
): WhatsAppChannel<E> {
	validateOptions(options);
	const channel: WhatsAppChannel<E> = {
		routes: [
			{
				method: 'GET',
				path: '/webhook',
				handler: createWhatsAppVerificationHandler(options),
			},
			{
				method: 'POST',
				path: '/webhook',
				handler: createWhatsAppWebhookHandler(options),
			},
		],
		conversationKey(ref) {
			assertConversationRef(ref);
			const base = [
				'whatsapp',
				'v1',
				'business-account',
				encodeURIComponent(ref.businessAccountId),
				'phone-number',
				encodeURIComponent(ref.phoneNumberId),
			];
			return ref.type === 'group'
				? [...base, 'group', encodeURIComponent(ref.groupId)].join(':')
				: [
						...base,
						'individual',
						ref.destination.type,
						encodeURIComponent(
							ref.destination.type === 'phone-number'
								? ref.destination.phoneNumber
								: ref.destination.userId,
						),
					].join(':');
		},
		parseConversationKey(id) {
			try {
				const groupMatch =
					/^whatsapp:v1:business-account:([^:]+):phone-number:([^:]+):group:([^:]+)$/.exec(id);
				const individualMatch =
					/^whatsapp:v1:business-account:([^:]+):phone-number:([^:]+):individual:(phone-number|user-id):([^:]+)$/.exec(
						id,
					);
				const match = groupMatch ?? individualMatch;
				if (!match) throw new InvalidWhatsAppConversationKeyError();
				const [, businessAccountId, phoneNumberId] = match;
				if (!businessAccountId || !phoneNumberId) {
					throw new InvalidWhatsAppConversationKeyError();
				}
				const common = {
					businessAccountId: decodeURIComponent(businessAccountId),
					phoneNumberId: decodeURIComponent(phoneNumberId),
				};
				let ref: WhatsAppConversationRef;
				if (groupMatch) {
					const groupId = groupMatch[3];
					if (!groupId) throw new InvalidWhatsAppConversationKeyError();
					ref = { type: 'group', ...common, groupId: decodeURIComponent(groupId) };
				} else {
					const destinationType = individualMatch?.[3];
					const destinationValue = individualMatch?.[4];
					if (!destinationType || !destinationValue) {
						throw new InvalidWhatsAppConversationKeyError();
					}
					ref = {
						type: 'individual',
						...common,
						destination:
							destinationType === 'phone-number'
								? {
										type: destinationType,
										phoneNumber: decodeURIComponent(destinationValue),
									}
								: {
										type: 'user-id',
										userId: decodeURIComponent(destinationValue),
									},
					};
				}
				assertConversationRef(ref);
				if (channel.conversationKey(ref) !== id) {
					throw new InvalidWhatsAppConversationKeyError();
				}
				return ref;
			} catch (error) {
				if (error instanceof InvalidWhatsAppConversationKeyError) throw error;
				throw new InvalidWhatsAppConversationKeyError();
			}
		},
	};
	return channel;
}

function validateOptions<E extends Env>(options: WhatsAppChannelOptions<E>): void {
	if (!options || typeof options !== 'object') {
		throw new TypeError('createWhatsAppChannel() requires an options object.');
	}
	for (const field of ['appSecret', 'verifyToken'] as const) {
		if (typeof options[field] !== 'string' || options[field].length === 0) {
			throw new InvalidWhatsAppInputError(field);
		}
	}
	if (typeof options.webhook !== 'function') {
		throw new InvalidWhatsAppInputError('webhook');
	}
}

function assertConversationRef(ref: WhatsAppConversationRef): void {
	if (!ref || typeof ref !== 'object') throw new InvalidWhatsAppInputError('ref');
	assertSegment(ref.businessAccountId, 'conversation.businessAccountId');
	assertSegment(ref.phoneNumberId, 'conversation.phoneNumberId');
	if (ref.type === 'individual') {
		if (!ref.destination || typeof ref.destination !== 'object') {
			throw new InvalidWhatsAppInputError('conversation.destination');
		}
		if (ref.destination.type === 'phone-number') {
			assertSegment(ref.destination.phoneNumber, 'conversation.destination.phoneNumber');
			return;
		}
		if (ref.destination.type === 'user-id') {
			assertSegment(ref.destination.userId, 'conversation.destination.userId');
			return;
		}
		throw new InvalidWhatsAppInputError('conversation.destination.type');
	}
	if (ref.type === 'group') {
		assertSegment(ref.groupId, 'conversation.groupId');
		return;
	}
	throw new InvalidWhatsAppInputError('conversation.type');
}

function assertSegment(value: unknown, field: string): asserts value is string {
	if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
		throw new InvalidWhatsAppInputError(field);
	}
}
