import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';

interface Company {
  id: string;
  name: string;
  slug: string;
  subscription_status: string;
  trial_ends_at: string;
}

interface CompanyMembership {
  id: string;
  company_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  company: Company;
}

interface AuthContextType {
  user: User | null;
  companies: CompanyMembership[];
  currentCompany: Company | null;
  setCurrentCompany: (company: Company) => void;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<CompanyMembership[]>([]);
  const [currentCompany, setCurrentCompanyState] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const setCurrentCompany = (company: Company) => {
    setCurrentCompanyState(company);
    localStorage.setItem('currentCompanyId', company.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setCompanies([]);
    setCurrentCompanyState(null);
    localStorage.removeItem('currentCompanyId');
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        setIsLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      fetchCompanies();
    } else {
      setCompanies([]);
      setCurrentCompanyState(null);
    }
  }, [user]);

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('company_memberships')
        .select(`
          id,
          company_id,
          user_id,
          role,
          company:companies(
            id,
            name,
            slug,
            subscription_status,
            trial_ends_at
          )
        `)
        .eq('user_id', user?.id);

      if (error) throw error;

      const memberships = data as CompanyMembership[];
      setCompanies(memberships);

      // Set current company from localStorage or first company
      const savedCompanyId = localStorage.getItem('currentCompanyId');
      const savedCompany = memberships.find(m => m.company.id === savedCompanyId);
      
      if (savedCompany) {
        setCurrentCompanyState(savedCompany.company);
      } else if (memberships.length > 0) {
        setCurrentCompanyState(memberships[0].company);
        localStorage.setItem('currentCompanyId', memberships[0].company.id);
      }
    } catch (error) {
      console.error('Error fetching companies:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        companies,
        currentCompany,
        setCurrentCompany,
        isLoading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}