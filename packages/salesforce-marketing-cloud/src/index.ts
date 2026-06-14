import type { Context, Env, Handler } from 'hono';
import { createSalesforceMarketingCloudEventsHandler } from './webhook.ts';

/** JSON-compatible provider value. */
export type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue };

/** JSON object used for provider-native Marketing Cloud fields. */
export type JsonObject = { [key: string]: JsonValue };

/** Fixed route declaration consumed by Flue channel discovery. */
export interface ChannelRoute<E extends Env = Env> {
	readonly method: string;
	readonly path: string;
	readonly handler: Handler<E>;
}

/** One unsigned callback-ownership challenge sent while configuring ENS. */
export interface SalesforceMarketingCloudVerification {
	/** Callback id assigned by Marketing Cloud Engagement. */
	callbackId: string;
	/** One-time key submitted separately to the ENS verification API. */
	verificationKey: string;
}

/**
 * One verified Marketing Cloud Engagement event.
 *
 * ENS event families do not share a closed schema. The durable common fields
 * are normalized and the complete provider object remains available as `raw`.
 */
export interface SalesforceMarketingCloudEvent {
	/** Open provider event taxonomy, such as `EngagementEvents.EmailOpen`. */
	eventCategoryType: string;
	/** Provider UTC epoch timestamp. */
	timestampUTC: number;
	/** Deprecated tracking id present on some event families. */
	compositeId?: string;
	/** Marketing Cloud business-unit id when supplied by the event family. */
	mid?: number | string;
	/** Marketing Cloud enterprise id when supplied by the event family. */
	eid?: number | string;
	/** Event-specific details when the provider family uses an `info` object. */
	info?: JsonObject;
	/** Complete parsed provider event, including future fields. */
	raw: JsonObject;
}

/** One authenticated, ordered ENS delivery batch. */
export interface SalesforceMarketingCloudBatch {
	/** Events in provider delivery order. */
	events: SalesforceMarketingCloudEvent[];
	/** Exact UTF-8 body after successful signature verification. */
	rawBody: string;
}

export interface SalesforceMarketingCloudVerificationHandlerInput<E extends Env = Env> {
	/** Authentic Hono context for the discovered route. */
	c: Context<E>;
	/** Unsigned one-time setup challenge. */
	verification: SalesforceMarketingCloudVerification;
}

export interface SalesforceMarketingCloudEventsHandlerInput<E extends Env = Env> {
	/** Authentic Hono context for the discovered route. */
	c: Context<E>;
	/** Verified ENS delivery batch. */
	batch: SalesforceMarketingCloudBatch;
}

type SalesforceMarketingCloudHandlerValue = undefined | JsonValue | Response;

/**
 * Returning no value or JSON responds with `200`. A returned `Response`
 * passes through. ENS acknowledges only statuses `200` through `204`.
 */
export type SalesforceMarketingCloudHandlerResult =
	| SalesforceMarketingCloudHandlerValue
	| Promise<SalesforceMarketingCloudHandlerValue>;

/** Ingress configuration for one Marketing Cloud Engagement ENS callback. */
export interface SalesforceMarketingCloudChannelOptions<E extends Env = Env> {
	/**
	 * Callback-specific signature key returned once during ENS callback
	 * creation. Marketing Cloud uses this opaque string directly as the HMAC
	 * key; only the signature header is base64-decoded.
	 */
	signatureKey?: string;
	/** Optional callback-id restriction for the unsigned setup challenge. */
	callbackId?: string;
	/** Maximum request-body size in bytes. Defaults to 1 MiB. */
	bodyLimit?: number;
	/**
	 * Complete route deadline. Defaults to and may not exceed 2500ms, leaving
	 * time before ENS's three-second delivery timeout.
	 *
	 * Timed-out work may continue after the failure response.
	 */
	handlerTimeoutMs?: number;
	/**
	 * Optional setup-only handler for the unsigned callback-verification
	 * challenge. Unsigned requests are rejected when this is omitted. Flue
	 * returns the required empty `200` after the handler completes.
	 */
	verification?(input: SalesforceMarketingCloudVerificationHandlerInput<E>): void | Promise<void>;
	/** Receives every authenticated ENS notification batch. */
	events(
		input: SalesforceMarketingCloudEventsHandlerInput<E>,
	): SalesforceMarketingCloudHandlerResult;
}

/** Verified Marketing Cloud Engagement ENS ingress. */
export interface SalesforceMarketingCloudChannel<E extends Env = Env> {
	/** Fixed route declarations published beneath the discovered channel path. */
	readonly routes: readonly ChannelRoute<E>[];
}

/**
 * Creates one Marketing Cloud Engagement Event Notification Service route.
 *
 * The route is fixed at `POST /events`. Callback verification is an unsigned
 * setup handshake; event batches require `x-sfmc-ens-signature`.
 */
export function createSalesforceMarketingCloudChannel<E extends Env = Env>(
	options: SalesforceMarketingCloudChannelOptions<E>,
): SalesforceMarketingCloudChannel<E> {
	validateOptions(options);
	return {
		routes: [
			{
				method: 'POST',
				path: '/events',
				handler: createSalesforceMarketingCloudEventsHandler(options),
			},
		],
	};
}

function validateOptions<E extends Env>(options: SalesforceMarketingCloudChannelOptions<E>): void {
	if (!options || typeof options !== 'object') {
		throw new TypeError('createSalesforceMarketingCloudChannel() requires an options object.');
	}
	if (
		options.signatureKey !== undefined &&
		(typeof options.signatureKey !== 'string' || options.signatureKey.length === 0)
	) {
		throw new TypeError('Salesforce Marketing Cloud signatureKey must be non-empty.');
	}
	if (
		options.callbackId !== undefined &&
		(typeof options.callbackId !== 'string' ||
			options.callbackId.length === 0 ||
			options.callbackId.trim() !== options.callbackId)
	) {
		throw new TypeError(
			'Salesforce Marketing Cloud callbackId must be a non-empty trimmed string.',
		);
	}
	if (options.verification !== undefined && typeof options.verification !== 'function') {
		throw new TypeError('Salesforce Marketing Cloud verification must be a function.');
	}
	if (typeof options.events !== 'function') {
		throw new TypeError('createSalesforceMarketingCloudChannel() requires an events handler.');
	}
}
