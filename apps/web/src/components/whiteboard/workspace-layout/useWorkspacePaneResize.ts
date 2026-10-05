import { useCallback, useEffect, useRef } from "react";
import { useWorkspaceLayoutStore } from "@/lib/workspace-layout-store";
import { AGENT_MAX_WIDTH, AGENT_MIN_WIDTH, CONTENT_MIN_WIDTH } from "./helpers";

interface ResizeState {
  startX: number;
  startWidth: number;
  onMove: (event: MouseEvent) => void;
  onUp: () => void;
}

export function useWorkspacePaneResize() {
  const agentWidth = useWorkspaceLayoutStore((state) => state.agentWidth);
  const isAgentOpen = useWorkspaceLayoutStore((state) => state.isAgentOpen);
  const setAgentWidth = useWorkspaceLayoutStore((state) => state.setAgentWidth);
  const openAgent = useWorkspaceLayoutStore((state) => state.openAgent);
  const closeAgent = useWorkspaceLayoutStore((state) => state.closeAgent);
  const agentWidthRef = useRef(agentWidth);
  const resizeRef = useRef<ResizeState | null>(null);
  agentWidthRef.current = agentWidth;

  const clampAgentWidth = useCallback((width: number) => {
    const viewportMaximum = Math.max(AGENT_MIN_WIDTH, window.innerWidth - CONTENT_MIN_WIDTH);
    return Math.min(Math.max(width, AGENT_MIN_WIDTH), Math.min(AGENT_MAX_WIDTH, viewportMaximum));
  }, []);

  useEffect(() => {
    function clampToViewport() {
      const next = clampAgentWidth(agentWidthRef.current);
      if (next !== agentWidthRef.current) setAgentWidth(next);
    }
    window.addEventListener("resize", clampToViewport);
    clampToViewport();
    return () => window.removeEventListener("resize", clampToViewport);
  }, [clampAgentWidth, isAgentOpen, setAgentWidth]);

  const handleResizeStart = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const onMove = (moveEvent: MouseEvent) => {
        const resize = resizeRef.current;
        if (!resize) return;
        setAgentWidth(clampAgentWidth(resize.startWidth + resize.startX - moveEvent.clientX));
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        resizeRef.current = null;
      };
      resizeRef.current = {
        startX: event.clientX,
        startWidth: agentWidthRef.current,
        onMove,
        onUp,
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [clampAgentWidth, setAgentWidth],
  );

  useEffect(
    () => () => {
      const resize = resizeRef.current;
      if (!resize) return;
      document.removeEventListener("mousemove", resize.onMove);
      document.removeEventListener("mouseup", resize.onUp);
    },
    [],
  );

  return { agentWidth, closeAgent, handleResizeStart, isAgentOpen, openAgent };
}
