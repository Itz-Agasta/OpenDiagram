# @OpenDiagram/harness

The diagram engine. Turns a semantic `DiagramSpec` (what the LLM outputs) into
positioned, styled, Excalidraw-ready elements. **The LLM never chooses pixels,
colors, or fonts — this package owns all geometry and styling.** That split is
the core quality mechanism of OpenDiagram.

```
DiagramSpec (semantics only)
   │  nodes, edges, groups/zones, categories, kinds — no coordinates
   ▼
layout      ELK layered graph layout (or a custom grid for sequence diagrams)
   │  exact boxes, orthogonal edge routes, measured label positions
   ▼
renderer    theme tokens → RenderSkeleton[] + raw icon elements
   │  framework-agnostic: NO @excalidraw/excalidraw import (server-safe)
   ▼
apps/web    excalidraw-utils.ts converts skeletons → real Excalidraw elements
```

## File structure

```
src/
  index.ts            Public API — everything below is re-exported here
  schema.ts           DiagramSpec TS types (the LLM's contract)
  diagram-schema.ts   Zod mirror of schema.ts, used as the draw_diagram tool
                      inputSchema. Kept loose (no refine/default/transform)
                      because Gemini structured output supports only an
                      OpenAPI 3.0 subset.
  geometry.ts         Box / EdgeRoute / PositionedSpec (leaf types)
  skeleton.ts         RenderSkeleton / RenderResult / icon registry types —
                      the framework-agnostic render plan
  measure.ts          Server-safe text measurement + node footprints. All
                      sizing flows through here; layout reserves exactly what
                      the renderer draws.
  font-metrics.ts     Per-glyph width tables (Excalifont=5, Nunito=6),
                      measured from real fonts in Chrome. Regenerate with the
                      snippet in the file header if fonts change.

  layout.ts           ELK pipeline: buildGraph + layoutDiagram (+ re-exported
                      geometry types)
  layout/
    sanitize.ts       Defensive cleanup of LLM output: unknown ids, double-
                      claimed nodes, reciprocal-edge merging → warnings[]
    align.ts          Post-layout polish: snap same-layer node centers so
                      columns line up; shifts edge endpoints to stay orthogonal
    sequence.ts       Sequence diagrams — a self-computed grid, NOT ELK.
                      Actors = columns, messages = rows, alt/loop fragments,
                      auto-numbering, red error / green success replies.

  renderer.ts         Orchestrator: renderToExcalidraw walks the positioned
                      spec and delegates to renderer/*
  renderer/
    containers.ts     Group/zone boxes with labels
    nodes.ts          Node shapes: solo icon, mermaid box, card, ERD entity
    edges.ts          Arrows along ELK routes, crow-foot cardinality, labels
    icons.ts          Clones raw Excalidraw icon elements from the registry
                      into a node's icon band (id remapping, binding strip)

  theme/
    types.ts          The Theme contract — every visual decision is a token
    classic.ts        Crisp architectural style (Nunito, roughness 0, cards)
    sketch.ts         Hand-drawn style (Excalifont, roughness 1, hachure)
    index.ts          `themes` registry (add new themes here)
```

## Key design rules

1. **Sizing and rendering must agree.** `measure.ts#nodeSize` decides a node's
   footprint; the renderer draws inside that exact box. If you change one
   branch (e.g. how entity tables render), change its sizing branch too.
2. **Edge routes are drawn verbatim.** ELK reserves space for measured edge
   labels along the exact polyline it returns — rerouting an edge after layout
   detaches its label. (This is also why Excalidraw `elbowed` arrows can't be
   used: programmatic insert draws them as straight diagonals.)
3. **No `@excalidraw/excalidraw` imports here.** That package only evaluates in
   a browser. The final skeleton→element conversion lives in
   `apps/web/src/lib/excalidraw-utils.ts`.
4. **Degrade, never throw.** LLM output is hostile input: sanitize, drop, and
   report via `PositionedSpec.warnings` — the agent relays them to the user.
5. **Themes own all styling.** New look = new file in `theme/` satisfying
   `Theme`, registered in `theme/index.ts`. Nothing else changes.

## Diagram-type dispatch

- `sequence` → `renderSequenceDiagram(spec, theme)` (layout+render in one pass)
- everything else → `await layoutDiagram(spec, theme)` then
  `renderToExcalidraw(positioned, iconRegistry, theme)`
- ERD entities are triggered by `node.columns`, crow-feet by
  `edge.cardinality`; `erd` type defaults to top-down direction.

The dispatch lives in the caller (`apps/server/src/lib/agent/tools.ts`), which
also strips icon keys that aren't in the server's icon registry before layout.

## Gotchas (hard-won — verify before "fixing")

- **elkjs on Bun** must run its worker as a real Worker
  (`new ELK({ workerUrl: require.resolve("elkjs/lib/elk-worker.min.js") })`);
  in-process loading hangs because Bun defines `self`.
- **`bun --hot` does not reload this package.** Restart `dev:server` after
  editing harness code or you'll verify stale behavior.
- **Excalidraw centered text:** with `textAlign: "center"`, the element's `x`
  is the CENTER anchor after re-measure — pass centers, not left edges.
- **`elk.layered.nodePlacement.strategy: NETWORK_SIMPLEX` makes routing worse**
  here (measured: 45 bends vs 26 on an 11-node grouped spec). Don't re-add it.
- Icon clones must null out `boundElements`/`containerId`/`*Binding`/`frameId`
  or `convertToExcalidrawElements` throws on dangling refs.

## Testing

```bash
cd packages/harness && bun test
```

`test/harness.test.ts` is the geometry smoke suite: sequence rendering
(fragments, numbering, error/success colors, bottom actor boxes), ERD
(entity rows, crow-foot heads, top-down order), ELK invariants (orthogonal
routes, column-center alignment), and theme fallbacks. It runs the real
pipeline — no mocks, no LLM, no browser. **Run it after any harness change
and extend it alongside new features.**
