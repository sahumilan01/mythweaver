# MythWeaver

MythWeaver is a consent-based creative canvas where a person and a browser agent take visible turns turning drawn symbols into a playable story world.

The person draws with tldraw. A WebMCP-capable browser agent reads the live canvas, places a structured proposal beside the person's marks, and can revise it after feedback. Only the person can accept or discard the contribution.

## What works

- Full tldraw canvas with local persistence
- Five imperative WebMCP tools
- Agent proposals rendered as orange dashed shapes
- Human-only accept and discard controls
- Visible contribution provenance
- Three-beat story performance with semantic camera focus
- Story metadata persistence across reloads
- Responsive light and dark interface
- Sample proposal for testing without a WebMCP browser

## WebMCP tools

| Tool | Purpose |
|---|---|
| `get_story_world` | Read visible shapes, selection, story state, revision, and consent rules |
| `propose_story_patch` | Add one reviewable contribution with up to eight elements and three beats |
| `revise_story_patch` | Replace the current pending proposal after human feedback |
| `focus_story_elements` | Navigate to elements by semantic IDs instead of screen coordinates |
| `preview_story_performance` | Play committed story beats without mutating the artifact |

There is intentionally no WebMCP tool for accepting, discarding, or resetting work. Creative consent remains a human action in the visible interface.

## Run locally

Requirements: Node.js `^20.19.0` or `>=22.12.0`.

```bash
npm install
cp .env.example .env
npm run dev
```

The app runs without a tldraw key on localhost. For a production deployment, add a valid trial, hobby, or commercial key:

```bash
NEXT_PUBLIC_TLDRAW_LICENSE_KEY=your-key
```

Open the deployed ChatGPT Site in ChatGPT's browser or WebMCP-enabled Chrome. Draw something, then use the prompt offered in the welcome panel.

## Verify

```bash
npm test
npm run build
```

Tests cover the consent state machine, stale revision protection, proposal revision, persistence, and registered WebMCP tool surface.

## Architecture

```text
Browser agent
    |
    | WebMCP tools
    v
registerTools.ts
    |
    +--> StoryStore: revision, pending proposal, contributions, beats
    |
    +--> CanvasPort: reads and updates the shared tldraw editor
                         |
                         v
                    Visible human UI
```

The agent reasons about the story. Tool code validates and applies primitive canvas operations. Agent writes appear immediately in the same workspace the person edits.

## Known first-version limits

- No multiplayer or cloud sync
- No embedded model or chat panel
- Story performances use camera focus and narration, not a general animation timeline
- Human-drawn marks are returned as compact shape data; the external agent supplies interpretation
- A production deployment requires a valid tldraw license key

## License

Project-authored code is available under the MIT License. tldraw and other dependencies retain their own licenses and terms.
