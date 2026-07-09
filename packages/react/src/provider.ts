import type { FlueClient } from '@bapX/sdk';
import { createContext, createElement, type ReactNode, useContext } from 'react';

const FlueContext = createContext<FlueClient | undefined>(undefined);

export interface FlueProviderProps {
	client: FlueClient;
	children?: ReactNode;
}

export function FlueProvider({ client, children }: FlueProviderProps) {
	return createElement(FlueContext.Provider, { value: client }, children);
}

export function useFlueClient(): FlueClient {
	const client = useContext(FlueContext);
	if (!client) throw new Error('useFlueClient() requires a FlueProvider');
	return client;
}

export function useResolvedFlueClient(override?: FlueClient): FlueClient {
	const provided = useContext(FlueContext);
	const client = override ?? provided;
	if (!client) throw new Error('Flue hooks require a client option or FlueProvider');
	return client;
}
