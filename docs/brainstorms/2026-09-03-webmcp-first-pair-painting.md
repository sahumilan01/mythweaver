---
date: 2026-09-03
topic: webmcp-first-pair-painting
---

# WebMCP-first pair painting

## What we're building

Replace the page-controlled fake ChatGPT autoplay with a real WebMCP collaboration handshake. The page may request an agent, but only an actual WebMCP tool call may mark ChatGPT as joined or create ChatGPT paint. The real agent reads the current semantic canvas, chooses a valid section and color, explains the choice, paints it, verifies the result, and follows the human-selected turn rule.

## Why this approach

The browser page cannot programmatically command the host ChatGPT agent. Pretending otherwise makes the demo easy but destroys provenance. A small set of atomic tools plus rich, fresh state gives the agent room to make intelligent choices while keeping every action visible and reversible.

## Key decisions

- Add `join_painting_session` as the explicit MCP handshake and current-session briefing.
- Make `get_story_world` return open regions, prior human choices, legal next actors, composition guidance, and a clear recommended loop.
- Require a short `reason` on each paint call and display it while the real agent cursor moves.
- Let the MCP caller act as the currently active agent, including the second-agent role in AI + AI mode.
- Keep a deterministic local fallback only as “Mica demo,” never as ChatGPT.
- “Invite ChatGPT” prepares and copies the exact chat request; it does not claim the agent joined.

## Success criteria

- Clicking invite never paints or shows ChatGPT as joined.
- Calling the join tool visibly adds ChatGPT and returns fresh canvas/turn context.
- An MCP paint call visibly moves the cursor, shows its reasoning, fills one predefined region, and advances the rule.
- The tool output tells the agent whether to continue, wait for the person, or finish.
- One prompt can drive 1+1, 2+2, watch, and AI + AI modes through repeated read/paint calls.

