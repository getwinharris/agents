import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createMediaHubInquiryStore, MediaHubInquiryError } from '../src/server/mediahub-inquiries.mjs';

const valid = (startedAt) => ({
	name: 'Anita Rao', email: 'ANITA@example.com', phone: '+91 98765 43210', organisation: 'Example Studio',
	service: 'Social Media Management', budget: '₹50,000–₹1,50,000', timeline: 'Within 30 days',
	brief: 'We need an audience-led social campaign and a reliable monthly publishing workflow.', consent: true, startedAt,
	page: 'https://mediahub.bapx.in/?utm_source=meta', referrer: 'javascript:alert(1)', utmSource: 'meta', utmCampaign: 'clinic-growth', device: 'mobile',
});

test('persists a validated, consented inquiry and derives private summaries', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mediahub-inquiry-'));
	const now = 1_800_000_000_000;
	const store = createMediaHubInquiryStore({ file: path.join(root, 'inquiries.json'), now: () => now });
	const created = store.create(valid(now - 5_000), { headers: { 'user-agent': 'Test Browser' } });
	assert.match(created.id, /^mh_/);
	const [item] = store.list();
	assert.equal(item.email, 'anita@example.com');
	assert.equal(item.status, 'new');
	assert.equal(item.source.utmSource, 'meta');
	assert.equal(item.source.device, 'mobile');
	assert.equal(item.source.page, 'https://mediahub.bapx.in/?utm_source=meta');
	assert.equal(item.source.referrer, '');
	assert.equal(store.summary().byStatus.new, 1);
	assert.equal(store.summary().byService['Social Media Management'], 1);
	assert.equal(store.updateStatus(item.id, 'qualified').status, 'qualified');
	assert.equal(store.summary().byStatus.qualified, 1);
});

test('rejects bots, missing consent, invalid enumerations, and underspecified briefs', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mediahub-inquiry-invalid-'));
	const now = 1_800_000_000_000;
	const store = createMediaHubInquiryStore({ file: path.join(root, 'inquiries.json'), now: () => now });
	assert.throws(() => store.create({ ...valid(now - 5_000), website: 'spam.example' }), (error) => error instanceof MediaHubInquiryError && error.code === 'spam_rejected');
	assert.throws(() => store.create({ ...valid(now - 5_000), consent: false, service: 'Anything', brief: 'short' }), (error) => Boolean(error.code === 'validation_failed' && error.fields.consent && error.fields.service && error.fields.brief));
	assert.throws(() => store.create(valid(now - 500)), (error) => error.code === 'invalid_form_session');
	assert.equal(fs.existsSync(path.join(root, 'inquiries.json')), false);
});

test('fails closed when the inquiry collection is corrupt', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mediahub-inquiry-corrupt-'));
	const file = path.join(root, 'inquiries.json'); fs.writeFileSync(file, '{broken');
	const store = createMediaHubInquiryStore({ file, now: () => 1_800_000_000_000 });
	assert.throws(() => store.list(), SyntaxError);
});
