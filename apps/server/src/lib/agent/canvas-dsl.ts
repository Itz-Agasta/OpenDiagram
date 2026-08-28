import type { DiagramSpec } from "@OpenDiagram/harness";

/**
 * Serializes a canvas diagram as a header-once pipe table instead of JSON.
 *
 * Reason 1 (correctness): JSON in CANVAS drives gemini-2.5-flash into its
 * Python tool-call mode (`print(default_api.draw_diagram(...))`), which the API
 * rejects as MALFORMED_FUNCTION_CALL: no text, no tool call, zero output tokens,
 * and the stream simply ends. Redrawing the 18-node LinkedIn spec failed 8/10
 * with a JSON canvas and 0/10 with this one, on a single-diagram canvas, so it
 * is the format and not the payload size. A 9-node redraw failed 4/10. The
 * control that pins it: the same table WITH icons still passed 10/10.
 *
 * This reduces the failure, it does not remove it: the same rejection still
 * turns up on an EMPTY canvas, where none of this runs. Keep the retry in
 * `chat-stream.ts`.
 *
 * Reason 2 (cost): 44% fewer tokens than compact JSON on the 16-spec corpus,
 * and CANVAS is the whole full-price part of the bill now that the head is
 * cached. https://arxiv.org/abs/2601.06007
 *
 * Layout: one header line per array listing only the columns that array
 * actually uses, then one row per element. Per-array and per-diagram, because a
 * fixed global header pays for empty cells and our nodes are sparse by nature.
 *
 * Nested leftovers (`columns` on ERD nodes, `sections` on sequence fragments,
 * `contains` on groups and zones) stay as compact JSON inside their cell.
 * Tabular for uniform rows, JSON for nested, and both survived a redraw intact
 * in the sweep.
 */

type Row = Record<string, unknown>;

// Labels are model-authored, so neither the `|` separator nor the `"""` fence
// that closes CANVAS can be assumed absent. Swapped, not escaped: a label is
// prose and nothing needs the original character back. After JSON.stringify too,
// or a `|` inside an ERD column name shifts every later column of that row.
function cell(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.replaceAll("|", "/").replaceAll('"""', "'''").replaceAll("\n", " ");
}

function table(tag: string, rows: Row[] | undefined, columns: string[]): string[] {
  if (!rows || rows.length === 0) return [];
  const used = columns.filter((key) =>
    rows.some((row) => row[key] !== undefined && row[key] !== ""),
  );
  return [
    `${tag} ${used.join("|")}`,
    ...rows.map((row) => used.map((key) => cell(row[key])).join("|")),
  ];
}

// `icon` and `description` are absent on purpose. Icons are 16% of CANVAS for
// strings the model picked once, so `restoreIcons` in tools.ts puts them back by
// node id and PROTOCOL rule 10 tells the model to omit them; that also fixes the
// silent drop when a redraw forgot one. `description` is read by nothing.
// Known limitation: a node can no longer shed its icon by omitting the field.
const NODE_COLUMNS = ["id", "label", "sublabel", "category", "shape", "columns", "style"];
const EDGE_COLUMNS = [
  "id",
  "from",
  "to",
  "label",
  "kind",
  "protocol",
  "direction",
  "cardinality",
  "style",
  "startArrowhead",
  "endArrowhead",
];
const GROUP_COLUMNS = [
  "id",
  "label",
  "sublabel",
  "style",
  "contains",
  "sections",
  "strokeColor",
  "backgroundColor",
];
const ZONE_COLUMNS = ["id", "label", "style", "contains"];

/** One diagram, as the model sees it. `id` is the frame it occupies. */
export function specToDsl(id: string, spec: DiagramSpec): string {
  return [
    `#${id} ${spec.type} ${spec.meta?.direction ?? "LR"} ${cell(spec.title)}`,
    ...table("N", spec.nodes as unknown as Row[], NODE_COLUMNS),
    ...table("E", spec.edges as unknown as Row[], EDGE_COLUMNS),
    ...table("G", spec.groups as Row[] | undefined, GROUP_COLUMNS),
    ...table("Z", spec.zones as Row[] | undefined, ZONE_COLUMNS),
  ].join("\n");
}
