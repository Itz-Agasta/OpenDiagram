import { Sidebar } from "@cloudflare/kumo/components/sidebar";
import { HouseIcon, GearIcon, SignOutIcon, PlusIcon } from "@phosphor-icons/react";
import {
  SkeletonLine,
  DropdownMenu,
  Dialog,
  DialogClose,
  DialogTitle,
  DialogDescription,
  useKumoToastManager,
  Meter,
} from "@cloudflare/kumo";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  projectsQueryOptions,
  createProject,
  authClient,
  billingQueryOptions,
  creationQuotaQueryOptions,
} from "#/lib/api";
import { clearAiSettingsCache } from "#/lib/api/settings-client";
import { getInitials } from "#/lib/utils";
import { HeroButton, CustomButton } from "#/components/ui/button";
import { useState } from "react";
import { ProjectMenuItem } from "./ProjectMenuItem";

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
  const toastManager = useKumoToastManager();
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [isLoggedOutOpen, setIsLoggedOutOpen] = useState(false);

  const { data: billing } = useQuery(billingQueryOptions);
  const { data: quota } = useQuery(creationQuotaQueryOptions);
  const { data: projects, isLoading: isProjectsLoading } = useQuery({
    ...projectsQueryOptions,
    enabled: isAuthenticated,
  });

  const handleCreateProject = () => {
    if (!newProjectName.trim()) return;
    toastManager.promise(createProject({ name: newProjectName.trim() }), {
      loading: {
        title: "Creating project...",
        description: "Setting up your new workspace.",
      },
      success: () => {
        setNewProjectName("");
        setIsCreateProjectOpen(false);
        queryClient.invalidateQueries({ queryKey: ["projects"] });
        return {
          title: "Project created",
          description: "Project was successfully created.",
          variant: "success",
        };
      },
      error: (err) => ({
        title: "Failed to create project",
        description: err.message,
        variant: "error",
      }),
    });
  };

  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          // Clear session in place so App stays on the same SideBar instance
          // (avoids remount that would drop this dialog's open state).
          clearAiSettingsCache();
          queryClient.setQueryData(["auth", "session"], null);
          queryClient.removeQueries({ queryKey: ["projects"] });
          queryClient.removeQueries({ queryKey: ["settings"] });
          setIsLoggedOutOpen(true);
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
                    className="text-sm font-semibold flex-1 hover:!bg-transparent cursor-default select-none"
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
                <Sidebar.MenuButton
                  icon={HouseIcon}
                  className="text-sm font-semibold hover:!bg-transparent cursor-default select-none"
                >
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
                    align="start"
                    alignOffset={-180}
                    sideOffset={18}
                    className="p-2.5 bg-white border border-gray-200/80 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.02)] flex flex-col gap-0.5 min-w-[230px] z-[9999] font-geist"
                  >
                    {billing &&
                      quota &&
                      billing.billingEnabled &&
                      (() => {
                        const limit = quota.limit ?? 0;
                        const remaining = quota.remaining ?? 0;
                        const percentage =
                          limit > 0 ? Math.min(100, Math.max(0, (remaining / limit) * 100)) : 0;
                        const periodText = quota.resetAt ? "this month" : "lifetime";

                        let indicatorColor = "bg-red-500";
                        if (percentage >= 80) {
                          indicatorColor = "bg-green-500";
                        } else if (percentage >= 20) {
                          indicatorColor = "bg-yellow-500";
                        }

                        const isFree = billing.planId === "free" || billing.planId === "guest";

                        return (
                          <>
                            <div className="px-3 py-2.5 select-none flex flex-col gap-3">
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                                    Plan
                                  </p>
                                  <p className="text-xs font-bold text-gray-900 mt-0.5">
                                    {billing.planId === "pro" ? "Pro Plan" : "Free Plan"}
                                  </p>
                                </div>
                                {!isFree && (
                                  <span className="rounded-full bg-orange px-2 py-0.5 text-[8px] font-bold text-white uppercase tracking-wider shadow-sm">
                                    Active
                                  </span>
                                )}
                              </div>
                              <div className="w-full">
                                <Meter
                                  value={percentage}
                                  label="Credits"
                                  customValue={`${remaining} of ${limit} left`}
                                  trackClassName="bg-gray-100"
                                  indicatorClassName={indicatorColor}
                                />
                                <p className="text-[9px] text-gray-400 font-semibold mt-1.5 capitalize">
                                  Resets: {periodText}
                                </p>
                              </div>
                              {isFree && (
                                <HeroButton
                                  text="Upgrade to Pro"
                                  color="blue"
                                  onClick={() => navigate({ to: "/settings" as any })}
                                  className="w-full justify-center h-8 py-0 text-xs font-semibold rounded-xl shadow-none mt-3"
                                />
                              )}
                            </div>
                            <DropdownMenu.Separator className="h-[1px] bg-gray-100 my-1" />
                          </>
                        );
                      })()}
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

      {/* Logged out → guest mode */}
      <Dialog.Root open={isLoggedOutOpen} onOpenChange={setIsLoggedOutOpen}>
        <Dialog size="base">
          <div className="p-6 flex flex-col gap-1.5 font-geist">
            <DialogTitle className="text-base font-semibold text-gray-900">
              You&apos;re logged out
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Guest mode lets you try OpenDiagram with a single demo file. Sign in anytime to save
              projects and create more.
            </DialogDescription>
            <div className="flex justify-end gap-2 mt-4">
              <CustomButton
                text="Stay as guest"
                className="h-8"
                onClick={() => setIsLoggedOutOpen(false)}
              />
              <HeroButton
                text="Log in"
                color="blue"
                className="h-8 py-0 text-xs shadow-none"
                onClick={() => {
                  navigate({ to: "/login" as any });
                }}
              />
            </div>
          </div>
        </Dialog>
      </Dialog.Root>
    </>
  );
};
