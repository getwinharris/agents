#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createFlueClient } from '@flue/sdk';
import { ulid } from 'ulidx';
import {
	type ConsoleResource,
	createConsoleController,
} from '../src/console-controller.ts';
import { boundedShutdown } from '../src/console-shutdown.ts';
import { openConsoleUi } from '../src/console-ui.tsx';

const usage = `Usage:
  flue-dev-console <agent:name|workflow:name> --server <url> [options]

Options:
  --server <url>         Absolute URL of the mounted Flue application
  --id <id>              Agent instance ID; generated when omitted
  --input <json>         Initial agent input or workflow input
  --token <token>        Bearer token sent with every request
  --header 'Name: value' Repeatable request header
  --help                 Show usage
  --version              Show package version
`;

async function main(): Promise<void> {
	const { positionals, values } = parseArgs({
		args: process.argv.slice(2),
		allowPositionals: true,
		strict: true,
		options: {
			server: { type: 'string' },
			id: { type: 'string' },
			input: { type: 'string' },
			token: { type: 'string' },
			header: { type: 'string', multiple: true },
			help: { type: 'boolean', short: 'h' },
			version: { type: 'boolean', short: 'v' },
		},
	});
	if (values.help) {
		process.stdout.write(usage);
		return;
	}
	if (values.version) {
		const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
		process.stdout.write(`${pkg.version}\n`);
		return;
	}
	const resource = parseResource(positionals);
	const server = parseServer(values.server);
	if (resource.kind === 'workflow' && values.id !== undefined) {
		throw new Error('--id is supported only for agents.');
	}
	const initialInput = values.input === undefined ? undefined : parseJson(values.input);
	if (resource.kind === 'agent' && initialInput !== undefined) validateAgentInput(initialInput);
	const headers = parseHeaders(values.header ?? []);
	if (values.token !== undefined && headers.authorization !== undefined) {
		throw new Error('--token cannot be combined with an Authorization header.');
	}
	if (!process.stdin.isTTY || !process.stderr.isTTY) {
		throw new Error('flue-dev-console requires an interactive TTY.');
	}
	const client = createFlueClient({
		baseUrl: server,
		headers,
		token: values.token,
	});
	const attachedResource: ConsoleResource = resource.kind === 'agent'
		? { ...resource, instanceId: values.id ?? ulid() }
		: resource;
	const controller = createConsoleController({ client, resource: attachedResource, server, initialInput });
	const ui = openConsoleUi(controller);
	let shutdownPromise: Promise<void> | undefined;
	const shutdown = (exitCode: number) => {
		if (shutdownPromise) return shutdownPromise;
		shutdownPromise = boundedShutdown({
			close: () => controller.close(),
			forceCloseSync: () => controller.forceCloseSync(),
			exitCode,
			beforeTerminate: () => ui.close(),
		}).finally(() => ui.close());
		return shutdownPromise;
	};
	process.once('SIGINT', () => void shutdown(130));
	process.once('SIGTERM', () => void shutdown(143));
	try {
		const starting = controller.start();
		if (resource.kind === 'workflow') {
			await starting;
			if (controller.getSnapshot().status === 'failed') process.exitCode = 1;
		}
		await ui.waitUntilExit();
	} finally {
		await shutdown(typeof process.exitCode === 'number' ? process.exitCode : 0);
	}
}

function parseResource(positionals: readonly string[]):
	| { kind: 'agent'; name: string }
	| { kind: 'workflow'; name: string } {
	const [value, ...extra] = positionals;
	if (!value) throw new Error('Missing resource. Expected agent:<name> or workflow:<name>.');
	if (extra.length > 0) throw new Error(`Unexpected argument: ${extra[0]}`);
	const separator = value.indexOf(':');
	const kind = value.slice(0, separator);
	const name = value.slice(separator + 1);
	if ((kind !== 'agent' && kind !== 'workflow') || !name) {
		throw new Error('Resource must be qualified as agent:<name> or workflow:<name>.');
	}
	return { kind, name };
}

function parseServer(value: string | undefined): string {
	if (!value) throw new Error('Missing required --server <url>.');
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`--server must be an absolute URL: ${JSON.stringify(value)}.`);
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error(`--server must use http or https: ${JSON.stringify(value)}.`);
	}
	if (url.search || url.hash) throw new Error('--server must not include a query string or fragment.');
	return url.toString().replace(/\/$/, '');
}

function parseHeaders(values: readonly string[]): Record<string, string> {
	const headers: Record<string, string> = {};
	for (const value of values) {
		const separator = value.indexOf(':');
		if (separator <= 0) throw new Error(`Invalid header: ${JSON.stringify(value)}.`);
		const name = value.slice(0, separator).trim();
		const headerValue = value.slice(separator + 1).trim();
		if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) {
			throw new Error(`Invalid header name: ${JSON.stringify(name)}.`);
		}
		headers[name.toLowerCase()] = headerValue;
	}
	return headers;
}

function parseJson(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		throw new Error(`Invalid JSON for --input: ${value}`);
	}
}

function validateAgentInput(value: unknown): void {
	if (!isRecord(value) || typeof value.message !== 'string') {
		throw new Error('Agent input must be an object with a string "message" field.');
	}
	const keys = Object.keys(value);
	if (keys.some((key) => key !== 'message' && key !== 'images')) {
		throw new Error('Agent input accepts only "message" and optional "images" fields.');
	}
	if (value.images !== undefined && !(
		Array.isArray(value.images)
		&& value.images.every((image) =>
			isRecord(image)
			&& image.type === 'image'
			&& typeof image.data === 'string'
			&& typeof image.mimeType === 'string')
	)) {
		throw new Error('Agent input "images" must be an array of image objects.');
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

void main().catch((error) => {
	process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
});
