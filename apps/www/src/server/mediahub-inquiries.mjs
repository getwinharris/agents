import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SERVICES = new Set([
	'Brand strategy and identity',
	'Content and production',
	'Social Media Management',
	'Digital Marketing',
	'Websites and commerce',
	'AI, data, and automation',
	'Forward-deployed engineering',
]);
const BUDGETS = new Set(['Under ₹50,000', '₹50,000–₹1,50,000', '₹1,50,000–₹5,00,000', 'Above ₹5,00,000', 'Need help scoping']);
const TIMELINES = new Set(['As soon as possible', 'Within 30 days', 'This quarter', 'Exploring options']);
const STATUSES = new Set(['new', 'contacted', 'qualified', 'closed']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+()\-\s0-9]{7,24}$/;

export class MediaHubInquiryError extends Error {
	constructor(code, message, status = 400, fields = {}) {
		super(message);
		this.name = 'MediaHubInquiryError';
		this.code = code;
		this.status = status;
		this.fields = fields;
	}
}

function clean(value, max) {
	return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function readCollection(file) {
	try {
		const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
		if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.inquiries)) throw new Error('Invalid inquiry collection');
		return parsed;
	} catch (error) {
		if (error?.code === 'ENOENT') return { schemaVersion: 1, inquiries: [] };
		throw error;
	}
}

function writeCollection(file, collection) {
	fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
	const temporary = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
	fs.writeFileSync(temporary, `${JSON.stringify(collection, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
	fs.renameSync(temporary, file);
}

function validate(payload, now) {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new MediaHubInquiryError('invalid_request', 'Submit the project brief form again.');
	if (clean(payload.website, 200)) throw new MediaHubInquiryError('spam_rejected', 'Your brief could not be submitted.');
	const startedAt = Number(payload.startedAt);
	if (!Number.isFinite(startedAt) || now - startedAt < 2_000 || now - startedAt > 86_400_000) {
		throw new MediaHubInquiryError('invalid_form_session', 'Refresh the page and try again.');
	}
	const inquiry = {
		name: clean(payload.name, 100),
		email: clean(payload.email, 254).toLowerCase(),
		phone: clean(payload.phone, 24),
		organisation: clean(payload.organisation, 120),
		service: clean(payload.service, 80),
		budget: clean(payload.budget, 60),
		timeline: clean(payload.timeline, 60),
		brief: String(payload.brief ?? '').replace(/\r\n?/g, '\n').trim().slice(0, 4_000),
		consent: payload.consent === true,
	};
	const fields = {};
	if (inquiry.name.length < 2) fields.name = 'Enter your name.';
	if (!EMAIL_PATTERN.test(inquiry.email)) fields.email = 'Enter a valid work email.';
	if (inquiry.phone && !PHONE_PATTERN.test(inquiry.phone)) fields.phone = 'Enter a valid phone number or leave it blank.';
	if (inquiry.organisation.length < 2) fields.organisation = 'Enter your organisation.';
	if (!SERVICES.has(inquiry.service)) fields.service = 'Choose a service.';
	if (!BUDGETS.has(inquiry.budget)) fields.budget = 'Choose a budget range.';
	if (!TIMELINES.has(inquiry.timeline)) fields.timeline = 'Choose a timeline.';
	if (inquiry.brief.length < 30) fields.brief = 'Tell us a little more (at least 30 characters).';
	if (!inquiry.consent) fields.consent = 'Consent is required so we can respond to your brief.';
	if (Object.keys(fields).length) throw new MediaHubInquiryError('validation_failed', 'Check the highlighted fields.', 422, fields);
	return inquiry;
}

function publicSource(payload, headers) {
	const allowed = (value, max = 120) => clean(value, max);
	const publicUrl = (value, max) => {
		const candidate = allowed(value, max);
		if (!candidate) return '';
		try {
			const parsed = new URL(candidate);
			if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return '';
			return parsed.toString().slice(0, max);
		} catch {
			return '';
		}
	};
	return {
		page: publicUrl(payload.page, 240),
		referrer: publicUrl(payload.referrer, 500),
		utmSource: allowed(payload.utmSource),
		utmMedium: allowed(payload.utmMedium),
		utmCampaign: allowed(payload.utmCampaign),
		utmContent: allowed(payload.utmContent),
		device: ['mobile', 'tablet', 'desktop'].includes(payload.device) ? payload.device : 'unknown',
		userAgent: allowed(headers['user-agent'], 300),
	};
}

export function createMediaHubInquiryStore({ file, now = () => Date.now() }) {
	if (!file) throw new TypeError('Inquiry store file is required');
	return Object.freeze({
		create(payload, context = {}) {
			const createdAtMs = now();
			const valid = validate(payload, createdAtMs);
			const collection = readCollection(file);
			const inquiry = {
				id: `mh_${crypto.randomUUID()}`,
				...valid,
				consentAt: new Date(createdAtMs).toISOString(),
				createdAt: new Date(createdAtMs).toISOString(),
				updatedAt: new Date(createdAtMs).toISOString(),
				status: 'new',
				source: publicSource(payload, context.headers || {}),
			};
			collection.inquiries.unshift(inquiry);
			writeCollection(file, collection);
			return { id: inquiry.id, createdAt: inquiry.createdAt };
		},
		list() {
			return readCollection(file).inquiries;
		},
		updateStatus(id, status) {
			if (!STATUSES.has(status)) throw new MediaHubInquiryError('invalid_status', 'Choose a valid inquiry status.', 422);
			const collection = readCollection(file);
			const inquiry = collection.inquiries.find((item) => item.id === id);
			if (!inquiry) throw new MediaHubInquiryError('not_found', 'Inquiry not found.', 404);
			inquiry.status = status;
			inquiry.updatedAt = new Date(now()).toISOString();
			writeCollection(file, collection);
			return inquiry;
		},
		summary() {
			const inquiries = readCollection(file).inquiries;
			const countBy = (key) => Object.fromEntries([...new Set(inquiries.map((item) => key(item) || 'unknown'))].map((value) => [value, inquiries.filter((item) => (key(item) || 'unknown') === value).length]));
			return { total: inquiries.length, byStatus: countBy((item) => item.status), byService: countBy((item) => item.service), bySource: countBy((item) => item.source?.utmSource || item.source?.referrer || 'direct'), byDevice: countBy((item) => item.source?.device) };
		},
	});
}
