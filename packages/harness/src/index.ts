export type {
  DiagramType,
  DiagramSpec,
  DiagramNode,
  DiagramEdge,
  DiagramGroup,
  DiagramZone,
  EntityColumn,
} from "./schema.js";

export { renderSequenceDiagram } from "./layout/sequence.js";
export type { SequenceRenderResult } from "./layout/sequence.js";

export { diagramSpecSchema, diagramTypeSchema } from "./diagram-schema.js";

export { layoutDiagram } from "./layout.js";
export type { Box, EdgeRoute, PositionedSpec } from "./layout.js";

export { renderToExcalidraw } from "./renderer.js";
export type {
  ArrowheadStyle,
  HarnessIconEntry,
  HarnessIconRegistry,
  RenderSkeleton,
  RenderResult,
} from "./renderer.js";

export { buildReport } from "./report/index.js";
export type {
  DiagnosticCode,
  Diagnostic,
  DiagramReport,
  Metrics,
  Offenders,
} from "./report/index.js";

export { classicTheme, sketchTheme, themes } from "./theme/index.js";
export type { Theme, ThemeName } from "./theme/index.js";

export { estimateTextWidth } from "./measure.js";
