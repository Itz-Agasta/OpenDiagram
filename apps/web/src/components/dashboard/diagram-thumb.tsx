import type { Variant } from "./data";

const stroke = "#1a1a1a";

function Flow() {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full">
      <rect x="78" y="10" width="44" height="22" rx="5" fill="none" stroke={stroke} strokeWidth="1.5" />
      <line x1="100" y1="32" x2="100" y2="50" stroke={stroke} strokeWidth="1.5" />
      <path d="M100 50 l16 14 -16 14 -16 -14 z" fill="none" stroke={stroke} strokeWidth="1.5" />
      <line x1="84" y1="64" x2="36" y2="64" stroke={stroke} strokeWidth="1.5" />
      <line x1="116" y1="64" x2="164" y2="64" stroke={stroke} strokeWidth="1.5" />
      <rect x="14" y="92" width="44" height="20" rx="5" fill="none" stroke={stroke} strokeWidth="1.5" />
      <rect x="142" y="92" width="44" height="20" rx="5" fill="none" stroke={stroke} strokeWidth="1.5" />
      <line x1="36" y1="64" x2="36" y2="92" stroke={stroke} strokeWidth="1.5" />
      <line x1="164" y1="64" x2="164" y2="92" stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}

function Sequence() {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full">
      {[34, 100, 166].map((x) => (
        <g key={x}>
          <rect x={x - 18} y="10" width="36" height="16" rx="4" fill="none" stroke={stroke} strokeWidth="1.5" />
          <line x1={x} y1="26" x2={x} y2="112" stroke={stroke} strokeWidth="1" strokeDasharray="3 3" />
        </g>
      ))}
      <line x1="34" y1="44" x2="100" y2="44" stroke={stroke} strokeWidth="1.5" />
      <line x1="100" y1="66" x2="166" y2="66" stroke={stroke} strokeWidth="1.5" />
      <line x1="166" y1="88" x2="34" y2="88" stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}

function Cloud() {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full">
      <rect x="20" y="18" width="160" height="84" rx="10" fill="none" stroke={stroke} strokeWidth="1.5" strokeDasharray="4 4" />
      <rect x="36" y="40" width="40" height="26" rx="5" fill="none" stroke={stroke} strokeWidth="1.5" />
      <rect x="124" y="40" width="40" height="26" rx="5" fill="none" stroke={stroke} strokeWidth="1.5" />
      <circle cx="100" cy="53" r="14" fill="none" stroke={stroke} strokeWidth="1.5" />
      <line x1="76" y1="53" x2="86" y2="53" stroke={stroke} strokeWidth="1.5" />
      <line x1="114" y1="53" x2="124" y2="53" stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}

function Erd() {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full">
      {[
        [22, 24],
        [118, 24],
        [70, 76],
      ].map(([x, y], i) => (
        <g key={i}>
          <rect x={x} y={y} width="60" height="34" rx="4" fill="none" stroke={stroke} strokeWidth="1.5" />
          <line x1={x} y1={y + 12} x2={x + 60} y2={y + 12} stroke={stroke} strokeWidth="1" />
          <line x1={x} y1={y + 23} x2={x + 60} y2={y + 23} stroke={stroke} strokeWidth="1" />
        </g>
      ))}
      <line x1="82" y1="41" x2="118" y2="41" stroke={stroke} strokeWidth="1.5" />
      <line x1="52" y1="58" x2="90" y2="76" stroke={stroke} strokeWidth="1.5" />
      <line x1="148" y1="58" x2="120" y2="76" stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}

function Mindmap() {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full">
      <circle cx="100" cy="60" r="18" fill="none" stroke={stroke} strokeWidth="1.5" />
      {[
        [30, 24],
        [170, 24],
        [28, 96],
        [172, 96],
      ].map(([x, y], i) => (
        <g key={i}>
          <line x1="100" y1="60" x2={x} y2={y} stroke={stroke} strokeWidth="1.5" />
          <circle cx={x} cy={y} r="9" fill="none" stroke={stroke} strokeWidth="1.5" />
        </g>
      ))}
    </svg>
  );
}

const map: Record<Variant, () => React.ReactNode> = {
  flow: Flow,
  sequence: Sequence,
  cloud: Cloud,
  erd: Erd,
  mindmap: Mindmap,
};

export function DiagramThumb({ variant }: { variant: Variant }) {
  const Comp = map[variant];
  return (
    <div className="h-full w-full bg-od-surface p-4">
      <Comp />
    </div>
  );
}
