"use client";

import { AIChatComposer } from "./ai-chat-panel/AIChatComposer";
import { AIChatConversation } from "./ai-chat-panel/AIChatConversation";
import { AIChatThreadBar } from "./ai-chat-panel/AIChatThreadBar";
import type { AIChatPanelProps } from "./ai-chat-panel/types";
import { useAIChatPanelController } from "./ai-chat-panel/use-ai-chat-panel-controller";

export function AIChatPanel(props: AIChatPanelProps) {
  const controller = useAIChatPanelController(props);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white text-od-ink">
      {props.projectId && props.fileId && (
        <AIChatThreadBar
          // Also disabled mid-turn: a turn is persisted against whichever thread
          // is open when it finishes, so switching under a running model files
          // the answer under a conversation that never asked the question.
          //
          // Busy means in flight, NOT "not ready". `error` is a resting state --
          // `handleSubmit` accepts it, and gating on `!== "ready"` left History
          // and "New chat" disabled forever after any failed turn, with starting
          // a fresh conversation being exactly what you want next.
          disabled={
            controller.threadSwitching ||
            controller.submitStatus === "submitted" ||
            controller.submitStatus === "streaming"
          }
          loadThreadList={controller.loadThreadList}
          onResumeThread={controller.resumeThread}
          startNewThread={controller.startNewThread}
          threads={controller.threads}
        />
      )}
      <AIChatConversation
        answerAskUser={controller.answerAskUser}
        applyError={controller.applyError}
        diagramError={controller.diagramError}
        diagramStatus={controller.diagramStatus}
        messages={controller.conversationMessages}
        projectError={controller.projectError}
        projectId={props.projectId}
        projectStatus={controller.projectStatus}
        repoGenerationError={props.repoGenerationError ?? null}
        repoGenerationJob={props.repoGenerationJob ?? null}
      />
      <AIChatComposer
        onStop={controller.stop}
        onSubmit={controller.handleSubmit}
        providerUsage={controller.providerUsage}
        providerId={controller.providerId}
        providerOptions={controller.providerOptions}
        setProviderId={controller.setProviderId}
        setTheme={controller.setTheme}
        status={controller.submitStatus}
        theme={controller.theme}
      />
    </div>
  );
}
