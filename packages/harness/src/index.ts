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

export { layoutDiagram, layoutPinned } from "./layout.js";
export type { Box, EdgeRoute, EdgeSides, PositionedSpec } from "./layout.js";
export { renderPreviewSvg } from "./preview.js";
export { edgeLabelText } from "./measure.js";

export { renderToExcalidraw } from "./renderer.js";
export type {
  ArrowheadStyle,
  HarnessIconEntry,
  HarnessIconRegistry,
  RenderSkeleton,
  RenderResult,
} from "./renderer.js";

export { buildReport } from "./report/index.js";
export { hardFaults, layoutLints } from "./report/lints.js";
export type { Lint, LintCode } from "./report/lints.js";
export type {
  DiagnosticCode,
  Diagnostic,
  DiagramReport,
  Metrics,
  Offenders,
} from "./report/index.js";

export { classicTheme, sketchTheme, themes } from "./theme/index.js";
export type { Theme, ThemeName } from "./theme/index.js";

export { systemModelSchema } from "./model/schema.js";
export type { SystemModel, SystemFlow } from "./model/schema.js";
export { MAX_DETAIL_NODES, planViews } from "./model/views.js";
