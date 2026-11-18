# Pteron workspace

Pteron is a desktop workbench for drawing editable SVGs and timing their motion and narration. The artboard and timeline are the primary surfaces. Scenes, Layers, and the inspector provide the context needed to work on them.

- Use flat docked surfaces, subtle dividers, and the shared dark theme tokens. Reserve the lavender accent for selection, keyboard focus, and the primary action. Keep warm amber for the playhead.
- Prefer readable sentence-case labels. Use at least 11 px for functional workspace text, including ruler values and clip labels. Familiar canvas and timing tools can use icons with accessible names and shortcut hints. Keep file actions, save and export states, and unfamiliar media actions legible without hover.
- Preserve the artboard position when selection changes. Keep panel dividers, the pinned timeline ruler, and the label column usable at the 800 × 560 minimum. Use tabular numbers for time and frame values.
- Reserve space for changing labels, job progress and status icons. Keep neighboring controls anchored as work starts, updates or finishes, including at the minimum window size.
- Give empty and disabled panels an actionable explanation. Keep errors visible and dismissible. Use immediate feedback for editing gestures and honor reduced motion for interface decoration.
- Use the existing Radix-based controls and shared commands. Keep workspace styling outside the artwork document and sampled render output.

Review changes on the actual Electron workspace at desktop and minimum sizes. Exercise keyboard focus, a blank scene, selected artwork and clips, media import, and export progress and recovery where the affected surface calls for them.

## Compact authoring controls

The artboard remains the visual focus. Energy 1, rhythm 1, interface motion 1: flat task-oriented surfaces, existing lavender selection/focus and amber timing cues. Reuse the existing Lucide stroke vocabulary for concrete actions, including saved-shape insertion, motion reuse, timing boundaries, fit, aspect locking and recovery. No additional decorative imagery or navigation system.

Use icon buttons for familiar compact actions with hover titles and accessible names. Use a short text label when an action is not universal (imports, Copy SRT, settings); icon-only is reserved for the canvas/tool rails, alignment tools and standard window controls. Keep authored names, fields, categorical labels and menus as text. Do not add explanatory sentences to the inspector or timeline. Saved shapes and motion use collapsed disclosures; recovery uses an explicit preview before replacement. Keep the 800×560 workspace operable through independent panel scrolling and the existing compact layout.

Window chrome is part of the application header. Use a frameless 40px drag strip with application-styled Minimize, Maximize/Restore and Close controls at the trailing edge; do not let the OS caption overlay sit outside the visual system. Double-clicking the empty header toggles maximize.

Activity and MCP is a flat utility surface: plain sections and rows, text status, one stable jobs area and no nested cards, dashed empty panels, status dots, pills or repeated metadata. Keep the copy action, revision and history text-first.

Timing fields must stay readable before they stay paired. Stack Start and Duration when a narrow inspector would clip snapped values, and keep an s/f switch in the same header so integer-frame editing does not require another panel. Distinguish Main scene sections with the scene glyph already used for screens; do not let a scene row look identical to a same-named artwork group.

The compact Export progress percentage uses 9px text at the user’s explicit request, reserving breathing room inside its 28px square. This exception is limited to the badge; its accessible progress value and tooltip retain the full status. Export uses a simple upward arrow leaving a tray, following the user’s CapCut reference and the existing Lucide stroke style.
