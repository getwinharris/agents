import type { BapxObservation } from '@bapX/runtime';
import type { Span } from '@opentelemetry/api';

export type GenAIContentType =
	| 'input_messages'
	| 'output_messages'
	| 'system_instructions'
	| 'tool_definitions'
	| 'tool_description'
	| 'tool_arguments'
	| 'tool_result'
	| 'exception_message';

export interface GenAIContentPolicy {
	enabled: boolean;
	inline?: boolean;
	transform?(content: unknown, scope: GenAIContentScope): unknown | undefined;
	externalContent?(content: unknown, scope: GenAIContentScope & { span: Span }): void;
	limits?: { maxAttributeBytes?: number; maxMessageParts?: number; maxToolDefinitions?: number };
}

export interface GenAIContentScope {
	contentType: GenAIContentType;
	eventType: BapxObservation['type'];
	runId?: string;
	agentName?: string;
	harness?: string;
	session?: string;
	parentSession?: string;
	instanceId?: string;
	submissionId?: string;
	dispatchId?: string;
	conversationId?: string;
	operationId?: string;
	turnId?: string;
	taskId?: string;
}

export interface ContentValueOptions {
	contentType: GenAIContentType;
	rawString?: boolean;
}

export interface ContentValueResult {
	value?: string;
	objectShaped?: boolean;
	truncated?: number;
	omitted?: boolean;
}

export type ContentDiagnostic = (diagnostic: { type: string; message: string; error?: unknown }) => void;

export function validateContentPolicy(policy: false | GenAIContentPolicy | undefined): void {
	if (!policy) return;
	for (const [name, value] of Object.entries(policy.limits ?? {})) {
		if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
			throw new TypeError(`content.limits.${name} must be a finite nonnegative safe integer.`);
		}
	}
}

export function contentValue(
	policy: false | GenAIContentPolicy | undefined,
	content: unknown,
	event: BapxObservation,
	span: Span,
	options: ContentValueOptions,
	diagnostic?: ContentDiagnostic,
): ContentValueResult {
	if (policy === false || !policy?.enabled || content === undefined) return {};
	const scope = contentScope(event, options.contentType);
	let transformed: unknown;
	try {
		transformed = policy.transform ? policy.transform(detach(content), scope) : detach(content);
	} catch {
		report(diagnostic, { type: 'content_transform_error', message: 'Content transform failed.' });
		return {};
	}
	if (transformed === undefined) return {};

	let limited: { value: unknown; truncated?: number };
	try {
		limited = applyStructuralLimit(detach(transformed), options.contentType, policy);
	} catch {
		report(diagnostic, { type: 'content_policy_error', message: 'Content policy processing failed.' });
		return {};
	}

	if (policy.externalContent && isExternalContent(options.contentType)) {
		try {
			policy.externalContent(detach(limited.value), { ...scope, span });
		} catch {
			report(diagnostic, { type: 'external_content_error', message: 'External content delivery failed.' });
		}
	}
	if (policy.inline === false) return limited.truncated ? { truncated: limited.truncated } : {};

	const objectShaped = isPlainObject(limited.value);
	let serialized: string | undefined;
	try {
		serialized = options.rawString && typeof limited.value === 'string'
			? limited.value
			: JSON.stringify(limited.value);
	} catch {
		report(diagnostic, { type: 'content_serialization_error', message: 'Content serialization failed.' });
		return { truncated: limited.truncated };
	}
	if (serialized === undefined) {
		report(diagnostic, { type: 'content_serialization_error', message: 'Content serialization failed.' });
		return { truncated: limited.truncated };
	}
	if (
		policy.limits?.maxAttributeBytes !== undefined &&
		new TextEncoder().encode(serialized).byteLength > policy.limits.maxAttributeBytes
	) {
		report(diagnostic, { type: 'content_omitted', message: 'Content exceeded maxAttributeBytes.' });
		return { truncated: limited.truncated, omitted: true };
	}
	return { value: serialized, objectShaped, truncated: limited.truncated };
}

function applyStructuralLimit(
	value: unknown,
	contentType: GenAIContentType,
	policy: GenAIContentPolicy,
): { value: unknown; truncated?: number } {
	if (contentType === 'tool_definitions' && policy.limits?.maxToolDefinitions !== undefined && Array.isArray(value)) {
		const retained = value.slice(0, policy.limits.maxToolDefinitions);
		const truncated = value.length - retained.length;
		return { value: retained, ...(truncated > 0 ? { truncated } : {}) };
	}
	const maxMessageParts = policy.limits?.maxMessageParts;
	if (
		(contentType === 'input_messages' || contentType === 'output_messages') &&
		maxMessageParts !== undefined &&
		Array.isArray(value)
	) {
		let truncated = 0;
		const retained = value.map((message) => {
			if (!isRecord(message) || !Array.isArray(message.parts)) return message;
			const parts = message.parts.slice(0, maxMessageParts);
			truncated += message.parts.length - parts.length;
			return { ...message, parts };
		});
		return { value: retained, ...(truncated > 0 ? { truncated } : {}) };
	}
	if (
		contentType === 'system_instructions' &&
		policy.limits?.maxMessageParts !== undefined &&
		Array.isArray(value)
	) {
		const retained = value.slice(0, policy.limits.maxMessageParts);
		const truncated = value.length - retained.length;
		return { value: retained, ...(truncated > 0 ? { truncated } : {}) };
	}
	return { value };
}

function contentScope(event: BapxObservation, contentType: GenAIContentType): GenAIContentScope {
	return {
		contentType,
		eventType: event.type,
		...(event.runId ? { runId: event.runId } : {}),
		...(event.agentName ? { agentName: event.agentName } : {}),
		...(event.harness ? { harness: event.harness } : {}),
		...(event.session ? { session: event.session } : {}),
		...(event.parentSession ? { parentSession: event.parentSession } : {}),
		...(event.instanceId ? { instanceId: event.instanceId } : {}),
		...(event.submissionId ? { submissionId: event.submissionId } : {}),
		...(event.dispatchId ? { dispatchId: event.dispatchId } : {}),
		...(event.conversationId ? { conversationId: event.conversationId } : {}),
		...(event.operationId ? { operationId: event.operationId } : {}),
		...(event.turnId ? { turnId: event.turnId } : {}),
		...(event.taskId ? { taskId: event.taskId } : {}),
	};
}

function isExternalContent(contentType: GenAIContentType): boolean {
	return contentType === 'input_messages' || contentType === 'output_messages' || contentType === 'system_instructions';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (!isRecord(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function report(diagnostic: ContentDiagnostic | undefined, value: Parameters<ContentDiagnostic>[0]): void {
	try {
		diagnostic?.(value);
	} catch {}
}

function detach<T>(value: T): T {
	return structuredClone(value);
}
