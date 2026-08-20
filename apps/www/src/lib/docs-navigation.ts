export type DocsNavItem =
	| {
			title: string;
			slug: string;
			anchor?: string;
			icon?: 'home';
			items?: DocsNavItem[];
	  }
	| {
			title: string;
			href: string;
	  };

export interface DocsNavGroup {
	title?: string;
	items: DocsNavItem[];
}

export interface DocsSection {
	key: string;
	title: string;
	landingSlug: string;
	groups: DocsNavGroup[];
}

const allDocsSections: DocsSection[] = [
	{
		key: 'guide',
		title: 'Guide',
		landingSlug: 'getting-started/quickstart',
		groups: [
			{
				title: 'Model providers',
				items: [
					{ title: 'OpenAI account OAuth', slug: 'guide/delegated-tasks' },
					{ title: 'Provider-neutral models', slug: 'guide/models' },
				],
			},
			{
				title: 'Introduction',
				items: [
					{ title: 'Getting Started', slug: 'getting-started/quickstart' },
					{ title: 'Product surfaces', slug: 'introduction/product-surfaces' },
					{ title: 'Why bapX?', slug: 'introduction/why-bapx' },
					{ title: 'What is an agent?', slug: 'concepts/agents' },
					{ title: 'Durable Agents', slug: 'concepts/durable-execution' },
				],
			},
		],
	},
	{
		key: 'developers',
		title: 'Developers',
		landingSlug: 'sdk/overview',
		groups: [
			{
				title: 'Build with Bapx',
				items: [
					{ title: 'Agents', slug: 'guide/building-agents' },
					{ title: 'Workflows', slug: 'guide/workflows' },
					{ title: 'Actions', slug: 'guide/actions' },
					{ title: 'Tools', slug: 'guide/tools' },
					{ title: 'Skills', slug: 'guide/skills' },
					{ title: 'Subagents', slug: 'guide/subagents' },
					{ title: 'Delegated tasks', slug: 'guide/delegated-tasks' },
					{ title: 'Models', slug: 'guide/models' },
					{ title: 'Routing', slug: 'guide/routing' },
					{ title: 'Persistence', slug: 'guide/database' },
					{ title: 'Sandboxes', slug: 'guide/sandboxes' },
					{ title: 'Schedules', slug: 'guide/schedules' },
					{ title: 'Channels', slug: 'guide/channels' },
					{ title: 'React', slug: 'guide/react' },
					{ title: 'Observability', slug: 'guide/observability' },
					{ title: 'Evals', slug: 'guide/evals' },
					{ title: 'Project layout', slug: 'guide/project-layout' },
					{ title: 'Node.js target', slug: 'guide/targets/node' },
					{ title: 'Cloudflare target', slug: 'guide/targets/cloudflare' },
				],
			},
			{
				title: 'Runtime API',
				items: [
					{ title: 'Agents', slug: 'api/agent-api' },
					{ title: 'Actions', slug: 'api/action-api' },
					{ title: 'Workflows', slug: 'api/workflow-api' },
					{ title: 'Routing', slug: 'api/routing-api' },
					{ title: 'Providers', slug: 'api/provider-api' },
					{ title: 'Persistence', slug: 'api/data-persistence-api' },
					{ title: 'Sandboxes', slug: 'api/sandbox-api' },
					{ title: 'Streaming', slug: 'api/streaming-protocol' },
					{ title: 'Events', slug: 'api/events-reference' },
					{ title: 'Errors', slug: 'api/errors-reference' },
				],
			},
			{
				title: 'SDK',
				items: [
					{ title: 'Overview', slug: 'sdk/overview' },
					{ title: 'Client', slug: 'sdk/client' },
					{ title: 'Agents', slug: 'sdk/agents' },
					{ title: 'Workflows', slug: 'sdk/workflows' },
					{ title: 'Runs', slug: 'sdk/runs' },
					{ title: 'Events', slug: 'sdk/events' },
					{ title: 'Errors', slug: 'sdk/errors' },
				],
			},
			{
				title: 'Maintainers',
				items: [
					{ title: 'Contributing', slug: 'reference/contributing' },
					{ title: 'Source ownership', slug: 'reference/source-ownership' },
					{ title: 'Platform auth', slug: 'reference/platform-auth' },
					{ title: 'Shipping workflow', slug: 'reference/shipping' },
					{
						title: 'Changelog',
						href: 'https://github.com/getwinharris/agents/blob/main/CHANGELOG.md',
					},
				],
			},
		],
	},
	{
		key: 'ecosystem',
		title: 'Ecosystem',
		landingSlug: 'ecosystem',
		groups: [
			{
				items: [{ title: 'Overview', slug: 'ecosystem', icon: 'home' }],
			},
			{
				title: 'Channels and connectors',
				items: [
					{ title: 'Discord', slug: 'ecosystem/channels/discord' },
					{ title: 'Facebook', slug: 'ecosystem/channels/messenger' },
					{ title: 'GitHub', slug: 'ecosystem/channels/github' },
					{ title: 'Google Chat', slug: 'ecosystem/channels/google-chat' },
					{ title: 'Intercom', slug: 'ecosystem/channels/intercom' },
					{ title: 'Linear', slug: 'ecosystem/channels/linear' },
					{ title: 'Microsoft Teams', slug: 'ecosystem/channels/teams' },
					{ title: 'Notion', slug: 'ecosystem/channels/notion' },
					{ title: 'Razorpay', slug: 'ecosystem/channels/razorpay' },
					{ title: 'Resend', slug: 'ecosystem/channels/resend' },
					{ title: 'Salesforce', slug: 'ecosystem/channels/salesforce-marketing-cloud' },
					{ title: 'Shopify', slug: 'ecosystem/channels/shopify' },
					{ title: 'Slack', slug: 'ecosystem/channels/slack' },
					{ title: 'Stripe', slug: 'ecosystem/channels/stripe' },
					{ title: 'Telegram', slug: 'ecosystem/channels/telegram' },
					{ title: 'Twilio', slug: 'ecosystem/channels/twilio' },
					{ title: 'WhatsApp', slug: 'ecosystem/channels/whatsapp' },
					{ title: 'Zendesk', slug: 'ecosystem/channels/zendesk' },
				],
			},
			{
				title: 'Agent workspaces',
				items: [
					{ title: 'boxd', slug: 'ecosystem/sandboxes/boxd' },
					{ title: 'Cloudflare Shell', slug: 'ecosystem/sandboxes/cloudflare-shell' },
					{ title: 'Cloudflare Sandbox', slug: 'ecosystem/sandboxes/cloudflare' },
					{ title: 'Daytona', slug: 'ecosystem/sandboxes/daytona' },
					{ title: 'bapXsandbox E2B', slug: 'ecosystem/sandboxes/e2b' },
					{ title: 'exe.dev', slug: 'ecosystem/sandboxes/exedev' },
					{ title: 'islo', slug: 'ecosystem/sandboxes/islo' },
					{ title: 'Mirage', slug: 'ecosystem/sandboxes/mirage' },
					{ title: 'Modal', slug: 'ecosystem/sandboxes/modal' },
					{ title: 'Vercel Sandbox', slug: 'ecosystem/sandboxes/vercel' },
				],
			},
			{
				title: 'Hosting and infrastructure',
				items: [
					{ title: 'AWS', slug: 'ecosystem/deploy/aws' },
					{ title: 'bapXhost', slug: 'ecosystem/deploy/bapx-host' },
					{ title: 'Cloudflare', slug: 'ecosystem/deploy/cloudflare' },
					{ title: 'Docker', slug: 'ecosystem/deploy/docker' },
					{ title: 'Fly.io', slug: 'ecosystem/deploy/fly' },
					{ title: 'GitHub Actions', slug: 'ecosystem/deploy/github-actions' },
					{ title: 'GitLab CI/CD', slug: 'ecosystem/deploy/gitlab-ci' },
					{ title: 'Google Cloud', slug: 'ecosystem/deploy/google-cloud' },
					{ title: 'Node.js', slug: 'ecosystem/deploy/node' },
					{ title: 'Railway', slug: 'ecosystem/deploy/railway' },
					{ title: 'Render', slug: 'ecosystem/deploy/render' },
					{ title: 'SST', slug: 'ecosystem/deploy/sst' },
				],
			},
			{
				title: 'Data and storage',
				items: [
					{ title: 'bapXdb', slug: 'ecosystem/databases/bapxdb' },
					{ title: 'libSQL', slug: 'ecosystem/databases/libsql' },
					{ title: 'MongoDB', slug: 'ecosystem/databases/mongodb' },
					{ title: 'MySQL', slug: 'ecosystem/databases/mysql' },
					{ title: 'Postgres', slug: 'ecosystem/databases/postgres' },
					{ title: 'Redis', slug: 'ecosystem/databases/redis' },
					{ title: 'Supabase', slug: 'ecosystem/databases/supabase' },
					{ title: 'Turso', slug: 'ecosystem/databases/turso' },
					{ title: 'Valkey', slug: 'ecosystem/databases/valkey' },
				],
			},
			{
				title: 'Observability and quality',
				items: [
					{ title: 'Braintrust', slug: 'ecosystem/tooling/braintrust' },
					{ title: 'Cloud coding CLIs', slug: 'ecosystem/tooling/cloud-coding-clis' },
					{ title: 'OpenTelemetry', slug: 'ecosystem/tooling/opentelemetry' },
					{ title: 'Sentry', slug: 'ecosystem/tooling/sentry' },
					{ title: 'Vitest Evals', slug: 'ecosystem/tooling/vitest-evals' },
				],
			},
		],
	},
	{
		key: 'platform',
		title: 'Platform',
		landingSlug: 'platform/overview',
		groups: [
			{
				title: 'Platform',
				items: [
					{ title: 'Overview', slug: 'platform/overview' },
					{ title: 'Billing', slug: 'platform/billing' },
					{ title: 'Organisations', slug: 'platform/organisations' },
				],
			},
		],
	},
	{
		key: 'mcp',
		title: 'MCP',
		landingSlug: 'mcp/overview',
		groups: [{ title: 'MCP', items: [{ title: 'Overview', slug: 'mcp/overview' }] }],
	},
	{
		key: 'okf',
		title: 'OKF',
		landingSlug: 'okf/overview',
		groups: [
			{
				title: 'OKF',
				items: [
					{ title: 'Overview', slug: 'okf/overview' },
					{ title: 'Workspace Maps', slug: 'okf/workspace-maps' },
				],
			},
		],
	},
];

export const docsSections = allDocsSections;

export function docsHref(slug: string, anchor?: string) {
	return `${import.meta.env.BASE_URL}docs/${slug.toLowerCase()}/${anchor ? `#${anchor}` : ''}`;
}

function includesSlug(items: DocsNavItem[], slug: string): boolean {
	return items.some(
		(item) =>
			'slug' in item &&
			(item.slug === slug || (item.items !== undefined && includesSlug(item.items, slug))),
	);
}

export function getDocsSection(slug: string) {
	return (
		docsSections.find((section) =>
			section.groups.some((group) => includesSlug(group.items, slug)),
		) ?? docsSections[0]
	);
}
