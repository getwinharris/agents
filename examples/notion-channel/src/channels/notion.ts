import { createNotionChannel } from '@bapX/notion';
import { defineTool, dispatch } from '@bapX/runtime';
import assistant from '../agents/assistant.ts';
import { createNotionClient } from '../notion-client.ts';

const PAGE_INSTANCE_PREFIX = 'notion-page:';

export const client = createNotionClient(requiredEnv('NOTION_TOKEN'));

const verificationToken = optionalEnv('NOTION_WEBHOOK_VERIFICATION_TOKEN');

export const channel = createNotionChannel({
	...(verificationToken === undefined ? {} : { verificationToken }),

	// Temporary endpoint setup only:
	// 1. Leave NOTION_WEBHOOK_VERIFICATION_TOKEN unset.
	// 2. Uncomment this callback and start the app.
	// 3. Add POST /channels/notion/webhook in Notion.
	// 4. Store the received token through the project's secret workflow.
	// 5. Set NOTION_WEBHOOK_VERIFICATION_TOKEN, then remove this callback.
	// async verification({ verificationToken }) {
	// 	await saveNotionWebhookVerificationToken(verificationToken);
	// },

	// Path: /channels/notion/webhook
	async webhook({ event }) {
		switch (event.type) {
			case 'page.created':
			case 'page.content_updated':
			case 'page.properties_updated':
			case 'page.moved':
			case 'page.locked':
			case 'page.unlocked':
			case 'page.undeleted': {
				await dispatch(assistant, {
					id: pageInstanceId(event.entity.id),
					message: {
						kind: 'signal',
						type: `notion.${event.type}`,
						// `data` is Notion's event-specific detail object; page events
						// carry no natural message text.
						body: JSON.stringify(event.data ?? {}),
						attributes: {
							eventId: event.id,
							pageId: event.entity.id,
							attemptNumber: String(event.attempt_number),
							authorIds: event.authors.map((author) => author.id).join(','),
						},
					},
				});
				return;
			}
			default:
				return;
		}
	},
});

export function retrievePage(pageId: string) {
	return defineTool({
		name: 'retrieve_notion_page',
		description: 'Retrieve the current Notion page bound to this agent.',
		async run() {
			return client.pages.retrieve({ page_id: pageId });
		},
	});
}

export function pageInstanceId(pageId: string): string {
	if (!pageId) throw new TypeError('Notion page id must be non-empty.');
	return `${PAGE_INSTANCE_PREFIX}${encodeURIComponent(pageId)}`;
}

export function pageIdFromInstanceId(id: string): string {
	if (!id.startsWith(PAGE_INSTANCE_PREFIX)) {
		throw new TypeError('Expected a local Notion page instance id.');
	}
	const encodedPageId = id.slice(PAGE_INSTANCE_PREFIX.length);
	if (!encodedPageId) throw new TypeError('Expected a local Notion page instance id.');
	const pageId = decodeURIComponent(encodedPageId);
	if (!pageId) throw new TypeError('Expected a local Notion page instance id.');
	return pageId;
}

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required.`);
	return value;
}

function optionalEnv(name: string): string | undefined {
	return process.env[name] || undefined;
}
