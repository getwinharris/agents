import type { FlueClient } from '@bapX/sdk';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useResolvedFlueClient } from './provider.ts';
import { emptyWorkflowSnapshot, WorkflowRun, type WorkflowSnapshot } from './workflow-run.ts';

const emptySubscribe = () => () => {};

export interface UseFlueWorkflowOptions {
	runId?: string;
	client?: FlueClient;
}

export type UseFlueWorkflowResult = WorkflowSnapshot;

export function useFlueWorkflow(options: UseFlueWorkflowOptions): UseFlueWorkflowResult {
	const client = useResolvedFlueClient(options.client);
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
