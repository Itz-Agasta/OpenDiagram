import type { UIMessage } from "ai";
import type { AskUserInput, DrawDiagramInput, DrawDiagramOutput } from "../utils/diagram-chat";

export type ChatTools = {
  ask_user: {
    input: AskUserInput;
    output: string;
  };
  draw_diagram: {
    input: DrawDiagramInput;
    output: DrawDiagramOutput;
  };
};

export type ChatMessage = UIMessage<unknown, never, ChatTools>;
