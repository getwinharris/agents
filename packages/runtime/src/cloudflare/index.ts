/**
 * Public authoring surface of `@bapX/runtime/cloudflare`: APIs that user
 * agent/workflow modules import on the Cloudflare target.
 *
 * Generated-entry plumbing lives in `./internal.ts`
 * (`@bapX/runtime/cloudflare/internal`), which also owns the
 * `cloudflare:workers` import graph — keep that virtual module out of this
 * entry's runtime graph (type-only imports are fine; they erase at build).
 */
export type { CloudflareAIBinding, CloudflareAIBindingRegistration } from '../runtime/providers.ts';
export type { CloudflareSandboxOptions, CloudflareSandboxStub } from './cf-sandbox.ts';
export { cloudflareSandbox } from './cf-sandbox.ts';
export type { CloudflareContext, FlueDurableObjectIdentity } from './context.ts';
export { getCloudflareContext, getDurableObjectIdentity } from './context.ts';
export type {
	CloudflareAgentLike,
	CloudflareExtension,
	ExtensionClass,
	GeneratedDurableObjectClass,
} from './extension.ts';
export { extend } from './extension.ts';
export type { CloudflareGatewayOptions } from './gateway.ts';
