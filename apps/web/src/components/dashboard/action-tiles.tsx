import { PlusIcon, PlugsIcon, MonitorArrowUpIcon } from "@phosphor-icons/react";

export function ActionTiles({
  onCreateDiagram,
  onConnectProject,
  onImportFile,
}: {
  onCreateDiagram: () => void;
  onConnectProject: () => void;
  onImportFile: () => void;
}) {
  return (
    <section className="grid grid-cols-3 gap-3 sm:max-w-[600px]">
      <button
        type="button"
        onClick={onCreateDiagram}
        className="flex aspect-square flex-col items-center justify-center gap-3 rounded-[16px] border border-[#d9d9d9] bg-white p-5 text-center"
      >
        <span className="grid h-12 w-12 place-items-center text-od-ink">
          <PlusIcon size={32} weight="regular" />
        </span>
        <span className="text-[14px] leading-tight text-od-ink">Create new diagram</span>
      </button>
      <button
        type="button"
        onClick={onConnectProject}
        className="flex aspect-square flex-col items-center justify-center gap-3 rounded-[16px] border border-[#d9d9d9] bg-white p-5 text-center"
      >
        <span className="grid h-12 w-12 place-items-center text-od-ink">
          <PlugsIcon size={32} weight="regular" />
        </span>
        <span className="text-[14px] leading-tight text-od-ink">Connect a project</span>
      </button>
      <button
        type="button"
        onClick={onImportFile}
        className="flex aspect-square flex-col items-center justify-center gap-3 rounded-[16px] border border-[#d9d9d9] bg-white p-5 text-center"
      >
        <span className="grid h-12 w-12 place-items-center text-od-ink">
          <MonitorArrowUpIcon size={32} weight="regular" />
        </span>
        <span className="text-[14px] leading-tight text-od-ink">Import a file</span>
      </button>
    </section>
  );
}
