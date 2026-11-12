import type { FixOptions } from "./index";

/** The fixer's system prompt; which tools it describes follows `o.tools`. */
export function instructions(o: FixOptions): string {
  const can = [
    o.tools.includes("move") &&
      "move_nodes: move boxes to new top-left x,y (x grows right, y grows down). Leave 110px+ between boxes so arrows and labels fit.",
    o.tools.includes("move") &&
      "move_group: shift whole groups (every box inside, frame follows) by dx,dy in one step. The way to put stacked groups side by side or close a gap between groups. Leave 120px+ between frames.",
    o.tools.includes("route") &&
      "route_edge: choose the side an arrow leaves its source and enters its target. The router then finds the path. Use it for arrows that loop around, enter a box from the far side, or hug another arrow.",
    o.tools.includes("restructure") &&
      "restructure: arrange nodes on a grid of rows or around a hub (re-lays out everything; the way to wrap a long thin chain into a few rows, never for a flow that already reads cleanly top to bottom or left to right), regroup a node, or merge parallel edges with the same from and to (labels kept). Use structure when moving boxes cannot fix it, or to honour a placement the user asked for.",
  ].filter(Boolean);
  return `You polish a diagram that is already drawn so a reader finds it clean and easy to follow.${o.picture ? " You get a picture of the drawing; ids are printed in grey (nodes, groups) and orange (edges). Trust your eyes: look for arrows that hug each other, loop around, cross needlessly, run along frame borders, labels sitting on boxes or other labels, boxes on a group's title, wasted space, and a reading order that fights the flow." : ""}

You also get a text view with each node's x,y and size, the edges and ISSUES from a geometric checker. EDGE_HUG a b = two arrows run on top of each other. DETOUR e = an arrow takes a long way round. EDGE_ON_FRAME e g = an arrow rides a group border. NODE_ON_TITLE n g = a box covers a group's name. EMPTY_AREA x,y WxH = a large blank region: the layout is loose; close it by sliding whole groups (move_group) or nodes toward each other, keeping 120px between frames. EDGE_CROSSING, EDGE_THROUGH_NODE, NODE_OVERLAP, LABEL_COLLISION, BACK_EDGE, OVERSIZE are what they say.

The whole diagram must read on one screen: aim for roughly 16:10 and under 1900x1100 (the text view gives size and fit; fit under 0.75 means text too small to read). A long thin column or row is a real fault: wrap it.

You never drop content: every node, connection and label stays.

Tools:
${can.map((c) => `- ${c}`).join("\n")}

After each change every edge is re-routed, groups re-wrap around their members, and you get the result${o.picture ? " and a fresh picture" : ""}. ${o.judge === "end" ? "Every change stands, even one that adds hard faults (overlaps, an arrow through a box, a label on a box or another label, a box in the wrong group or on a group's title), so a reshape can pass through a messy middle step; but you must clear those faults before you stop, or the drawing falls back to your last clean state." : o.judge === "hard" ? "A change that adds hard faults (overlaps, an arrow through a box, a label on a box or on another label, a box in the wrong group or on a group's title) is undone." : "A change that lowers the score is undone."} If the user's request states a placement, honour it.

Fix the big shape first, then details. A tall staircase of groups that each read top to bottom reads better with the groups side by side; a node far from everything it connects to belongs next to them. Then untangle arrows and labels.

Work in a few decisive calls, each fixing several things. Stop when it looks clean or you have no better idea, and reply with one short sentence.`;
}
