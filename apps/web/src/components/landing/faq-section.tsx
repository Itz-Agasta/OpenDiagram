"use client";

import { useId, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "motion/react";

const faqItems = [
  {
    question: "What is a Vibe Diagram?",
    answer:
      "A Vibe Diagram is living software architecture created through conversation. Describe how a system should work, get an editable visual draft, and refine it with AI as your thinking evolves.",
  },
  {
    question: "How does vibe diagramming work?",
    answer:
      "Start by describing the system, its constraints, and the behavior you need. OpenDiagram creates a visual first draft that you can shape with the editor and AI agent.",
  },
  {
    question: "Can I start from a GitHub repo?",
    answer:
      "Yes. Connect GitHub, choose a repository, and OpenDiagram can ground your Vibe Diagram in real project structure.",
  },
  {
    question: "What can I diagram?",
    answer:
      "System architecture, request flows, data flows, service maps, cloud layouts, onboarding maps, and early product ideas.",
  },
  {
    question: "Can I edit the output?",
    answer:
      "Yes. Every Vibe Diagram opens in an editable whiteboard so you can move shapes, rename parts, and keep iterating.",
  },
  {
    question: "Is OpenDiagram free to try?",
    answer:
      "Yes. You can start creating Vibe Diagrams from the dashboard and save work when you sign in.",
  },
  {
    question: "Does a Vibe Diagram replace engineering review?",
    answer:
      "No. A Vibe Diagram gives your team an editable starting point for discussion and design. Engineers should review it before treating it as authoritative architecture documentation.",
  },
];

interface AccordionItemProps {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}

function AccordionItem({ question, answer, isOpen, onToggle }: AccordionItemProps) {
  const buttonId = useId();
  const contentId = useId();

  return (
    <div className="border-b border-black/10 pb-6">
      <button
        id={buttonId}
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className="flex w-full items-center justify-between py-4 text-left text-lg font-semibold transition-colors hover:text-black/70"
      >
        {question}
        <motion.svg
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3 }}
          className="h-5 w-5 flex-shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </motion.svg>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={contentId}
            role="region"
            aria-labelledby={buttonId}
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p className="pb-4 text-base leading-[1.7] text-black/70">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="flex w-full flex-col items-center justify-center px-[120px] max-md:px-6">
      <div className="flex w-full max-w-[1440px] flex-col items-center gap-[60px] pb-[160px] pt-[120px] max-md:pb-20 max-md:pt-16">
        <div className="flex w-full flex-col items-center gap-2.5 overflow-hidden">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="relative z-10 inline-flex items-center gap-6 rounded-full px-6"
          >
            <span className="h-px w-[69px] bg-black/50" />
            <span className="font-serif text-2xl italic">FAQ</span>
            <span className="h-px w-[69px] bg-black/50" />
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="w-full text-center text-[48px] font-bold leading-[1.4] -tracking-[0.04em] max-md:text-3xl"
          >
            Your Questions, Answered
          </motion.h2>
        </div>

        <div className="flex w-full items-start gap-20 max-md:flex-col">
          <motion.div
            initial={{ opacity: 0, x: -30, rotate: -8 }}
            whileInView={{ opacity: 1, x: 0, rotate: -2 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="flex w-full max-w-[400px] origin-center flex-col gap-20 rounded-2xl bg-white/50 p-10 max-md:max-w-full"
          >
            <div className="flex items-center gap-6">
              <Image
                src="/faq-maintainer.webp"
                alt=""
                width={80}
                height={80}
                className="h-20 w-20 shrink-0 rounded-full object-cover"
              />
              <h3 className="text-2xl font-bold leading-[1.6] -tracking-[0.02em]">
                Have more questions? Check out our GitHub
              </h3>
            </div>
            <div className="flex w-full flex-col items-center gap-6">
              <div className="inline-flex w-full items-center gap-6 rounded-[33px] bg-white p-2">
                <a
                  href="https://github.com/Itz-Agasta/OpenDiagram"
                  className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition-[opacity,transform] hover:opacity-80 active:translate-y-px"
                >
                  Raise an issue
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </a>
              </div>
              <a
                href="mailto:support@opendiagram.ink"
                className="text-base leading-[1.7] underline underline-offset-2 transition-colors hover:text-black/60"
              >
                Or, email us at support@opendiagram.ink
              </a>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex w-full flex-col gap-9"
            style={{ paddingTop: "36px" }}
          >
            {faqItems.map((item, i) => (
              <AccordionItem
                key={i}
                question={item.question}
                answer={item.answer}
                isOpen={openIndex === i}
                onToggle={() => setOpenIndex(openIndex === i ? null : i)}
              />
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
