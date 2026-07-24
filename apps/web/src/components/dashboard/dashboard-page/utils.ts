import { FileText, PenTool } from "lucide-react";
import type { FileKind } from "./types";

export function getFileIcon(kind: FileKind) {
  return kind === "diagram" ? PenTool : FileText;
}

export function getInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "PR";
}

export function deriveAgentProjectNames(prompt: string, kind: FileKind) {
  const fallback = kind === "doc" ? "Architecture Notes" : "Architecture Diagram";
  const cleaned = prompt
    .replace(/[`*_#[\](){}<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const significantWords = cleaned
    .split(" ")
    .map((word) => word.replace(/[^\p{L}\p{N}-]/gu, ""))
    .filter(Boolean)
    .filter((word) => !agentNameStopWords.has(word.toLowerCase()))
    .slice(0, 5);
  const projectName = clampName(titleCase(significantWords.join(" ")) || fallback, fallback);
  const fileSuffix = kind === "doc" ? "Doc" : "Canvas";
  return { projectName, fileName: clampName(`${projectName} ${fileSuffix}`, fallback) };
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function clampName(value: string, fallback: string) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const characters = Array.from(trimmed);
  return characters.length <= 64 ? trimmed : characters.slice(0, 61).join("").trimEnd() + "...";
}

const agentNameStopWords = new Set([
  "a",
  "an",
  "and",
  "architecture",
  "create",
  "design",
  "diagram",
  "doc",
  "document",
  "for",
  "generate",
  "make",
  "of",
  "system",
  "the",
  "with",
]);

const projectColors = [
  "#0CB300",
  "#3B82F6",
  "#F97316",
  "#A855F7",
  "#EF4444",
  "#14B8A6",
  "#EAB308",
  "#6366F1",
];

export function getProjectColor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash + char.charCodeAt(0)) % projectColors.length;
  return projectColors[hash];
}
