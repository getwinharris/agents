// bapX MCP endpoint — the inbound bridge at https://api.bapx.in/mcp
//
// Lets an external MCP client (Claude, Codex, and others) reach a business's
// bapX capabilities using a bapX-issued API key. The same key that authorises
// /v1 authorises here, and resolves to exactly one account, so tenancy is
// enforced at the door.
//
// Transport is Streamable HTTP (MCP 2025-06-18), which replaced HTTP+SSE. The
// spec requires one endpoint path serving POST and GET.
//
// Deliberately stateless: assigning an Mcp-Session-Id is a MAY, not a MUST, and
// the 2026-07-28 release candidate removes sessions from the protocol entirely.
// A stateless server needs no sticky routing and cannot leak one client's
// session to another.

const JSONRPC = '2.0';

// Versions this server will negotiate. An unknown version in the header is a
// 400 per the transport spec, not a silent downgrade.
const SUPPORTED_PROTOCOL_VERSIONS = new Set(['2025-03-26', '2025-06-18', '2025-11-25']);
const PREFERRED_PROTOCOL_VERSION = '2025-06-18';

// Errors: JSON-RPC reserved range, plus MCP's own usage.
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

export const MAX_MCP_BODY_BYTES = 1024 * 1024;

function rpcError(id, code, message, data) {
	const error = { code, message };
	if (data !== undefined) error.data = data;
	return { jsonrpc: JSONRPC, id: id ?? null, error };
}

function rpcResult(id, result) {
	return { jsonrpc: JSONRPC, id, result };
}

// The transport spec REQUIRES Origin validation to stop DNS rebinding. A
// non-browser client (the normal case here) sends no Origin at all, which is
// fine; a browser-originated request must come from a bapX surface.
export function isAllowedMcpOrigin(origin) {
	if (!origin) return true;
	try {
		const parsed = new URL(origin);
		if (parsed.protocol !== 'https:') return false;
		return parsed.hostname === 'bapx.in' || parsed.hostname.endsWith('.bapx.in');
	} catch {
		return false;
	}
}

export function negotiateProtocolVersion(header) {
	// Absent header means a pre-negotiation or older client; the spec says assume
	// 2025-03-26 rather than reject.
	if (!header) return { ok: true, version: '2025-03-26' };
	const version = String(header).trim();
	if (!SUPPORTED_PROTOCOL_VERSIONS.has(version)) return { ok: false, version };
	return { ok: true, version };
}

// Tools are declared once and executed by name. Each carries the JSON Schema an
// MCP client needs to call it correctly.
function toolDefinitions() {
	return [
		{
			name: 'list_models',
			title: 'List reachable models',
			description:
				'List the models this business can actually call, which is determined by the providers it has connected on Platform. A model absent from this list is not callable.',
			inputSchema: { type: 'object', properties: {}, additionalProperties: false },
		},
		{
			name: 'chat_completion',
			title: 'Call a model',
			description:
				'Send an OpenAI-compatible chat completion through the bapX gateway using the business\'s own provider credentials. Address the model as <provider>/<model>, exactly as returned by list_models.',
			inputSchema: {
				type: 'object',
				properties: {
					model: { type: 'string', description: 'Provider-prefixed model id, e.g. openai/gpt-4o-mini.' },
					messages: {
						type: 'array',
						description: 'OpenAI-format messages.',
						items: {
							type: 'object',
							properties: {
								role: { type: 'string', enum: ['system', 'user', 'assistant'] },
								content: { type: 'string' },
							},
							required: ['role', 'content'],
							additionalProperties: false,
						},
						minItems: 1,
					},
					temperature: { type: 'number', minimum: 0, maximum: 2 },
					max_tokens: { type: 'integer', minimum: 1 },
				},
				required: ['model', 'messages'],
				additionalProperties: false,
			},
		},
	];
}

export function mcpToolNames() {
	return toolDefinitions().map((tool) => tool.name);
}

// One call to the API plane. The caller's bapX key never travels onward — it
// authenticates the customer to us and means nothing to the plane, which is
// reached with its own credential.
async function callPlane({ origin, planeToken, path, method = 'GET', body }) {
	const headers = { accept: 'application/json' };
	if (planeToken) headers.authorization = `Bearer ${planeToken}`;
	if (body !== undefined) headers['content-type'] = 'application/json';
	const response = await fetch(new URL(path, origin), {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const text = await response.text();
	let parsed;
	try {
		parsed = text ? JSON.parse(text) : null;
	} catch {
		parsed = null;
	}
	return { ok: response.ok, status: response.status, body: parsed, text };
}

// MCP reports tool failures inside a successful result with isError, so the
// model can read and react to them, rather than as JSON-RPC protocol errors.
function toolFailure(message) {
	return { content: [{ type: 'text', text: message }], isError: true };
}

function toolText(value) {
	return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

async function runTool(name, args, context) {
	if (name === 'list_models') {
		const response = await callPlane({ ...context, path: '/v1/models' });
		if (!response.ok) return toolFailure(`The API plane returned ${response.status} for /v1/models.`);
		const models = Array.isArray(response.body?.data) ? response.body.data.map((entry) => entry.id) : [];
		if (!models.length) {
			return toolText('No models are reachable. Connect a model provider on https://platform.bapx.in/ first — bapX routes your own provider credentials and does not resell capacity.');
		}
		return toolText({ count: models.length, models });
	}

	if (name === 'chat_completion') {
		if (!args || typeof args.model !== 'string' || !Array.isArray(args.messages) || !args.messages.length) {
			return toolFailure('chat_completion requires a model string and a non-empty messages array.');
		}
		const payload = { model: args.model, messages: args.messages, stream: false };
		if (typeof args.temperature === 'number') payload.temperature = args.temperature;
		if (Number.isInteger(args.max_tokens)) payload.max_tokens = args.max_tokens;
		const response = await callPlane({ ...context, path: '/v1/chat/completions', method: 'POST', body: payload });
		if (!response.ok) {
			const detail = response.body?.error?.message || `status ${response.status}`;
			return toolFailure(`The model call failed: ${detail}`);
		}
		const message = response.body?.choices?.[0]?.message?.content;
		return toolText(message ?? response.body);
	}

	return null;
}

// Handle one JSON-RPC message. Returns null for notifications, which the
// transport answers with 202 and no body.
export async function handleMcpMessage(message, context) {
	if (!message || typeof message !== 'object' || Array.isArray(message)) {
		return rpcError(null, INVALID_REQUEST, 'Request must be a JSON-RPC object.');
	}
	if (message.jsonrpc !== JSONRPC) {
		return rpcError(message.id ?? null, INVALID_REQUEST, 'Only JSON-RPC 2.0 is supported.');
	}
	const { method, id } = message;
	if (typeof method !== 'string') {
		return rpcError(id ?? null, INVALID_REQUEST, 'A method name is required.');
	}

	// Notifications carry no id and MUST NOT be answered with a response body.
	const isNotification = id === undefined || id === null;

	if (method === 'initialize') {
		return rpcResult(id, {
			protocolVersion: PREFERRED_PROTOCOL_VERSION,
			capabilities: { tools: { listChanged: false } },
			serverInfo: { name: 'bapx', title: 'bapX', version: '1' },
			instructions:
				'bapX routes calls through the model providers this business has connected on Platform, using its own credentials. Call list_models before chat_completion — a model that is not listed is not callable.',
		});
	}

	if (method === 'notifications/initialized' || method.startsWith('notifications/')) {
		return null;
	}

	if (method === 'ping') {
		return isNotification ? null : rpcResult(id, {});
	}

	if (method === 'tools/list') {
		return rpcResult(id, { tools: toolDefinitions() });
	}

	if (method === 'tools/call') {
		const params = message.params;
		if (!params || typeof params.name !== 'string') {
			return rpcError(id, INVALID_PARAMS, 'tools/call requires a tool name.');
		}
		const known = toolDefinitions().some((tool) => tool.name === params.name);
		if (!known) {
			return rpcError(id, INVALID_PARAMS, `Unknown tool: ${params.name}`);
		}
		try {
			const result = await runTool(params.name, params.arguments || {}, context);
			return rpcResult(id, result ?? toolFailure('The tool produced no result.'));
		} catch {
			// Never surface an upstream exception verbatim — it can carry the
			// plane's own credential or internal hostnames.
			return rpcResult(id, toolFailure('The tool failed while calling the bapX API plane.'));
		}
	}

	if (isNotification) return null;
	return rpcError(id, METHOD_NOT_FOUND, `Unknown method: ${method}`);
}

export const MCP_ERRORS = { PARSE_ERROR, INVALID_REQUEST, METHOD_NOT_FOUND, INVALID_PARAMS, INTERNAL_ERROR };
