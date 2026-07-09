import { defineTool, dispatch } from '@bapX/runtime';
import { createTeamsChannel, type TeamsConversationRef } from '@bapX/teams';
import * as v from 'valibot';
import assistant from '../agents/assistant.ts';
import { createTeamsClient } from '../lib/teams-client.ts';

const appId = requiredEnv('TEAMS_APP_ID');
const tenantId = requiredEnv('TEAMS_TENANT_ID');
const oauthAuthority = optionalEnv('TEAMS_OAUTH_AUTHORITY');
const openIdMetadataUrl = optionalEnv('TEAMS_OPENID_METADATA_URL');
const tokenIssuer = optionalEnv('TEAMS_TOKEN_ISSUER');

export const client = createTeamsClient({
	appId,
	tenantId,
	appPassword: requiredEnv('TEAMS_APP_PASSWORD'),
	...(oauthAuthority === undefined ? {} : { oauthAuthority }),
});

export const channel = createTeamsChannel({
	appId,
	tenantId,
	...(openIdMetadataUrl === undefined ? {} : { openIdMetadataUrl }),
	...(tokenIssuer === undefined ? {} : { tokenIssuer }),

	// Path: /channels/teams/activities
	async activities({ activity }) {
		if (activity.type !== 'message' || !activity.text) return;
		await dispatch(assistant, {
			id: channel.conversationKey(channel.destination(activity)),
			message: {
				kind: 'signal',
				type: 'teams.message',
				body: activity.text,
				attributes: {
					...(activity.id === undefined ? {} : { activityId: activity.id }),
					senderId: activity.from.id,
					senderName: activity.from.name,
				},
			},
		});
	},
});

export function postMessage(ref: TeamsConversationRef) {
	return defineTool({
		name: 'post_teams_message',
		description: 'Post a message to the Microsoft Teams conversation bound to this agent.',
		input: v.object({ text: v.pipe(v.string(), v.minLength(1)) }),
		async run({ input }) {
			const result = await client.postMessage(ref, input.text);
			return { activityId: result.id };
		},
	});
}

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required.`);
	return value;
}

function optionalEnv(name: string): string | undefined {
	return process.env[name] || undefined;
}
