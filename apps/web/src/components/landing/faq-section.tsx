"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ButtonShaderTexture } from "@/components/button-shader-texture";

const faqItems = [
  {
    question: "What type of docs does OpenDiagram generate?",
    answer:
      "The subscription is ongoing and flexible — ideal for continuous design needs. Custom projects are one-time, fixed-scope engagements for larger goals like a rebrand or product launch.",
  },
  {
    question: "How long does analysis take?",
    answer:
      "Most requests are delivered within 1–2 business days. Larger tasks may take longer, but you’ll always be kept in the loop.",
  },
  {
    question: "Does it work with private repositories?",
    answer:
      "As many as you like — with a subscription, you can queue unlimited requests, and they’ll be handled one at a time in priority order.",
  },
  {
    question: "What languages and frameworks are supported?",
    answer:
      "Websites, product UI, landing pages, brand assets, decks, social media visuals — anything digital that needs to look and feel sharp.",
  },
  {
    question: "Can I customize the output format?",
    answer:
      "Figma for design, Notion for task management, and Slack or email for async communication.",
  },
  {
    question: "Is there a free tier?",
    answer: "Yes — you can pause anytime and resume when you’re ready. Unused days roll over.",
  },
  {
    question: "Do you support monorepos?",
    answer:
      "Joris focuses on design only, but all deliverables are dev-ready. He can also recommend trusted no-code or Webflow/Framer developers if needed.",
  },
];

interface AccordionItemProps {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}

function AccordionItem({ question, answer, isOpen, onToggle }: AccordionItemProps) {
  return (
    <div className="border-b border-black/10 pb-6">
      <button
        onClick={onToggle}
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
              <img
                src="https://framerusercontent.com/images/zRVCa2eOgJIf1mJK5PYcBLrYI.png"
                alt=""
                className="h-20 w-20 rounded-full"
              />
              <h3 className="text-2xl font-bold leading-[1.6] -tracking-[0.02em]">
                Have more questions? Checkout our GitHub
              </h3>
            </div>
            <div className="flex w-full flex-col items-center gap-6">
              <div className="inline-flex w-full items-center gap-6 rounded-[33px] bg-white p-2">
                <a
                  href="https://github.com/Itz-Agasta/OpenDiagram"
                  className="relative isolate inline-flex w-full cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition-all hover:opacity-90"
                >
                  <ButtonShaderTexture />
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
                href="mailto:hello@opendiagram.dev"
                className="text-base leading-[1.7] underline underline-offset-2 transition-colors hover:text-black/60"
              >
                Or, email me at hello@opendiagram.dev
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
