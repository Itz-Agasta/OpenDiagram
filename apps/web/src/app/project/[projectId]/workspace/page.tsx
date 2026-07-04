import { WorkspaceLayout } from "@/components/whiteboard/WorkspaceLayout";

interface WorkspacePageProps {
  params: Promise<{ projectId: string }>;
}

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  await params;

  return (
    <div className="h-screen w-screen overflow-hidden">
      <WorkspaceLayout />
    </div>
  );
}
