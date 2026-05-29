export type DocsNavItem =
	| {
			title: string;
			slug: string;
	  }
	| {
			title: string;
			href: string;
	  };

export interface DocsNavGroup {
	title: string;
	items: DocsNavItem[];
}

export interface DocsSection {
	key: 'guide' | 'api' | 'cli' | 'sdk' | 'ecosystem';
	title: string;
	landingSlug: string;
	groups: DocsNavGroup[];
}

export const docsSections: DocsSection[] = [
	{
		key: 'guide',
		title: 'Guide',
		landingSlug: 'getting-started/quickstart',
		groups: [
			{
				title: 'Introduction',
				items: [
					{ title: 'Getting Started', slug: 'getting-started/quickstart' },
					{ title: 'What is an agent?', slug: 'concepts/agents' },
					{ title: 'Why Flue?', slug: 'introduction/why-flue' },
					{ title: 'Changelog', href: 'https://github.com/withastro/flue/blob/main/CHANGELOG.md' },
				],
			},
			{
				title: 'Guides',
				items: [
					{ title: 'Project Layout', slug: 'guide/project-layout' },
					{ title: 'Configuration', slug: 'guide/configuration' },
					{ title: 'Models & Providers', slug: 'guide/models' },
					{ title: 'Agents', slug: 'guide/building-agents' },
					{ title: 'Workflows', slug: 'guide/workflows' },
					{ title: 'Prompting', slug: 'guide/prompting' },
					{ title: 'Skills', slug: 'guide/skills' },
					{ title: 'Tools', slug: 'guide/tools' },
					{ title: 'Subagents', slug: 'guide/subagents' },
					{ title: 'Sandboxes', slug: 'guide/sandboxes' },
					{ title: 'Routing', slug: 'guide/routing' },
					{ title: 'Build & Deploy', slug: 'guide/deployment' },
					{ title: 'Chat', slug: 'guide/chat' },
					{ title: 'Observability', slug: 'guide/observability' },
				],
			},
		],
	},
	{
		key: 'api',
		title: 'Reference',
		landingSlug: 'api/agent-api',
		groups: [
			{
				title: 'Runtime',
				items: [
					{ title: 'Agent API', slug: 'api/agent-api' },
					{ title: 'Workflows API', slug: 'api/workflows-api' },
					{ title: 'Harness API', slug: 'api/harness-api' },
					{ title: 'Application API', slug: 'api/application-api' },
					{ title: 'Events Reference', slug: 'api/events-reference' },
				],
			},
			{
				title: 'Advanced',
				items: [
					{ title: 'Sandbox Connector API', slug: 'api/sandbox-api' },
					{ title: 'Data Persistence API', slug: 'api/data-persistence-api' },
				],
			},
		],
	},
	{
		key: 'cli',
		title: 'CLI',
		landingSlug: 'cli/overview',
		groups: [
			{
				title: 'CLI',
				items: [
					{ title: 'Overview', slug: 'cli/overview' },
					{ title: 'init', slug: 'cli/init' },
					{ title: 'dev', slug: 'cli/dev' },
					{ title: 'run', slug: 'cli/run' },
					{ title: 'build', slug: 'cli/build' },
					{ title: 'logs', slug: 'cli/logs' },
					{ title: 'add', slug: 'cli/add' },
				],
			},
		],
	},
	{
		key: 'sdk',
		title: 'SDK',
		landingSlug: 'sdk/overview',
		groups: [
			{
				title: 'Introduction',
				items: [{ title: 'Overview', slug: 'sdk/overview' }],
			},
			{
				title: 'Client',
				items: [
					{ title: 'createFlueClient()', slug: 'sdk/create-flue-client' },
					{ title: 'client.agents.invoke()', slug: 'sdk/client-agents-invoke' },
					{ title: 'client.agents.connect()', slug: 'sdk/client-agents-connect' },
					{ title: 'client.workflows.connect()', slug: 'sdk/client-workflows-connect' },
					{ title: 'client.runs.get()', slug: 'sdk/client-runs-get' },
					{ title: 'client.runs.events()', slug: 'sdk/client-runs-events' },
					{ title: 'client.runs.stream()', slug: 'sdk/client-runs-stream' },
				],
			},
			{
				title: 'Admin',
				items: [
					{ title: 'client.admin.agents.list()', slug: 'sdk/client-admin-agents-list' },
					{ title: 'client.admin.runs.list()', slug: 'sdk/client-admin-runs-list' },
					{ title: 'client.admin.runs.get()', slug: 'sdk/client-admin-runs-get' },
				],
			},
			{
				title: 'Reference',
				items: [
					{ title: 'WebSocket Types', slug: 'sdk/websocket-types' },
					{ title: 'Event Types', slug: 'sdk/event-types' },
					{ title: 'Error Types', slug: 'sdk/error-types' },
				],
			},
		],
	},
	{
		key: 'ecosystem',
		title: 'Ecosystem',
		landingSlug: 'ecosystem/overview',
		groups: [
			{
				title: 'Ecosystem',
				items: [{ title: 'Overview', slug: 'ecosystem/overview' }],
			},
			{
				title: 'Deployment',
				items: [
					{ title: 'Cloudflare', slug: 'ecosystem/deploy/cloudflare' },
					{ title: 'GitHub Actions', slug: 'ecosystem/deploy/github-actions' },
					{ title: 'GitLab CI/CD', slug: 'ecosystem/deploy/gitlab-ci' },
					{ title: 'Node.js', slug: 'ecosystem/deploy/node' },
					{ title: 'Render', slug: 'ecosystem/deploy/render' },
				],
			},
			{
				title: 'Sandboxes',
				items: [
					{ title: 'boxd', slug: 'ecosystem/sandboxes/boxd' },
					{ title: 'Cloudflare Shell', slug: 'ecosystem/sandboxes/cloudflare-shell' },
					{ title: 'Cloudflare Sandbox', slug: 'ecosystem/sandboxes/cloudflare' },
					{ title: 'Daytona', slug: 'ecosystem/sandboxes/daytona' },
					{ title: 'E2B', slug: 'ecosystem/sandboxes/e2b' },
					{ title: 'exe.dev', slug: 'ecosystem/sandboxes/exedev' },
					{ title: 'islo', slug: 'ecosystem/sandboxes/islo' },
					{ title: 'Mirage', slug: 'ecosystem/sandboxes/mirage' },
					{ title: 'Modal', slug: 'ecosystem/sandboxes/modal' },
					{ title: 'smolvm', slug: 'ecosystem/sandboxes/smolvm' },
					{ title: 'Superserve', slug: 'ecosystem/sandboxes/superserve' },
					{ title: 'Vercel Sandbox', slug: 'ecosystem/sandboxes/vercel' },
				],
			},
		],
	},
];

export function docsHref(slug: string) {
	return `${import.meta.env.BASE_URL}${slug}/`;
}

export function getDocsSection(slug: string) {
	return docsSections.find((section) => section.groups.some((group) => group.items.some((item) => 'slug' in item && item.slug === slug))) ?? docsSections[0];
}

