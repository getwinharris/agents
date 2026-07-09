import { createResendChannel } from '@bapX/resend';
import { defineTool, dispatch, type JsonValue } from '@bapX/runtime';
import assistant from '../agents/assistant.ts';
import { createResendClient } from '../resend-client.ts';

const EMAIL_INSTANCE_PREFIX = 'resend-email:';

export const client = createResendClient(requiredEnv('RESEND_API_KEY'));

export const channel = createResendChannel({
	client,
	webhookSecret: requiredEnv('RESEND_WEBHOOK_SECRET'),

	// Path: /channels/resend/webhook
	async webhook({ event, delivery }) {
		switch (event.type) {
			case 'email.received': {
				await dispatch(assistant, {
					id: emailInstanceId(event.data.email_id),
					message: {
						kind: 'signal',
						type: 'resend.email.received',
						// The webhook carries envelope data only; the agent retrieves the
						// full email text through the retrieve_resend_email tool.
						body: event.data.subject,
						attributes: {
							deliveryId: delivery.id,
							emailId: event.data.email_id,
							messageId: event.data.message_id,
							from: event.data.from,
							to: event.data.to.join(', '),
							...(event.data.cc.length === 0 ? {} : { cc: event.data.cc.join(', ') }),
							...(event.data.attachments.length === 0
								? {}
								: { attachmentCount: String(event.data.attachments.length) }),
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

export function retrieveReceivedEmail(emailId: string) {
	return defineTool({
		name: 'retrieve_resend_email',
		description: 'Retrieve the complete inbound email already bound to this agent.',
		async run() {
			const result = await client.emails.receiving.get(emailId);
			if (result.error) throw new Error(result.error.message);
			return result.data as unknown as JsonValue;
		},
	});
}

export function emailInstanceId(emailId: string): string {
	if (!emailId) throw new TypeError('Resend email id must be non-empty.');
	return `${EMAIL_INSTANCE_PREFIX}${encodeURIComponent(emailId)}`;
}

export function emailIdFromInstanceId(id: string): string {
	if (!id.startsWith(EMAIL_INSTANCE_PREFIX)) {
		throw new TypeError('Expected a local Resend email instance id.');
	}
	const encodedEmailId = id.slice(EMAIL_INSTANCE_PREFIX.length);
	if (!encodedEmailId) throw new TypeError('Expected a local Resend email instance id.');
	const emailId = decodeURIComponent(encodedEmailId);
	if (!emailId) throw new TypeError('Expected a local Resend email instance id.');
	return emailId;
}

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required.`);
	return value;
}
