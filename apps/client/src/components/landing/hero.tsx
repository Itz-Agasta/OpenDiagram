import { CustomButton, HeroButton } from "../ui/button";
import Paragraph from "./character";
import { useNavigate } from "@tanstack/react-router";

export const Hero = () => {
  const navigate = useNavigate();
  const handleHeroButton = () => {
    navigate({ to: "/App" });
  };
  return (
    <>
      <main className="flex-1">
        <div className="flex flex-col items-center justify-center my-34 gap-12">
          <h1 className="font-excalifont text-7xl leading-24 text-center">
            <span className="text-blue-600">Vibe</span> your Diagrams
            <br />
            for complex System Designs
          </h1>
          <div className="flex flex-col items-center justify-center gap-4">
            <span className="font-geist w-[50%] text-center">
              Turn a rough idea into editable software architecture. Describe the system, shape it
              with AI, and keep every decision connected as the design evolves.
            </span>
            <div className="flex flex-row items-center justify-center gap-2">
              <HeroButton
                text="Create Your Vibe Diagram Now"
                color="blue"
                onClick={handleHeroButton}
              />
              <CustomButton text="Star Our Repo" className="bg-white h-9" />
            </div>
          </div>
          <Paragraph
            value={
              "Vibe diagramming is a faster way to design software systems. Describe how the system should work, get a visual first draft, then refine the architecture through conversation and a real editing canvas."
            }
            style={
              "w-[80%] font-geist pt-8 sm:pt-12 md:pt-16 lg:pt-20 text-md sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl font-[semiBold] text-[#dfdcff] text-center leading-tighter"
            }
          />
        </div>
      </main>
    </>
  );
};
