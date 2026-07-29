import { Sidebar, SidebarGroup } from "@cloudflare/kumo/components/sidebar";
import { HouseIcon, PencilIcon, GearIcon } from "@phosphor-icons/react";
import { SkeletonLine } from "@cloudflare/kumo";

export const SideBar = ({
  imageUrl,
  name,
  email,
  isLoading,
}: {
  imageUrl: string;
  name: string;
  email: string;
  isLoading: boolean;
}) => {
  return (
    <Sidebar.Provider defaultOpen resizable defaultWidth={280} minWidth={240} maxWidth={400}>
      <Sidebar className="font-geist">
        <Sidebar.Header>
          <div className="flex flex-row items-center text-center gap-4">
            <img src="/mascot.png" alt="OpenDiagram Logo" width={32} height={32}></img>
            <h1 className="heading-font">OpenDiagram</h1>
          </div>
        </Sidebar.Header>
        <Sidebar.Content>
          <Sidebar.Group>
            <Sidebar.Menu>
              <Sidebar.MenuButton icon={HouseIcon} active>
                Home
              </Sidebar.MenuButton>
            </Sidebar.Menu>
          </Sidebar.Group>
          <Sidebar.Group>
            <Sidebar.GroupLabel>Projects</Sidebar.GroupLabel>
            <Sidebar.Menu>
              <Sidebar.MenuItem>
                <Sidebar.Collapsible defaultOpen>
                  <Sidebar.CollapsibleTrigger
                    render={
                      <Sidebar.MenuButton icon={PencilIcon}>
                        Compute <Sidebar.MenuChevron />
                      </Sidebar.MenuButton>
                    }
                  />
                  <Sidebar.CollapsibleContent>
                    <Sidebar.MenuSub>
                      <Sidebar.MenuSubButton>
                        Containers <Sidebar.MenuBadge>Beta</Sidebar.MenuBadge>
                      </Sidebar.MenuSubButton>
                    </Sidebar.MenuSub>
                  </Sidebar.CollapsibleContent>
                </Sidebar.Collapsible>
              </Sidebar.MenuItem>
            </Sidebar.Menu>
          </Sidebar.Group>
        </Sidebar.Content>
        <Sidebar.Footer className="min-h-auto p-4">
          <SidebarGroup className="flex flex-row gap-2">
            {isLoading ? (
              <div className="flex w-64 flex-col gap-3">
                <SkeletonLine minWidth={80} maxWidth={100} />
                <SkeletonLine minWidth={60} maxWidth={80} />
                <SkeletonLine minWidth={40} maxWidth={60} />
              </div>
            ) : (
              <>
                <div className="flex flex-row items-center justify-center gap-2">
                  <img
                    src={imageUrl}
                    alt="User avatar"
                    width={32}
                    height={32}
                    className="rounded-full object-cover"
                  ></img>
                  <div className="flex flex-col text-[12px]">
                    <h1>{name}</h1>
                    <h2>{email}</h2>
                  </div>
                </div>
                <button className="p-2 hover:cursor-pointer">
                  <GearIcon />
                </button>
              </>
            )}
          </SidebarGroup>
        </Sidebar.Footer>
      </Sidebar>
    </Sidebar.Provider>
  );
};
