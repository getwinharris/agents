import type { DeliveredMessage, DispatchReceipt, NamedAgentDispatchRequest } from '../types.ts';
import type { DispatchQueue } from './dispatch-queue.ts';
import { parseDeliveredMessage } from './schemas.ts';

export interface DispatchRuntime {
	agents: ReadonlyArray<{ name: string }>;
}

export async function enqueueDispatch(options: {
	request: NamedAgentDispatchRequest;
	dispatchQueue: DispatchQueue;
	rt: DispatchRuntime;
}): Promise<DispatchReceipt> {
	const agent = options.request.agent;
	const message = validateDispatchRequest(options.request, agent, options.rt);
	return options.dispatchQueue.enqueue({
		dispatchId: crypto.randomUUID(),
		agent,
		id: options.request.id,
		message,
		acceptedAt: new Date().toISOString(),
	});
}

function validateDispatchRequest(
	request: NamedAgentDispatchRequest,
	agent: string,
	rt: DispatchRuntime,
): DeliveredMessage {
	if (typeof agent !== 'string' || agent.trim() === '') {
		throw new Error('[bapX] dispatch() requires a non-empty target agent.');
	}
	if (typeof request.id !== 'string' || request.id.trim() === '') {
		throw new Error('[bapX] dispatch() requires a non-empty "id" target agent instance id.');
	}
	if (!agentExists(rt, agent)) {
		throw new Error(`[bapX] dispatch() target agent "${agent}" is not registered.`);
	}
	return parseDeliveredMessage(request.message);
}

function agentExists(rt: DispatchRuntime, agentName: string): boolean {
	return rt.agents.some((agent) => agent.name === agentName);
}
