import { Sidebar } from "@cloudflare/kumo/components/sidebar";
import {
  HouseIcon,
  PencilIcon,
  GearIcon,
  SignOutIcon,
  ShapesIcon,
  FileTextIcon,
  PlusIcon,
  DotsThreeVerticalIcon,
} from "@phosphor-icons/react";
import { SkeletonLine, DropdownMenu, Dialog, DialogClose, DialogTitle } from "@cloudflare/kumo";
import { useNavigate } from "@tanstack/react-router";
import { authClient } from "#/lib/auth-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  projectsQueryOptions,
  projectFilesQueryOptions,
  createProject,
  updateProject,
  deleteProject,
  createProjectFile,
  updateProjectFile,
  deleteProjectFile,
} from "#/lib/api";
import type { Project, ProjectFile } from "#/lib/types";
import { HeroButton, CustomButton } from "#/components/ui/button";
import { useState } from "react";

const ProjectMenuItem = ({ project, isFirst }: { project: Project; isFirst: boolean }) => {
  const queryClient = useQueryClient();
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
  const handleRenameProject = async () => {
    if (!renameProjectName.trim()) return;
    try {
      await updateProject(project.id, { name: renameProjectName.trim() });
      setIsRenameProjectOpen(false);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteProject = async () => {
    try {
      await deleteProject(project.id);
      setIsDeleteProjectOpen(false);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateFile = async () => {
    if (!newFileName.trim()) return;
    try {
      await createProjectFile(project.id, newFileName.trim(), newFileType);
      setNewFileName("");
      setIsCreateFileOpen(false);
      queryClient.invalidateQueries({ queryKey: ["projects", project.id, "files"] });
    } catch (err) {
      console.error(err);
    }
  };

  const handleRenameFile = async () => {
    if (!selectedFile || !renameFileName.trim()) return;
    try {
      await updateProjectFile(project.id, selectedFile.id, { name: renameFileName.trim() });
      setSelectedFile(null);
      setIsRenameFileOpen(false);
      queryClient.invalidateQueries({ queryKey: ["projects", project.id, "files"] });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteFile = async () => {
    if (!selectedFile) return;
    try {
      await deleteProjectFile(project.id, selectedFile.id);
      setSelectedFile(null);
      setIsDeleteFileOpen(false);
      queryClient.invalidateQueries({ queryKey: ["projects", project.id, "files"] });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Sidebar.MenuItem className={isFirst ? "mt-6" : "mt-2"}>
      <Sidebar.Collapsible>
        <div className="group flex items-center justify-between w-full pr-1">
          <Sidebar.CollapsibleTrigger
            render={
              <Sidebar.MenuButton
                icon={PencilIcon}
                className="text-[13px] text-gray-700 font-medium flex-1"
              >
                {project.name} <Sidebar.MenuChevron />
              </Sidebar.MenuButton>
            }
          />
          {/* Project actions dropdown */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <DropdownMenu>
              <DropdownMenu.Trigger
                render={(p) => (
                  <button
                    {...p}
                    className="p-1 hover:cursor-pointer rounded hover:bg-gray-100 transition text-gray-500 hover:text-gray-900"
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
              <div
                key={file.id}
                className="group flex items-center justify-between w-full pr-1 mt-1"
              >
                <Sidebar.MenuSubButton className="text-[12px] text-gray-500 flex-1 min-w-0">
                  {file.type === "diagram" ? (
                    <ShapesIcon size={14} className="mr-2 text-gray-400 shrink-0" />
                  ) : (
                    <FileTextIcon size={14} className="mr-2 text-gray-400 shrink-0" />
                  )}
                  <span className="truncate">{file.name}</span>
                </Sidebar.MenuSubButton>
                {/* File actions dropdown */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <DropdownMenu>
                    <DropdownMenu.Trigger
                      render={(p) => (
                        <button
                          {...p}
                          className="p-1 hover:cursor-pointer rounded hover:bg-gray-100 transition text-gray-500 hover:text-gray-900"
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
              <div className="px-6 py-1.5 text-[11px] text-gray-400 italic">
                No files in project
              </div>
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
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">File Type</label>
              <select
                value={newFileType}
                onChange={(e) => setNewFileType(e.target.value as "diagram" | "doc")}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500 bg-white transition"
              >
                <option value="diagram">Diagram (editable architecture spec)</option>
                <option value="doc">Document (notes, reference text)</option>
              </select>
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

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export const SideBar = ({
  imageUrl,
  name,
  email,
  isLoading,
  isAuthenticated,
}: {
  imageUrl: string;
  name: string;
  email: string;
  isLoading: boolean;
  isAuthenticated: boolean;
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  const { data: projects, isLoading: isProjectsLoading } = useQuery({
    ...projectsQueryOptions,
    enabled: isAuthenticated,
  });

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      await createProject({ name: newProjectName.trim() });
      setNewProjectName("");
      setIsCreateProjectOpen(false);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          navigate({ to: "/login" as any });
        },
      },
    });
  };

  return (
    <>
      <Sidebar className="h-full font-geist">
        <Sidebar.Header className="border-b-0">
          <div className="flex flex-row items-center text-center gap-4">
            <img src="/mascot.png" alt="OpenDiagram Logo" width={32} height={32} />
            <h1 className="heading-font">OpenDiagram</h1>
          </div>
        </Sidebar.Header>
        <Sidebar.Content>
          <Sidebar.Group>
            <Sidebar.Menu>
              {isAuthenticated ? (
                <div className="flex items-center justify-between w-full pr-1.5">
                  <Sidebar.MenuButton
                    icon={HouseIcon}
                    active
                    className="text-sm font-semibold flex-1"
                  >
                    Your Projects
                  </Sidebar.MenuButton>
                  <button
                    onClick={() => {
                      setNewProjectName("");
                      setIsCreateProjectOpen(true);
                    }}
                    className="p-1 hover:bg-gray-100 rounded-md transition shrink-0 cursor-pointer text-gray-500 hover:text-gray-900"
                    title="Create Project"
                  >
                    <PlusIcon size={16} />
                  </button>
                </div>
              ) : (
                <Sidebar.MenuButton icon={HouseIcon} active className="text-sm font-semibold">
                  Your Projects
                </Sidebar.MenuButton>
              )}
              {/* Projects List */}
              {isProjectsLoading || isLoading ? (
                <div className="flex flex-col gap-3 px-2 py-4 mt-6">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="flex items-center gap-2.5">
                      <div className="h-4 w-4 rounded bg-gray-100 animate-pulse shrink-0" />
                      <SkeletonLine minWidth={60} maxWidth={100} />
                    </div>
                  ))}
                </div>
              ) : projects && projects.length > 0 ? (
                projects.map((project, index) => (
                  <ProjectMenuItem key={project.id} project={project} isFirst={index === 0} />
                ))
              ) : (
                <div className="px-3 py-4 text-xs text-gray-400 italic mt-6">
                  No projects created yet.
                </div>
              )}
            </Sidebar.Menu>
          </Sidebar.Group>
        </Sidebar.Content>
        <Sidebar.Footer className="min-h-auto p-4">
          {isLoading ? (
            <div className="flex w-full flex-col gap-3">
              <SkeletonLine minWidth={80} maxWidth={100} />
              <SkeletonLine minWidth={60} maxWidth={80} />
            </div>
          ) : isAuthenticated ? (
            <div className="flex flex-row items-center justify-between w-full">
              <div className="flex flex-row items-center gap-2.5 min-w-0">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="User avatar"
                    width={32}
                    height={32}
                    className="rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-[10px] font-bold text-white uppercase shrink-0">
                    {getInitials(name)}
                  </div>
                )}
                <div className="flex flex-col text-[12px] min-w-0">
                  <h1 className="font-semibold truncate text-gray-900 leading-none mb-1">{name}</h1>
                  <h2 className="text-gray-500 truncate leading-none">{email}</h2>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenu.Trigger
                  render={(p) => (
                    <button
                      {...p}
                      className="p-1.5 hover:cursor-pointer rounded-md hover:bg-gray-50/80 transition shrink-0"
                    >
                      <GearIcon size={16} />
                    </button>
                  )}
                />
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    side="top"
                    align="end"
                    sideOffset={10}
                    className="p-1 bg-white border border-gray-200/80 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.02)] flex flex-col gap-0.5 min-w-[130px] z-[9999] font-sans"
                  >
                    <DropdownMenu.Item
                      onClick={() => navigate({ to: "/settings" as any })}
                      className="px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2 text-gray-700 hover:bg-gray-50 hover:text-gray-950 transition cursor-pointer"
                      icon={<GearIcon size={14} />}
                    >
                      <span>Settings</span>
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className="h-[1px] bg-gray-100 my-0.5" />
                    <DropdownMenu.Item
                      onClick={handleLogout}
                      className="px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2 text-red-600 hover:bg-red-50/50 hover:text-red-700 transition cursor-pointer"
                      icon={<SignOutIcon size={14} />}
                      variant="danger"
                    >
                      <span>Logout</span>
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu>
            </div>
          ) : (
            <HeroButton
              text="Sign In"
              color="blue"
              className="w-full justify-center h-8 py-0 text-xs font-semibold rounded-lg shadow-none"
              onClick={() => navigate({ to: "/login" as any })}
            />
          )}
        </Sidebar.Footer>
      </Sidebar>

      {/* Create Project Dialog */}
      <Dialog.Root open={isCreateProjectOpen} onOpenChange={setIsCreateProjectOpen}>
        <Dialog size="base">
          <div className="p-6 flex flex-col gap-4 font-geist">
            <DialogTitle className="text-base font-semibold text-gray-900">
              Create New Project
            </DialogTitle>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">Project Name</label>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="e.g. My E-commerce System"
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500 transition"
              />
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <DialogClose render={<CustomButton text="Cancel" className="h-8" />} />
              <HeroButton
                text="Create"
                color="blue"
                onClick={handleCreateProject}
                disabled={!newProjectName.trim()}
                className="h-8 py-0 text-xs shadow-none"
              />
            </div>
          </div>
        </Dialog>
      </Dialog.Root>
    </>
  );
};
