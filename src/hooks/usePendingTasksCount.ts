import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function usePendingTasksCount() {
  const [count, setCount] = useState<number>(0);
  const { currentCompany } = useAuth();

  useEffect(() => {
    if (!currentCompany) {
      setCount(0);
      return;
    }

    const fetchCount = async () => {
      try {
        const { count: pendingCount, error } = await supabase
          .from('master_file_staging')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', currentCompany.id)
          .eq('action_taken', 'pending');

        if (error) {
          console.error('Error fetching pending tasks count:', error);
          return;
        }

        setCount(pendingCount || 0);
      } catch (error) {
        console.error('Error in fetchCount:', error);
      }
    };

    fetchCount();

    // Set up real-time subscription for updates
    const channel = supabase
      .channel('staging-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'master_file_staging',
          filter: `company_id=eq.${currentCompany.id}`
        },
        () => {
          fetchCount(); // Refetch count when staging records change
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentCompany]);

  return count;
}