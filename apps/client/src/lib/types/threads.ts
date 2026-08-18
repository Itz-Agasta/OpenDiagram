export type ChatThreadSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatThreadMessage = {
  seq: number;
  clientId: string;
  role: "user" | "assistant";
  parts: unknown[];
};

export type ChatThread = {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatThreadMessage[];
};
