---
title: "WebMCP research: beyond co-painting toward a consent-based creative medium"
type: research
date: 2026-09-02
source_page: "https://webmcp.devpost.com/resources"
---

# WebMCP research: beyond co-painting toward a consent-based creative medium

## Executive conclusion

The best WebMCP canvas is not an AI drawing program with a chat box. It is a **shared, inspectable medium for negotiating meaning**.

WebMCP's special advantage is that the human, agent, and application act on the same live artifact and signed-in page state. The page exposes semantic actions while preserving its own UI, rules, and history. OpenAI calls out editing a canvas as a canonical case for site tools; the WebMCP explainer makes human visibility, history, and control explicit goals rather than incidental features. [OpenAI site-tools documentation](https://learn.chatgpt.com/docs/webmcp) · [WebMCP explainer](https://github.com/webmachinelearning/webmcp#background-and-motivation)

For this project, the strongest second-order showcase is therefore:

> A person draws ambiguous symbols. The agent does not overwrite or “finish” them. It reads the structured scene, proposes a semantic continuation on a visibly separate layer, explains what it inferred, and lets the person revise the work by drawing back. Only the person can commit the proposal. Accepted marks become a playable story world with durable human/agent/mixed provenance.

The second-order value is not faster drawing. It is a new collaboration contract: ambiguity becomes material for dialogue; disagreement becomes a branch rather than a destructive edit; authorship remains visible; and the history of offers, revisions, and acceptances becomes useful process data. Research on co-creative systems supports shared artifacts, shifting initiative, explicit feedback, editability, and measurement of interaction dynamics. [CollabDraw](https://research.google/pubs/collabdraw-an-environment-for-collaborative-sketching-with-an-artificial-agent/) · [Beyond Prompts](https://arxiv.org/abs/2305.07465) · [AI Drawing Partner](https://arxiv.org/abs/2501.06607)

## What the Devpost page actually contains

The [Devpost resources page](https://webmcp.devpost.com/resources) links to the draft specification and explainers, Chrome implementation and security documentation, OpenAI's showcase, supporter integrations, framework helpers, demos, and deployment resources. It does **not** directly list research papers. The papers in this note were added separately because they directly test the human-agent drawing and mixed-initiative premise.

The page also states the judge-facing runtime constraint: test in ChatGPT's in-app browser or Chrome 149+ with the WebMCP testing flag/origin trial. A public repository, live deployment, and under-three-minute demo are required. [Devpost resources and FAQ](https://webmcp.devpost.com/resources)

## Technical findings

### What WebMCP is good at

- A page registers JavaScript functions as tools through `document.modelContext.registerTool()`. Each tool has a stable name, natural-language description, JSON Schema input, optional annotations, and an `execute` callback. The agent discovers the tools, invokes one with structured arguments, and receives the callback's result. [WebMCP specification](https://webmachinelearning.github.io/webmcp/)
- The callback runs in the registering page's JavaScript realm, so it can reuse the same command handlers, authentication, authorization, validation, and UI updates as human actions. This avoids a parallel backend integration and keeps effects visible in the current tab. [WebMCP explainer](https://github.com/webmachinelearning/webmcp#backend-integrations-vs-in-browser-webmcp-tools) · [Shopify WebMCP tools](https://shopify.dev/docs/api/web-mcp)
- Tools may be registered and unregistered as page state changes. An `AbortSignal` can unregister a tool, invocation cancellation is passed to the execute callback, and `toolchange` announces registry changes. [WebMCP imperative design](https://github.com/webmachinelearning/webmcp#imperative-tool-registration-documentmodelcontext)
- Tool annotations currently include `readOnlyHint` and `untrustedContentHint`. These are signals to the client, not proof of safety. [WebMCP specification: tool annotations](https://webmachinelearning.github.io/webmcp/#dom-toolannotations)
- WebMCP can progressively enhance an existing interface. If a suitable tool is absent, an agent may still fall back to normal browser actuation. [Chrome WebMCP overview](https://developer.chrome.com/docs/ai/webmcp)
- The browser can expose invocation history and schema validation in DevTools, and Google's eval CLI can test expected tool selection and arguments against either schemas or a live page. [Chrome DevTools WebMCP panel](https://developer.chrome.com/docs/devtools/application/webmcp) · [WebMCP evals](https://developer.chrome.com/docs/ai/webmcp/evals)

### Current limits that should shape the design

1. **ChatGPT currently supports only part of the draft.** Its built-in browser does not discover declarative form tools or tools registered inside iframes. For the hackathon, register imperative tools in the top-level page. ChatGPT's docs also say to use GPT-5.6 Sol or Terra; Luna currently has WebMCP disabled. [OpenAI site-tools limitations](https://learn.chatgpt.com/docs/webmcp#limitations)
2. **WebMCP is page-scoped.** Closing or navigating away can remove the tools. Registrations are tied to the document lifetime; non-active documents cannot register, discover, or run tools. Persist creative state in the app, but recreate the registry after page load. [OpenAI site-tools documentation](https://learn.chatgpt.com/docs/webmcp#how-it-works-in-the-browser) · [WebMCP specification](https://webmachinelearning.github.io/webmcp/)
3. **It is not a realtime stroke transport.** Tool calls are semantic, model-mediated operations. Sending every pointer sample through WebMCP would add latency, tokens, and failure points. Human freehand drawing should stay local; the agent should work at the level of bounded contributions, regions, elements, connections, and story beats. This is an engineering inference from the tool-call lifecycle and Chrome's recommendation to keep tool metadata and individual outputs small. [Chrome security guidance](https://developer.chrome.com/docs/ai/webmcp/secure-tools#set-character-budgets)
4. **The agent does not automatically receive a continuously updated canvas model.** Give it a compact read tool and return the current revision, selection, viewport, semantic elements, and bounded shape summaries. Let it re-read after a human edit. The agent can inspect the visible page as a fallback, but relying on screenshots would weaken the WebMCP case. [OpenAI site-tools documentation](https://learn.chatgpt.com/docs/webmcp#how-it-works-in-the-browser)
5. **Atomicity, undo, and merge policy belong to the application.** The API mediates individual callbacks but does not define canvas transactions, revision conflict handling, or collaborative undo. Google's experimental batch helper runs sequential calls and stops after a failure, but it is not a rollback protocol. A canvas proposal must be applied through one app-level transaction with rollback on error. [Google WebMCP batch helper](https://github.com/GoogleChromeLabs/webmcp-tools/blob/main/demos/shared/webmcp-batch.js)
6. **The declarative API is still unsettled.** Schema synthesis, cross-document responses, and some activation/cancellation event details remain TODO or under debate. It is unnecessary for a freehand canvas and unavailable in ChatGPT today. [Declarative API explainer](https://github.com/webmachinelearning/webmcp/blob/main/declarative-api-explainer.md)
7. **Browser support remains experimental and uneven.** The project status lists ChatGPT Desktop support, a Chrome 149 origin trial, an Edge 150 trial, experimental Brave support, and open Firefox/WebKit standards discussions. [Implementation status](https://github.com/webmachinelearning/webmcp/blob/main/implementation-status.md)
8. **Complex UI state still needs explicit application code.** Chrome notes that complex sites may need refactoring to expose and manage state cleanly, and clients must visit a site before discovering its tools. [Chrome WebMCP limitations](https://developer.chrome.com/docs/ai/webmcp#limitations)

### Security and consent are product mechanics, not boilerplate

- Tool names, descriptions, parameter descriptions, and results are all untrusted content. Prompt injection can occur in metadata or outputs; model-level defenses cannot guarantee safety. [Chrome WebMCP tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools) · [WebMCP security considerations](https://webmachinelearning.github.io/webmcp/#security-privacy)
- Tools are gated by secure/origin-isolated contexts and the `tools` Permissions Policy. Cross-origin iframe access requires explicit permission and `exposedTo` origin configuration, though ChatGPT does not currently support iframe discovery anyway. [Chrome origin isolation and permissions](https://developer.chrome.com/docs/ai/webmcp#security-and-permissions)
- `readOnlyHint` can guide confirmation behavior, but OpenAI warns that a tool claiming to be read-only is not proof. Keep authorization and validation in the application. [OpenAI security and user controls](https://learn.chatgpt.com/docs/webmcp#security-and-user-controls)
- A tool creates a second code path to the same capability. The draft warns that the UI and WebMCP paths can accidentally have different validation. Both must call one domain command layer. [WebMCP security questionnaire](https://github.com/webmachinelearning/webmcp/blob/main/security-privacy-questionnaire.md)
- The safest creative boundary is capability absence: do not register `accept`, `publish`, `delete-human-work`, or `purchase/print` as agent tools in the MVP. A visible human click commits or discards a proposal. This is stronger and easier to demonstrate than asking the model to honor a prompt-level rule.

## What the showcases teach

The ten OpenAI WebMCP showcases repeatedly use a **read → propose/change → inspect → refine** loop. The transferable pattern is the shared artifact, not the domain.

| Showcase | What transfers to a co-creative canvas |
|---|---|
| [Margin Editor](https://developers.openai.com/showcase/margin-editor) | Agent comments under its own identity; feedback remains attached to the artifact rather than impersonating the human. |
| [Fieldwork // 12](https://developers.openai.com/showcase/ko-field-beat-machine) | Agent changes land in a sequencer the human can immediately play, hear, and edit. Feedback is grounded in the artifact. |
| [WanderNote](https://developers.openai.com/showcase/wandernote) | Suggestions can be edited or dismissed; agent reads comments and revises against the same itinerary/map. |
| [Sunday Table](https://developers.openai.com/showcase/sunday-table) | Human edits continue while the agent works; the system preserves rather than flattens those changes. |
| [Paperie](https://developers.openai.com/showcase/paperie) | Closest first-order analogue: agent brings context and generated art into a shared card canvas while the human edits and previews. |
| [Webroom](https://developers.openai.com/showcase/webroom) | Rich read/write surface for exposure, color, and composition; visible parameter changes turn vague critique into steerable iteration. |
| [Crossword Desk](https://developers.openai.com/showcase/crossword-desk) | Separates semantic structure from presentation: the agent can revise clues without moving words. A drawing app should likewise separate meaning from stroke geometry. |
| [Codex Modeling Studio](https://developers.openai.com/showcase/codex-modeling-studio) | Inspect/change/refine loop on a spatial scene; build notes say tool expressiveness and latency improved by having the agent use the tools and expose their limits. |
| [Cubecade](https://developers.openai.com/showcase/cubecade-rubiks) | One compact read tool plus one queued move tool can be more legible and reliable than many tiny controls. Animated moves make agent action observable. |
| [Verdant Market](https://developers.openai.com/showcase/verdant-market) | Structured read and write operations affect the same visible state; build notes emphasize visible tool-activity feedback and removing low-value/navigation-only tools. |

The spec's own graphic-design scenario goes one step further: it recommends applying a sequence of edits as **uncommitted changes** that the person can review or adjust before finalizing. [WebMCP creative and graphic design use case](https://github.com/webmachinelearning/webmcp#creative--graphic-design)

## Relevant research papers

These are not linked directly from Devpost, but they are the most relevant primary research sources for the proposed interaction.

| Paper | Finding or design implication |
|---|---|
| [CollabDraw: an environment for collaborative sketching with an artificial agent](https://research.google/pubs/collabdraw-an-environment-for-collaborative-sketching-with-an-artificial-agent/) (C&C 2019) | A cooperative, responsive drawing agent on a shared web canvas produced sketches as recognizable as human-only sketches; analysis suggested the semantics arose from the collaboration rather than either party alone. Optimize for responsiveness to the human's marks, not autonomous image quality. |
| [Beyond Prompts: Exploring the Design Space of Mixed-Initiative Co-Creativity Systems](https://arxiv.org/abs/2305.07465) (2023) | In a 185-participant study, broader ways for human and AI to communicate creative intent rated as well or better, preferences differed by expertise, and participants surfaced scrutability and explainability as missing dimensions. Support drawing, selection, comments, direct manipulation, and proposals—not prompt-only control. |
| [AI Drawing Partner: Co-Creative Drawing Agent and Research Platform to Model Co-Creation](https://arxiv.org/abs/2501.06607) (2024/2025 preprint) | Shared-canvas editability, positive/negative feedback, requests, drawing modes, interruptibility, and logged human/agent histories are core mechanics. The paper treats turn rhythm and interaction dynamics as measurable creative outcomes. |
| [“It Felt Like Having a Second Mind”: Human-AI Co-creativity in Prewriting](https://arxiv.org/abs/2307.10811) (CSCW 2024) | Creative work moved through ideation, illumination, and implementation with mixed and shifting initiative while the human retained the dominant role. The tool surface should change by creative phase rather than expose one undifferentiated “generate” action. |
| [Interaction, Process, Infrastructure: A Unified Framework for Human–Agent Collaboration](https://www.microsoft.com/en-us/research/wp-content/uploads/2025/12/Human_Agent_Framework.pdf) (2025) | Open-ended collaboration needs an explicit, manipulable representation of the activity and its changing structure, not only internal agent plans. On a canvas, proposal state, intent, dependencies, and ownership should themselves be visible and editable objects. |

## Recommended implementation contract

### One state machine, two hands

Human gestures and agent tools must call the same canvas/story command layer. WebMCP should contain no drawing logic of its own.

```text
Human pointer/UI ─┐
                  ├─> validated domain commands ─> canvas + story store ─> visible UI
WebMCP callbacks ─┘                              └─> revision/history/provenance
```

The freehand editor remains responsible for pointer sampling, rendering, selection, undo, and local persistence. WebMCP exposes a smaller semantic interface.

### A small, high-leverage tool surface

1. `get_story_world` — Read-only, bounded snapshot of revision, viewport, selection, compact visible shapes, known semantic elements, relations, beats, and pending proposal. Do not send a full unbounded tldraw store.
2. `propose_story_patch` — Create one transactionally applied ghost-layer contribution. Require `basedOnRevision`; cap element, connection, and beat counts; use proposal-local IDs rather than accepting raw editor IDs for new records.
3. `revise_story_patch` — Replace or adjust the pending proposal after a new human mark or comment. Preserve proposal-local IDs where possible so the revision reads as a response, not a new generation.
4. `focus_story_elements` — Frame or select semantic IDs without screen coordinates. Treat it as artifact-read-only even though it changes view state.
5. `preview_story_performance` — Turn the committed drawing into a short sequence of focused story beats. This demonstrates that semantic state created through WebMCP becomes a new human-facing capability.

Do not expose commit/discard. The tool result should always return a concise verification payload: revision, affected semantic IDs, counts, proposal status, and a recovery instruction on error. OpenAI recommends narrow inputs, explicit side effects, and enough returned information to verify the result. [OpenAI implementation guidance](https://learn.chatgpt.com/docs/webmcp#add-webmcp-to-your-website)

### State and race rules

- Keep a monotonic document revision. Reject a write if `basedOnRevision` is stale and tell the agent to call `get_story_world` again.
- Allow only one pending proposal in the MVP. This turns a hard multi-writer merge problem into a clear conversational turn.
- Apply each proposal as one domain transaction. If one shape or relation fails validation, write nothing.
- Pass the invocation `AbortSignal` into any animation, fetch, or long-running canvas operation. Cancellation should stop future effects and leave a consistent state.
- Return stable semantic IDs and opaque editor IDs. Never ask the model to manufacture internal record IDs.
- Keep tool registration stable during ordinary canvas edits. Dynamic registration is useful for authentication or route scope, but frequent registry churn adds stale-tool races already noted in the draft spec.

## The second-order showcase

### Working concept: a consent-based story world, not an AI whiteboard

The first-order demo is: “I draw a moon; the agent draws a fox.”

The second-order demo is:

1. A person draws a moon inside a jar and three rough houses. These marks are intentionally ambiguous.
2. The agent reads geometry plus context, but returns its interpretation as an explicit claim: “jarred moon,” “village,” “missing night.”
3. The agent proposes a fox, a path, relations between elements, and three story beats on a ghost layer. Every proposed item has agent provenance and an explanation tied to source marks.
4. The person draws a crown on the fox. That edit is not merely another shape; it is a counter-offer.
5. The agent rereads the new revision, changes “thief” to “guardian,” and revises the proposal in place.
6. The person accepts with a human-only control. Accepted objects retain human, agent, or mixed provenance.
7. The same artifact becomes a short performance: the camera follows semantic story beats rather than raw coordinates.

This demonstrates five things at once:

- **Joint sense-making:** the meaning emerges across turns rather than from a one-shot prompt.
- **Creative consent:** the agent can offer but cannot silently claim authorship or finalize the work.
- **Legible negotiation:** inference, proposal, revision, and acceptance are visible in the artifact.
- **Semantic leverage:** structured roles and relations unlock performance, accessibility descriptions, remixing, and later export.
- **Research value:** the event history can measure who initiated, who revised, interruption/recovery time, proposal acceptance, and how much work became mixed-authorship—without treating “more AI output” as success.

### Why this is second-order WebMCP thinking

Most demos optimize the agent's ability to complete a task. This one optimizes the **quality of the relationship between agent action and human intent**. WebMCP becomes a protocol for bounded participation.

The canvas is also a boundary object between three representations:

- marks the person can draw and feel ownership over;
- semantic state the agent can inspect and manipulate reliably;
- a visible proposal/history the pair can use to negotiate what the work means.

Once that contract exists, later versions can add:

- **Adaptive initiative:** infer whether the person wants an idea, detail work, critique, or silence from explicit feedback and turn rhythm—not from hidden surveillance.
- **Counterfactual branches:** keep two proposed continuations side by side, then let the person merge only selected elements.
- **Accessible co-creation:** translate between freehand marks, speech, semantic labels, spatial descriptions, and tactile/export formats while preserving the same human approval boundary.
- **Creative lineage:** export a machine-readable contribution history or content credentials so downstream readers can distinguish human, agent, and mixed work.
- **Cross-app workflows:** a browser agent can bring context from mail or notes, help shape it on the canvas, then hand the committed artifact to print/export—while each site remains responsible for its own tools and permissions.
- **A collaboration observatory:** replay a session by offers and responses, not just pixel history, so educators or creators can reflect on how an idea evolved.

These are future directions, not claims that the current WebMCP API supplies provenance, branching, accessibility conversion, or collaboration metrics automatically. The application must model them.

## Evaluation plan

Tool correctness and collaboration quality need separate tests.

### Deterministic WebMCP evals

- Given “read the current story,” expect `get_story_world` with no write call.
- Given a stale revision, expect a recoverable failure followed by a fresh read before retry.
- Given “accept it,” verify no agent-callable commit tool exists.
- Given an oversized patch, verify a bounded validation error and no partial shapes.
- Given a new crown after a proposal, expect `get_story_world` then `revise_story_patch`, not a duplicate proposal.
- Given an unknown semantic ID, return valid alternatives rather than guessing coordinates.

Google's eval guidance says the test state should include the complete set of available tools because selection depends on the surrounding tool surface, not only the target tool. [Chrome WebMCP evals](https://developer.chrome.com/docs/ai/webmcp/evals#application-state)

### Human-facing measures

- Can the person tell which marks are human, agent, proposed, and mixed?
- Can they stop, revise, undo, or reject without learning prompt tricks?
- Does the agent respond to the latest human mark rather than regenerate from scratch?
- How quickly can the pair recover from a wrong interpretation?
- Does the person still describe the final story as theirs?
- How often do agent proposals create a useful new direction versus merely polish the current one?

The AI Drawing Partner paper suggests recording turn rhythm, regulation/feedback actions, drawing actions, and contribution history. Those are better collaboration signals than output volume alone. [AI Drawing Partner](https://arxiv.org/abs/2501.06607)

## Hackathon positioning

The concise pitch should be:

> WebMCP usually helps an agent operate a site. Here it governs how an agent participates in human creativity. MythWeaver turns rough marks into a shared story world through visible proposals, revision, and human-only consent. The agent gains semantics; the child or creator keeps authorship.

The demo should show the WebMCP call trace once, then spend its time on the human-agent turn: draw → read → propose → human counter-edit → revise → human accept → perform. This makes the protocol necessary to the interaction rather than an implementation footnote.

## Resource audit

Reviewed from the Devpost page:

- [WebMCP specification source, explainer, declarative proposal, implementation status, and security questionnaire](https://github.com/webmachinelearning/webmcp)
- [Chrome developer overview](https://developer.chrome.com/docs/ai/webmcp), [origin trial](https://developer.chrome.com/blog/ai-webmcp-origin-trial), [security guide](https://developer.chrome.com/docs/ai/webmcp/secure-tools), [evals](https://developer.chrome.com/docs/ai/webmcp/evals), and [DevTools panel](https://developer.chrome.com/docs/devtools/application/webmcp)
- [OpenAI site-tools documentation](https://learn.chatgpt.com/docs/webmcp) and all ten [OpenAI WebMCP showcase entries](https://developers.openai.com/showcase?view=webmcp-apps)
- [GoogleChromeLabs demos and utilities](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos), including imperative, declarative, embedded-page-agent, cross-origin, and experimental batch patterns
- [Angular experimental WebMCP integration](https://angular.dev/ai/webmcp), including route-scoped cleanup guidance
- [Shopify WebMCP tools](https://shopify.dev/docs/api/web-mcp), which demonstrate reuse of the live session and the same storefront actions as the human UI
- [Vercel storefront implementation history](https://github.com/vercel/shop/pull/498), whose initial hand-rolled integration was later replaced with Shopify/Hydrogen's implementation
- [Cloudflare WebMCP bridge](https://blog.cloudflare.com/webmcp/) and [Browser Run support](https://developers.cloudflare.com/browser-run/features/webmcp/), which demonstrate same-origin MCP proxying, edge injection, and remote-browser testing

Hosting/credit pages and generic workflow products were checked for scope but do not change the canvas interaction design, so they are not used as technical evidence here.
