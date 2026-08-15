import { Sidebar } from "@cloudflare/kumo/components/sidebar";
import { PencilIcon, ShapesIcon, FileTextIcon, DotsThreeVerticalIcon } from "@phosphor-icons/react";
import {
  DropdownMenu,
  Dialog,
  DialogClose,
  DialogTitle,
  Tabs,
  useKumoToastManager,
} from "@cloudflare/kumo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  projectFilesQueryOptions,
  updateProject,
  deleteProject,
  createProjectFile,
  updateProjectFile,
  deleteProjectFile,
} from "#/lib/api";
import type { Project, ProjectFile } from "#/lib/types";
import { HeroButton, CustomButton } from "#/components/ui/button";
import { useState } from "react";
import { Link } from "@tanstack/react-router";

export const ProjectMenuItem = ({ project, isFirst }: { project: Project; isFirst: boolean }) => {
  const queryClient = useQueryClient();
  const toastManager = useKumoToastManager();
  const { data: files } = useQuery(projectFilesQueryOptions(project.id));

  // Modal State hooks
  const [isRenameProjectOpen, setIsRenameProjectOpen] = useState(false);
  const [renameProjectName, setRenameProjectName] = useState(project.name);

  const [isDeleteProjectOpen, setIsDeleteProjectOpen] = useState(false);

  const [isCreateFileOpen, setIsCreateFileOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileType, setNewFileType] = useState<"diagram" | "doc">("diagram");

  const [isRenameFileOpen, setIsRenameFileOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [renameFileName, setRenameFileName] = useState("");

  const [isDeleteFileOpen, setIsDeleteFileOpen] = useState(false);

  // Operations
  const handleRenameProject = () => {
    if (!renameProjectName.trim()) return;
    toastManager.promise(updateProject(project.id, { name: renameProjectName.trim() }), {
      loading: {
        title: "Renaming project...",
        description: "Updating the project name.",
      },
      success: () => {
        setIsRenameProjectOpen(false);
        queryClient.invalidateQueries({ queryKey: ["projects"] });
        return {
          title: "Project renamed",
          description: "Project was successfully renamed.",
          variant: "success",
        };
      },
      error: (err) => ({
        title: "Failed to rename project",
        description: err.message,
        variant: "error",
      }),
    });
  };

  const handleDeleteProject = () => {
    toastManager.promise(deleteProject(project.id), {
      loading: {
        title: "Deleting project...",
        description: "Removing the project and its files.",
      },
      success: () => {
        setIsDeleteProjectOpen(false);
        queryClient.invalidateQueries({ queryKey: ["projects"] });
        return {
          title: "Project deleted",
          description: "Project was successfully deleted.",
          variant: "success",
        };
      },
      error: (err) => ({
        title: "Failed to delete project",
        description: err.message,
        variant: "error",
      }),
    });
  };

  const handleCreateFile = () => {
    if (!newFileName.trim()) return;
    toastManager.promise(
      createProjectFile(project.id, { name: newFileName.trim(), type: newFileType }),
      {
        loading: {
          title: "Creating file...",
          description: "Initializing your new file.",
        },
        success: () => {
          setNewFileName("");
          setIsCreateFileOpen(false);
          queryClient.invalidateQueries({ queryKey: ["projects", project.id, "files"] });
          return {
            title: "File created",
            description: "File was successfully created.",
            variant: "success",
          };
        },
        error: (err) => ({
          title: "Failed to create file",
          description: err.message,
          variant: "error",
        }),
      },
    );
  };

  const handleRenameFile = () => {
    if (!selectedFile || !renameFileName.trim()) return;
    toastManager.promise(
      updateProjectFile(project.id, selectedFile.id, { name: renameFileName.trim() }),
      {
        loading: {
          title: "Renaming file...",
          description: "Updating the file name.",
        },
        success: () => {
          setSelectedFile(null);
          setIsRenameFileOpen(false);
          queryClient.invalidateQueries({ queryKey: ["projects", project.id, "files"] });
          return {
            title: "File renamed",
            description: "File was successfully renamed.",
            variant: "success",
          };
        },
        error: (err) => ({
          title: "Failed to rename file",
          description: err.message,
          variant: "error",
        }),
      },
    );
  };

  const handleDeleteFile = () => {
    if (!selectedFile) return;
    toastManager.promise(deleteProjectFile(project.id, selectedFile.id), {
      loading: {
        title: "Deleting file...",
        description: "Removing file from project.",
      },
      success: () => {
        setSelectedFile(null);
        setIsDeleteFileOpen(false);
        queryClient.invalidateQueries({ queryKey: ["projects", project.id, "files"] });
        return {
          title: "File deleted",
          description: "File was successfully deleted.",
          variant: "success",
        };
      },
      error: (err) => ({
        title: "Failed to delete file",
        description: err.message,
        variant: "error",
      }),
    });
  };

  return (
    <Sidebar.MenuItem className={isFirst ? "mt-6" : "mt-2"}>
      <Sidebar.Collapsible>
        <div className="group relative flex items-center w-full">
          <Sidebar.CollapsibleTrigger
            render={
              <Sidebar.MenuButton
                icon={PencilIcon}
                className="text-[13px] text-gray-700 font-medium w-full pr-8"
              >
                {project.name} <Sidebar.MenuChevron className="mr-1" />
              </Sidebar.MenuButton>
            }
          />
          {/* Project actions dropdown */}
          <div className="absolute right-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 z-10">
            <DropdownMenu>
              <DropdownMenu.Trigger
                render={(p) => (
                  <button
                    {...p}
                    onClick={(e) => {
                      e.stopPropagation();
                      p.onClick?.(e);
                    }}
                    className="p-1 hover:cursor-pointer rounded hover:bg-gray-100/80 transition text-gray-500 hover:text-gray-900"
                  >
                    <DotsThreeVerticalIcon size={14} weight="bold" />
                  </button>
                )}
              />
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  side="right"
                  align="start"
                  sideOffset={5}
                  className="p-1 bg-white border border-gray-200/80 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.02)] flex flex-col gap-0.5 min-w-[130px] z-[9999] font-sans"
                >
                  <DropdownMenu.Item
                    onClick={() => {
                      setNewFileName("");
                      setIsCreateFileOpen(true);
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2 text-gray-700 hover:bg-gray-50 hover:text-gray-950 transition cursor-pointer"
                  >
                    <span>Create File</span>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onClick={() => {
                      setRenameProjectName(project.name);
                      setIsRenameProjectOpen(true);
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2 text-gray-700 hover:bg-gray-50 hover:text-gray-950 transition cursor-pointer"
                  >
                    <span>Rename Project</span>
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="h-[1px] bg-gray-100 my-0.5" />
                  <DropdownMenu.Item
                    onClick={() => setIsDeleteProjectOpen(true)}
                    className="px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2 text-red-600 hover:bg-red-50/50 hover:text-red-700 transition cursor-pointer"
                    variant="danger"
                  >
                    <span>Delete Project</span>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu>
          </div>
        </div>

        <Sidebar.CollapsibleContent>
          <Sidebar.MenuSub>
            {files?.map((file) => (
              <div key={file.id} className="group relative flex items-center w-full mt-1">
                <Link
                  to="/project/$projectId/workspace/$workspaceId"
                  params={{ projectId: project.id, workspaceId: file.id }}
                  className="flex-1 min-w-0"
                >
                  <Sidebar.MenuSubButton className="text-[12px] text-gray-500 w-full pr-8 hover:!bg-transparent cursor-pointer">
                    {file.type === "diagram" ? (
                      <ShapesIcon size={14} className="mr-2 text-gray-400 shrink-0" />
                    ) : (
                      <FileTextIcon size={14} className="mr-2 text-gray-400 shrink-0" />
                    )}
                    <span className="truncate">{file.name}</span>
                  </Sidebar.MenuSubButton>
                </Link>
                {/* File actions dropdown */}
                <div className="absolute right-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 z-10">
                  <DropdownMenu>
                    <DropdownMenu.Trigger
                      render={(p) => (
                        <button
                          {...p}
                          onClick={(e) => {
                            e.stopPropagation();
                            p.onClick?.(e);
                          }}
                          className="p-1 hover:cursor-pointer rounded hover:bg-gray-100/80 transition text-gray-500 hover:text-gray-900"
                        >
                          <DotsThreeVerticalIcon size={12} weight="bold" />
                        </button>
                      )}
                    />
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        side="right"
                        align="start"
                        sideOffset={5}
                        className="p-1 bg-white border border-gray-200/80 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.02)] flex flex-col gap-0.5 min-w-[120px] z-[9999] font-sans"
                      >
                        <DropdownMenu.Item
                          onClick={() => {
                            setSelectedFile(file);
                            setRenameFileName(file.name);
                            setIsRenameFileOpen(true);
                          }}
                          className="px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2 text-gray-700 hover:bg-gray-50 hover:text-gray-950 transition cursor-pointer"
                        >
                          <span>Rename File</span>
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator className="h-[1px] bg-gray-100 my-0.5" />
                        <DropdownMenu.Item
                          onClick={() => {
                            setSelectedFile(file);
                            setIsDeleteFileOpen(true);
                          }}
                          className="px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2 text-red-600 hover:bg-red-50/50 hover:text-red-700 transition cursor-pointer"
                          variant="danger"
                        >
                          <span>Delete File</span>
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu>
                </div>
              </div>
            ))}
            {files && files.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  setNewFileName("");
                  setIsCreateFileOpen(true);
                }}
                className="px-6 py-1.5 text-[11px] text-gray-400 hover:text-gray-900 transition italic text-left w-full hover:cursor-pointer"
              >
                <span className="underline">Create diagram</span>
              </button>
            )}
          </Sidebar.MenuSub>
        </Sidebar.CollapsibleContent>
      </Sidebar.Collapsible>

      {/* Rename Project Dialog */}
      <Dialog.Root open={isRenameProjectOpen} onOpenChange={setIsRenameProjectOpen}>
        <Dialog size="base">
          <div className="p-6 flex flex-col gap-4 font-geist">
            <DialogTitle className="text-base font-semibold text-gray-900">
              Rename Project
            </DialogTitle>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">Project Name</label>
              <input
                type="text"
                value={renameProjectName}
                onChange={(e) => setRenameProjectName(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500 transition"
              />
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <DialogClose render={<CustomButton text="Cancel" className="h-8" />} />
              <HeroButton
                text="Save"
                color="blue"
                onClick={handleRenameProject}
                disabled={!renameProjectName.trim()}
                className="h-8 py-0 text-xs shadow-none"
              />
            </div>
          </div>
        </Dialog>
      </Dialog.Root>

      {/* Delete Project Dialog */}
      <Dialog.Root open={isDeleteProjectOpen} onOpenChange={setIsDeleteProjectOpen}>
        <Dialog size="base">
          <div className="p-6 flex flex-col gap-4 font-geist">
            <DialogTitle className="text-base font-semibold text-gray-900">
              Delete Project
            </DialogTitle>
            <p className="text-sm text-gray-500">
              Are you sure you want to delete &quot;{project.name}&quot;? This action cannot be
              undone.
            </p>
            <div className="flex justify-end gap-2 mt-2">
              <DialogClose render={<CustomButton text="Cancel" className="h-8" />} />
              <HeroButton
                text="Delete"
                color="red-500"
                onClick={handleDeleteProject}
                className="h-8 py-0 text-xs shadow-none !bg-red-600 hover:!bg-red-700"
              />
            </div>
          </div>
        </Dialog>
      </Dialog.Root>

      {/* Create File Dialog */}
      <Dialog.Root open={isCreateFileOpen} onOpenChange={setIsCreateFileOpen}>
        <Dialog size="base">
          <div className="p-6 flex flex-col gap-4 font-geist">
            <DialogTitle className="text-base font-semibold text-gray-900">
              Create New File
            </DialogTitle>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">File Name</label>
              <input
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="e.g. architecture"
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500 transition"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-500">File Type</label>
              <Tabs
                tabs={[
                  {
                    value: "diagram",
                    className: "flex-1 justify-center",
                    label: (
                      <div className="flex items-center gap-2 py-1 px-4 text-xs font-semibold">
                        <ShapesIcon size={15} className="text-gray-500 shrink-0" />
                        <span>Diagram</span>
                      </div>
                    ),
                  },
                  {
                    value: "doc",
                    className: "flex-1 justify-center",
                    label: (
                      <div className="flex items-center gap-2 py-1 px-4 text-xs font-semibold">
                        <FileTextIcon size={15} className="text-gray-500 shrink-0" />
                        <span>Document</span>
                      </div>
                    ),
                  },
                ]}
                value={newFileType}
                onValueChange={(val) => setNewFileType(val as "diagram" | "doc")}
                size="base"
                className="w-full"
              />
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <DialogClose render={<CustomButton text="Cancel" className="h-8" />} />
              <HeroButton
                text="Create"
                color="blue"
                onClick={handleCreateFile}
                disabled={!newFileName.trim()}
                className="h-8 py-0 text-xs shadow-none"
              />
            </div>
          </div>
        </Dialog>
      </Dialog.Root>

      {/* Rename File Dialog */}
      <Dialog.Root open={isRenameFileOpen} onOpenChange={setIsRenameFileOpen}>
        <Dialog size="base">
          <div className="p-6 flex flex-col gap-4 font-geist">
            <DialogTitle className="text-base font-semibold text-gray-900">Rename File</DialogTitle>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">File Name</label>
              <input
                type="text"
                value={renameFileName}
                onChange={(e) => setRenameFileName(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500 transition"
              />
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <DialogClose render={<CustomButton text="Cancel" className="h-8" />} />
              <HeroButton
                text="Save"
                color="blue"
                onClick={handleRenameFile}
                disabled={!renameFileName.trim()}
                className="h-8 py-0 text-xs shadow-none"
              />
            </div>
          </div>
        </Dialog>
      </Dialog.Root>

      {/* Delete File Dialog */}
      <Dialog.Root open={isDeleteFileOpen} onOpenChange={setIsDeleteFileOpen}>
        <Dialog size="base">
          <div className="p-6 flex flex-col gap-4 font-geist">
            <DialogTitle className="text-base font-semibold text-gray-900">Delete File</DialogTitle>
            <p className="text-sm text-gray-500">
              Are you sure you want to delete &quot;{selectedFile?.name}&quot;? This action cannot
              be undone.
            </p>
            <div className="flex justify-end gap-2 mt-2">
              <DialogClose render={<CustomButton text="Cancel" className="h-8" />} />
              <HeroButton
                text="Delete"
                color="red-500"
                onClick={handleDeleteFile}
                className="h-8 py-0 text-xs shadow-none !bg-red-600 hover:!bg-red-700"
              />
            </div>
          </div>
        </Dialog>
      </Dialog.Root>
    </Sidebar.MenuItem>
  );
};
