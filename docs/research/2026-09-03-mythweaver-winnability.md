# MythWeaver winnability audit

Date: 2026-09-03

## Verdict

MythWeaver is not eligible as it stands because its GitHub repository is private. If the submission requirements are completed, the product is credible and distinctive, but it is not yet a likely top-10 entry. The strongest issue is provenance: the visible “Invite ChatGPT” flow starts a local autoplay routine, while genuine WebMCP tool calls are a separate path. The demo must clearly prove real WebMCP use.

Subjective score after fixing eligibility: 6.5/10 overall; roughly a 5–12% top-10 chance. A focused submission that demonstrates real tool calls and sharpens the impact case could plausibly raise that to 15–25%. These probabilities are judgment calls, not statistical estimates; the number and quality of final submissions are unknown.

## Judge-style score

| Criterion | Score | Evidence |
| --- | ---: | --- |
| WebMCP leverage | 6/10 | Eight registered tools, semantic scene state, section fills, undo/clear, story proposals, revision, focus, and preview are non-trivial. The default visible agent flow is locally simulated and obscures the actual WebMCP boundary. |
| Execution | 7.5/10 | Hosted, polished, coherent, responsive, and tested. Onboarding and turn states exist. Documentation describes removed freehand behavior and an obsolete tool. |
| Potential impact | 5.5/10 | Guided co-creation for children and educators is plausible, but the current experience demonstrates fun more strongly than a specific problem, audience, or outcome. |
| Creativity and ambition | 7/10 | Pair-programming mechanics applied to a shared coloring canvas, explicit turn rules, multiple agents, and reversible story contributions are distinctive. Simple color filling alone risks reading as a toy. |

## Blocking submission requirements

- Make the source repository public and keep the MIT license detectable in GitHub’s About section.
- Supply a public, accessible live URL through the judging period.
- Publish a public YouTube demo with audio, strictly under three minutes.
- Write the required submission description: WebMCP fit, better UX, what humans and agents can newly do together, and a brief implementation explanation.
- Register and submit before September 3, 2026 at 1:00 PM Pacific.

## Highest-leverage improvements

1. In the video, issue a real ChatGPT request that causes `get_story_world` followed by `paint_canvas_region`. Show the WebMCP trace or advanced activity alongside the visible cursor and fill.
2. Rename or clearly label local autoplay as a demo partner. Do not imply that a local timer is ChatGPT. Make actual agent presence visually distinct and truthfully sourced.
3. Demonstrate one advanced collaboration loop: the agent proposes a story change, the human approves it, and the performance preview plays. This turns the pitch from “AI coloring toy” into governed co-creation.
4. Update README and PRODUCT documentation to remove `add_canvas_stroke`, freehand drawing, and the outdated launch path.
5. Frame the audience narrowly: a guided co-creation activity for children and educators that makes turn-taking, agency, and AI actions visible and reversible.

## Suggested demo spine (under three minutes)

- 0:00: A child and an agent share the same coloring page instead of exchanging drawing instructions in chat.
- 0:15: The person selects a color and fills one named section.
- 0:30: ChatGPT reads the live semantic scene through WebMCP and fills a different section; show the real tool calls and cursor.
- 0:55: Change the collaboration rule to 2+2 or agent-versus-agent and show the handoff.
- 1:20: ChatGPT proposes one story element; the person reviews and accepts it; preview the result.
- 2:05: Explain the architecture: semantic artifacts, shared command layer, provenance, undo, and human-only consent.
- 2:35: Close on the thesis: WebMCP lets people supervise and create with an agent inside the interface where the work already lives.

## Sources

- Official rules and judging criteria: https://webmcp.devpost.com/rules
- Official challenge resources: https://webmcp.devpost.com/resources
- WebMCP documentation: https://learn.chatgpt.com/docs/webmcp

