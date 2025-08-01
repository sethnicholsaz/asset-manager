import { useState } from "react";
import { 
  BarChart3, 
  Upload, 
  TrendingDown, 
  FileText, 
  Settings,
  HelpCircle,
  Beef,
  Users,
  FileCheck,
  AlertTriangle
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { usePendingTasksCount } from "@/hooks/usePendingTasksCount";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const settingsItems = [
  { title: "Data Import", url: "/data-import", icon: Upload },
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Help", url: "/help", icon: HelpCircle },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const currentPath = location.pathname;
  const pendingTasksCount = usePendingTasksCount();

  // Dynamic main items with count
  const mainItems = [
    { title: "Dashboard", url: "/", icon: BarChart3 },
    { 
      title: "Cows Needing Attention", 
      url: "/cows-needing-attention", 
      icon: AlertTriangle,
      count: pendingTasksCount > 0 ? pendingTasksCount : undefined
    },
    { title: "Reports", url: "/reports", icon: FileText },
    { title: "Team", url: "/users", icon: Users },
  ];

  const isActive = (path: string) => {
    if (path === "/" && currentPath === "/") return true;
    if (path !== "/" && currentPath.startsWith(path)) return true;
    return false;
  };

  const getNavCls = (path: string) => {
    const active = isActive(path);
    return `flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors ${
      active 
        ? "bg-primary/10 text-primary border-r-2 border-primary" 
        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
    }`;
  };

  return (
    <Sidebar className={`border-r ${collapsed ? "w-16" : "w-64"}`}>
      <SidebarHeader className="border-b p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
            <Beef className="h-5 w-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <h2 className="text-sm font-semibold text-foreground truncate">
                Dairy Tracker
              </h2>
              <p className="text-xs text-muted-foreground truncate">
                Asset Management
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="p-2">
        <SidebarGroup>
          <SidebarGroupLabel className={`px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground ${collapsed ? "hidden" : ""}`}>
            Main
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild className="p-0">
                    <NavLink to={item.url} className={getNavCls(item.url)}>
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      {!collapsed && (
                        <div className="flex items-center justify-between w-full">
                          <span>{item.title}</span>
                          {'count' in item && item.count && (
                            <span className="bg-destructive text-destructive-foreground text-xs font-medium px-2 py-0.5 rounded-full ml-2">
                              {item.count}
                            </span>
                          )}
                        </div>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-8">
          <SidebarGroupLabel className={`px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground ${collapsed ? "hidden" : ""}`}>
            Settings
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {settingsItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild className="p-0">
                    <NavLink to={item.url} className={getNavCls(item.url)}>
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t p-4">
        {!collapsed && (
          <div className="text-xs text-muted-foreground">
            v1.0.0 • © 2024
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}