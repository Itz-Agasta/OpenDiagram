import { useEffect, useState } from "react";
import { SideBar } from "#/components/app/Sidebar";
import { PromptInput } from "#/components/ui/PromptInput";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useKumoToastManager } from "@cloudflare/kumo";
import { sessionQueryOptions, createProject, createProjectFile } from "#/lib/api";
import { savePendingFiles, clearPendingFiles } from "#/lib/utils";
import { Sidebar } from "@cloudflare/kumo/components/sidebar";
import { CheckoutReturn } from "#/components/billing/CheckoutReturn";

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

export const Route = createFileRoute("/app")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { checkout?: string; subscription_id?: string; status?: string } => {
    return {
      checkout: (search.checkout as string) || undefined,
      subscription_id: (search.subscription_id as string) || undefined,
      status: (search.status as string) || undefined,
    };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const toastManager = useKumoToastManager();
  const { data: session, isPending, error } = useQuery(sessionQueryOptions);
  const isAuthenticated = !isPending && !error && !!session?.user;
  const [tagline, setTagline] = useState("");

  useEffect(() => {
    const randomPhrase = TAGLINE_POOL[Math.floor(Math.random() * TAGLINE_POOL.length)];
    setTagline(randomPhrase);
  }, []);
  const handleSubmitPrompt = async (
    prompt: string,
    files?: { type: "file"; mediaType: string; filename: string; url: string }[],
    modelId?: string,
    providerId?: string,
  ) => {
    if (!prompt.trim() && (!files || files.length === 0)) return;
    if (!isAuthenticated) {
      void navigate({
        to: "/login",
        search: { redirect: "/app" },
      });
      return;
    }

    try {
      localStorage.setItem("pending_agent_prompt", prompt);
      if (files && files.length > 0) {
        await savePendingFiles(files);
      } else {
        await clearPendingFiles();
      }

      const firstLine = prompt.trim().split("\n")[0];
      const projectName = firstLine.slice(0, 50).trim() || "New Architecture";

      const project = await createProject({ name: projectName });

      const file = await createProjectFile(project.id, {
        name: "Architecture Diagram",
        type: "diagram",
      });

      void navigate({
        to: "/project/$projectId/workspace/$workspaceId",
        params: { projectId: project.id, workspaceId: file.id },
        search: { init: true, modelId, providerId } as unknown as {
          init: boolean;
          modelId?: string;
          providerId?: string;
        },
      });
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      toastManager.add({
        title: "Failed to create project",
        description: message,
        variant: "error",
      });
      localStorage.removeItem("pending_agent_prompt");
      void clearPendingFiles();
      throw err;
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-kumo-base overflow-hidden">
      <CheckoutReturn />
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
          <PromptInput onSubmit={handleSubmitPrompt} />
        </div>
      </Sidebar.Provider>
    </div>
  );
}
