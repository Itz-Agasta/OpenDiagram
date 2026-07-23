import { useCallback, useMemo, useRef, useState } from "react";
import type { DiagramSpec, ThemeName } from "@OpenDiagram/harness";
import { normalizeStoredChatHistory } from "@/lib/chat-history";
import { orchestrateWorkspaceRequest } from "@/lib/workspace-agents";
import type { AiProviderUsage } from "@/lib/ai-provider-usage";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type { AIChatPanelProps } from "./types";
import { parseInitialDiagramSpec } from "./types";
import { diagramRequestLikely, pendingAskUser } from "./utils";
import { useDiagramCanvas } from "./use-diagram-canvas";
import { useDiagramChat } from "./use-diagram-chat";
import { useProjectChat } from "./use-project-chat";

export function useAIChatPanelController({
  activeFileType,
  allowSeedAutoRun = true,
  excalidrawAPI,
  fileId,
  hasExistingScene,
  initialHistory,
  initialSpec,
  onHistoryChange,
  onProviderError,
  onQuotaError,
  projectId,
}: AIChatPanelProps) {
  const parsedInitialSpec = useMemo(() => parseInitialDiagramSpec(initialSpec), [initialSpec]);
  const normalizedHistory = useMemo(
    () => normalizeStoredChatHistory(initialHistory),
    [initialHistory],
  );
  const currentSpecRef = useRef<DiagramSpec | undefined>(parsedInitialSpec);
  const [theme, setTheme] = useState<ThemeName>("sketch");
  const [providerUsage, setProviderUsage] = useState<AiProviderUsage | null>(null);
  const autoDiagramPrompt =
    activeFileType === "diagram"
      ? normalizedHistory.find((message) => message.role === "user")
      : undefined;
  const diagramChat = useDiagramChat({
    activeFileType,
    allowSeedAutoRun,
    autoDiagramPrompt,
    currentSpecRef,
    excalidrawAPI,
    fileId,
    hasExistingScene,
    normalizedHistory,
    onHistoryChange,
    onProviderUsage: setProviderUsage,
    onProviderError,
    onQuotaError,
    projectId,
    theme,
  });
  const canvas = useDiagramCanvas({
    currentSpecRef,
    diagramMessages: diagramChat.messages,
    excalidrawAPI,
    fileId,
    initialSpec: parsedInitialSpec,
    projectId,
  });
  const projectChat = useProjectChat({
    activeFileType,
    diagramMessages: diagramChat.messages,
    fileId,
    normalizedHistory,
    onHistoryChange,
    onProviderUsage: setProviderUsage,
    onProviderError,
    onQuotaError,
    projectId,
  });

  const answerAskUser = useCallback(
    (toolCallId: string, answer: string) => {
      diagramChat.addToolOutput({ tool: "ask_user", toolCallId, output: answer });
    },
    [diagramChat.addToolOutput],
  );

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const text = message.text.trim();
      const status = projectChat.status !== "ready" ? projectChat.status : diagramChat.status;
      if (!text || (status !== "ready" && status !== "error")) return;

      canvas.setApplyError(null);
      const pending = pendingAskUser(diagramChat.messages);
      if (pending) {
        answerAskUser(pending.toolCallId, text);
        return;
      }

      let useProjectChat = Boolean(projectId) && !diagramRequestLikely(text);
      if (projectId && excalidrawAPI) {
        try {
          const route = await orchestrateWorkspaceRequest({ text, projectId });
          useProjectChat = route.intent === "project_chat";
        } catch {
          useProjectChat = !diagramRequestLikely(text);
        }
      }

      if (useProjectChat || !excalidrawAPI) {
        await projectChat.run(text);
      } else {
        void diagramChat.sendMessage({ text });
      }
    },
    [
      answerAskUser,
      canvas.setApplyError,
      diagramChat.messages,
      diagramChat.sendMessage,
      diagramChat.status,
      excalidrawAPI,
      projectChat.run,
      projectChat.status,
      projectId,
    ],
  );

  const submitStatus = projectChat.status !== "ready" ? projectChat.status : diagramChat.status;

  return {
    answerAskUser,
    applyError: canvas.applyError,
    diagramError: diagramChat.error,
    diagramMessages: diagramChat.messages,
    diagramStatus: diagramChat.status,
    handleSubmit,
    projectError: projectChat.error,
    projectMessages: projectChat.messages,
    projectStatus: projectChat.status,
    providerUsage,
    setTheme,
    submitStatus,
    theme,
  };
}
