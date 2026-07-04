import { WorkspaceLayout } from "@/components/whiteboard/WorkspaceLayout";

interface WorkspaceFilePageProps {
  params: Promise<{ projectId: string; workspaceId: string }>;
}

export default async function WorkspaceIdPage({ params }: WorkspaceFilePageProps) {
  await params;

  return (
    <div className="h-screen w-screen overflow-hidden">
      <WorkspaceLayout />
    </div>
  );
}
