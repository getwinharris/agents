import type { FlueContext, FlueEvent, FlueEventSubscriber } from '@flue/runtime';
import {
	type Attributes,
	type Context,
	context,
	type Span,
	SpanKind,
	type SpanOptions,
	SpanStatusCode,
	type Tracer,
	trace,
} from '@opentelemetry/api';

export interface OpenTelemetryObserverOptions {
	tracer?: Tracer;
	sanitize?: (event: FlueEvent) => FlueEvent | undefined;
	resolveRootContext?: (event: FlueEvent, ctx: FlueContext) => Context | undefined;
}

export function createOpenTelemetryObserver(
	options: OpenTelemetryObserverOptions = {},
): FlueEventSubscriber {
	const tracer = options.tracer ?? trace.getTracer('@flue/opentelemetry');
	const sanitize = options.sanitize;
	const resolveRootContext = options.resolveRootContext;
	const runs = new Map<string, Span>();
	const recoveryHandledRuns = new Set<string>();
	const operations = new Map<string, Span>();
	const turns = new Map<string, Span>();
	const tools = new Map<string, Span>();
	const tasks = new Map<string, Span>();
	const compactions = new Map<string, Span>();

	return (event, ctx) => {
		const time = timestamp(event);
		if (event.type === 'run_start') {
			const exportedEvent = sanitizeEvent(sanitize, event);
			runs.set(
				event.runId,
				startSpan(
					tracer,
					`flue.workflow ${event.workflowName}`,
					undefined,
					event,
					ctx,
					resolveRootContext,
					{
						kind: SpanKind.INTERNAL,
						startTime: new Date(event.startedAt),
						attributes: {
							...identifiers(event),
							'flue.workflow.name': event.workflowName,
							...contentAttribute('flue.workflow.payload', exportedEvent?.payload),
						},
					},
				),
			);
			return;
		}
		if (event.type === 'run_resume') {
			const interrupted = runs.get(event.runId);
			if (interrupted) {
				interrupted.setStatus({
					code: SpanStatusCode.ERROR,
					message: 'Workflow execution was interrupted before recovery continued run handling.',
				});
				interrupted.end(time);
			}
			recoveryHandledRuns.add(event.runId);
			runs.set(
				event.runId,
				startSpan(
					tracer,
					`flue.workflow ${event.workflowName}`,
					undefined,
					event,
					ctx,
					resolveRootContext,
					{
						kind: SpanKind.INTERNAL,
						startTime: time,
						attributes: {
							...identifiers(event),
							'flue.workflow.name': event.workflowName,
							'flue.workflow.recovery_handling': true,
							'flue.workflow.started_at': event.startedAt,
						},
					},
				),
			);
			return;
		}
		if (event.type === 'operation_start') {
			const parent = event.taskId ? tasks.get(event.taskId) : workflowSpan(event, runs);
			operations.set(
				event.operationId,
				startSpan(
					tracer,
					`flue.operation ${event.operationKind}`,
					parent,
					event,
					ctx,
					resolveRootContext,
					{
						startTime: time,
						attributes: { ...identifiers(event), 'flue.operation.kind': event.operationKind },
					},
				),
			);
			return;
		}
		if (event.type === 'task_start') {
			const exportedEvent = sanitizeEvent(sanitize, event);
			const parent = operationSpan(event, operations) ?? workflowSpan(event, runs);
			tasks.set(
				event.taskId,
				startSpan(
					tracer,
					event.agent ? `flue.task ${event.agent}` : 'flue.task',
					parent,
					event,
					ctx,
					resolveRootContext,
					{
						startTime: time,
						attributes: {
							...identifiers(event),
							...(event.agent ? { 'flue.task.agent': event.agent } : {}),
							...(exportedEvent?.cwd ? { 'flue.task.cwd': exportedEvent.cwd } : {}),
							...contentAttribute('flue.task.prompt', exportedEvent?.prompt),
						},
					},
				),
			);
			return;
		}
		if (event.type === 'compaction_start') {
			const parent = operationSpan(event, operations) ?? workflowSpan(event, runs);
			compactions.set(
				compactionKey(event),
				startSpan(tracer, 'flue.compaction', parent, event, ctx, resolveRootContext, {
					startTime: time,
					attributes: {
						...identifiers(event),
						'flue.compaction.reason': event.reason,
						'flue.compaction.estimated_tokens': event.estimatedTokens,
					},
				}),
			);
			return;
		}
		if (event.type === 'turn_request') {
			const exportedEvent = sanitizeEvent(sanitize, event);
			const parent =
				event.purpose === 'agent'
					? (operationSpan(event, operations) ?? workflowSpan(event, runs))
					: (compactions.get(compactionKey(event)) ??
						operationSpan(event, operations) ??
						workflowSpan(event, runs));
			turns.set(
				event.turnId,
				startSpan(tracer, 'gen_ai.generate', parent, event, ctx, resolveRootContext, {
					startTime: time,
					attributes: {
						...identifiers(event),
						'flue.turn.purpose': event.purpose,
						'gen_ai.operation.name': 'chat',
						'gen_ai.provider.name': event.provider,
						'gen_ai.request.model': event.model,
						'flue.provider.api': event.api,
						...(event.reasoning ? { 'flue.reasoning': event.reasoning } : {}),
						...contentAttribute('flue.turn.input', exportedEvent?.input),
					},
				}),
			);
			return;
		}
		if (event.type === 'tool_start') {
			const exportedEvent = sanitizeEvent(sanitize, event);
			const parent =
				(event.turnId ? turns.get(event.turnId) : undefined) ??
				operationSpan(event, operations) ??
				workflowSpan(event, runs);
			tools.set(
				toolKey(event),
				startSpan(tracer, `flue.tool ${event.toolName}`, parent, event, ctx, resolveRootContext, {
					startTime: time,
					attributes: {
						...identifiers(event),
						'flue.tool.name': event.toolName,
						'flue.tool.call_id': event.toolCallId,
						...contentAttribute('flue.tool.arguments', exportedEvent?.args),
					},
				}),
			);
			return;
		}
		if (event.type === 'tool_call') {
			const span = tools.get(toolKey(event));
			if (!span) return;
			const exportedEvent = sanitizeEvent(sanitize, event);
			span.setAttributes({
				'flue.duration_ms': event.durationMs,
				...eventIndexAttribute('end', event),
			});
			setContentAttribute(span, 'flue.tool.result', exportedEvent?.result);
			complete(span, event.isError, exportedEvent?.result, 'Tool call failed.', time);
			tools.delete(toolKey(event));
			return;
		}
		if (event.type === 'turn') {
			const span = turns.get(event.turnId);
			if (!span) return;
			const exportedEvent = sanitizeEvent(sanitize, event);
			span.setAttributes({
				'flue.duration_ms': event.durationMs,
				...eventIndexAttribute('end', event),
				...(event.model ? { 'gen_ai.response.model': event.model } : {}),
				...(event.provider ? { 'gen_ai.provider.name': event.provider } : {}),
				...(event.api ? { 'flue.provider.api': event.api } : {}),
				...(event.stopReason ? { 'gen_ai.response.finish_reasons': [event.stopReason] } : {}),
				...usageAttributes(event.usage),
			});
			setContentAttribute(span, 'flue.turn.output', exportedEvent?.output);
			complete(span, event.isError, exportedEvent?.error, 'Model turn failed.', time);
			turns.delete(event.turnId);
			return;
		}
		if (event.type === 'compaction') {
			const key = compactionKey(event);
			const span = compactions.get(key);
			if (!span) return;
			span.setAttributes({
				'flue.duration_ms': event.durationMs,
				...eventIndexAttribute('end', event),
				'flue.compaction.messages_before': event.messagesBefore,
				'flue.compaction.messages_after': event.messagesAfter,
				...usageAttributes(event.usage, 'flue.compaction.usage'),
			});
			span.end(time);
			compactions.delete(key);
			return;
		}
		if (event.type === 'task') {
			const span = tasks.get(event.taskId);
			if (!span) return;
			const exportedEvent = sanitizeEvent(sanitize, event);
			span.setAttributes({
				'flue.duration_ms': event.durationMs,
				...eventIndexAttribute('end', event),
			});
			setContentAttribute(span, 'flue.task.result', exportedEvent?.result);
			complete(span, event.isError, exportedEvent?.result, 'Task failed.', time);
			tasks.delete(event.taskId);
			return;
		}
		if (event.type === 'log') {
			const span =
				(event.turnId ? turns.get(event.turnId) : undefined) ??
				operationSpan(event, operations) ??
				workflowSpan(event, runs);
			if (!span) return;
			const exportedEvent = sanitizeEvent(sanitize, event);
			span.addEvent(
				'flue.log',
				{
					'flue.log.level': event.level,
					...eventIndexAttribute('index', event),
					...contentAttribute('flue.log.message', exportedEvent?.message),
					...contentAttribute('flue.log.attributes', exportedEvent?.attributes),
				},
				time,
			);
			return;
		}
		if (event.type === 'operation') {
			const span = operations.get(event.operationId);
			if (!span) return;
			const exportedEvent = sanitizeEvent(sanitize, event);
			span.setAttributes({
				'flue.duration_ms': event.durationMs,
				...eventIndexAttribute('end', event),
				...usageAttributes(event.usage, 'flue.operation.usage'),
			});
			setContentAttribute(span, 'flue.operation.result', exportedEvent?.result);
			complete(span, event.isError, exportedEvent?.error, 'Operation failed.', time);
			operations.delete(event.operationId);
			const key = compactionKey(event);
			const compaction = compactions.get(key);
			if (compaction) {
				compaction.setStatus({
					code: SpanStatusCode.ERROR,
					message: 'Operation ended without a terminal compaction event.',
				});
				compaction.end(time);
				compactions.delete(key);
			}
			return;
		}
		if (event.type === 'run_end') {
			const span = runs.get(event.runId);
			if (!span) return;
			const exportedEvent = sanitizeEvent(sanitize, event);
			span.setAttributes({
				[recoveryHandledRuns.has(event.runId)
					? 'flue.workflow.total_duration_ms'
					: 'flue.duration_ms']: event.durationMs,
				...eventIndexAttribute('end', event),
			});
			setContentAttribute(span, 'flue.workflow.result', exportedEvent?.result);
			complete(span, event.isError, exportedEvent?.error, 'Workflow run failed.', time);
			runs.delete(event.runId);
			recoveryHandledRuns.delete(event.runId);
		}
	};
}

function startSpan(
	tracer: Tracer,
	name: string,
	parent: Span | undefined,
	event: FlueEvent,
	ctx: FlueContext,
	resolveRootContext: OpenTelemetryObserverOptions['resolveRootContext'],
	options: SpanOptions,
): Span {
	const parentContext = parent
		? trace.setSpan(context.active(), parent)
		: resolveRootContext?.(event, ctx);
	return tracer.startSpan(
		name,
		{
			...options,
			root: parentContext === undefined,
			attributes: { ...options.attributes, ...eventIndexAttribute('start', event) },
		},
		parentContext,
	);
}

function workflowSpan(event: FlueEvent, runs: Map<string, Span>): Span | undefined {
	return event.runId ? runs.get(event.runId) : undefined;
}

function operationSpan(event: FlueEvent, operations: Map<string, Span>): Span | undefined {
	return event.operationId ? operations.get(event.operationId) : undefined;
}

function compactionKey(event: FlueEvent): string {
	return `${event.runId ?? event.instanceId ?? ''}:${event.session ?? ''}:${event.operationId ?? ''}`;
}

function toolKey(event: FlueEvent & { toolCallId: string }): string {
	return `${event.turnId ?? event.operationId ?? event.taskId ?? event.runId ?? event.instanceId ?? ''}:${event.toolCallId}`;
}

function identifiers(event: FlueEvent): Attributes {
	return Object.fromEntries(
		Object.entries({
			'flue.run_id': event.runId,
			'flue.instance_id': event.instanceId,
			'flue.dispatch_id': event.dispatchId,
			'flue.harness.name': event.harness,
			'flue.session.name': event.session,
			'flue.parent_session.name': event.parentSession,
			'flue.operation.id': event.operationId,
			'flue.task.id': event.taskId,
			'flue.turn.id': event.turnId,
		}).filter((entry): entry is [string, string] => entry[1] !== undefined),
	);
}

function eventIndexAttribute(scope: 'start' | 'end' | 'index', event: FlueEvent): Attributes {
	if (event.eventIndex === undefined) return {};
	return {
		[scope === 'index' ? 'flue.event.index' : `flue.event.${scope}_index`]: event.eventIndex,
	};
}

function usageAttributes(
	usage: Extract<FlueEvent, { type: 'turn' }>['usage'],
	prefix = 'gen_ai.usage',
): Attributes {
	if (!usage) return {};
	return {
		[`${prefix}.input_tokens`]: usage.input,
		[`${prefix}.output_tokens`]: usage.output,
		[`${prefix}.cache_read_tokens`]: usage.cacheRead,
		[`${prefix}.cache_write_tokens`]: usage.cacheWrite,
		[`${prefix}.total_tokens`]: usage.totalTokens,
		[`${prefix}.cost_total`]: usage.cost.total,
	};
}

function sanitizeEvent<TEvent extends FlueEvent>(
	sanitize: OpenTelemetryObserverOptions['sanitize'],
	event: TEvent,
): TEvent | undefined {
	try {
		return sanitize?.({ ...event }) as TEvent | undefined;
	} catch (error) {
		console.error('[flue:opentelemetry] sanitizer failed:', error);
		return undefined;
	}
}

function contentAttribute(name: string, value: unknown): Attributes {
	if (value === undefined) return {};
	return { [name]: typeof value === 'string' ? value : safeJson(value) };
}

function setContentAttribute(span: Span, name: string, value: unknown): void {
	const attributes = contentAttribute(name, value);
	if (Object.keys(attributes).length > 0) span.setAttributes(attributes);
}

function complete(
	span: Span,
	isError: boolean,
	exportedError: unknown,
	defaultMessage: string,
	time: Date,
): void {
	if (isError) {
		const message = exportedError === undefined ? defaultMessage : errorMessage(exportedError);
		span.setStatus({ code: SpanStatusCode.ERROR, message });
		if (message) span.recordException(message);
	}
	span.end(time);
}

function errorMessage(error: unknown): string | undefined {
	if (typeof error === 'string') return error;
	if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string')
		return error.message;
	return error === undefined ? undefined : safeJson(error);
}

function safeJson(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function timestamp(event: FlueEvent): Date {
	return event.timestamp ? new Date(event.timestamp) : new Date();
}
