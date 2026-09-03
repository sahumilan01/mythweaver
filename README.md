# MythWeaver

MythWeaver is a live pair-painting canvas for a person and ChatGPT. It begins like a coloring book: choose a color, tap an outlined region, or drag to draw. A WebMCP-capable agent can read the same page and add visible fills or brush strokes while the person keeps painting.

## The collaboration model

- Human paint and ChatGPT paint appear immediately on one shared canvas.
- Every region has a stable name, so an agent can paint the fox or river without guessing screen coordinates.
- The activity strip says who changed what. ChatGPT paint also uses a coral outline.
- Human undo affects human paint. Agent undo and clear affect agent paint only.
- Low-risk, reversible paint moves happen live. Larger story additions remain proposals that only the person can keep or remove.
- The native SVG canvas has no production license dependency and persists locally across reloads.

## WebMCP tools

| Tool | Purpose |
|---|---|
| `get_story_world` | Read named regions, fills, strokes, story state, and revision |
| `paint_canvas_region` | Fill one named region immediately |
| `add_canvas_stroke` | Add one visible freehand stroke |
| `undo_agent_paint` | Undo ChatGPT's latest paint move only |
| `clear_agent_paint` | Clear ChatGPT paint while preserving human work |
| `propose_story_patch` | Stage a larger story contribution for human review |
| `revise_story_patch` | Revise the pending story proposal |
| `focus_story_elements` | Focus accepted story elements by semantic ID |
| `preview_story_performance` | Play committed story beats without changing the work |

There is no agent tool for accepting or discarding story proposals. That decision stays in the visible UI.

## Run locally

Requires Node.js `^20.19.0` or `>=22.12.0`.

```bash
npm install
npm run dev
```

Open the site in ChatGPT or a WebMCP-enabled browser. Tap **Color the moon**, then ask ChatGPT to paint with you. **Watch a demo partner** shows the same live rhythm without an attached agent.

## Verify

```bash
npm test
npx tsc --noEmit
npm run build
```

Tests cover the shared human/agent paint world, origin-specific undo, tool validation, consent state, stale revision protection, persistence, and the registered WebMCP surface.

## Architecture

```text
ChatGPT
   | WebMCP: read, fill, stroke, undo
   v
CanvasPort --------> native SVG canvas
   |                       ^
   |                       | tap, drag, undo
   +--> StoryStore      person
        proposals and consent
```

## First-version limits

- Collaboration is between the local page and its attached browser agent; there is no remote multiplayer sync.
- Chat lives in ChatGPT rather than inside the canvas.
- Story performances are short narrated beats, not a general animation timeline.

## License

Project-authored code is available under the MIT License. Dependencies retain their own licenses and terms.
