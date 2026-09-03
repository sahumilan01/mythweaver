---
title: "feat: Build MythWeaver WebMCP story canvas"
type: feat
status: active
date: 2026-08-31
deadline: "2026-09-03 13:00 PDT"
---

# Build MythWeaver WebMCP Story Canvas

## Outcome

Ship a public, judge-ready WebMCP app in which a person and a browser agent take visible turns turning hand-drawn symbols into a playable story world.

The submission thesis is:

> MythWeaver is a consent-based creative canvas where a young storyteller and a browser agent take visible turns turning hand-drawn symbols into a playable story world.

The app must demonstrate that WebMCP is not a thin convenience wrapper. The browser agent should understand structured canvas state, compose a multi-element creative proposal, revise it after human feedback, and operate the visible app without coordinate guessing. The human must retain authorship: an agent proposal cannot become part of the story until the person accepts it in the canvas UI.

## Judging Strategy

The challenge selects ten winners using four equally weighted criteria. Ties are resolved in criterion order, so WebMCP leverage is the first optimization target.

| Criterion | Target | Evidence in the submission |
|---|---:|---|
| WebMCP leverage | 9/10 | Five typed tools, state-aware results, multi-tool workflow, tool error recovery, and no screenshot-driven editing |
| Execution | 8.5/10 | Complete first-run experience, coherent visual language, working proposal review, persistence, and performance mode |
| Potential impact | 8/10 | Families and facilitated creative classrooms help young storytellers author rather than passively consume generated media |
| Creativity and ambition | 9/10 | Visible turn-taking, creative consent, provenance, and a playable story artifact |

## Product Boundaries

### Primary audience

Parents, educators, and facilitators creating with young storytellers. The MVP is not positioned as an unsupervised service for children and does not collect personal data.

### The artifact

A story world containing:

- Characters
- Places
- Objects
- Connections between them
- An ordered set of story beats

The artifact can be explored on the canvas and played as a short camera-guided performance.

### Signature interaction: creative consent

1. The human draws or arranges marks.
2. The browser agent reads the canvas through WebMCP.
3. The agent places a proposed contribution on a visually distinct proposal layer.
4. The human accepts, rejects, or asks the agent to revise it.
5. Only an explicit click in the app can commit or discard the proposal.
6. Committed shapes retain their origin: `human`, `agent`, or `mixed`.

The app must not register an `accept_proposal`, `commit_proposal`, or `reject_proposal` WebMCP tool. This is a deliberate trust boundary, not a missing feature.

### Explicit non-goals

- Embedded chatbot or embedded LLM API
- Accounts, authentication, or cloud storage
- Multiplayer
- Image generation
- Freehand image recognition inside the app
- General-purpose whiteboarding
- Mobile editing
- Complex timeline or animation authoring
- More than one pending agent proposal
- Production-scale moderation or classroom management

## Judge Demo

Design and implement backward from this 90-second core sequence:

1. The human draws a moon inside a jar and three simple houses.
2. The human tells the browser agent: "This village has forgotten nighttime. Help me continue it, but let me approve your idea."
3. The agent calls `get_story_world` and sees the raw shapes, visible text, selection, bounds, committed semantics, and current proposal state.
4. The agent calls `propose_story_patch` to interpret the jar and moon, add a path, add a fox, connect the fox to the jar, and suggest the next story beat.
5. Purple dashed proposal shapes appear in view with a concise proposal card.
6. The human draws a crown on the fox or tells the agent to make the fox a guardian.
7. The agent reads the changed state and calls `revise_story_patch` without duplicating the proposal.
8. The human clicks **Accept contribution**. Proposal shapes become committed and the provenance count updates.
9. The human clicks **Perform story**. The camera moves through three beats while elements highlight and narration appears.

The demo should visibly show the browser agent's WebMCP calls at least once. Do not spend video time explaining setup before showing the result.

## Technical Architecture

### Stack

- React + TypeScript + Vite
- `tldraw` for the infinite canvas and editor runtime
- Plain React state or a small Zustand store for story/proposal metadata
- Vitest for schema and state-transition tests
- Playwright for the critical human-facing flow
- Static deployment on Vercel or Netlify

Avoid a backend. The browser agent supplies the reasoning; the app supplies structured state and deterministic creative operations.

### Module map

```text
src/
  app/
    App.tsx                         # shell, unsupported-browser state, canvas layout
    constants.ts                   # limits, colors, storage version
  canvas/
    MythCanvas.tsx                 # tldraw mount and editor lifecycle
    canvasAdapter.ts               # safe tldraw reads/writes; no WebMCP knowledge
    shapeSerializer.ts             # compact, stable shape context for agents
    proposalRenderer.ts            # pending visual layer and commit/discard transitions
    performanceController.ts       # deterministic story playback
  story/
    schema.ts                      # StoryWorld, StoryPatch, StoryBeat schemas/types
    storyStore.ts                  # proposal, semantics, beats, persistence, migration
    reconcileStory.ts              # repairs metadata after undo/delete/reload
  webmcp/
    global.d.ts                    # experimental document.modelContext types
    registerMythWeaverTools.ts     # lifecycle and AbortController cleanup
    tools/
      getStoryWorld.ts
      proposeStoryPatch.ts
      reviseStoryPatch.ts
      focusStoryElements.ts
      previewStoryPerformance.ts
    toolResult.ts                  # consistent text + structured result helpers
    validation.ts                  # limits, IDs, stale-state and overlap checks
  ui/
    ProposalCard.tsx               # human-only accept/discard/revision guidance
    StoryToolbar.tsx               # perform, reset, help
    ProvenanceLegend.tsx           # human/agent/mixed visual key
    WelcomeOverlay.tsx             # 20-second first-run instruction
    WebMcpStatus.tsx               # supported/unsupported and tool count
  test/
    fixtures.ts
```

### State model

```ts
type Origin = 'human' | 'agent' | 'mixed'
type StoryRole = 'character' | 'place' | 'object' | 'event'

interface StoryElement {
  id: string
  shapeId: string
  role: StoryRole
  name: string
  meaning?: string
  origin: Origin
}

interface StoryConnection {
  id: string
  arrowShapeId: string
  fromElementId: string
  toElementId: string
  relation: string
  origin: Origin
}

interface StoryBeat {
  id: string
  order: number
  narration: string
  focusElementIds: string[]
}

interface PendingProposal {
  id: string
  basedOnRevision: number
  summary: string
  proposedElements: StoryElement[]
  proposedConnections: StoryConnection[]
  proposedBeats: StoryBeat[]
  interpretations: Array<{
    shapeId: string
    role: StoryRole
    name: string
    meaning?: string
  }>
}
```

Use generated opaque IDs. Never allow tool inputs to supply raw tldraw record IDs for newly created shapes. The app maps proposal-local IDs to canvas IDs.

Persist the tldraw document locally and persist the versioned story state separately. Reconcile both stores at startup and after delete/undo. Missing shape references are removed; the app must never crash on stale metadata.

### Visual grammar

- Human/unclassified marks: tldraw's normal appearance
- Pending agent proposal: violet, dashed, lower opacity, labeled **Agent proposal**
- Committed agent contribution: violet accent at normal opacity
- Mixed contribution: warm gold accent
- Selected story beat: spotlight highlight
- Proposal card: one summary, changed-item count, **Accept contribution**, and **Discard**

Do not redesign the entire tldraw interface. Add only the UI needed to make collaboration and provenance legible.

## WebMCP Contract

Register tools through `document.modelContext.registerTool()` after the editor is mounted. Use one `AbortController` to unregister them when the editor unmounts. Tool handlers call the canvas and story adapters rather than importing UI components.

### 1. `get_story_world`

Read-only. Returns:

- Document revision
- Current selection and viewport bounds
- Compact representations of current-page shapes
- Known story elements, connections, and beats
- Pending proposal summary and proposal-local IDs
- Suggested next actions

Set the WebMCP read-only annotation where supported. Limit output to the current page and enforce a shape count/response-size ceiling.

### 2. `propose_story_patch`

Creates the only allowed pending proposal. Input includes:

- `basedOnRevision`
- `summary`
- Interpretations of existing human shapes
- New elements with role, label, primitive visual type, position, and size
- Connections using proposal-local or existing story element IDs
- Up to three story beats

Rules:

- Reject stale revisions and tell the agent to call `get_story_world` again.
- Reject calls while another proposal is pending.
- Validate every reference before writing.
- Cap a proposal at eight new elements, eight connections, and three beats.
- Apply rendering as one transaction; roll back all proposal shapes if any operation fails.
- Zoom only enough to make the proposal visible; do not disorient the human.

### 3. `revise_story_patch`

Replaces or adjusts the pending proposal using its proposal ID and current document revision. It must reuse stable proposal-local IDs where possible and delete superseded pending shapes in the same transaction.

This tool is the proof that the agent can respond to a human edit rather than merely generate once.

### 4. `focus_story_elements`

Read-only with respect to the artifact. Selects or frames known elements by semantic ID. Reject unknown IDs with valid alternatives. This demonstrates semantic navigation without screen coordinates.

### 5. `preview_story_performance`

Plays, pauses, or restarts the current committed beats. It must not mutate persisted story content. If no beats exist, return an actionable error.

### Tool result conventions

Every result should contain a concise human-readable message and a structured object. Error responses should say how the agent can recover. Never return secrets, browser storage contents, or unrelated page data.

## User Flows and Required Decisions

### First visit

1. Load a blank canvas with a three-line welcome overlay.
2. Show **WebMCP ready · 5 tools** when supported.
3. Let the person draw immediately; no sign-in or tutorial gate.
4. Provide a sample prompt that can be copied into the browser agent.

If WebMCP is unavailable, drawing and local persistence still work. Show concise instructions for using ChatGPT's in-app browser or supported Chrome; do not simulate agent success.

### Proposal review

- Only one pending proposal may exist.
- The human may continue drawing while it is pending.
- Human deletion of a pending shape updates the proposal as a partial rejection.
- Accept commits the remaining proposal shapes and interpretations in one undoable step.
- Discard deletes all remaining pending shapes and leaves human work unchanged.
- Reload restores a pending proposal and its review card.

### Revision conflict

Every canvas/story mutation increments a document revision. A proposal based on an old revision is rejected before rendering. The agent must re-read the story world. This prevents delayed calls from overwriting newer human intent.

### Performance

- Perform only committed beats.
- Disable accept/discard while playback is running.
- Escape or the toolbar stop button restores the prior camera and selection.
- Empty or broken beats are skipped with an on-screen notice.
- Reduced-motion preference replaces camera animation with immediate focus changes.

### Reset

Reset requires a native confirmation dialog and clears both canvas and story state. It is not exposed through WebMCP.

## Security, Privacy, and Safety

- No accounts, analytics, cookies, backend, or user-content upload in the MVP.
- Do not request a child's name, age, school, location, or contact details.
- Treat all labels and narration as untrusted text; render through React/tldraw text APIs, never `innerHTML`.
- Bound string lengths, element counts, coordinates, and dimensions at the tool boundary.
- Clamp proposed objects to a reasonable world extent.
- Reject prototype-polluting keys and unexpected schema properties.
- Keep accept, discard, and reset human-only.
- Document that the experience is intended for family or facilitated use.

## Implementation Phases

### Phase 0 — Submission safety and technical spike (2–3 hours)

- [ ] Register for the challenge and create the Devpost draft.
- [ ] Request a tldraw trial or qualifying hobby license for the deployment domain.
- [ ] Initialize the public repository with MIT license, README stub, and dated commits.
- [ ] Scaffold React + TypeScript + Vite and install tldraw.
- [ ] Mount a persistent tldraw canvas.
- [ ] Register one temporary `get_story_world` WebMCP tool.
- [ ] Deploy immediately and verify the tool in ChatGPT's in-app browser.

**Gate:** Do not continue architecture work until a deployed tool can read live canvas state in the judging browser.

### Phase 1 — Story state and WebMCP proposal loop (6–8 hours)

- [ ] Add schemas, limits, versioned story state, and persistence.
- [ ] Implement compact canvas serialization.
- [ ] Implement `get_story_world` with selection and revision.
- [ ] Implement `propose_story_patch` with transactional validation.
- [ ] Render the violet pending proposal layer.
- [ ] Build the human-only proposal card.
- [ ] Commit or discard a proposal without damaging human shapes.
- [ ] Add provenance counts and legend.

**Gate:** Starting from three human shapes, the external browser agent can create one visible proposal and the human can accept or discard it.

### Phase 2 — Adaptation and semantic navigation (4–6 hours)

- [ ] Implement `revise_story_patch` with stable IDs.
- [ ] Implement revision conflict responses.
- [ ] Reconcile deleted or undone shapes.
- [ ] Implement `focus_story_elements`.
- [ ] Make partial human deletion of proposals safe.
- [ ] Restore pending proposal state after reload.

**Gate:** The agent revises an existing proposal after a human canvas edit without duplication or loss of human work.

### Phase 3 — The memorable reveal (4–6 hours)

- [ ] Implement three-beat deterministic performance mode.
- [ ] Add camera focus, element spotlight, and narration card.
- [ ] Implement `preview_story_performance`.
- [ ] Add stop/restart and reduced-motion behavior.
- [ ] Create the moon-jar-village seed scene or a one-click demo reset.

**Gate:** The full judge journey works twice in a row after a clean reload.

### Phase 4 — Reliability and polish (4–6 hours)

- [ ] Add welcome overlay and copyable agent prompt.
- [ ] Add WebMCP status and unsupported-browser instructions.
- [ ] Unit test input validation, stale revisions, proposal transitions, reconciliation, and limits.
- [ ] Browser test draw → propose → accept → perform.
- [ ] Test malformed inputs, no selection, empty canvas, refresh, undo/delete, and interrupted playback.
- [ ] Verify desktop layouts at 1280×720 and 1440×900.
- [ ] Audit keyboard focus, labels, contrast, and reduced motion.
- [ ] Remove console errors and recover from tool failures without reload.

### Phase 5 — Submission package (4–5 hours, reserve before deadline)

- [ ] Freeze features no later than 12 hours before submission.
- [ ] Record the polished demo before making final code changes.
- [ ] Produce a public YouTube video under three minutes with clear audio.
- [ ] Show the app working within the first 15 seconds.
- [ ] Show at least one WebMCP tool invocation and the human-only consent boundary.
- [ ] Update README with setup, architecture, tool schemas, browser requirements, license, limitations, and dated hackathon work.
- [ ] Add screenshots/GIF and a simple architecture diagram.
- [ ] Complete Devpost copy against each judging criterion.
- [ ] Verify live URL, public repository, license detection, video visibility, and clean-install instructions.
- [ ] Submit at least two hours before the deadline.

## Quality Gates

### Functional acceptance criteria

- [ ] A person can draw with standard tldraw tools without an account.
- [ ] The page registers exactly five documented WebMCP tools after canvas mount.
- [ ] `get_story_world` reports selection, raw shapes, semantic elements, beats, revision, and pending status.
- [ ] A valid proposal appears as a visually distinct, reviewable layer.
- [ ] Invalid or stale proposals produce actionable errors and no partial canvas mutation.
- [ ] The browser agent cannot commit, discard, or reset the story through WebMCP.
- [ ] Human acceptance commits a proposal as one logical operation and preserves provenance.
- [ ] Human rejection leaves all pre-proposal human work unchanged.
- [ ] A pending proposal can be revised after the human changes the canvas.
- [ ] A committed three-beat story can be performed, stopped, and replayed.
- [ ] Canvas and story state survive reload and reconcile missing shapes.

### Reliability targets

- [ ] Complete the scripted demo successfully five consecutive times on the deployed URL.
- [ ] Tool registration produces no console errors in the judging browser.
- [ ] Tool calls settle within one second for a canvas of 100 shapes, excluding playback duration.
- [ ] The app remains usable without WebMCP and explains how to enable it.
- [ ] No uncaught exception from malformed tool inputs.

### Submission targets

- [ ] A judge understands the product and audience within 20 seconds of the video.
- [ ] The video demonstrates all four judging criteria rather than only naming them.
- [ ] The repository contains all code, setup instructions, and an open-source license visible at the top level.
- [ ] The deployed project remains free and accessible through the judging period.

## Test Matrix

| Scenario | Expected result |
|---|---|
| WebMCP unavailable | Canvas works; support banner appears; no fake agent controls |
| Empty canvas read | Valid empty world plus suggested first action |
| No selection | World read succeeds with an empty selection |
| Two simultaneous proposals | Second call rejected; first remains intact |
| Stale revision | No shapes created; response requests a fresh read |
| Unknown referenced ID | Whole proposal rejected with valid-ID guidance |
| Proposal operation throws halfway | All shapes from that proposal are rolled back |
| Human deletes one pending shape | Proposal remains reviewable with updated count |
| Reload with pending proposal | Proposal layer and review card return |
| Delete committed shape | Orphan semantics/connections are reconciled |
| Perform with no beats | Actionable message; no camera change |
| Stop during playback | Original camera and selection restored |
| Reduced motion | Instant focus changes; no animated camera travel |
| Reset | Human confirmation required; both stores cleared |

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| tldraw AI canvas appears derivative | High | Do not use its embedded agent template; center creative consent, provenance, and external WebMCP orchestration |
| tldraw production license blocks deployment | Critical | Request a trial/hobby key in Phase 0 and validate it on the final hostname |
| Experimental WebMCP API differs between browsers | High | Test the deployed spike first; isolate types/registration in one module; document supported browser path |
| Too much scope for the deadline | Critical | Freeze the five tools and three semantic element primitives; cut animation polish before consent or reliability |
| Agent produces invalid geometry or IDs | High | Strict schemas, bounds, generated IDs, limits, all-or-nothing transactions, actionable errors |
| Agent contribution overwhelms human work | High | Eight-element cap, visible pending layer, one proposal at a time, human-only commit |
| Child-privacy concerns weaken impact story | Medium | No collection, no accounts, local-only storage, position for facilitated family/classroom use |
| Demo depends on unpredictable creative reasoning | High | Use a seed canvas, tested prompt, bounded schemas, and record only after five successful dry runs |
| Performance mode consumes implementation time | Medium | Keep it deterministic: camera focus + highlight + narration; no general animation system |

## Cut Order

If schedule slips, cut in this order:

1. Mixed-origin styling
2. Partial deletion semantics for pending proposals
3. Agent-triggered performance preview
4. Fancy camera easing
5. Seed-scene reset

Never cut deployed WebMCP verification, human-only acceptance, proposal revision, state validation, or the complete demo path.

## Submission Narrative

### Why WebMCP

Canvas work is spatial, stateful, and difficult for browser agents to manipulate through screenshots and clicks. MythWeaver exposes a semantic creative language: the agent reads story objects and relationships, proposes structured changes, revises against current state, and navigates by stable IDs. The visible canvas remains the primary human interface.

### What was difficult before

Existing creative AI often replaces the person's work with a generated result or hides edits inside chat. Here, human marks and agent contributions coexist, authorship is visible, and the person controls which ideas become part of the artifact.

### Better user experience

The person draws naturally. The agent handles structure, connections, and alternative narrative possibilities. Neither must translate the creative process into menus, coordinates, or a long prompt.

## Repository and Documentation Deliverables

- `README.md` with a GIF above the fold
- `LICENSE` using MIT for project-authored code
- `docs/architecture.md` explaining WebMCP → adapters → tldraw
- `docs/webmcp-tools.md` with exact schemas and example results
- `docs/demo-script.md` with timestamps and recovery takes
- `docs/submission-copy.md` mapped to the four criteria
- Clear third-party notices and tldraw license instructions

## Research Basis

- [WebMCP proposal and imperative tool lifecycle](https://github.com/webmachinelearning/webmcp/blob/main/README.md)
- [WebMCP Challenge rules and judging criteria](https://webmcp.devpost.com/rules)
- [OpenAI WebMCP Challenge overview and example categories](https://openai.com/webmcp-challenge/)
- [tldraw editor and AI integration documentation](https://github.com/tldraw/tldraw/blob/main/apps/docs/content/docs/ai.mdx)
- [tldraw agent template](https://github.com/tldraw/agent-template)
- [tldraw production license requirements](https://tldraw.dev/sdk-features/license-key)

## Plan Completion Definition

Implementation is complete only when the deployed app passes the five-run demo test, the video and repository satisfy every submission requirement, and the Devpost entry is submitted before the deadline. A locally working prototype alone is not completion.
