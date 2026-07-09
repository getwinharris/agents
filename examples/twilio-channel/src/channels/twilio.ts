import { defineTool, dispatch } from '@bapX/runtime';
import { createTwilioChannel, type TwilioConversationRef } from '@bapX/twilio';
import * as v from 'valibot';
import assistant from '../agents/assistant.ts';
import { TwilioClient } from '../twilio-client.ts';

export const client = new TwilioClient({
	accountSid: requiredEnv('TWILIO_ACCOUNT_SID'),
	authToken: requiredEnv('TWILIO_AUTH_TOKEN'),
});

export const channel = createTwilioChannel({
	accountSid: requiredEnv('TWILIO_ACCOUNT_SID'),
	authToken: requiredEnv('TWILIO_AUTH_TOKEN'),
	webhookUrl: requiredEnv('TWILIO_WEBHOOK_URL'),
	destination: {
		type: 'address',
		address: requiredEnv('TWILIO_PHONE_NUMBER'),
	},

	// Path: /channels/twilio/webhook
	async webhook({ payload, conversation }) {
		if (payload.OptOutType === 'STOP') return;
		const attributes: Record<string, string> = {
			messageSid: payload.MessageSid,
			from: payload.From,
		};
		const numMedia = Number(payload.NumMedia ?? '0');
		if (numMedia > 0) {
			attributes.numMedia = String(numMedia);
			for (let index = 0; index < numMedia; index += 1) {
				const contentType = payload[`MediaContentType${index}`];
				if (typeof contentType === 'string') {
					attributes[`mediaContentType${index}`] = contentType;
				}
			}
		}
		await dispatch(assistant, {
			id: channel.conversationKey(conversation),
			message: {
				kind: 'signal',
				type: 'twilio.message',
				body: payload.Body,
				attributes,
			},
		});
	},
});

export function postMessage(ref: TwilioConversationRef) {
	return defineTool({
		name: 'post_twilio_message',
		description: 'Post a message to the Twilio conversation bound to this agent.',
		input: v.object({ text: v.pipe(v.string(), v.minLength(1)) }),
		async run({ input }) {
			const result = await client.messages.create({
				to: ref.participant,
				body: input.text,
				...(ref.type === 'messaging-service'
					? { messagingServiceSid: ref.messagingServiceSid }
					: { from: ref.address }),
			});
			return { messageSid: result.sid };
		},
	});
}

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required.`);
	return value;
}
