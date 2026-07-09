import type { BapxObservation } from '@bapX/runtime';
import { context, propagation, trace } from '@opentelemetry/api';
import * as Sentry from '@sentry/node';
import { afterEach, describe, expect, it } from 'vitest';
import { createOpenTelemetryInstrumentation } from '../src/index.ts';

function observation(value: Record<string, unknown>): BapxObservation {
	return {
		...value,
		v: 3,
		eventIndex: value.eventIndex ?? 0,
		timestamp: value.timestamp ?? '2026-06-22T00:00:00.000Z',
	} as unknown as BapxObservation;
}

const ctx = { id: 'instance-1', agentName: 'assistant', env: {}, req: undefined } as never;

afterEach(async () => {
	await Sentry.close(1_000);
	Sentry.getCurrentScope().setClient(undefined);
	context.disable();
	propagation.disable();
	trace.disable();
});

describe('Sentry OpenTelemetry compatibility', () => {
	it('preserves Bapx GenAI attributes through the Sentry span processor', async () => {
		const spans: Array<Record<string, any>> = [];
		Sentry.init({
			dsn: 'https://public@example.invalid/1',
			defaultIntegrations: false,
			registerEsmLoaderHooks: false,
			tracesSampleRate: 1,
			sendClientReports: false,
			beforeSendSpan(span) {
				spans.push(structuredClone(span));
				return span;
			},
			transport: () => ({
				async send() {
					return { statusCode: 200 };
				},
				async flush() {
					return true;
				},
			}),
		});
		const instrumentation = createOpenTelemetryInstrumentation();
		try {
			instrumentation.observe(observation({
				type: 'turn_request', instanceId: 'instance-1', conversationId: 'conversation-1',
				operationId: 'operation-1', turnId: 'turn-1', purpose: 'agent',
				request: {
					providerId: 'gateway-id', providerName: 'gateway', requestedModel: 'model-1',
					api: 'openai-responses', input: { messages: [] },
				},
			}), ctx);
			instrumentation.observe(observation({
				type: 'turn', instanceId: 'instance-1', conversationId: 'conversation-1',
				operationId: 'operation-1', turnId: 'turn-1', purpose: 'agent', durationMs: 10,
				request: {
					providerId: 'gateway-id', providerName: 'gateway', requestedModel: 'model-1',
					api: 'openai-responses',
				},
				response: {
					responseId: 'response-1', responseModel: 'model-actual',
					output: { role: 'assistant', content: [{ type: 'text', text: 'answer' }] },
					finishReason: 'stop',
					usage: {
						input: 3, output: 2, cacheRead: 1, cacheWrite: 1, totalTokens: 7,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
					},
				},
				isError: false,
			}), ctx);
			await Sentry.flush(1_000);
		} finally {
			instrumentation.dispose();
		}

		expect(spans).toHaveLength(1);
		expect(spans[0]).toMatchObject({
			description: 'chat model-1',
			status: 'ok',
			origin: 'manual',
			is_segment: true,
			data: {
				'otel.kind': 'CLIENT',
				'gen_ai.operation.name': 'chat',
				'gen_ai.provider.name': 'gateway',
				'gen_ai.request.model': 'model-1',
				'gen_ai.request.stream': true,
				'gen_ai.response.id': 'response-1',
				'gen_ai.response.model': 'model-actual',
				'gen_ai.usage.input_tokens': 5,
				'gen_ai.usage.output_tokens': 2,
				'bapX.turn.purpose': 'agent',
			},
		});
		expect(spans[0]?.trace_id).toMatch(/^[0-9a-f]{32}$/);
		expect(spans[0]?.span_id).toMatch(/^[0-9a-f]{16}$/);
		expect(spans[0]?.op).toBeUndefined();
	});
});
