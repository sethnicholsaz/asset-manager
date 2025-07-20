-- Create stored journal entries table
CREATE TABLE public.stored_journal_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  entry_date DATE NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('depreciation', 'disposition')),
  description TEXT NOT NULL,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'exported')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, month, year, entry_type)
);

-- Create stored journal lines table
CREATE TABLE public.stored_journal_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  journal_entry_id UUID NOT NULL REFERENCES public.stored_journal_entries(id) ON DELETE CASCADE,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  description TEXT NOT NULL,
  debit_amount NUMERIC NOT NULL DEFAULT 0,
  credit_amount NUMERIC NOT NULL DEFAULT 0,
  line_type TEXT NOT NULL CHECK (line_type IN ('debit', 'credit')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.stored_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stored_journal_lines ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for journal entries
CREATE POLICY "Users can access journal entries from their company" 
ON public.stored_journal_entries 
FOR ALL 
USING (company_id IN (
  SELECT company_memberships.company_id
  FROM company_memberships
  WHERE company_memberships.user_id = auth.uid()
));

-- Create RLS policies for journal lines (accessible via journal entry)
CREATE POLICY "Users can access journal lines through their company journal entries" 
ON public.stored_journal_lines 
FOR ALL 
USING (journal_entry_id IN (
  SELECT id FROM public.stored_journal_entries 
  WHERE company_id IN (
    SELECT company_memberships.company_id
    FROM company_memberships
    WHERE company_memberships.user_id = auth.uid()
  )
));

-- Create trigger for updating timestamps
CREATE TRIGGER update_stored_journal_entries_updated_at
BEFORE UPDATE ON public.stored_journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_stored_journal_entries_company_date ON public.stored_journal_entries(company_id, entry_date);
CREATE INDEX idx_stored_journal_entries_company_month_year ON public.stored_journal_entries(company_id, month, year);
CREATE INDEX idx_stored_journal_lines_journal_entry ON public.stored_journal_lines(journal_entry_id);