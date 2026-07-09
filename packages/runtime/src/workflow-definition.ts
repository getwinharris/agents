import type * as v from 'valibot';
import {
	defineAction,
	isActionDefinition,
	type ActionContext,
	type ActionDefinition,
	type ActionInputSchema,
	type ActionOutputSchema,
} from './action.ts';
import { isAgentDefinition } from './agent-definition.ts';
import type { JsonValue } from './json-snapshot.ts';
import type { AgentDefinition } from './types.ts';

type InlineRunResult<S extends ActionOutputSchema | undefined> = S extends ActionOutputSchema
	? v.InferInput<S>
	: JsonValue | undefined;

export interface WorkflowDefinition<TAction extends ActionDefinition = ActionDefinition> {
	readonly __flueWorkflowDefinition: true;
	readonly agent: AgentDefinition;
	readonly action: TAction;
}

const WORKFLOW_DEFINITIONS_KEY = Symbol.for('@bapX/runtime/workflow-definitions');
const runtimeGlobal = globalThis as typeof globalThis & {
	[WORKFLOW_DEFINITIONS_KEY]?: WeakSet<object>;
};
if (!runtimeGlobal[WORKFLOW_DEFINITIONS_KEY]) {
	runtimeGlobal[WORKFLOW_DEFINITIONS_KEY] = new WeakSet<object>();
}
const workflowDefinitions = runtimeGlobal[WORKFLOW_DEFINITIONS_KEY];

type ExtractedWorkflowOptions<TAction extends ActionDefinition> = {
	agent: AgentDefinition;
	action: TAction;
	input?: never;
	output?: never;
	run?: never;
};

type InlineWorkflowOptions<
	TInput extends ActionInputSchema | undefined,
	TOutput extends ActionOutputSchema | undefined,
> = {
	agent: AgentDefinition;
	action?: never;
	input?: TInput;
	output?: TOutput;
	run(context: ActionContext<TInput>): InlineRunResult<TOutput> | Promise<InlineRunResult<TOutput>>;
};

export function defineWorkflow<TAction extends ActionDefinition>(
	options: ExtractedWorkflowOptions<TAction>,
): WorkflowDefinition<TAction>;
export function defineWorkflow<
	const TInput extends ActionInputSchema | undefined = undefined,
	const TOutput extends ActionOutputSchema | undefined = undefined,
>(
	options: InlineWorkflowOptions<TInput, TOutput>,
): WorkflowDefinition<ActionDefinition<TInput, TOutput>>;
export function defineWorkflow(
	options: ExtractedWorkflowOptions<ActionDefinition> | InlineWorkflowOptions<any, any>,
): WorkflowDefinition {
	if (!options || typeof options !== 'object') {
		throw new Error('[bapX] defineWorkflow() requires a workflow definition object.');
	}
	if (!isAgentDefinition(options.agent)) {
		throw new Error('[bapX] defineWorkflow({ agent }) requires an AgentDefinition.');
	}
	const hasAction = Object.hasOwn(options, 'action') && options.action !== undefined;
	const hasRun = Object.hasOwn(options, 'run') && options.run !== undefined;
	if (hasAction === hasRun) {
		throw new Error('[bapX] defineWorkflow() requires exactly one of action or run.');
	}
	if (hasAction) {
		if (!isActionDefinition(options.action)) {
			throw new Error('[bapX] defineWorkflow({ action }) requires an Action.');
		}
		if (Object.hasOwn(options, 'input') || Object.hasOwn(options, 'output')) {
			throw new Error('[bapX] defineWorkflow({ action }) does not accept input or output.');
		}
		return makeWorkflowDefinition(options.agent, options.action);
	}
	const action = defineAction({
		name: 'workflow',
		description: 'Workflow-private action.',
		input: options.input,
		output: options.output,
		run: options.run,
	} as never);
	return makeWorkflowDefinition(options.agent, action);
}

function makeWorkflowDefinition<TAction extends ActionDefinition>(
	agent: AgentDefinition,
	action: TAction,
): WorkflowDefinition<TAction> {
	const workflow = Object.freeze({
		__flueWorkflowDefinition: true as const,
		agent,
		action,
	});
	workflowDefinitions.add(workflow);
	return workflow;
}

export function isWorkflowDefinition(value: unknown): value is WorkflowDefinition {
	return Boolean(value && typeof value === 'object' && workflowDefinitions.has(value));
}

