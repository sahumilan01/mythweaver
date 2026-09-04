# MythWeaver capability map

| UI action | Agent capability | Status |
|---|---|---|
| Read the canvas and current turn | `get_story_world` | Complete |
| Fill a named region | `paint_canvas_region` | Complete |
| Fill a predefined coloring section | `paint_canvas_region` | Complete |
| Join and show live presence | `join_painting_session` or authenticated `/presence` | Complete |
| Read from another browser | Authenticated `/state` | Complete |
| Undo agent paint | `undo_agent_paint` | Complete |
| Clear agent paint | `clear_agent_paint` | Complete |
| Choose the session rule | Human host action | Intentionally human-only |
| Read and obey the session rule | `get_story_world` plus tool enforcement | Complete |
| Undo or clear human paint | Visible human controls | Intentionally human-only |
| Accept or discard a story proposal | Visible human controls | Intentionally human-only |
