"use client";
import { useRef } from "react";
import { useScroll, motion, useTransform, MotionValue } from "motion/react";

interface ParagraphProps {
  value: string;
  style: string;
  highlightWords?: string[];
}

export default function Paragraph({
  value,
  style,
}: ParagraphProps) {
  const element = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({
    target: element,
    offset: ["start 0.6", "end 0.35"],
  });

  const tokens = value.split(/(\s+|:[a-zA-Z0-9_]+:)/g).filter(Boolean);

  return (
    <p
      className={`${style} flex flex-wrap justify-center relative`}
      ref={element}
    >
      {tokens.map((token, i) => {
        const start = i / tokens.length;
        const end = start + 1 / tokens.length;

        return (
          <Word
            key={i}
            range={[start, end]}
            progress={scrollYProgress}
          >
            {token}
          </Word> )
          })
        }
    </p>);
}

interface WordProps {
  children: string;
  range: [number, number];
  progress: MotionValue<number>;
  isHighlighted?: boolean;
}

const Word = ({ children, range, progress, isHighlighted }: WordProps) => {
  const characters = children.split("");
  const amount = range[1] - range[0];
  const step = amount / characters.length;

  return (
    <span className="mr-1 sm:mr-2 mt-2 sm:mt-3 md:mt-4">
      {characters.map((char, i) => {
        const start = range[0] + i * step;
        const end = range[0] + (i + 1) * step;
        return (
          <Character
            key={i}
            range={[start, end]}
            progress={progress}
            isHighlighted={isHighlighted}
          >
            {char}
          </Character>
        );
      })}
    </span>
  );
};

interface CharacterProps {
  children: string;
  range: [number, number];
  progress: MotionValue<number>;
  isHighlighted?: boolean;
}

const Character = ({
  children,
  range,
  progress,
  isHighlighted,
}: CharacterProps) => {
  const opacity = useTransform(progress, range, [0, 1]);
  const colorClass = isHighlighted ? "text-blue-600" : "text-black";

  return (
    <span className="relative">
      <span className={`absolute opacity-10 ${colorClass}`}>{children}</span>
      <motion.span className={`relative ${colorClass}`} style={{ opacity }}>
        {children}
      </motion.span>
    </span>
  );
};