import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = new URL('../dist/flue.js', import.meta.url);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

let server;
let registryUrl;

function stripFrontmatter(source) {
	if (!source.startsWith('---\n')) return source;
	const end = source.indexOf('\n---\n', 4);
	if (end < 0) return source;
	return source.slice(end + '\n---\n'.length).replace(/^\n+/, '');
}

async function runCli(args) {
	const child = spawn(process.execPath, [cli.pathname, ...args], {
		env: { ...process.env, FLUE_REGISTRY_URL: registryUrl },
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let stdout = '';
	let stderr = '';
	child.stdout.setEncoding('utf8');
	child.stderr.setEncoding('utf8');
	child.stdout.on('data', (chunk) => {
		stdout += chunk;
	});
	child.stderr.on('data', (chunk) => {
		stderr += chunk;
	});
	const [code, signal] = await once(child, 'exit');
	return { code, signal, stdout, stderr };
}

before(async () => {
	server = createServer(async (request, response) => {
		const slug = /^\/([^/]+)\.md$/.exec(request.url ?? '')?.[1];
		const files = {
			channel: 'channel.md',
			github: 'channel--github.md',
			stripe: 'channel--stripe.md',
			notion: 'channel--notion.md',
			resend: 'channel--resend.md',
			shopify: 'channel--shopify.md',
			intercom: 'channel--intercom.md',
			zendesk: 'channel--zendesk.md',
			'salesforce-marketing-cloud': 'channel--salesforce-marketing-cloud.md',
			slack: 'channel--slack.md',
			discord: 'channel--discord.md',
			teams: 'channel--teams.md',
			'google-chat': 'channel--google-chat.md',
			linear: 'channel--linear.md',
			telegram: 'channel--telegram.md',
			whatsapp: 'channel--whatsapp.md',
			twilio: 'channel--twilio.md',
			messenger: 'channel--messenger.md',
		};
		const file = slug ? files[slug] : undefined;
		if (!file) {
			response.writeHead(404).end('Not found');
			return;
		}
		const source = await readFile(join(repoRoot, 'connectors', file), 'utf8');
		response.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8' });
		response.end(stripFrontmatter(source));
	});
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const address = server.address();
	assert.ok(address && typeof address === 'object');
	registryUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
	server.close();
	await once(server, 'close');
});

describe('flue add', () => {
	it('lists named channel recipes and both generic categories when no name is given', async () => {
		const result = await runCli(['add']);
		assert.equal(result.code, 0);
		assert.match(result.stderr, /flue add github\s+channel\s+https:\/\/github\.com/);
		assert.match(result.stderr, /flue add stripe\s+channel\s+https:\/\/stripe\.com/);
		assert.match(result.stderr, /flue add notion\s+channel\s+https:\/\/developers\.notion\.com/);
		assert.match(result.stderr, /flue add resend\s+channel\s+https:\/\/resend\.com/);
		assert.match(result.stderr, /flue add shopify\s+channel\s+https:\/\/shopify\.dev/);
		assert.match(
			result.stderr,
			/flue add intercom\s+channel\s+https:\/\/developers\.intercom\.com/,
		);
		assert.match(result.stderr, /flue add zendesk\s+channel\s+https:\/\/developer\.zendesk\.com/);
		assert.match(
			result.stderr,
			/flue add salesforce-marketing-cloud\s+channel\s+https:\/\/developer\.salesforce\.com/,
		);
		assert.match(result.stderr, /flue add slack\s+channel\s+https:\/\/slack\.com/);
		assert.match(
			result.stderr,
			/flue add teams\s+channel\s+https:\/\/www\.microsoft\.com\/microsoft-teams/,
		);
		assert.match(
			result.stderr,
			/flue add google-chat\s+channel\s+https:\/\/developers\.google\.com\/workspace\/chat/,
		);
		assert.match(result.stderr, /flue add linear\s+channel\s+https:\/\/linear\.app\/developers/);
		assert.match(
			result.stderr,
			/flue add telegram\s+channel\s+https:\/\/core\.telegram\.org\/bots\/api/,
		);
		assert.match(
			result.stderr,
			/flue add whatsapp\s+channel\s+https:\/\/developers\.facebook\.com\/docs\/whatsapp\/cloud-api/,
		);
		assert.match(
			result.stderr,
			/flue add twilio\s+channel\s+https:\/\/www\.twilio\.com\/docs\/messaging/,
		);
		assert.match(
			result.stderr,
			/flue add messenger\s+channel\s+https:\/\/developers\.facebook\.com\/docs\/messenger-platform/,
		);
		assert.ok(result.stderr.includes('flue add <url> --category sandbox'));
		assert.ok(result.stderr.includes('flue add <url> --category channel'));
	});

	it('prints the WhatsApp channel recipe', async () => {
		const result = await runCli(['add', 'whatsapp', '--print']);

		assert.equal(result.code, 0);
		assert.ok(result.stdout.includes('@flue/whatsapp'));
		assert.ok(result.stdout.includes('@kapso/whatsapp-cloud-api@^0.2.1'));
		assert.ok(result.stdout.includes('/channels/whatsapp/webhook'));
		assert.ok(result.stdout.includes('X-Hub-Signature-256'));
	});

	it('prints the Stripe recipe with snapshot and thin event support', async () => {
		const result = await runCli(['add', 'stripe', '--print']);

		assert.equal(result.code, 0);
		assert.ok(result.stdout.includes('@flue/stripe'));
		assert.ok(result.stdout.includes('stripe@^22.2.0'));
		assert.ok(result.stdout.includes('/channels/stripe/webhook'));
		assert.ok(result.stdout.includes('Stripe.createFetchHttpClient()'));
		assert.ok(result.stdout.includes("eventPayload: 'thin'"));
		assert.ok(result.stdout.includes('without `nodejs_compat`'));
	});

	it('prints the Notion recipe with setup and signed-event guidance', async () => {
		const result = await runCli(['add', 'notion', '--print']);

		assert.equal(result.code, 0);
		assert.ok(result.stdout.includes('@flue/notion'));
		assert.ok(result.stdout.includes('@notionhq/client@5.22.0'));
		assert.ok(result.stdout.includes('/channels/notion/webhook'));
		assert.ok(result.stdout.includes('verification_token'));
		assert.ok(result.stdout.includes('X-Notion-Signature'));
		assert.ok(result.stdout.includes('without `nodejs_compat`'));
	});

	it('prints the Resend recipe with signed ingress and fake-client guidance', async () => {
		const result = await runCli(['add', 'resend', '--print']);

		assert.equal(result.code, 0);
		assert.ok(result.stdout.includes('@flue/resend'));
		assert.ok(result.stdout.includes('resend@6.12.4'));
		assert.ok(result.stdout.includes('@types/node'));
		assert.ok(result.stdout.includes('@types/react'));
		assert.ok(result.stdout.includes('/channels/resend/webhook'));
		assert.ok(result.stdout.includes('svix-signature'));
		assert.ok(result.stdout.includes('delivery.id'));
		assert.ok(result.stdout.includes('without `nodejs_compat`'));
		assert.ok(result.stdout.includes('fake transport'));
		assert.ok(result.stdout.includes('Never create a receiving domain'));
	});

	it('prints the Shopify recipe with signed ingress and a shop-bound GraphQL client', async () => {
		const result = await runCli(['add', 'shopify', '--print']);

		assert.equal(result.code, 0);
		assert.ok(result.stdout.includes('@flue/shopify'));
		assert.ok(result.stdout.includes('@shopify/admin-api-client@1.1.2'));
		assert.ok(result.stdout.includes('@types/node'));
		assert.ok(result.stdout.includes('/channels/shopify/webhook'));
		assert.ok(result.stdout.includes('apiVersion: ADMIN_API_VERSION'));
		assert.ok(result.stdout.includes("'2026-04'"));
		assert.ok(result.stdout.includes('X-Shopify-Hmac-Sha256'));
		assert.ok(result.stdout.includes('previousClientSecret'));
		assert.ok(result.stdout.includes('customFetchApi'));
		assert.ok(result.stdout.includes('without `nodejs_compat`'));
		assert.ok(result.stdout.includes('Never register a live webhook'));
	});

	it('prints the Intercom recipe with endpoint validation and the official SDK', async () => {
		const result = await runCli(['add', 'intercom', '--print']);

		assert.equal(result.code, 0);
		assert.ok(result.stdout.includes('@flue/intercom'));
		assert.ok(result.stdout.includes('intercom-client@7.0.3'));
		assert.ok(result.stdout.includes('/channels/intercom/webhook'));
		assert.ok(result.stdout.includes('HEAD'));
		assert.ok(result.stdout.includes('X-Hub-Signature'));
		assert.ok(result.stdout.includes("version: '2.14'"));
		assert.ok(result.stdout.includes('nodejs_compat'));
		assert.ok(result.stdout.includes('Never register or modify a live webhook'));
	});

	it('prints the Zendesk recipe with signed ingress and a ticket-bound Fetch client', async () => {
		const result = await runCli(['add', 'zendesk', '--print']);

		assert.equal(result.code, 0);
		assert.ok(result.stdout.includes('@flue/zendesk'));
		assert.ok(result.stdout.includes('lossless-json@4.3.0'));
		assert.ok(result.stdout.includes('/channels/zendesk/webhook'));
		assert.ok(result.stdout.includes('X-Zendesk-Webhook-Signature'));
		assert.ok(result.stdout.includes('X-Zendesk-Webhook-Signature-Timestamp'));
		assert.ok(result.stdout.includes('/api/v2/tickets/'));
		assert.ok(result.stdout.includes('nodejs_compat'));
		assert.ok(result.stdout.includes('Never create or modify a live webhook'));
	});

	it('prints the Salesforce Marketing Cloud recipe with signed ENS batches', async () => {
		const result = await runCli(['add', 'salesforce-marketing-cloud', '--print']);

		assert.equal(result.code, 0);
		assert.ok(result.stdout.includes('@flue/salesforce-marketing-cloud'));
		assert.ok(result.stdout.includes('/channels/salesforce-marketing-cloud/events'));
		assert.ok(result.stdout.includes('x-sfmc-ens-signature'));
		assert.ok(result.stdout.includes('.rest.marketingcloudapis.com'));
		assert.ok(result.stdout.includes('/platform/v1/ens-callbacks/'));
		assert.ok(result.stdout.includes('nodejs_compat'));
		assert.ok(result.stdout.includes('Never register or modify a live callback'));
	});

	it('prints the Twilio recipe with the Workers-compatible Fetch path', async () => {
		const result = await runCli(['add', 'twilio', '--print']);

		assert.equal(result.code, 0);
		assert.ok(result.stdout.includes('@flue/twilio'));
		assert.ok(result.stdout.includes('/channels/twilio/webhook'));
		assert.ok(result.stdout.includes('/channels/twilio/status'));
		assert.ok(result.stdout.includes('X-Twilio-Signature'));
		assert.ok(result.stdout.includes('application/x-www-form-urlencoded'));
		assert.ok(result.stdout.includes('Do not install the official `twilio` Node helper'));
	});

	it('prints the Messenger recipe with verified batches and the Graph Fetch path', async () => {
		const result = await runCli(['add', 'messenger', '--print']);

		assert.equal(result.code, 0);
		assert.ok(result.stdout.includes('@flue/messenger'));
		assert.ok(result.stdout.includes('/channels/messenger/webhook'));
		assert.ok(result.stdout.includes('X-Hub-Signature-256'));
		assert.ok(result.stdout.includes('EVENT_RECEIVED'));
		assert.ok(result.stdout.includes('entry.changes'));
		assert.ok(result.stdout.includes('Graph API Fetch client'));
	});

	it('prints the Teams channel recipe with the Workers-compatible Fetch path', async () => {
		const result = await runCli(['add', 'teams', '--print']);
		assert.equal(result.code, 0);
		assert.ok(result.stdout.startsWith('# Add a Microsoft Teams Channel to Flue'));
		assert.ok(result.stdout.includes('export const channel'));
		assert.ok(result.stdout.includes('export const client'));
		assert.ok(result.stdout.includes('/channels/teams/activities'));
		assert.ok(result.stdout.includes('https://api.botframework.com/.default'));
	});

	it('prints the Google Chat recipe with both verified HTTP surfaces', async () => {
		const result = await runCli(['add', 'google-chat', '--print']);
		assert.equal(result.code, 0);
		assert.ok(result.stdout.startsWith('# Add a Google Chat Channel to Flue'));
		assert.ok(result.stdout.includes('export const channel'));
		assert.ok(result.stdout.includes('export const client'));
		assert.ok(result.stdout.includes('/channels/google-chat/interactions'));
		assert.ok(result.stdout.includes('/channels/google-chat/events'));
		assert.ok(result.stdout.includes('https://www.googleapis.com/auth/chat.bot'));
	});

	it('prints the Linear recipe with verified ingress and the official SDK path', async () => {
		const result = await runCli(['add', 'linear', '--print']);
		assert.equal(result.code, 0);
		assert.ok(result.stdout.startsWith('# Add a Linear Channel to Flue'));
		assert.ok(result.stdout.includes('export const channel'));
		assert.ok(result.stdout.includes('export const client'));
		assert.ok(result.stdout.includes('/channels/linear/webhook'));
		assert.ok(result.stdout.includes('@linear/sdk@^86.0.0'));
		assert.ok(result.stdout.includes('nodejs_compat'));
	});

	it('prints the Telegram recipe with verified ingress and the Workers client path', async () => {
		const result = await runCli(['add', 'telegram', '--print']);
		assert.equal(result.code, 0);
		assert.ok(result.stdout.startsWith('# Add a Telegram Channel to Flue'));
		assert.ok(result.stdout.includes('export const channel'));
		assert.ok(result.stdout.includes('export const client'));
		assert.ok(result.stdout.includes('/channels/telegram/webhook'));
		assert.ok(result.stdout.includes('grammy@^1.43.0'));
		assert.ok(result.stdout.includes('nodejs_compat'));
	});

	it('prints a named channel recipe without registry frontmatter', async () => {
		const result = await runCli(['add', 'slack', '--print']);
		assert.equal(result.code, 0);
		assert.ok(result.stdout.startsWith('# Add a Slack Channel to Flue'));
		assert.ok(result.stdout.includes('export const channel'));
		assert.ok(result.stdout.includes('export const client'));
		assert.ok(result.stdout.includes('@slack/web-api@^8.0.0-rc.1'));
		assert.ok(result.stdout.includes('/channels/slack/commands'));
		assert.ok(!result.stdout.startsWith('---'));
	});

	it('substitutes the provider research URL into the generic channel recipe', async () => {
		const url = 'https://docs.example.test/webhooks';
		const result = await runCli(['add', url, '--category', 'channel', '--print']);
		assert.equal(result.code, 0);
		assert.ok(result.stdout.includes(`\`${url}\``));
		assert.ok(!result.stdout.includes('{{URL}}'));
	});

	it('rejects an unknown category with both known categories in the guidance', async () => {
		const result = await runCli([
			'add',
			'https://docs.example.test',
			'--category',
			'unknown',
			'--print',
		]);
		assert.equal(result.code, 1);
		assert.ok(result.stderr.includes('Known categories: channel, sandbox'));
	});
});
