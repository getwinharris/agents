# Imported Skill Example

This example shows two supported contracts:

- `with-imported-skill` imports `src/skills/review/SKILL.md` with `{ type: 'skill' }`. The import is a lightweight `SkillReference`; the complete permitted skill directory, including `CHECKLIST.txt`, is packaged. Its files are readable during `session.skill(review)`, and during ordinary/session-by-name operations when the reference is registered in `skills: [review]`. Merely importing an unregistered reference does not expose its files to prompts.
- `with-custom-bash` imports `Bash` and `InMemoryFs` directly from `just-bash` to customize the virtual sandbox. Because application source imports it directly, `just-bash` is declared in this application's dependencies.

Run the imported skill on Node with an Anthropic key:

```bash
pnpm exec bapX run with-imported-skill --target node --env ../../.env
```

Run the deterministic custom-sandbox workflow on Node or Cloudflare local development:

```bash
pnpm exec bapX run with-custom-bash --target node
pnpm exec bapX dev --target cloudflare
```

Cloudflare builds and local development use the official Vite/workerd integration.
