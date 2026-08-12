import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Activity, ArchiveRestore, BarChart3, ClipboardList, FileBarChart2, HardDrive, PanelLeft, Plus } from "lucide-react";
import { useLocation } from "wouter";

const menuItems = [
  { icon: BarChart3, label: "ダッシュボード", path: "/" },
  { icon: Plus, label: "新規報告書登録", path: "/upload" },
  { icon: ClipboardList, label: "報告書一覧", path: "/incidents" },
  { icon: FileBarChart2, label: "月次レポート", path: "/monthly-report" },
  { icon: ArchiveRestore, label: "バックアップ・復元", path: "/backup" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const activeMenuItem = menuItems.find((item) => item.path === location);

  return (
    <>
      <Sidebar collapsible="icon" className="border-r-0">
        <SidebarHeader className="h-16 justify-center border-b border-sidebar-border">
          <div className="flex items-center gap-3 px-3 w-full">
            <SidebarTrigger className="h-8 w-8 rounded-lg" aria-label="ナビゲーションを切り替える">
              <PanelLeft className="h-4 w-4" />
            </SidebarTrigger>
            <div className="flex items-center gap-2 min-w-0 group-data-[collapsible=icon]:hidden">
              <Activity className="h-5 w-5 text-sidebar-primary shrink-0" />
              <span className="font-semibold tracking-tight truncate text-sidebar-foreground text-sm">インシデント管理</span>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent className="gap-0 pt-2">
          <SidebarMenu className="px-2 py-1">
            {menuItems.map((item) => (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton
                  isActive={location === item.path}
                  onClick={() => setLocation(item.path)}
                  tooltip={item.label}
                  className="h-10 transition-all font-normal"
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2 rounded-lg bg-sidebar-accent/50 px-2 py-2 group-data-[collapsible=icon]:justify-center" title="データはこの端末のブラウザ内だけに保存されます">
            <HardDrive className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="text-xs leading-tight text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">端末内にのみ保存中</span>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <div className="flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:hidden">
          <SidebarTrigger className="h-9 w-9 rounded-lg" />
          <span className="font-medium text-sm">{activeMenuItem?.label ?? "インシデント管理"}</span>
        </div>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </>
  );
}
