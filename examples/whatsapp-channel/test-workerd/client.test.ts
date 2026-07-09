import type { WhatsAppConversationRef } from '@bapX/whatsapp';
import { WhatsAppClient } from '@kapso/whatsapp-cloud-api';
import { describe, expect, it, vi } from 'vitest';
import { sendTextMessage } from '../src/whatsapp-client.ts';

describe('sendTextMessage()', () => {
	it('sends phone, BSUID, and group text messages through Fetch in workerd', async () => {
		const fetch = vi
			.fn<typeof globalThis.fetch>()
			.mockResolvedValueOnce(
				Response.json({
					messaging_product: 'whatsapp',
					contacts: [{ input: '+15557006101', wa_id: '+15557006101' }],
					messages: [{ id: 'wamid_outbound_individual' }],
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					messaging_product: 'whatsapp',
					contacts: [
						{
							input: 'US.synthetic-worker-6101',
							user_id: 'US.synthetic-worker-6101',
						},
					],
					messages: [{ id: 'wamid_outbound_bsuid' }],
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					messaging_product: 'whatsapp',
					messages: [{ id: 'wamid_outbound_group' }],
				}),
			);
		const client = new WhatsAppClient({
			accessToken: 'synthetic-access-token',
			graphVersion: 'v25.0',
			fetch,
		});
		const phone: WhatsAppConversationRef = {
			type: 'individual',
			businessAccountId: 'waba_worker_61',
			phoneNumberId: 'phone_worker_61',
			destination: {
				type: 'phone-number',
				phoneNumber: '+15557006101',
			},
		};
		const userId: WhatsAppConversationRef = {
			type: 'individual',
			businessAccountId: 'waba_worker_61',
			phoneNumberId: 'phone_worker_61',
			destination: {
				type: 'user-id',
				userId: 'US.synthetic-worker-6101',
			},
		};
		const group: WhatsAppConversationRef = {
			type: 'group',
			businessAccountId: 'waba_worker_61',
			phoneNumberId: 'phone_worker_61',
			groupId: 'group_worker_61',
		};

		const individual = await sendTextMessage(client, phone, 'Individual response');
		const bsuid = await sendTextMessage(client, userId, 'BSUID response');
		const groupResult = await sendTextMessage(client, group, 'Group response');

		expect(individual.messages[0]?.id).toBe('wamid_outbound_individual');
		expect(bsuid.messages[0]?.id).toBe('wamid_outbound_bsuid');
		expect(groupResult.messages[0]?.id).toBe('wamid_outbound_group');
		expect(fetch).toHaveBeenCalledTimes(3);
		expect(String(fetch.mock.calls[0]?.[0])).toBe(
			'https://graph.facebook.com/v25.0/phone_worker_61/messages',
		);
		expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({
			Authorization: 'Bearer synthetic-access-token',
		});
		expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
			messaging_product: 'whatsapp',
			recipient_type: 'individual',
			to: '+15557006101',
			type: 'text',
			text: { body: 'Individual response' },
		});
		expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({
			messaging_product: 'whatsapp',
			recipient_type: 'individual',
			recipient: 'US.synthetic-worker-6101',
			type: 'text',
			text: { body: 'BSUID response' },
		});
		expect(JSON.parse(String(fetch.mock.calls[2]?.[1]?.body))).toEqual({
			messaging_product: 'whatsapp',
			recipient_type: 'group',
			to: 'group_worker_61',
			type: 'text',
			text: { body: 'Group response' },
		});
	});
});
