# MythWeaver

MythWeaver is a live pair-painting canvas for a person and ChatGPT. It begins like a coloring book: choose a color and tap an outlined region. A WebMCP-capable agent can read the same semantic page, choose a section and color with visual judgment, explain its choice, and add a visible fill while following the person's turn rule.

## The collaboration model

- Human paint and ChatGPT paint appear immediately on one shared canvas.
- Every region has a stable name, so an agent can paint the fox or river without guessing screen coordinates.
- The activity strip says who changed what. ChatGPT paint also uses a coral outline.
- Figma-style presence appears only after a real WebMCP call reaches the page, then shows ChatGPT moving a labeled cursor to its chosen paint target.
- The human host chooses the rhythm: one-and-one, two-and-two, agent showcase, or a two-agent paint-off.
- A live turn ribbon locks the brush between turns and counts down the remaining moves.
- Human undo affects human paint. Agent undo and clear affect agent paint only.
- ChatGPT cannot overwrite a person's painted section; recoloring its own work requires an explicit request.
- A live WebMCP receipt shows the agent's latest read or visual decision without opening a technical panel.
- Tool registration retries when a browser injects WebMCP after the page mounts, so every visitor can connect the agent in their own ChatGPT session.
- Low-risk, reversible paint moves happen live. Larger story additions remain proposals that only the person can keep or remove.
- The native SVG canvas has no production license dependency and persists locally across reloads.

## WebMCP tools

| Tool | Purpose |
|---|---|
| `join_painting_session` | Join visibly through WebMCP and receive the live collaboration briefing |
| `get_story_world` | Read named regions, fills, human choices, visual relations, turn state, and next-action guidance |
| `paint_canvas_region` | Explain a visual choice, move the agent cursor, and fill one named region |
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

Open the site in ChatGPT's in-app browser. Select **Connect your agent**, then paste the copied live URL and instructions into that user's ChatGPT conversation. The page confirms that nine tools are ready before the message is sent. ChatGPT opens the canvas, joins through `join_painting_session`, reads the fresh scene, and paints only when the turn state permits. Each visitor gets an independent browser-local painting and connects their own agent; no shared account is required. When the invitation opens in another tab of that browser, paint, presence, and turn state stay synchronized so the original tab becomes a live spectator view. **Watch Mica demo one move** is a clearly labeled deterministic fallback and does not claim to use WebMCP.

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
   | WebMCP: join, read, reason, fill, verify, undo
   v
CanvasPort --------> native SVG canvas
   |                       ^
   |                       | tap, fill, undo
   +--> StoryStore      person
        proposals and consent
```

## First-version limits

- Collaboration is between the browser-local canvas and its attached agent, with live synchronization between tabs in that browser. It is not cross-device multiplayer.
- A webpage cannot summon the host agent. The invite button prepares the request; ChatGPT joins only after the person sends it in chat.
- Chat lives in ChatGPT rather than inside the canvas.
- Story performances are short narrated beats, not a general animation timeline.

## License

Project-authored code is available under the MIT License. Dependencies retain their own licenses and terms.
