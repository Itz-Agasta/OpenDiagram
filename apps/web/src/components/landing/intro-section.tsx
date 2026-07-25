import { SkillChip, TextOpacityWords } from "./intro-content";
import { ScrollReveal } from "./scroll-reveal";

export function IntroSection() {
  return (
    <section className="flex w-full flex-col items-center justify-center overflow-hidden px-[120px] max-lg:px-12 max-md:px-6">
      <ScrollReveal className="relative flex min-h-screen w-full max-w-[1366px] flex-col items-center justify-center py-20">
        <div className="relative z-10 inline-flex items-center gap-6 rounded-full px-6 max-sm:gap-4 max-sm:px-0">
          <span className="h-px w-[69px] shrink-0 bg-black/50 max-sm:w-10" />
          <span className="font-excali text-2xl">What is a Vibe Diagram?</span>
          <span className="h-px w-[69px] shrink-0 bg-black/50 max-sm:w-10" />
        </div>

        <div className="relative flex w-full max-w-[940px] flex-col items-center gap-12 px-[120px] py-12 max-lg:px-6 max-md:px-0">
          <TextOpacityWords text="Vibe diagramming is a faster way to design software systems. Describe how the system should work, get a visual first draft, then refine the architecture through conversation and a real editing canvas." />

          <SkillChip
            label="System Architecture"
            icon="Strategy"
            iconBackground="rgb(255, 213, 0)"
            iconColor="rgb(102, 0, 128)"
            rotation={4}
            className="right-[-78px] bottom-[52px] max-lg:hidden"
          />
          <SkillChip
            label="Design Decisions"
            icon="SidebarSimple"
            iconBackground="rgb(71, 71, 71)"
            iconColor="rgb(186, 255, 208)"
            rotation={4}
            className="left-[-57px] top-1/2 -translate-y-1/2 max-lg:hidden"
          />
          <SkillChip
            label="Living Context"
            icon="FileDashed"
            iconBackground="rgb(255, 69, 171)"
            iconColor="rgb(201, 255, 251)"
            rotation={-4}
            className="right-[-98px] top-1/2 -translate-y-1/2 max-lg:hidden"
          />
          <SkillChip
            label="Data Flow"
            icon="Path"
            iconBackground="rgb(82, 255, 105)"
            iconColor="rgb(50, 36, 255)"
            rotation={-5}
            className="right-[-92px] top-[51px] max-lg:hidden"
          />
          <SkillChip
            label="AI Collaboration"
            icon="MagnifyingGlass"
            iconBackground="rgb(5, 169, 255)"
            iconColor="rgb(248, 255, 191)"
            rotation={-4}
            className="bottom-[51px] left-[-75px] max-lg:hidden"
          />
          <SkillChip
            label="Component Maps"
            icon="GridFour"
            iconBackground="rgb(255, 94, 0)"
            iconColor="rgb(255, 243, 194)"
            rotation={3}
            className="left-[-120px] top-[62px] max-lg:hidden"
          />
        </div>
      </ScrollReveal>
    </section>
  );
}
