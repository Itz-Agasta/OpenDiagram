import { FolderOpen, Star } from "lucide-react";
import { DiagramThumb } from "./diagram-thumb";
import { avatarColor, type DiagramFile } from "./data";

function Avatars({ people }: { people: string[] }) {
  return (
    <div className="flex -space-x-2">
      {people.map((p) => (
        <div
          key={p}
          className="grid h-6 w-6 place-items-center rounded-full border border-white text-[10px] text-od-on-dark"
          style={{ backgroundColor: avatarColor(p) }}
        >
          {p}
        </div>
      ))}
    </div>
  );
}

export function FileTable({ files }: { files: DiagramFile[] }) {
  if (files.length === 0) {
    return (
      <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 rounded-[18px] border border-[#d9d9d9] bg-white px-6 py-10 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-[18px] border border-[#d9d9d9] bg-od-surface text-od-ink">
          <FolderOpen className="h-6 w-6" />
        </div>
        <div className="flex max-w-[430px] flex-col gap-2">
          <h3 className="text-[18px] text-od-ink">No diagrams yet</h3>
          <p className="text-[14px] leading-[1.7] text-od-ink-muted">
            Create a diagram, connect a GitHub project, or import a local file to populate this workspace.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[1fr_1fr_120px_100px_32px] gap-3 px-3 pb-2 text-[12px] text-od-ink-faint">
        <span>Name</span>
        <span>Folder</span>
        <span className="text-center">Edited</span>
        <span className="text-center">People</span>
        <span />
      </div>
      <div className="flex flex-col gap-1">
        {files.map((file) => (
          <FileRow key={file.id} file={file} />
        ))}
      </div>
    </div>
  );
}

function FileRow({ file }: { file: DiagramFile }) {
  return (
    <div className="group grid grid-cols-[1fr_1fr_120px_100px_32px] gap-3 rounded-[12px] border border-od-border-soft bg-od-surface-elevated px-3 py-2.5 backdrop-blur-sm transition hover:bg-white items-center">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-10 w-[72px] shrink-0 overflow-hidden rounded-[8px] border border-od-border-soft">
          <DiagramThumb variant={file.variant} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] text-od-ink">{file.title}</h3>
            {file.live && <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-od-green" />}
          </div>
        </div>
      </div>
      <span className="truncate text-[13px] text-od-ink-faint">{file.folder}</span>
      <span className="truncate text-center text-[13px] text-od-ink-faint">{file.edited}</span>
      <div className="flex justify-center">
        <Avatars people={file.collaborators} />
      </div>
      <div className="flex justify-end">
        <Star
          className={`h-4 w-4 ${
            file.starred ? "fill-od-ink text-od-ink" : "text-od-ink-faint"
          }`}
        />
      </div>
    </div>
  );
}
