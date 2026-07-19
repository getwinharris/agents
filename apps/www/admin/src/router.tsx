import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  useParams,
} from '@tanstack/react-router'
import { AppSidebar } from '@/components/app-sidebar'
import { ChatView } from '@/components/chat/chat-view'
import { NewChat } from '@/components/new-chat'
import { ProjectsPage } from '@/components/projects-page'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { operatingSurface } from '@/lib/operating-surface.mjs'

function RootLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-svh min-h-0 min-w-0 overflow-hidden">
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}

function ChatRoute() {
  const { chatId } = useParams({ from: '/c/$chatId' })
  return <ChatView key={chatId} conversationId={chatId} />
}

const surfaces = {
  automations: {
    title: 'Automations',
    description: 'Time, recurring schedule, webhook, repository-event, connector-event, and manual triggers.',
  },
  mcps: {
    title: 'MCPs',
    description: 'Manage the Model Context Protocol servers, tools, access, and credentials available to bapX agents.',
  },
  team: {
    title: 'Team',
    description: 'People, roles, responsibilities, permissions, and human coordination for the bapX business.',
  },
  agents: {
    title: 'Agents',
    description: 'Main and role-specific agents, their tools, responsibilities, availability, and assigned work.',
  },
  'pull-requests': {
    title: 'Pull requests',
    description: `Repository review and delivery work across ${operatingSurface.projectScope}.`,
  },
} as const

function OperationalSurface({ surface }: { surface: keyof typeof surfaces }) {
  const item = surfaces[surface]
  return (
    <div className="flex h-svh flex-col">
      <header className="flex h-14 items-center border-b px-3"><SidebarTrigger /></header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
        <h1 className="text-4xl font-semibold tracking-tight">{item.title}</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">{item.description}</p>
        <div className="mt-10 rounded-lg border p-6">
          <p className="font-medium">No configured records yet.</p>
          <p className="mt-2 text-sm text-muted-foreground">This is the owned Admin location. Operations will appear here only after their backing API is implemented and validated.</p>
        </div>
      </main>
    </div>
  )
}

const rootRoute = createRootRoute({ component: RootLayout })

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: NewChat,
})

const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/c/$chatId',
  component: ChatRoute,
})

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects',
  component: ProjectsPage,
})

const operationalRoutes = (Object.keys(surfaces) as Array<keyof typeof surfaces>).map((surface) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: `/${surface}`,
    component: () => <OperationalSurface surface={surface} />,
  }),
)

const routeTree = rootRoute.addChildren([indexRoute, chatRoute, projectsRoute, ...operationalRoutes])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
