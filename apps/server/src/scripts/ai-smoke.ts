import { diagramSpecSchema, layoutDiagram, renderToExcalidraw } from "@OpenDiagram/harness";
import { generateText } from "ai";
import { createPrimaryModel } from "../lib/ai-provider";
import { iconRegistry } from "../lib/icons/registry";

const diagramPrompt = `Generate a small system-design diagram for a beta SaaS app.
Include a browser client, Hono API, Postgres database, and an AI provider.
Return exactly one JSON object with at least 5 nodes and 4 edges.`;

const docPrompt = `Write a concise markdown architecture note for a beta SaaS app using a Hono API,
Postgres, and a configurable AI provider. Include headings.`;

async function main() {
  const diagram = await generateText({
    model: createPrimaryModel("structured"),
    system: [
      "You are an expert software architect generating engineering diagrams.",
      "Return one valid JSON object matching this shape: { title, type, nodes, edges }.",
      "Each node needs id, label, category, and shape. Each edge needs from, to, and label.",
      "Allowed categories: service, database, queue, gateway, client, external, storage, cache, function, user.",
      "Allowed shapes: rectangle, ellipse, diamond, cylinder, document.",
      "Use type system-design. Do not wrap the JSON in markdown fences.",
    ].join("\n"),
    prompt: diagramPrompt,
    maxOutputTokens: 4096,
  });
  const spec = diagramSpecSchema.parse(JSON.parse(extractJsonObject(diagram.text)));
  const positioned = await layoutDiagram(spec);
  const scene = renderToExcalidraw(positioned, iconRegistry);

  if (spec.nodes.length < 4 || spec.edges.length < 3 || scene.skeletons.length === 0) {
    throw new Error(
      `AI diagram smoke returned an incomplete renderable diagram: ${spec.nodes.length} nodes, ${spec.edges.length} edges, ${scene.skeletons.length} skeletons.`,
    );
  }

  const doc = await generateText({
    model: createPrimaryModel("text"),
    system: "Return valid markdown only. No wrapper explanation.",
    prompt: docPrompt,
    maxOutputTokens: 1200,
  });

  if (!doc.text.includes("#") || doc.text.length < 300) {
    throw new Error("AI doc smoke returned markdown that was too short or missing headings.");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        diagram: { title: spec.title, nodes: spec.nodes.length, edges: spec.edges.length },
        doc: { chars: doc.text.length },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return text.trim();
  return text.slice(start, end + 1);
}
