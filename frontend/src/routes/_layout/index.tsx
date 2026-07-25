import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  Activity,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock3,
  ShieldCheck,
  UsersRound,
} from "lucide-react"

import { ItemsService, UsersService } from "@/client"
import { PageHeader } from "@/components/Common/PageHeader"
import { Button } from "@/components/ui/button"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
  head: () => ({
    meta: [
      {
        title: "Overview - FlowOps",
      },
    ],
  }),
})

function Dashboard() {
  const { user: currentUser } = useAuth()
  const itemsQuery = useQuery({
    queryKey: ["items", "dashboard"],
    queryFn: () => ItemsService.readItems({ skip: 0, limit: 100 }),
  })
  const usersQuery = useQuery({
    queryKey: ["users", "dashboard"],
    queryFn: () => UsersService.readUsers({ skip: 0, limit: 100 }),
    enabled: Boolean(currentUser?.is_superuser),
  })

  const items = itemsQuery.data?.data ?? []
  const users = usersQuery.data?.data ?? []
  const activeUsers = users.filter((user) => user.is_active).length
  const recentItems = [...items]
    .sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
      return bTime - aTime
    })
    .slice(0, 5)

  const formatDate = (value?: string | null) => {
    if (!value) return "No timestamp"
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value))
  }

  const metrics = [
    {
      label: "Total items",
      value: itemsQuery.isPending ? "—" : String(itemsQuery.data?.count ?? 0),
      helper: "Available resources",
      icon: Boxes,
      color: "text-cyan-500 bg-cyan-500/10",
    },
    {
      label: currentUser?.is_superuser ? "Active users" : "Account status",
      value: currentUser?.is_superuser
        ? usersQuery.isPending
          ? "—"
          : String(activeUsers)
        : "Active",
      helper: currentUser?.is_superuser
        ? `${usersQuery.data?.count ?? 0} total accounts`
        : "Session is authorized",
      icon: UsersRound,
      color: "text-violet-500 bg-violet-500/10",
    },
    {
      label: "Access level",
      value: currentUser?.is_superuser ? "Admin" : "Member",
      helper: currentUser?.is_superuser
        ? "Full permissions"
        : "Standard access",
      icon: ShieldCheck,
      color: "text-amber-500 bg-amber-500/10",
    },
    {
      label: "Platform status",
      value: "Healthy",
      helper: "All services online",
      icon: Activity,
      color: "text-emerald-500 bg-emerald-500/10",
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Control plane"
        title="Workspace overview"
        description={`Welcome back, ${currentUser?.full_name || currentUser?.email}. Monitor your application resources and account activity.`}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, helper, icon: Icon, color }) => (
          <div key={label} className="console-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="console-label">{label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">
                  {value}
                </p>
              </div>
              <span
                className={`grid size-9 place-items-center rounded-md ${color}`}
              >
                <Icon className="size-4" />
              </span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{helper}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
        <section className="console-surface min-w-0">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Recent items</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Latest resources in this workspace
              </p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/items">
                View all
                <ArrowRight />
              </Link>
            </Button>
          </div>

          {recentItems.length > 0 ? (
            <div className="divide-y">
              {recentItems.map((item, index) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3.5 hover:bg-muted/40"
                >
                  <span className="grid size-8 place-items-center rounded-md border bg-muted/50 font-mono text-[10px] text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.description || "No description"}
                    </p>
                  </div>
                  <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
                    <Clock3 className="size-3.5" />
                    {formatDate(item.created_at)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center px-5 text-center">
              <Boxes className="mb-3 size-8 text-muted-foreground/40" />
              <p className="text-sm font-medium">No items yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create your first item to see activity here.
              </p>
            </div>
          )}
        </section>

        <section className="console-surface">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold">Environment health</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Current control plane checks
            </p>
          </div>
          <div className="space-y-1 p-3">
            {[
              ["Backend API", "Connected"],
              ["Authentication", "Operational"],
              ["Data access", "Available"],
            ].map(([label, state]) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-md px-2 py-3"
              >
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  <span className="text-sm">{label}</span>
                </div>
                <span className="text-xs text-muted-foreground">{state}</span>
              </div>
            ))}
          </div>
          <div className="mx-5 mb-5 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="flex items-center gap-2">
              <span className="status-dot" />
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                All systems operational
              </p>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Your workspace is connected and ready for administrative tasks.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
