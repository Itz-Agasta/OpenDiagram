import {
  countTextLines,
  edgeLabelText,
  estimateTextHeight,
  estimateTextWidth,
} from "../measure.js";
import type { RenderResult, RenderSkeleton } from "../skeleton.js";
import type { DiagramEdge, DiagramSpec } from "../schema.js";
import type { Theme } from "../theme/index.js";

// Sequence geometry (px). ELK is not involved: sequence diagrams are a strict
// grid (actors = columns, messages = rows), so the layout is computed directly.
const MIN_ACTOR_GAP = 170; // min center-to-center distance between lifelines
const ACTOR_CLEARANCE = 64; // extra air between adjacent actor boxes
const LABEL_CLEARANCE = 64; // air around a message label between its lifelines
const FIRST_ROW_GAP = 52; // gap between actor boxes and the first message
const ROW_HEIGHT = 52; // vertical rhythm per message
const SELF_LOOP_WIDTH = 56; // how far a self-call pokes right of its lifeline
const SELF_LOOP_HEIGHT = 24;
const SELF_ROW_EXTRA = 28; // self-calls take a taller row
const LIFELINE_TAIL = 40; // lifeline length past the last message
const LIFELINE_COLOR = "#9ca3af"; // thin solid gray, like classic UML tools
const FRAGMENT_HEADER = 30; // room above a fragment's first message for its label
const FRAGMENT_FOOTER = 14; // room below a fragment's last message
const FRAGMENT_PAD_X = 28; // fragment box overhang past its outermost lifelines
const FRAGMENT_STROKE = "#64748b";
const FRAGMENT_FILL = "#f1f5f9"; // light tint so the span reads as one block
const SECTION_BAND = 24; // room for an alt/else branch label + divider

// Actors always cycle through Excalidraw's vivid stock pastels so each column
// is unmistakable — category colors are too pale for sequence headers.
const ACTOR_PALETTE = [
  { stroke: "#6741d9", fill: "#d0bfff" }, // purple
  { stroke: "#2f9e44", fill: "#b2f2bb" }, // green
  { stroke: "#1971c2", fill: "#a5d8ff" }, // blue
  { stroke: "#f08c00", fill: "#ffec99" }, // yellow
  { stroke: "#e03131", fill: "#ffc9c9" }, // red
];

export interface SequenceRenderResult extends RenderResult {
  warnings: string[];
}

interface SequenceMessage extends DiagramEdge {
  id: string;
  fromIndex: number;
  toIndex: number;
}

/**
 * Longer flows get auto-numbered messages ("4. POST /login") so the timeline
 * reads easily; short diagrams (≤3 messages) stay clean without numbers.
 */
function numberedLabel(msg: SequenceMessage, index: number, total: number): string | undefined {
  const label = edgeLabelText(msg);
  if (!label) return undefined;
  return total > 3 ? `${index + 1}. ${label}` : label;
}

/**
 * Custom sequence diagram pipeline (layout + render in one pass): actors
 * become boxes (repeated at top and bottom) on solid gray lifelines, edges
 * become horizontal message arrows stacked top-to-bottom in spec order,
 * `from === to` renders a self-call loop, and groups whose `contains` lists
 * message edge ids become UML alt/loop/opt fragment boxes. Column spacing is
 * measured from actor and message label widths so nothing ever truncates.
 */
export function renderSequenceDiagram(spec: DiagramSpec, theme: Theme): SequenceRenderResult {
  const warnings: string[] = [];
  const { boxNode, text } = theme;

  if ((spec.zones?.length ?? 0) > 0) {
    warnings.push("sequence layout ignores zones");
  }

  const actorIndex = new Map<string, number>();
  spec.nodes.forEach((node, i) => {
    if (actorIndex.has(node.id)) warnings.push(`duplicate actor id "${node.id}" — keeping first`);
    else actorIndex.set(node.id, i);
  });
  const actors = spec.nodes.filter((node, i) => actorIndex.get(node.id) === i);
  actors.forEach((node, i) => actorIndex.set(node.id, i));

  // Messages keep spec order — array order IS the timeline.
  const messages: SequenceMessage[] = [];
  spec.edges.forEach((edge, i) => {
    const fromIndex = actorIndex.get(edge.from);
    const toIndex = actorIndex.get(edge.to);
    if (fromIndex === undefined || toIndex === undefined) {
      warnings.push(`dropping message with unknown actor (${edge.from} -> ${edge.to})`);
      return;
    }
    messages.push({ ...edge, id: edge.id ?? `msg-${i}`, fromIndex, toIndex });
  });

  // UML-style fragments (alt/loop/opt boxes): a group whose `contains` lists
  // message edge ids becomes a labeled box spanning those rows.
  const msgIndexById = new Map(messages.map((m, i) => [m.id, i]));
  interface Fragment {
    id: string;
    label: string;
    first: number;
    last: number;
    rows: number[];
    /** alt/else branches, resolved to row indices, sorted top-down. */
    sections: { label: string; row: number }[];
  }
  const fragments: Fragment[] = [];
  for (const group of spec.groups ?? []) {
    const rows = group.contains
      .map((id) => msgIndexById.get(id))
      .filter((v): v is number => v !== undefined)
      .sort((a, b) => a - b);
    if (rows.length === 0) {
      warnings.push(`dropping fragment "${group.id}" — contains no known message ids`);
      continue;
    }
    const sections: Fragment["sections"] = [];
    for (const section of group.sections ?? []) {
      const row = msgIndexById.get(section.startsAt);
      if (row === undefined) {
        warnings.push(
          `dropping section "${section.label}" of fragment "${group.id}" — unknown edge id "${section.startsAt}"`,
        );
        continue;
      }
      sections.push({ label: section.label, row });
    }
    sections.sort((a, b) => a.row - b.row);
    fragments.push({
      id: group.id,
      label: group.label,
      first: rows[0]!,
      last: rows.at(-1)!,
      rows,
      sections,
    });
  }
  const headerCount = new Map<number, number>();
  const footerCount = new Map<number, number>();
  const sectionCount = new Map<number, number>();
  const rowInFragment = new Set<number>();
  for (const f of fragments) {
    headerCount.set(f.first, (headerCount.get(f.first) ?? 0) + 1);
    footerCount.set(f.last, (footerCount.get(f.last) ?? 0) + 1);
    for (const s of f.sections) sectionCount.set(s.row, (sectionCount.get(s.row) ?? 0) + 1);
    for (let r = f.first; r <= f.last; r++) rowInFragment.add(r);
  }

  // Actor box sizes (same box style as icon-less nodes, label centered inside).
  const actorWidths = actors.map((node) => {
    const labelWidth = estimateTextWidth(node.label, text.nodeLabel.size, theme.fontFamily);
    const sublabelWidth = node.sublabel
      ? estimateTextWidth(node.sublabel, text.nodeSublabel.size, theme.fontFamily)
      : 0;
    return Math.max(boxNode.minWidth, Math.max(labelWidth, sublabelWidth) + boxNode.paddingX * 2);
  });
  const actorHeight =
    boxNode.paddingY * 2 +
    boxNode.labelHeight +
    (actors.some((node) => node.sublabel) ? boxNode.sublabelHeight : 0);

  // Column spacing: start from box clearance, then widen the gaps each message
  // label spans until the label fits (spread across all gaps it crosses).
  const gaps: number[] = [];
  for (let i = 0; i < actors.length - 1; i++) {
    const w = actorWidths[i] ?? 0;
    const next = actorWidths[i + 1] ?? 0;
    gaps.push(Math.max(MIN_ACTOR_GAP, w / 2 + next / 2 + ACTOR_CLEARANCE));
  }
  const labelSize = text.edgeLabel.size;
  messages.forEach((msg, msgIndex) => {
    const label = numberedLabel(msg, msgIndex, messages.length);
    if (!label) return;
    const needed = estimateTextWidth(label, labelSize, theme.fontFamily) + LABEL_CLEARANCE;
    const lo = Math.min(msg.fromIndex, msg.toIndex);
    const hi = Math.max(msg.fromIndex, msg.toIndex);
    if (lo === hi) {
      // Self-call: the loop + label live to the RIGHT of the lifeline.
      const gapIdx = lo;
      if (gapIdx < gaps.length) {
        const nextHalf = (actorWidths[gapIdx + 1] ?? 0) / 2;
        gaps[gapIdx] = Math.max(gaps[gapIdx] ?? 0, SELF_LOOP_WIDTH + needed + nextHalf);
      }
      return;
    }
    const span = hi - lo;
    for (let g = lo; g < hi; g++) {
      gaps[g] = Math.max(gaps[g] ?? 0, needed / span);
    }
  });

  const lifelineX: number[] = [];
  let cursor = (actorWidths[0] ?? 0) / 2;
  for (let i = 0; i < actors.length; i++) {
    lifelineX.push(cursor);
    cursor += gaps[i] ?? 0;
  }

  // Row positions: labels sit ABOVE each arrow, so every row reserves label
  // height — multi-line labels (LLMs emit them despite instructions) push
  // their own row down; self-calls reserve extra for the loop body; fragment
  // boundaries reserve room for their header/footer bands.
  let y = actorHeight + FIRST_ROW_GAP;
  const rowY: number[] = [];
  const labelHeights: number[] = [];
  messages.forEach((msg, i) => {
    const label = numberedLabel(msg, i, messages.length);
    const extraLines = label ? countTextLines(label) - 1 : 0;
    labelHeights.push(label ? estimateTextHeight(labelSize, countTextLines(label)) + 4 : 0);
    y += FRAGMENT_HEADER * (headerCount.get(i) ?? 0);
    y += SECTION_BAND * (sectionCount.get(i) ?? 0);
    y += estimateTextHeight(labelSize, extraLines);
    rowY.push(y);
    y += ROW_HEIGHT + (msg.fromIndex === msg.toIndex ? SELF_ROW_EXTRA : 0);
    y += FRAGMENT_FOOTER * (footerCount.get(i) ?? 0);
  });
  const lifelineBottom =
    (rowY.length > 0 ? y - ROW_HEIGHT : actorHeight + FIRST_ROW_GAP) + LIFELINE_TAIL;

  const skeletons: RenderSkeleton[] = [];

  // Fragment boxes (UML alt/loop/opt): square dashed rect with a light fill,
  // drawn FIRST so lifelines, actor boxes and arrows all stay visible on top.
  // Spans from just above the first row's label to just below the last row,
  // label top-left ("alt — invalid token", "loop — until valid").
  for (const fragment of fragments) {
    let minX = Infinity;
    let maxX = -Infinity;
    for (const row of fragment.rows) {
      const msg = messages[row]!;
      const fx = lifelineX[msg.fromIndex] ?? 0;
      const tx = lifelineX[msg.toIndex] ?? 0;
      minX = Math.min(minX, fx, tx);
      maxX = Math.max(maxX, fx, tx, msg.fromIndex === msg.toIndex ? fx + SELF_LOOP_WIDTH : fx);
    }
    const firstSectionBand = fragment.sections.some((s) => s.row === fragment.first)
      ? SECTION_BAND
      : 0;
    const top =
      (rowY[fragment.first] ?? 0) -
      (labelHeights[fragment.first] ?? 0) -
      6 -
      firstSectionBand -
      FRAGMENT_HEADER;
    const lastMsg = messages[fragment.last]!;
    const bottom =
      (rowY[fragment.last] ?? 0) +
      (lastMsg.fromIndex === lastMsg.toIndex ? SELF_LOOP_HEIGHT : 0) +
      FRAGMENT_FOOTER;
    const groupId = crypto.randomUUID();
    skeletons.push({
      kind: "container",
      id: `fragment-${fragment.id}`,
      shape: "rectangle",
      x: minX - FRAGMENT_PAD_X,
      y: top,
      width: maxX - minX + FRAGMENT_PAD_X * 2,
      height: bottom - top,
      strokeColor: FRAGMENT_STROKE,
      backgroundColor: FRAGMENT_FILL,
      strokeStyle: "dashed",
      strokeWidth: 1,
      rounded: false,
      roughness: theme.roughness,
      groupId,
    });
    skeletons.push({
      kind: "text",
      id: `fragment-${fragment.id}-label`,
      text: fragment.label,
      x: minX - FRAGMENT_PAD_X + 10,
      y: top + 5,
      fontSize: labelSize,
      fontFamily: theme.fontFamily,
      color: FRAGMENT_STROKE,
      textAlign: "left",
      groupId,
    });

    // alt/else branches: a small [label] band per section, with a dashed
    // divider line across the box between branches (UML operand separator).
    fragment.sections.forEach((section, si) => {
      const bandTop =
        (rowY[section.row] ?? 0) - (labelHeights[section.row] ?? 0) - 6 - SECTION_BAND;
      if (section.row !== fragment.first) {
        skeletons.push({
          kind: "arrow",
          id: `fragment-${fragment.id}-divider-${si}`,
          x: minX - FRAGMENT_PAD_X,
          y: bandTop,
          points: [
            [0, 0],
            [maxX - minX + FRAGMENT_PAD_X * 2, 0],
          ],
          strokeColor: FRAGMENT_STROKE,
          strokeStyle: "dashed",
          strokeWidth: 1,
          roughness: theme.roughness,
          startArrowhead: "none",
          endArrowhead: "none",
          groupId,
        });
      }
      skeletons.push({
        kind: "text",
        id: `fragment-${fragment.id}-section-${si}`,
        text: `[${section.label}]`,
        x: minX - FRAGMENT_PAD_X + 10,
        y: bandTop + 4,
        fontSize: labelSize,
        fontFamily: theme.fontFamily,
        color: FRAGMENT_STROKE,
        textAlign: "left",
        groupId,
      });
    });
  }

  // Lifelines + actor boxes next so message arrows draw on top. The actor box
  // repeats at the bottom of the lifeline (classic UML) so long diagrams stay
  // readable at the far end. Everything of one actor shares a group — dragging
  // the actor moves its whole column.
  actors.forEach((node, i) => {
    const cx = lifelineX[i] ?? 0;
    const width = actorWidths[i] ?? boxNode.minWidth;
    const colors = ACTOR_PALETTE[i % ACTOR_PALETTE.length]!;
    const groupId = crypto.randomUUID();

    skeletons.push({
      kind: "arrow",
      id: `lifeline-${node.id}`,
      x: cx,
      y: actorHeight,
      points: [
        [0, 0],
        [0, lifelineBottom - actorHeight],
      ],
      strokeColor: LIFELINE_COLOR,
      strokeStyle: "solid",
      strokeWidth: 1,
      roughness: theme.edge.roughness,
      startArrowhead: "none",
      endArrowhead: "none",
      groupId,
    });

    const textBlockHeight = boxNode.labelHeight + (node.sublabel ? boxNode.sublabelHeight : 0);
    for (const [suffix, boxY] of [
      ["", 0],
      ["-bottom", lifelineBottom],
    ] as const) {
      skeletons.push({
        kind: "container",
        id: `${node.id}${suffix}`,
        shape: "rectangle",
        x: cx - width / 2,
        y: boxY,
        width,
        height: actorHeight,
        strokeColor: colors.stroke,
        backgroundColor: colors.fill,
        fillStyle: boxNode.fillStyle,
        strokeStyle: "solid",
        strokeWidth: boxNode.strokeWidth,
        rounded: true,
        roughness: theme.roughness,
        groupId,
      });

      const labelY = boxY + (actorHeight - textBlockHeight) / 2;
      skeletons.push({
        kind: "text",
        id: `${node.id}${suffix}-label`,
        text: node.label,
        x: cx,
        y: labelY,
        fontSize: text.nodeLabel.size,
        fontFamily: theme.fontFamily,
        color: text.nodeLabel.color,
        textAlign: "center",
        groupId,
      });
      if (node.sublabel) {
        skeletons.push({
          kind: "text",
          id: `${node.id}${suffix}-sublabel`,
          text: node.sublabel,
          x: cx,
          y: labelY + boxNode.labelHeight,
          fontSize: text.nodeSublabel.size,
          fontFamily: theme.fontFamily,
          color: text.nodeSublabel.color,
          textAlign: "center",
          groupId,
        });
      }
    }
  });

  messages.forEach((msg, i) => {
    const yArrow = rowY[i] ?? 0;
    const fx = lifelineX[msg.fromIndex] ?? 0;
    const tx = lifelineX[msg.toIndex] ?? 0;
    const strokeStyle = msg.style ?? theme.edge.kind[msg.kind ?? "sync"];
    // Failure responses read as red, confirmations as green — arrow and label.
    const stroke =
      msg.kind === "error"
        ? theme.edge.errorStroke
        : msg.kind === "success"
          ? theme.edge.successStroke
          : theme.edge.stroke;
    const defaultHead = theme.edge.arrowhead;
    const normalizeHead = (head: "none" | "arrow" | "circle" | "bar") =>
      head === "arrow" ? defaultHead : head;
    const endHead = msg.endArrowhead ? normalizeHead(msg.endArrowhead) : defaultHead;
    const startHead = msg.startArrowhead
      ? normalizeHead(msg.startArrowhead)
      : msg.direction === "bi"
        ? defaultHead
        : "none";

    if (msg.fromIndex === msg.toIndex) {
      // Self-call: small rectangular loop out to the right, arrow back in.
      skeletons.push({
        kind: "arrow",
        id: msg.id,
        x: fx,
        y: yArrow,
        points: [
          [0, 0],
          [SELF_LOOP_WIDTH, 0],
          [SELF_LOOP_WIDTH, SELF_LOOP_HEIGHT],
          [0, SELF_LOOP_HEIGHT],
        ],
        strokeColor: stroke,
        strokeStyle,
        strokeWidth: theme.edge.strokeWidth,
        roughness: theme.edge.roughness,
        startArrowhead: "none",
        endArrowhead: endHead,
      });
    } else {
      skeletons.push({
        kind: "arrow",
        id: msg.id,
        x: fx,
        y: yArrow,
        points: [
          [0, 0],
          [tx - fx, 0],
        ],
        strokeColor: stroke,
        strokeStyle,
        strokeWidth: theme.edge.strokeWidth,
        roughness: theme.edge.roughness,
        startArrowhead: startHead,
        endArrowhead: endHead,
      });
    }

    const label = numberedLabel(msg, i, messages.length);
    if (!label) return;
    const labelWidth = estimateTextWidth(label, labelSize, theme.fontFamily) + 8;
    const labelHeight = labelHeights[i] ?? estimateTextHeight(labelSize) + 4;
    const groupId = crypto.randomUUID();
    // Self-call labels sit beside the loop; normal labels center between the
    // lifelines, above the arrow, on a backing rect that masks any lifeline
    // passing under the text. Inside a fragment the backing uses the fragment
    // fill so the label blends with the box instead of punching a white hole.
    const centerX =
      msg.fromIndex === msg.toIndex ? fx + SELF_LOOP_WIDTH + 8 + labelWidth / 2 : (fx + tx) / 2;
    const boxY =
      msg.fromIndex === msg.toIndex
        ? yArrow + SELF_LOOP_HEIGHT / 2 - labelHeight / 2
        : yArrow - labelHeight - 6;
    skeletons.push({
      kind: "container",
      id: `${msg.id}-label-bg`,
      shape: "rectangle",
      x: centerX - labelWidth / 2,
      y: boxY,
      width: labelWidth,
      height: labelHeight,
      strokeColor: "transparent",
      backgroundColor: rowInFragment.has(i) ? FRAGMENT_FILL : theme.edge.labelBackground,
      strokeStyle: "solid",
      strokeWidth: 1,
      roughness: theme.roughness,
      groupId,
    });
    skeletons.push({
      kind: "text",
      id: `${msg.id}-label`,
      text: label,
      x: centerX,
      y: boxY + 2,
      fontSize: labelSize,
      fontFamily: theme.fontFamily,
      color: msg.kind === "error" || msg.kind === "success" ? stroke : theme.text.edgeLabel.color,
      textAlign: "center",
      groupId,
    });
  });

  skeletons.push({
    kind: "frame",
    id: `frame-${crypto.randomUUID()}`,
    name: spec.title,
    children: skeletons.map((s) => s.id),
  });

  return { skeletons, rawElements: [], warnings };
}
