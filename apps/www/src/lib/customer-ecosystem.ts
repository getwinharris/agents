import {
	channels,
	databases,
	deploy,
	sandboxes,
	tooling,
	type EcosystemItem,
} from '../../../ecosystem-catalog';

export type CustomerEcosystemCategory = 'channels' | 'databases' | 'sandboxes' | 'deploy' | 'tooling';

export interface CustomerEcosystemEntry {
	category: CustomerEcosystemCategory;
	categoryTitle: string;
	slug: string;
	item: EcosystemItem;
	purpose: string;
}

const groups: Array<{
	category: CustomerEcosystemCategory;
	title: string;
	items: EcosystemItem[];
	purpose: (name: string) => string;
}> = [
	{
		category: 'channels',
		title: 'Channels and connectors',
		items: channels,
		purpose: (name) => `Connect ${name} business activity, messages, events, or records to approved bapX agents and automations.`,
	},
	{
		category: 'databases',
		title: 'Data and storage',
		items: databases,
		purpose: (name) => `Use ${name} as a business-approved data or persistence connection for hosted agent and automation work.`,
	},
	{
		category: 'sandboxes',
		title: 'Agent workspaces',
		items: sandboxes,
		purpose: (name) => `Give approved agents an isolated ${name} workspace for project files and controlled execution.`,
	},
	{
		category: 'deploy',
		title: 'Hosting and infrastructure',
		items: deploy,
		purpose: (name) => `Connect or operate business workloads that use ${name} while bapX remains the hosted control and coordination layer.`,
	},
	{
		category: 'tooling',
		title: 'Observability and quality',
		items: tooling,
		purpose: (name) => `Connect ${name} to observe, evaluate, trace, or review agent and automation activity.`,
	},
];

function slugFromHref(href: string): string {
	return href.replace(/\/$/, '').split('/').at(-1) ?? '';
}

export const customerEcosystemEntries: CustomerEcosystemEntry[] = groups.flatMap((group) =>
	group.items.map((item) => ({
		category: group.category,
		categoryTitle: group.title,
		slug: slugFromHref(item.href),
		item,
		purpose: group.purpose(item.name),
	})),
);

export const customerEcosystemGroups = groups.map((group) => ({
	category: group.category,
	title: group.title,
	entries: customerEcosystemEntries.filter((entry) => entry.category === group.category),
}));
