import { useCallback, useEffect, useRef } from "react";
import { useWorkspaceLayoutStore } from "@/lib/workspace-layout-store";
import {
  AGENT_MAX_WIDTH,
  AGENT_MIN_WIDTH,
  CONTENT_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "./helpers";

interface ResizeState {
  pane: "sidebar" | "agent";
  startX: number;
  startWidth: number;
  onMove: (event: MouseEvent) => void;
  onUp: () => void;
}

export function useWorkspacePaneResize() {
  const sidebarWidth = useWorkspaceLayoutStore((state) => state.sidebarWidth);
  const isSidebarOpen = useWorkspaceLayoutStore((state) => state.isSidebarOpen);
  const agentWidth = useWorkspaceLayoutStore((state) => state.agentWidth);
  const isAgentOpen = useWorkspaceLayoutStore((state) => state.isAgentOpen);
  const setSidebarWidth = useWorkspaceLayoutStore((state) => state.setSidebarWidth);
  const openSidebar = useWorkspaceLayoutStore((state) => state.openSidebar);
  const closeSidebar = useWorkspaceLayoutStore((state) => state.closeSidebar);
  const setAgentWidth = useWorkspaceLayoutStore((state) => state.setAgentWidth);
  const openAgent = useWorkspaceLayoutStore((state) => state.openAgent);
  const closeAgent = useWorkspaceLayoutStore((state) => state.closeAgent);
  const sidebarWidthRef = useRef(sidebarWidth);
  const agentWidthRef = useRef(agentWidth);
  const resizeRef = useRef<ResizeState | null>(null);
  sidebarWidthRef.current = sidebarWidth;
  agentWidthRef.current = agentWidth;

  const clampSidebarWidth = useCallback((width: number, agent = agentWidthRef.current) => {
    const viewportMaximum = Math.max(
      SIDEBAR_MIN_WIDTH,
      window.innerWidth - agent - CONTENT_MIN_WIDTH,
    );
    return Math.min(
      Math.max(width, SIDEBAR_MIN_WIDTH),
      Math.min(SIDEBAR_MAX_WIDTH, viewportMaximum),
    );
  }, []);
  const clampAgentWidth = useCallback((width: number, sidebar = sidebarWidthRef.current) => {
    const viewportMaximum = Math.max(
      AGENT_MIN_WIDTH,
      window.innerWidth - sidebar - CONTENT_MIN_WIDTH,
    );
    return Math.min(Math.max(width, AGENT_MIN_WIDTH), Math.min(AGENT_MAX_WIDTH, viewportMaximum));
  }, []);

  useEffect(() => {
    function clampPanesToViewport() {
      const nextSidebarWidth = clampSidebarWidth(sidebarWidthRef.current);
      const nextAgentWidth = clampAgentWidth(agentWidthRef.current);
      if (
        nextSidebarWidth !== sidebarWidthRef.current ||
        nextAgentWidth !== agentWidthRef.current
      ) {
        setSidebarWidth(nextSidebarWidth);
        setAgentWidth(nextAgentWidth);
      }
    }
    window.addEventListener("resize", clampPanesToViewport);
    return () => window.removeEventListener("resize", clampPanesToViewport);
  }, [clampAgentWidth, clampSidebarWidth, setAgentWidth, setSidebarWidth]);

  const handleResizeStart = useCallback(
    (pane: "sidebar" | "agent", event: React.MouseEvent) => {
      event.preventDefault();
      const onMove = (moveEvent: MouseEvent) => {
        const resize = resizeRef.current;
        if (!resize) return;
        const delta =
          resize.pane === "sidebar"
            ? moveEvent.clientX - resize.startX
            : resize.startX - moveEvent.clientX;
        const width =
          resize.pane === "sidebar"
            ? clampSidebarWidth(resize.startWidth + delta)
            : clampAgentWidth(resize.startWidth + delta);
        if (resize.pane === "sidebar") setSidebarWidth(width);
        else setAgentWidth(width);
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        resizeRef.current = null;
      };
      resizeRef.current = {
        pane,
        startX: event.clientX,
        startWidth: pane === "sidebar" ? sidebarWidthRef.current : agentWidthRef.current,
        onMove,
        onUp,
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [clampAgentWidth, clampSidebarWidth, setAgentWidth, setSidebarWidth],
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

  return {
    agentWidth,
    closeAgent,
    closeSidebar,
    handleResizeStart,
    isAgentOpen,
    isSidebarOpen,
    openAgent,
    openSidebar,
    sidebarWidth,
  };
}
