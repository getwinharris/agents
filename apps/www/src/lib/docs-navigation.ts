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
				title: 'Introduction',
				items: [
					{ title: 'Getting Started', slug: 'getting-started/quickstart' },
					{ title: 'Why bapX?', slug: 'introduction/why-bapX' },
					{ title: 'What is an agent?', slug: 'concepts/agents' },
					{ title: 'Durable Agents', slug: 'concepts/durable-execution' },
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
					{ title: 'E2B', slug: 'ecosystem/sandboxes/e2b' },
					{ title: 'exe.dev', slug: 'ecosystem/sandboxes/exedev' },
					{ title: 'islo', slug: 'ecosystem/sandboxes/islo' },
					{ title: 'Mirage', slug: 'ecosystem/sandboxes/mirage' },
					{ title: 'Modal', slug: 'ecosystem/sandboxes/modal' },
					{ title: 'smolvm', slug: 'ecosystem/sandboxes/smolvm' },
					{ title: 'Vercel Sandbox', slug: 'ecosystem/sandboxes/vercel' },
				],
			},
			{
				title: 'Hosting and infrastructure',
				items: [
					{ title: 'AWS', slug: 'ecosystem/deploy/aws' },
					{ title: 'Cloudflare', slug: 'ecosystem/deploy/cloudflare' },
					{ title: 'Docker', slug: 'ecosystem/deploy/docker' },
					{ title: 'Fly.io', slug: 'ecosystem/deploy/fly' },
					{ title: 'GitHub Actions', slug: 'ecosystem/deploy/github-actions' },
					{ title: 'GitLab CI/CD', slug: 'ecosystem/deploy/gitlab-ci' },
					{ title: 'Node.js', slug: 'ecosystem/deploy/node' },
					{ title: 'Railway', slug: 'ecosystem/deploy/railway' },
					{ title: 'Render', slug: 'ecosystem/deploy/render' },
					{ title: 'SST', slug: 'ecosystem/deploy/sst' },
				],
			},
			{
				title: 'Data and storage',
				items: [
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
		groups: [{ title: 'Platform', items: [{ title: 'Overview', slug: 'platform/overview' }] }],
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
	return `${import.meta.env.BASE_URL}${slug}/${anchor ? `#${anchor}` : ''}`;
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
