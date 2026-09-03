---
date: 2026-09-03
topic: paint-turn-rules
---

# Human-directed paint turns

## What we are building

The person is the session host. They choose one of four rhythms: one-and-one, two-and-two, agent showcase, or a two-agent paint-off. A persistent rule chip and live canvas ribbon show the active painter and remaining moves. Human input locks during agent turns, and separate labeled cursors show ChatGPT and Mica working in real time.

## Why this approach

Freeform simultaneous work was lively but unclear. A visible turn state makes the collaboration understandable, game-like, and easy to direct. The rule remains data in the shared session, while fill and stroke tools stay atomic. This lets a connected agent use judgment within the rhythm instead of hiding the workflow inside a large tool.

## Key decisions

- Human owns the rule: agents can read it but cannot change it.
- Low-risk moves apply immediately and remain separately undoable.
- One-and-one is the default because it teaches the product without setup.
- Agent-only modes autoplay in the preview so the behavior is demonstrable without an attached model.
- ChatGPT uses coral; Mica uses emerald. Both have independent avatars and cursors.
- A short finite paint-off ends cleanly when the page and fallback sky marks are complete.

## Open questions

- Future sessions could let the host name agents or create custom turn sequences.
- Remote multiplayer would require a shared network store rather than local browser persistence.
