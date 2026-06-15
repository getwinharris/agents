import { describe, expect, it } from 'vitest';
import { parseBlueprintFrontmatter, validateBlueprintBody } from '../src/lib/blueprint-index.ts';

describe('parseBlueprintFrontmatter()', () => {
	it('returns versions for named and root blueprints when positive integers', () => {
		const named = parseBlueprintFrontmatter(
			'---\n{"kind":"channel","version":2,"website":"https://example.com"}\n---\nBody',
			'channel--example.md',
		);
		const root = parseBlueprintFrontmatter(
			'---\n{"kind":"channel","version":3,"root":true}\n---\nBody',
			'channel.md',
		);

		expect(named.version).toBe(2);
		expect(root.version).toBe(3);
	});

	it('rejects a missing version', () => {
		expect(() =>
			parseBlueprintFrontmatter(
				'---\n{"kind":"channel","website":"https://example.com"}\n---\nBody',
				'channel--example.md',
			),
		).toThrow('required positive integer field "version"');
	});

	it('rejects non-positive, non-integer, and unsafe versions', () => {
		for (const version of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
			expect(() =>
				parseBlueprintFrontmatter(
					`---\n{"kind":"channel","version":${version},"root":true}\n---\nBody`,
					'channel.md',
				),
			).toThrow('required positive integer field "version"');
		}
	});
});

describe('validateBlueprintBody()', () => {
	it('accepts a complete contiguous upgrade history matching the current version', () => {
		const source = `# Example

## Setup

Current instructions.

## Upgrade Guide

### Version 1 — 2026-06-13

Initial version.

### Version 2 — 2026-06-14

Changed the integration.

\`\`\`diff
--- a/channels/example.ts
+++ b/channels/example.ts
@@ -1 +1 @@
-old
+new
\`\`\`
`;

		expect(() => validateBlueprintBody(source, 'channel--example.md', 2)).not.toThrow();
	});

	it('rejects an upgrade guide that is missing, duplicated, or not the final H2 section', () => {
		const cases = [
			'# Example\n\n## Setup\n',
			'# Example\n\n## Upgrade Guide\n\n### Version 1 — 2026-06-14\n\nInitial version.\n\n## Upgrade Guide\n',
			'# Example\n\n## Upgrade Guide\n\n### Version 1 — 2026-06-14\n\nInitial version.\n\n## Setup\n',
		];

		for (const source of cases) {
			expect(() => validateBlueprintBody(source, 'channel--example.md', 1)).toThrow();
		}
	});

	it('rejects non-contiguous entries or histories that do not match frontmatter version', () => {
		const skipped = `## Upgrade Guide

### Version 1 — 2026-06-13

Initial version.

### Version 3 — 2026-06-14

\`\`\`diff
--- a/file.ts
+++ b/file.ts
\`\`\`
`;
		const short = '## Upgrade Guide\n\n### Version 1 — 2026-06-14\n\nInitial version.\n';

		expect(() => validateBlueprintBody(skipped, 'channel--example.md', 2)).toThrow(
			'expected Version 2',
		);
		expect(() => validateBlueprintBody(short, 'channel--example.md', 2)).toThrow(
			'exactly 2 version entries',
		);
	});

	it('rejects a Version 1 body with content other than the initial-version sentence', () => {
		const source =
			'## Upgrade Guide\n\n### Version 1 — 2026-06-14\n\nInitial version.\n\nMore text.\n';

		expect(() => validateBlueprintBody(source, 'channel--example.md', 1)).toThrow(
			'body must be exactly "Initial version."',
		);
	});

	it('rejects later versions without a fenced unified diff and file headers', () => {
		const source = `## Upgrade Guide

### Version 1 — 2026-06-13

Initial version.

### Version 2 — 2026-06-14

\`\`\`diff
@@ -1 +1 @@
-old
+new
\`\`\`
`;

		expect(() => validateBlueprintBody(source, 'channel--example.md', 2)).toThrow(
			'must contain a fenced unified diff',
		);
	});
});
