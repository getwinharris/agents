/**
 * Builds a sanitized environment for spawned CLI children so test assertions
 * do not depend on the developer's shell:
 *
 * - The runtime resolves model-provider credentials from the environment
 *   (pi-ai's env API-key registry: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
 *   `GEMINI_API_KEY`, `AWS_*` Bedrock credentials, `GOOGLE_*` Vertex
 *   settings, ...). An exported key would let a spawned `bapX run` reach the
 *   live provider instead of failing with "No API key for provider".
 * - `bapX add`/`bapX update` detect coding agents through environment markers
 *   (@vercel/detect-agent: `CLAUDECODE`, `CODEX_*`, `CURSOR_*`, ...) and
 *   print raw blueprint Markdown instead of human instructions when one is
 *   present — e.g. when the tests themselves run under a coding agent.
 */

const STRIPPED_KEY_PATTERNS = [
	// Model-provider credentials and settings read by the runtime.
	/API_KEY/,
	/^ANTHROPIC_/,
	/^AWS_/,
	/^GOOGLE_/,
	/^GCLOUD_/,
	/^COPILOT_/,
	/^HF_TOKEN$/,
	// Coding-agent markers read by @vercel/detect-agent.
	/^AI_AGENT$/,
	/^CLAUDE/,
	/^CODEX_/,
	/^CURSOR_/,
	/^GEMINI_/,
	/^ANTIGRAVITY_/,
	/^AUGMENT_/,
	/^OPENCODE_/,
	/^REPL_ID$/,
];

export function sanitizedChildEnv(overrides = {}) {
	const env = { ...process.env };
	for (const key of Object.keys(env)) {
		if (STRIPPED_KEY_PATTERNS.some((pattern) => pattern.test(key))) delete env[key];
	}
	return { ...env, ...overrides };
}
