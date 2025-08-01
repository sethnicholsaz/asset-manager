import { Toaster } from "@/components/ui/toaster";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AuthComponent } from "@/components/AuthComponent";
import { CompanySelector } from "@/components/CompanySelector";
import { GlobalSearch } from "@/components/GlobalSearch";
import { AppSidebar } from "@/components/AppSidebar";
import Index from "./pages/Index";
import DataImport from "./pages/DataImport";
import CowsNeedingAttention from "./pages/CowsNeedingAttention";
import CowDetail from "./pages/CowDetail";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import UserManagement from "./pages/UserManagement";
import Help from "./pages/Help";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function CreateCompanyForm() {
  const [companyName, setCompanyName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !companyName.trim()) return;
    
    setIsLoading(true);
    try {
      // Validate input
      if (companyName.trim().length < 2) {
        throw new Error('Company name must be at least 2 characters long');
      }

      if (companyName.trim().length > 100) {
        throw new Error('Company name must be less than 100 characters');
      }
      
      // Create company
      const companySlug = companyName.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      const { data: company, error: companyError } = await supabase
        .from('companies')
        .insert({
          name: companyName.trim(),
          slug: companySlug
        })
        .select()
        .single();

      if (companyError) {
        throw new Error(`Failed to create company: ${companyError.message}`);
      }

      // Create profile if it doesn't exist
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          user_id: user.id,
          email: user.email || '',
          first_name: user.user_metadata?.first_name || '',
          last_name: user.user_metadata?.last_name || ''
        }, {
          onConflict: 'user_id'
        });

      if (profileError) {
        throw new Error(`Failed to create profile: ${profileError.message}`);
      }

      // Create company membership
      const { error: membershipError } = await supabase
        .from('company_memberships')
        .insert({
          company_id: company.id,
          user_id: user.id,
          role: 'owner',
          accepted_at: new Date().toISOString()
        });

      if (membershipError) {
        throw new Error(`Failed to create membership: ${membershipError.message}`);
      }

      console.log('Membership created successfully');

      toast({
        title: "Company created!",
        description: "Your company has been set up successfully.",
      });

      // Refresh the page to load the new company
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error('Full error:', error);
      toast({
        title: "Failed to create company",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleCreateCompany} className="space-y-4 max-w-sm">
      <div className="space-y-2">
        <Label htmlFor="companyName">Company Name</Label>
        <Input
          id="companyName"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Your Dairy Farm"
          required
        />
      </div>
      <Button type="submit" disabled={isLoading || !companyName.trim()}>
        {isLoading ? "Creating..." : "Create Company"}
      </Button>
    </form>
  );
}

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
          <div className="text-center space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">No Company Selected</h2>
              <p className="text-muted-foreground">
                You need to be a member of a company to continue.
              </p>
            </div>
            <div className="border-t pt-6">
              <h3 className="text-lg font-medium mb-4">Create a New Company</h3>
              <CreateCompanyForm />
            </div>
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
          <header className="h-14 border-b bg-background flex items-center px-4 gap-4">
            <SidebarTrigger className="flex-shrink-0" />
            <GlobalSearch />
            <CompanySelector />
          </header>
          
          {/* Main Content */}
          <main className="flex-1 p-6 bg-background">
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/data-import" element={<DataImport />} />
              <Route path="/cows-needing-attention" element={<CowsNeedingAttention />} />
              <Route path="/cow/:cowId" element={<CowDetail />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/users" element={<UserManagement />} />
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
