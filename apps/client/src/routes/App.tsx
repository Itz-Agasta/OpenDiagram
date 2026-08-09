import { useEffect, useState } from "react";
import { SideBar } from "#/components/app/Sidebar";
import { PromptInput } from "#/components/ui/PromptInput";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { sessionQueryOptions } from "#/lib/session-query";
import { Sidebar } from "@cloudflare/kumo/components/sidebar";

const TAGLINE_POOL = [
  "Describe a vibe, get an architecture.",
  "Sketch with words, render in canvas.",
  "Vibe your diagrams, shape your systems.",
  "Design systems in natural language.",
  "AI-powered architectural blueprinting.",
  "From a rough idea to interactive design.",
  "Explain the flow, see the layout.",
  "Architect at the speed of thought.",
  "Your system design companion, powered by AI.",
  "Describe the system, get the spec.",
  "Turn complex specifications into clean diagrams.",
  "Iterate on system architecture with AI.",
  "Document decisions, generate visual models.",
  "Speak system design, see it come to life.",
  "Where natural language meets architecture design.",
];

export const Route = createFileRoute("/App")({
  component: RouteComponent,
});

function RouteComponent() {
  const { data: session, isPending, error } = useQuery(sessionQueryOptions);
  const isAuthenticated = !isPending && !error && !!session?.user;
  const [tagline, setTagline] = useState("");

  useEffect(() => {
    const randomPhrase = TAGLINE_POOL[Math.floor(Math.random() * TAGLINE_POOL.length)];
    setTagline(randomPhrase);
  }, []);

  return (
    <div className="flex flex-col h-screen w-full bg-kumo-base overflow-hidden">
      {/* Main Body */}
      <Sidebar.Provider
        defaultOpen
        collapsible="none"
        defaultWidth={280}
        className="h-full min-h-0 flex-1"
      >
        {isPending ? (
          <SideBar imageUrl="" name="" email="" isLoading isAuthenticated={false} />
        ) : error ? (
          <SideBar
            imageUrl=""
            name="Guest"
            email="guest@opendiagram.ink"
            isLoading={false}
            isAuthenticated={false}
          />
        ) : (
          <SideBar
            imageUrl={session?.user.image || ""}
            name={session?.user.name || "Guest"}
            email={session?.user.email || "guest@opendiagram.ink"}
            isLoading={false}
            isAuthenticated={isAuthenticated}
          />
        )}

        {/* Content Workspace */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-50/30 overflow-y-auto">
          <div className="w-full max-w-[680px] flex flex-col items-center gap-4 mb-4">
            <div className="flex flex-col gap-3.5 w-full text-center">
              {tagline && (
                <div className="font-excalifont text-2xl sm:text-3xl font-medium tracking-wide leading-normal text-blue-600/90 cursor-default">
                  {tagline}
                </div>
              )}
            </div>
          </div>
          <PromptInput />
        </div>
      </Sidebar.Provider>
    </div>
  );
}
