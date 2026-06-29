import { Whiteboard } from "@/components/whiteboard/Whiteboard";

interface WorkspacePageProps {
  params: Promise<{ projectId: string }>;
}

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const { projectId: _projectId } = await params;

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Whiteboard />
    </div>
  );
}

// TODO: Need to redesign the canvas & add ai panel
