import type { BapxClient } from '@bapX/sdk';
import { createContext, createElement, type ReactNode, useContext } from 'react';

const BapxContext = createContext<BapxClient | undefined>(undefined);

export interface BapxProviderProps {
	client: BapxClient;
	children?: ReactNode;
}

export function BapxProvider({ client, children }: BapxProviderProps) {
	return createElement(BapxContext.Provider, { value: client }, children);
}

export function useBapxClient(): BapxClient {
	const client = useContext(BapxContext);
	if (!client) throw new Error('useBapxClient() requires a BapxProvider');
	return client;
}

export function useResolvedBapxClient(override?: BapxClient): BapxClient {
	const provided = useContext(BapxContext);
	const client = override ?? provided;
	if (!client) throw new Error('Bapx hooks require a client option or BapxProvider');
	return client;
}
