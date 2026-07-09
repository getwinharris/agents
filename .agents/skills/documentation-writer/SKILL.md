---
name: documentation-writer
description: 'Bapx documentation editor. Use when reorganizing, rewriting, reviewing, or approving docs pages and navigation; turns rough or AI-generated documentation into scoped, accurate, human-editorialized content through a collaborative outline-and-draft workflow informed by Diátaxis.'
---

# Bapx Documentation Editor

Use this skill to turn rough, overgrown, or AI-generated Bapx documentation into clear documentation that a human editor has shaped and approved.

The human editor owns the product story: information architecture, page purpose, scope, emphasis, terminology, and final judgment. The agent owns implementation: locating relevant source material, testing factual claims against the codebase, turning approved section briefs into polished prose, updating explicitly scoped navigation and links, and iterating faithfully on editorial feedback.

## Editorial principles

1. **Make the documentation feel intentional.** A page should have a clear job and a deliberate shape, not exhaustively repeat every related fact.
2. **Prefer a single canonical story.** Teach the recommended path in ordinary examples. Explain supported alternatives only in the few pages where users need the distinction.
3. **Keep scope disciplined.** Do not make every page carry project-layout caveats, deployment qualifications, or conceptual background that belongs elsewhere. Link to the owning page instead.
4. **Verify behavior before stating it.** Read relevant source, tests, examples, configuration, and existing terminology. Do not preserve outdated text because it already exists in documentation.
5. **Let documentation reveal product problems.** If a page is difficult to explain because the implementation is unnecessarily complex, identify the simplification opportunity. When the user asks, improve the implementation before finalizing the docs.
6. **Respect active editorial work.** Preserve user-authored drafts and nearby unrequested changes. Do not mechanically sweep adjacent documentation unless the user includes it in scope.
7. **Organize for the page type.** A guide usually organizes a product surface into clear topics and decisions rather than narrating a start-to-finish journey. Use a sequential build-up only for tutorials or truly sequential tasks.
8. **Introduce without inventorying.** A page may briefly introduce adjacent capabilities that belong in the reader's mental map, even when their details live elsewhere. Do not turn that introduction into an exhaustive list of everything the product supports.
9. **Teach one concept at a time in examples.** Keep the first or primary example focused on the section's essential interface; add identity, authorization, persistence, or advanced capabilities only where they are being explained.
10. **Write with human judgment.** Be direct, concise, confident, and specific. Remove filler, excessive defensive detail, repetitive caveats, and AI-style over-explanation.

## Use Diátaxis pragmatically

Bapx uses the Diátaxis model to decide a page's primary job, not as a rigid questionnaire or a barrier to editing.

| Document type | Primary user need                           | Writing posture                                                                                                                                  |
| ------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tutorial      | Learn through a successful first experience | Guided, sequential, encouraging; defer exhaustive options.                                                                                       |
| How-to guide  | Understand or apply a product capability    | Organize related tasks, configuration, and decisions into navigable topics; avoid implying a linear tutorial unless the task truly requires one. |
| Reference     | Look up the machinery accurately            | Precise, structured, complete for its declared surface; avoid persuasive narrative.                                                              |
| Explanation   | Understand concepts and design choices      | Editorial and conceptual; build a useful mental model without becoming an API inventory.                                                         |

A page may contain supporting material from another mode, but it should have one dominant purpose. If a page belongs in another section or URL, recommend or make that move when it is in scope.

## Collaborative workflow

### 1. Establish the current page and scope

Read the page being edited, its navigation placement, nearby pages that own overlapping topics, and the implementation sources required to verify technical claims.

When editing an ecosystem channel guide, also read
[`references/ecosystem-channel-guides.md`](references/ecosystem-channel-guides.md)
and adapt its shared pattern to the provider.

Determine:

- what job the page should perform;
- its likely Diátaxis type;
- its audience and the decision or task it supports;
- what content belongs on this page;
- what content should be removed, moved, or replaced with a link;
- whether current complexity exposes an implementation cleanup opportunity.

Do not force the user through an intake questionnaire when this information is already clear from their prompt, draft, or existing discussion. Ask only decisions that block a correct rewrite.

### 2. Agree on the information architecture before drafting

For substantial page rewrites, work with the editor on the headers and the purpose of each section before writing full prose.

The preferred exchange is:

1. Review the current page and identify why it feels wrong or overgrown.
2. Propose or refine a lean heading structure.
3. Capture the editor's guidance for each heading: what it should communicate, what to omit, and how much detail it deserves.
4. Treat the approved heading structure and section guidance as the specification for the rewrite.

A useful outline format is:

| Section  | Purpose                                     | Include            | Exclude or link elsewhere                             |
| -------- | ------------------------------------------- | ------------------ | ----------------------------------------------------- |
| `## ...` | What the reader learns or accomplishes here | Key facts/examples | Content that would distract or duplicate another page |

If the user has already supplied the outline and section-level guidance, do not ask them to approve it again. Confirm any ambiguity briefly and proceed.

### 3. Investigate facts and related implementation

Before drafting factual material:

- inspect the relevant implementation and tests;
- inspect existing conventions and terminology in adjacent approved docs;
- locate navigation entries and inbound links if URLs or categories change;
- identify examples that should express the canonical user path while isolating one new concept at a time;
- check whether the existing docs describe accidental or obsolete behavior;
- distinguish important related capabilities worth introducing briefly from detail that belongs in a dedicated guide or reference page.

Documentation work may intentionally lead to code improvements. When the editor asks to simplify implementation first, implement and verify the product behavior, then write docs against the simplified contract.

### 4. Write the approved page

When the structure is approved or explicitly provided, make the plan real:

- write concise, polished content under the agreed headings;
- keep each paragraph focused on that section's purpose;
- match section organization and heading style to the page mode: topical and lookup-friendly for guides, sequential only for tutorials or required procedures;
- use code or tree examples only when they make the interface or convention immediately clearer, and avoid loading a basic example with unrelated concerns;
- use the canonical documented path and terminology unless the page specifically explains alternatives;
- introduce an adjacent capability briefly when readers need to know it belongs to this surface, then link to deeper guides or reference pages rather than restating its mechanics;
- keep generated output, runtime context, source layout, and product concepts distinct when applicable;
- do not imply conventions or special behavior that the product does not implement.

For an existing human-edited outline containing TODO notes, replace the notes with final content while preserving the intended organization and scope.

### 5. Iterate with the editor

Treat follow-up edits and comments as editorial direction, not merely patch requests. If the editor narrows scope, remove material instead of defending it. If they change the framing, update nearby paragraphs so the page reads cohesively.

When the editor asks for a handoff rather than an edit, provide a compact editorial brief containing:

- the implemented or verified behavior;
- the canonical terminology and examples to use;
- alternate behavior that needs a short note;
- facts that must not be implied;
- pages or links that require updates.

### 6. Validate only the scoped result

After editing:

- search for stale inbound links when moving or renaming a page;
- run the docs typecheck/build commands provided by the repository;
- run formatting or whitespace checks relevant to changed files;
- avoid sweeping unrelated pages solely because they contain older phrasing unless the editor requested that migration.

## Patterns to avoid

Do not:

- start by rewriting prose before agreeing on substantial structural changes;
- turn every page into an exhaustive specification;
- turn a guide into a tutorial by default, organizing it around an implied build sequence when readers should be able to navigate its topics independently;
- omit a significant capability solely because another page documents it in depth, or expand a brief introduction into a distracting feature inventory;
- overload introductory examples with several concepts that can be introduced separately;
- repeat optional-layout or edge-case explanations throughout all guides;
- present ordinary colocated files as framework conventions merely because examples use them;
- preserve an implementation detail when simplifying the product would produce a clearer contract;
- consult external content for claims unless the user requests or supplies it, or verifying an explicitly linked claim is necessary;
- overwrite an editor's in-progress draft without first understanding which text is intentional.

## Expected output modes

Choose the mode the request calls for:

- **Editorial diagnosis:** concise assessment of page purpose, misplaced material, and recommended shape.
- **Outline/brief:** headings plus section-level scope for the editor to approve.
- **Implementation plan:** code/docs/navigation work required before the prose can be accurate.
- **Draft/edit:** direct changes to approved documentation scope.
- **Handoff context:** a copyable brief for another writer after implementation decisions are settled.

The goal is not to generate more documentation. The goal is to produce documentation whose structure, claims, and tone reflect clear human editorial intent.
