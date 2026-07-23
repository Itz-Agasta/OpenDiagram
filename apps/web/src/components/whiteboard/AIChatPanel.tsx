"use client";

import { AIChatComposer } from "./ai-chat-panel/AIChatComposer";
import { AIChatConversation } from "./ai-chat-panel/AIChatConversation";
import type { AIChatPanelProps } from "./ai-chat-panel/types";
import { useAIChatPanelController } from "./ai-chat-panel/use-ai-chat-panel-controller";

export function AIChatPanel(props: AIChatPanelProps) {
  const controller = useAIChatPanelController(props);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white text-od-ink">
      <AIChatConversation
        answerAskUser={controller.answerAskUser}
        applyError={controller.applyError}
        diagramError={controller.diagramError}
        diagramMessages={controller.diagramMessages}
        diagramStatus={controller.diagramStatus}
        projectError={controller.projectError}
        projectId={props.projectId}
        projectMessages={controller.projectMessages}
        projectStatus={controller.projectStatus}
        repoGenerationError={props.repoGenerationError ?? null}
        repoGenerationJob={props.repoGenerationJob ?? null}
      />
      <AIChatComposer
        onSubmit={controller.handleSubmit}
        providerUsage={controller.providerUsage}
        setTheme={controller.setTheme}
        status={controller.submitStatus}
        theme={controller.theme}
      />
    </div>
  );
}
