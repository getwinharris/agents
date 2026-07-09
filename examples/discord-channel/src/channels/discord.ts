import { REST } from '@discordjs/rest';
import {
	type APIInteraction,
	type APIInteractionResponse,
	createDiscordChannel,
	type DiscordDestinationRef,
} from '@bapX/discord';
import { defineTool, dispatch } from '@bapX/runtime';
import * as v from 'valibot';
import assistant from '../agents/assistant.ts';

export const client = new REST({ version: '10' }).setToken(requiredEnv('DISCORD_BOT_TOKEN'));

export const channel = createDiscordChannel({
	publicKey: requiredEnv('DISCORD_PUBLIC_KEY'),

	// Path: /channels/discord/interactions
	async interactions({ interaction }) {
		if (interaction.type !== 2 || interaction.data.name !== 'ask') {
			return {
				type: 4,
				data: { content: 'Unsupported interaction.', flags: 64 },
			} satisfies APIInteractionResponse;
		}

		const destination = destinationFromInteraction(interaction);
		if (!destination || destination.type === 'private') {
			return {
				type: 4,
				data: { content: 'Unsupported interaction.', flags: 64 },
			} satisfies APIInteractionResponse;
		}

		// The first string option of the `/ask` chat-input command is the prompt.
		const question =
			interaction.data.type === 1
				? interaction.data.options?.find((option) => option.type === 3)?.value
				: undefined;
		await dispatch(assistant, {
			id: channel.conversationKey(destination),
			message: {
				kind: 'signal',
				type: 'discord.command.ask',
				body: question ?? JSON.stringify(interaction.data),
				attributes: { interactionId: interaction.id, commandName: interaction.data.name },
			},
		});
		return {
			type: 4,
			data: { content: 'Your request was accepted.', flags: 64 },
		} satisfies APIInteractionResponse;
	},
});

export function postMessage(ref: DiscordDestinationRef) {
	return defineTool({
		name: 'post_discord_message',
		description: 'Post a message to the Discord destination bound to this agent.',
		input: v.object({ content: v.pipe(v.string(), v.minLength(1)) }),
		async run({ input }) {
			const result = (await client.post(`/channels/${ref.channelId}/messages`, {
				body: { content: input.content },
			})) as { id?: string };
			return { ...(result.id === undefined ? {} : { messageId: result.id }) };
		},
	});
}

function destinationFromInteraction(
	interaction: APIInteraction,
): DiscordDestinationRef | undefined {
	const channelId = interaction.channel?.id ?? interaction.channel_id;
	if (!channelId) return undefined;
	if (interaction.guild_id) {
		return { type: 'guild', guildId: interaction.guild_id, channelId };
	}
	if (interaction.context === 2 || interaction.channel?.type === 3) {
		return { type: 'private', channelId };
	}
	if (interaction.context === 1 || interaction.channel?.type === 1) {
		return { type: 'dm', channelId };
	}
	return undefined;
}

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required.`);
	return value;
}
