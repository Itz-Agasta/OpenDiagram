export type {
  DiagramType,
  DiagramSpec,
  DiagramNode,
  DiagramEdge,
  DiagramGroup,
  DiagramZone,
} from "./schema.js";

export { diagramSpecSchema, diagramTypeSchema } from "./diagram-schema.js";

export { layoutDiagram } from "./layout.js";
export type { Box, EdgeRoute, PositionedSpec } from "./layout.js";

export { renderToExcalidraw } from "./renderer.js";
export type {
  HarnessIconEntry,
  HarnessIconRegistry,
  RenderSkeleton,
  RenderResult,
} from "./renderer.js";

export { classicTheme, sketchTheme, themes } from "./theme/index.js";
export type { Theme, ThemeName } from "./theme/index.js";
