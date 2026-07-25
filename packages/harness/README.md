# @OpenDiagram/harness

The diagram engine. Takes the semantic `DiagramSpec` the LLM emits and turns it
into positioned, styled elements that Excalidraw can render.

The LLM picks structure. This package picks every pixel, color and font. Keep it
that way.

```
DiagramSpec (semantics only)
   │  nodes, edges, groups/zones, categories, kinds - no coordinates
   ▼
layout      ELK layered graph layout (or a custom grid for sequence diagrams)
   │  exact boxes, orthogonal edge routes, measured label positions
   ▼
renderer    theme tokens -> RenderSkeleton[] + raw icon elements
   │  framework-agnostic: NO @excalidraw/excalidraw import (server-safe)
   ▼
apps/web    excalidraw-utils.ts converts skeletons into real Excalidraw elements
```

## File structure

```
src/
  index.ts            Public API. Everything below is re-exported here.
  schema.ts           DiagramSpec TS types (the LLM's contract)
  diagram-schema.ts   Zod mirror of schema.ts, used as the draw_diagram tool
                      inputSchema. Kept loose (no refine/default/transform)
                      because Gemini structured output only supports an
                      OpenAPI 3.0 subset.
  geometry.ts         Box / EdgeRoute / PositionedSpec (leaf types)
  skeleton.ts         RenderSkeleton / RenderResult / icon registry types.
                      The framework-agnostic render plan.
  measure.ts          Server-safe text measurement and node footprints. All
                      sizing flows through here; layout reserves exactly what
                      the renderer draws.
  font-metrics.ts     Per-glyph width tables (Excalifont=5, Nunito=6), measured
                      from real fonts in Chrome. Regenerate with the snippet in
                      the file header if the fonts change.

  layout.ts           ELK pipeline: buildGraph + layoutDiagram (plus re-exported
                      geometry types)
  layout/
    sanitize.ts       Cleanup of LLM output: unknown ids, double-claimed nodes,
                      reciprocal-edge merging. Emits warnings[].
    align.ts          Post-layout polish. Snaps same-layer node centers so
                      columns line up, then shifts edge endpoints to stay
                      orthogonal.
    sequence.ts       Sequence diagrams. Self-computed grid, not ELK. Actors are
                      columns, messages are rows. Handles alt/loop fragments,
                      auto-numbering, red error and green success replies.

  renderer.ts         Orchestrator. renderToExcalidraw walks the positioned spec
                      and delegates to renderer/*
  renderer/
    containers.ts     Group/zone boxes with labels
    nodes.ts          Node shapes: solo icon, mermaid box, card, ERD entity
    edges.ts          Arrows along ELK routes, crow-foot cardinality, labels
    icons.ts          Clones raw Excalidraw icon elements from the registry into
                      a node's icon band (id remapping, binding strip)

  theme/
    types.ts          The Theme contract. Every visual decision is a token.
    classic.ts        Crisp architectural style (Nunito, roughness 0, cards)
    sketch.ts         Hand-drawn style (Excalifont, roughness 1, hachure)
    index.ts          themes registry (add new themes here)
```

## Design rules

**Sizing and rendering must agree.** `measure.ts#nodeSize` decides a node's
footprint and the renderer draws inside that exact box. Change one branch (say,
how entity tables render) and you have to change its sizing branch too.

**Edge routes are drawn verbatim.** ELK reserves space for measured edge labels
along the exact polyline it returns, so rerouting an edge after layout detaches
its label. This is also why Excalidraw `elbowed` arrows are unusable here:
programmatic insert draws them as straight diagonals.

**No `@excalidraw/excalidraw` imports in this package.** It only evaluates in a
browser. The final skeleton-to-element conversion lives in
`apps/web/src/lib/excalidraw-utils.ts`.

**Degrade, never throw.** LLM output is hostile input. Sanitize it, drop what is
unusable, and report through `PositionedSpec.warnings` so the agent can relay it
to the user.

**Themes own all styling.** A new look means a new file in `theme/` satisfying
`Theme` and registered in `theme/index.ts`. Nothing else should change.

## Diagram-type dispatch

- `sequence` calls `renderSequenceDiagram(spec, theme)`, which lays out and
  renders in one pass.
- Everything else calls `await layoutDiagram(spec, theme)` then
  `renderToExcalidraw(positioned, iconRegistry, theme)`.
- ERD entities are triggered by `node.columns` and crow-feet by
  `edge.cardinality`. The `erd` type defaults to top-down direction.

Dispatch itself lives in the caller, `apps/server/src/lib/agent/tools.ts`, which
also strips icon keys missing from the server's icon registry before layout.

## Gotchas

Each of these already cost someone an afternoon. Check here before "fixing" them.

- **elkjs on Bun** has to run its worker as a real Worker:
  `new ELK({ workerUrl: require.resolve("elkjs/lib/elk-worker.min.js") })`.
  In-process loading hangs because Bun defines `self`.
- **`bun --hot` does not reload this package.** Restart `dev:server` after
  editing harness code or you are verifying stale behavior.
- **Excalidraw centered text:** with `textAlign: "center"` the element's `x` is
  the center anchor after re-measure. Pass centers, not left edges.
- **Don't re-add `elk.layered.nodePlacement.strategy: NETWORK_SIMPLEX`.** It
  makes routing worse here: 45 bends vs 26 on an 11-node grouped spec.
- **Icon clones must null out** `boundElements`, `containerId`, `*Binding` and
  `frameId`, or `convertToExcalidrawElements` throws on dangling refs.

## Testing

```bash
cd packages/harness && bun test
```

`test/harness.test.ts` is the geometry smoke suite. It covers sequence rendering
(fragments, numbering, error/success colors, bottom actor boxes), ERD (entity
rows, crow-foot heads, top-down order), ELK invariants (orthogonal routes,
column-center alignment) and theme fallbacks. It runs the real pipeline: no
mocks, no LLM, no browser.

Run it after any harness change, and extend it when you add pipeline features.
