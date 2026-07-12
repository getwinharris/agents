import type { APIRoute } from 'astro';
import { customerEcosystemEntries, type CustomerEcosystemEntry } from '../../../../../lib/customer-ecosystem';

export function getStaticPaths() {
	return customerEcosystemEntries.map((entry) => ({
		params: { category: entry.category, slug: entry.slug },
		props: { entry },
	}));
}

function markdown(entry: CustomerEcosystemEntry): string {
	return `---\ntitle: ${JSON.stringify(entry.item.name)}\ndescription: ${JSON.stringify(entry.purpose)}\n---\n\n# ${entry.item.name}\n\n${entry.purpose}\n\n## How it fits into bapX\n\n${entry.item.name} is a **${entry.categoryTitle}** connection. It belongs to a business and is scoped to approved projects, people, agents, and automations. Manage ownership and credentials in Platform; use MCP permissions when the capability is exposed through an MCP server or tool.\n\n## Credentials and access\n\n- Bring external-provider credentials when required.\n- Keep secrets out of source files, Markdown, and chat messages.\n- Grant only the agents, automations, and people that need access.\n\n## Availability\n\nSelf-service controls are being enabled incrementally in Platform. Until the control appears in your business workspace, contact the bapX team instead of installing an internal bapX package or CLI.\n`;
}

export const GET: APIRoute = ({ props }) =>
	new Response(markdown((props as { entry: CustomerEcosystemEntry }).entry), {
		headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
	});
