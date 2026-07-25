import { Boxes, Gauge, UsersRound } from "lucide-react"

import { SidebarAppearance } from "@/components/Common/Appearance"
import { Logo } from "@/components/Common/Logo"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar"
import useAuth from "@/hooks/useAuth"
import { type Item, Main } from "./Main"
import { User } from "./User"

const baseItems: Item[] = [
  { icon: Gauge, title: "Overview", path: "/", section: "Monitor" },
  { icon: Boxes, title: "Items", path: "/items", section: "Manage" },
]

export function AppSidebar() {
  const { user: currentUser } = useAuth()

  const items = currentUser?.is_superuser
    ? [
        ...baseItems,
        {
          icon: UsersRound,
          title: "Users",
          path: "/admin",
          section: "Administration",
        },
      ]
    : baseItems

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
        <Logo variant="responsive" />
      </SidebarHeader>
      <SidebarContent className="py-3">
        <Main items={items} />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="mx-2 flex items-center gap-2 rounded-md border border-sidebar-border bg-white/[0.04] px-2.5 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <span className="status-dot" />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="text-[11px] font-medium text-sidebar-foreground">
              API connected
            </p>
            <p className="text-[9px] text-sidebar-foreground/45">
              All systems operational
            </p>
          </div>
        </div>
        <SidebarAppearance />
        <User user={currentUser} />
      </SidebarFooter>
    </Sidebar>
  )
}

export default AppSidebar
