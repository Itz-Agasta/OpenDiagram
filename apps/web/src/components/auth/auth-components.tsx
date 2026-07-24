"use client";

import { useState } from "react";
import Image from "next/image";
import { IconEye, IconEyeOff, IconCheck } from "@tabler/icons-react";

export function scoreStrength(pwd: string): { level: number; label: string } {
  if (!pwd) return { level: 0, label: "" };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const level = Math.min(4, score);
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  return { level, label: labels[level] ?? "" };
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <div className="field-head">
        <label className="field-label" htmlFor={htmlFor}>
          {label}
        </label>
        {hint && <span className="field-hint">{hint}</span>}
      </div>
      {children}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

export function PasswordInput({
  value,
  onChange,
  placeholder,
  invalid,
  autoComplete,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  invalid?: boolean;
  autoComplete?: string;
  id?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="input-wrap">
      <input
        className="input"
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={invalid || undefined}
      />
      <button
        type="button"
        className="input-suffix"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? <IconEyeOff size={16} /> : <IconEye size={16} />}
      </button>
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="check-box">
        <IconCheck />
      </span>
      <span className="check-text">{children}</span>
    </label>
  );
}

export function VisualPane({ _isSignup }: { _isSignup: boolean }) {
  return (
    <div className="pane-visual">
      <Image
        src="/od_flower1.jpg"
        alt="Annotated flower architecture study"
        fill
        priority
        sizes="50vw"
        className="visual-image"
      />
      <div className="visual-label">
        <span className="visual-tag">VIBE DIAGRAMS</span>
        <p className="visual-quote">
          {_isSignup
            ? "Architect systems visually, generate instantly."
            : "Make Vibe Diagrams for your Vibe Projects."}
        </p>
      </div>
    </div>
  );
}
