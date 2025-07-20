import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AuthComponent } from "@/components/AuthComponent";
import { CompanySelector } from "@/components/CompanySelector";
import { AppSidebar } from "@/components/AppSidebar";
import Index from "./pages/Index";
import Import from "./pages/Import";
import Dispositions from "./pages/Dispositions";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Help from "./pages/Help";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppContent() {
  const { user, isLoading, currentCompany } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <AuthComponent />;
  }

  if (!currentCompany) {
    return (
      <div className="min-h-screen flex flex-col">
        {/* Header with Sign Out */}
        <header className="h-14 border-b bg-background flex items-center px-4 justify-between">
          <div className="flex items-center">
            <h1 className="text-lg font-semibold">Cow Asset Manager</h1>
          </div>
          <CompanySelector />
        </header>
        
        {/* Main Content */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <h2 className="text-xl font-semibold">No Company Selected</h2>
            <p className="text-muted-foreground">
              You need to be a member of a company to continue.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          {/* Header with Company Selector */}
          <header className="h-14 border-b bg-background flex items-center px-4">
            <SidebarTrigger className="mr-4" />
            <div className="flex-1" />
            <CompanySelector />
          </header>
          
          {/* Main Content */}
          <main className="flex-1 p-6 bg-background">
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/import" element={<Import />} />
              <Route path="/dispositions" element={<Dispositions />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/help" element={<Help />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
