import type { BapxClient } from '@bapX/sdk';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useResolvedBapxClient } from './provider.ts';
import { emptyWorkflowSnapshot, WorkflowRun, type WorkflowSnapshot } from './workflow-run.ts';

const emptySubscribe = () => () => {};

export interface UseBapxWorkflowOptions {
	runId?: string;
	client?: BapxClient;
}

export type UseBapxWorkflowResult = WorkflowSnapshot;

export function useBapxWorkflow(options: UseBapxWorkflowOptions): UseBapxWorkflowResult {
	const client = useResolvedBapxClient(options.client);
	const run = useMemo(
		() => (options.runId ? new WorkflowRun(client, options.runId) : undefined),
		[client, options.runId],
	);
	useEffect(() => {
		run?.start();
		return () => run?.dispose();
	}, [run]);
	return useSyncExternalStore(
		run?.subscribe ?? emptySubscribe,
		run?.getSnapshot ?? (() => emptyWorkflowSnapshot),
		() => emptyWorkflowSnapshot,
	);
}
