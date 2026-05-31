/** Runtime provider registries consumed by `resolveModel` and Session. */

import {
	getModel,
	type KnownProvider,
	registerApiProvider as piRegisterApiProvider,
	type Api,
	type Model,
} from '@earendil-works/pi-ai';
import type { CloudflareGatewayOptions } from '../cloudflare/gateway.ts';
import { CLOUDFLARE_AI_BINDING_API } from '../cloudflare-model.ts';
import type { ProviderSettings } from '../types.ts';

// ─── Public types ───────────────────────────────────────────────────────────

/**
 * Minimal Workers AI binding shape. Kept structural so `@flue/runtime` stays
 * importable on Node.
 */
export interface CloudflareAIBinding {
	run(
		modelId: string,
		inputs: Record<string, unknown>,
		options?: Record<string, unknown>,
	): Promise<Response | Record<string, unknown>>;
}

/**
 * Provider declarations keyed by provider ID. HTTP providers carry endpoint
 * settings; Workers AI binding providers carry the captured binding object.
 */
export type ProviderRegistration =
	| HttpProviderRegistration
	| CloudflareAIBindingRegistration;

/** Register an HTTP-backed provider ID with {@link registerProvider}. */
export interface HttpProviderRegistration {
	api: Api;
	/** Endpoint root, e.g. `'https://api.anthropic.com/v1'`. */
	baseUrl: string;
	/**
	 * Optional API key. Propagated to pi-ai via the harness's per-call
	 * `getApiKey(providerId)` callback. Falls back to whatever pi-ai's normal
	 * env-var lookup produces if unset.
	 */
	apiKey?: string;
	/** Optional default headers for every outgoing request. */
	headers?: Record<string, string>;
	/**
	 * Default `contextWindow` (in tokens) for every model resolved through
	 * this registration. Overridden per-model via {@link models}. Unset is
	 * `0`, which the runtime treats as "unknown".
	 */
	contextWindow?: number;
	/**
	 * Default `maxTokens` for every model resolved through this registration.
	 * Overridden per-model via {@link models}. Unset is `0`.
	 */
	maxTokens?: number;
	/** Per-model overrides for {@link contextWindow} and {@link maxTokens}, keyed by model ID. */
	models?: Record<string, { contextWindow?: number; maxTokens?: number }>;
}

/** Register a Workers AI binding-backed provider ID with {@link registerProvider}. */
export interface CloudflareAIBindingRegistration {
	api: typeof CLOUDFLARE_AI_BINDING_API;
	/** The captured `env.AI` reference. Read at registration time. */
	binding: CloudflareAIBinding;
	/**
	 * AI Gateway options forwarded to every `env.AI.run(...)` call routed
	 * through this registration.
	 *
	 * - Omitted: routes through Cloudflare's default AI Gateway, which the
	 *   binding spins up on demand for the account.
	 * - Options object: replaces the default. Specify `id` plus any other
	 *   knobs (cache, metadata, logging).
	 * - `false`: opts out — no gateway is passed to `ai.run`.
	 *
	 * See https://developers.cloudflare.com/ai-gateway/integrations/worker-binding-methods/.
	 */
	gateway?: CloudflareGatewayOptions | false;
}

/**
 * pi-ai's open-ended `Api` type prevents direct discriminator narrowing.
 */
function isCloudflareBindingRegistration(
	def: ProviderRegistration,
): def is CloudflareAIBindingRegistration {
	return def.api === CLOUDFLARE_AI_BINDING_API;
}

// ─── Registry ───────────────────────────────────────────────────────────────

/**
 * Provider registry populated at module init by `app.ts` and generated
 * server entries.
 */
const providersById = new Map<string, ProviderRegistration>();

/**
 * Register a model provider keyed by the provider ID used in model specifiers.
 *
 * Last-write-wins. On Cloudflare, registering the `cloudflare` provider ID in
 * `app.ts` takes precedence over the generated Workers AI binding default.
 */
export function registerProvider(
	providerId: string,
	registration: ProviderRegistration,
): void {
	providersById.set(providerId, registration);
}


/** Whether a provider ID has already been registered. */
export function hasRegisteredProvider(providerId: string): boolean {
	return providersById.has(providerId);
}

/** Look up an API key registered for a provider ID. */
export function getRegisteredApiKey(providerId: string): string | undefined {
	const registration = providersById.get(providerId);
	if (!registration || isCloudflareBindingRegistration(registration)) return undefined;
	return registration.apiKey;
}

/**
 * Re-export of pi-ai's `registerApiProvider`. Use to register a brand-new
 * wire-protocol handler for an `api` slug pi-ai doesn't ship. Then call
 * {@link registerProvider} to associate a provider ID with that api.
 *
 * ```ts
 * registerApiProvider({ api: 'my-novel-api', stream, streamSimple });
 * registerProvider('thing', { api: 'my-novel-api', baseUrl: '...', apiKey: '...' });
 * ```
 *
 * pi-ai's registry is also module-scoped and last-write-wins. Calling
 * `registerApiProvider` repeatedly with the same `api` string overwrites,
 * so generated code can register on every isolate boot without dedupe
 * bookkeeping.
 */
export const registerApiProvider = piRegisterApiProvider;

// ─── Provider override registry ─────────────────────────────────────────────
//
// Transport-level settings keyed by provider ID. This keeps built-in catalog
// metadata intact while letting apps patch auth/endpoints.

/**
 * Provider settings accepted by {@link configureProvider}.
 */
export type ProviderConfiguration = ProviderSettings;

const providerSettingsById = new Map<string, ProviderSettings>();

// TODO: Decide whether repeated configureProvider() calls should compose partial
// settings or intentionally replace the previous object.

/**
 * Configure transport-level settings on an existing provider while preserving
 * its resolved Model metadata (cost, context window, token limits, etc.).
 * Repeated calls for the same provider ID replace the previous settings object.
 *
 * ```ts
 * import { configureProvider } from '@flue/runtime';
 *
 * configureProvider('anthropic', {
 *   baseUrl: 'https://gateway.example.com/anthropic',
 *   apiKey: process.env.GATEWAY_KEY,
 * });
 * ```
 *
 * Keyed by provider ID. Last-write-wins.
 */
export function configureProvider(
	providerId: string,
	settings: ProviderConfiguration,
): void {
	providerSettingsById.set(providerId, settings);
}

/** Internal read accessor for provider settings. */
export function getProviderConfiguration(
	providerId: string,
): ProviderSettings | undefined {
	return providerSettingsById.get(providerId);
}

// ─── Model binding extension ────────────────────────────────────────────────

/**
 * Resolved Model with the captured Workers AI binding (and optional AI
 * Gateway options) attached as non-pi-ai extension fields. Flows from the
 * registration through the resolved Model to the Workers AI stream
 * function without going through AsyncLocalStorage.
 */
type ModelWithBinding<TApi extends Api> = Model<TApi> & {
	binding: CloudflareAIBinding;
	gateway?: CloudflareGatewayOptions | false;
};

/** Attach a Workers AI binding (and optional gateway options) to a Model literal. */
function attachModelBinding<TApi extends Api>(
	model: Model<TApi>,
	binding: CloudflareAIBinding,
	gateway?: CloudflareGatewayOptions | false,
): ModelWithBinding<TApi> {
	return { ...model, binding, gateway } as ModelWithBinding<TApi>;
}

/**
 * Read a Workers AI binding off a resolved Model, or `undefined` if no
 * usable binding is attached.
 */
export function getModelBinding<TApi extends Api>(
	model: Model<TApi>,
): CloudflareAIBinding | undefined {
	const candidate = (model as Model<TApi> & { binding?: unknown }).binding;
	if (!candidate || typeof (candidate as { run?: unknown }).run !== 'function') {
		return undefined;
	}
	return candidate as CloudflareAIBinding;
}

// ─── Internal helpers ───────────────────────────────────────────────────────

/** Resolve `'provider-id/model-id'` against the provider registry. */
export function resolveRegisteredModel(
	providerId: string,
	modelId: string,
): Model<Api> | undefined {
	const registration = providersById.get(providerId);
	if (!registration) return undefined;
	return buildModelFromRegistration(providerId, registration, modelId);
}

/**
 * Construct a pi-ai Model from a registered provider template. Binding
 * registrations hydrate metadata from pi-ai's `cloudflare-workers-ai`
 * catalog; HTTP registrations supply their own metadata, with any unset
 * fields defaulting to zero.
 */
function buildModelFromRegistration(
	providerId: string,
	registration: ProviderRegistration,
	modelId: string,
): Model<Api> {
	if (isCloudflareBindingRegistration(registration)) {
		// pi-ai's catalog covers only the chat-completion subset of Workers AI;
		// fall back to zero metadata for ids it doesn't know. The `shouldCompact`
		// guard treats `contextWindow <= 0` as unknown.
		const catalog = getModel('cloudflare-workers-ai' as KnownProvider, modelId as never);
		const base: Model<Api> = catalog
			? { ...catalog, api: CLOUDFLARE_AI_BINDING_API, provider: providerId, baseUrl: '' }
			: {
					id: modelId,
					name: modelId,
					api: CLOUDFLARE_AI_BINDING_API,
					provider: providerId,
					baseUrl: '',
					reasoning: false,
					input: ['text'],
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
					contextWindow: 0,
					maxTokens: 0,
				};
		return attachModelBinding(base, registration.binding, registration.gateway);
	}

	return {
		id: modelId,
		name: modelId,
		api: registration.api,
		provider: providerId,
		baseUrl: registration.baseUrl,
		reasoning: false,
		input: ['text'],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: registration.models?.[modelId]?.contextWindow ?? registration.contextWindow ?? 0,
		maxTokens: registration.models?.[modelId]?.maxTokens ?? registration.maxTokens ?? 0,
		headers: registration.headers,
	};
}
