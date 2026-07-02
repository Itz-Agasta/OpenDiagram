import { FolderOpen, Star } from "lucide-react";
import { DiagramThumb } from "./diagram-thumb";
import { avatarColor, type DiagramFile } from "./data";

function Avatars({ people }: { people: string[] }) {
  return (
    <div className="flex -space-x-2">
      {people.map((p, index) => (
        <div
          key={`${p}-${index}`}
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
            Create a diagram, connect a GitHub project, or import a local file to populate this
            workspace.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] border-separate border-spacing-y-1">
        <thead>
          <tr className="text-[12px] text-od-ink-faint">
            <th scope="col" className="px-3 pb-1 text-left font-normal">
              Name
            </th>
            <th scope="col" className="px-3 pb-1 text-left font-normal">
              Folder
            </th>
            <th scope="col" className="w-[120px] px-3 pb-1 text-center font-normal">
              Edited
            </th>
            <th scope="col" className="w-[100px] px-3 pb-1 text-center font-normal">
              People
            </th>
            <th scope="col" className="w-8 px-3 pb-1">
              <span className="sr-only">Status</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <FileRow key={file.id} file={file} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FileRow({ file }: { file: DiagramFile }) {
  return (
    <tr className="group">
      <th
        scope="row"
        className="rounded-l-[12px] border-y border-l border-od-border-soft bg-od-surface-elevated px-3 py-2.5 text-left font-normal backdrop-blur-sm transition-colors group-hover:bg-white"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-10 w-[72px] shrink-0 overflow-hidden rounded-[8px] border border-od-border-soft">
            <DiagramThumb variant={file.variant} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-[15px] text-od-ink">{file.title}</h3>
              {file.live && (
                <span className="inline-flex items-center">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full bg-od-green"
                    aria-hidden="true"
                  />
                  <span className="sr-only">Live file</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </th>
      <td className="border-y border-od-border-soft bg-od-surface-elevated px-3 py-2.5 text-[13px] text-od-ink-faint backdrop-blur-sm transition-colors group-hover:bg-white">
        <span className="block truncate">{file.folder}</span>
      </td>
      <td className="border-y border-od-border-soft bg-od-surface-elevated px-3 py-2.5 text-center text-[13px] text-od-ink-faint backdrop-blur-sm transition-colors group-hover:bg-white">
        <span className="block truncate">{file.edited}</span>
      </td>
      <td className="border-y border-od-border-soft bg-od-surface-elevated px-3 py-2.5 backdrop-blur-sm transition-colors group-hover:bg-white">
        <div className="flex justify-center">
          <Avatars people={file.collaborators} />
        </div>
      </td>
      <td className="rounded-r-[12px] border-y border-r border-od-border-soft bg-od-surface-elevated px-3 py-2.5 backdrop-blur-sm transition-colors group-hover:bg-white">
        <div className="flex justify-end">
          <Star
            aria-hidden="true"
            className={`h-4 w-4 ${file.starred ? "fill-od-ink text-od-ink" : "text-od-ink-faint"}`}
          />
          <span className="sr-only">{file.starred ? "Starred" : "Not starred"}</span>
        </div>
      </td>
    </tr>
  );
}
