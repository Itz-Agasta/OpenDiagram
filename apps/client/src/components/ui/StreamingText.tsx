import styles from "./StreamingText.module.css";

export function StreamingText({
  text,
  className,
  showCursor = false,
}: {
  text: string;
  className?: string;
  showCursor?: boolean;
}) {
  return (
    <p className={`${styles.prose} ${className || ""}`}>
      {text}
      {showCursor && <span className={`${styles.caret} ${styles.caretSteady}`} />}
    </p>
  );
}
