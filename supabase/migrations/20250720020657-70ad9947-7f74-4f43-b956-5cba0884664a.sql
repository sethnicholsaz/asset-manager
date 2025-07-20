-- Create table for cow dispositions
CREATE TABLE public.cow_dispositions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cow_id TEXT NOT NULL,
  disposition_date DATE NOT NULL,
  disposition_type TEXT NOT NULL CHECK (disposition_type IN ('sale', 'death', 'culled')),
  sale_amount DECIMAL(10,2) DEFAULT 0,
  final_book_value DECIMAL(10,2) NOT NULL,
  gain_loss DECIMAL(10,2) NOT NULL,
  notes TEXT,
  journal_entry_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for cows (main asset table)
CREATE TABLE public.cows (
  id TEXT NOT NULL PRIMARY KEY,
  tag_number TEXT NOT NULL UNIQUE,
  name TEXT,
  birth_date DATE NOT NULL,
  freshen_date DATE NOT NULL,
  purchase_price DECIMAL(10,2) NOT NULL,
  salvage_value DECIMAL(10,2) NOT NULL,
  asset_type_id TEXT NOT NULL DEFAULT 'dairy-cow',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'deceased', 'retired')),
  depreciation_method TEXT NOT NULL DEFAULT 'straight-line',
  current_value DECIMAL(10,2) NOT NULL,
  total_depreciation DECIMAL(10,2) NOT NULL DEFAULT 0,
  disposition_id UUID REFERENCES public.cow_dispositions(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for journal entries
CREATE TABLE public.journal_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_date DATE NOT NULL,
  description TEXT NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('depreciation', 'disposition', 'acquisition')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for journal lines (debits and credits)
CREATE TABLE public.journal_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  description TEXT NOT NULL,
  debit_amount DECIMAL(10,2) DEFAULT 0,
  credit_amount DECIMAL(10,2) DEFAULT 0,
  line_type TEXT NOT NULL CHECK (line_type IN ('debit', 'credit')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.cow_dispositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (public access for now, can be restricted later with auth)
CREATE POLICY "Public access to cow dispositions" ON public.cow_dispositions FOR ALL USING (true);
CREATE POLICY "Public access to cows" ON public.cows FOR ALL USING (true);
CREATE POLICY "Public access to journal entries" ON public.journal_entries FOR ALL USING (true);
CREATE POLICY "Public access to journal lines" ON public.journal_lines FOR ALL USING (true);

-- Create triggers for updated_at columns
CREATE TRIGGER update_cow_dispositions_updated_at
BEFORE UPDATE ON public.cow_dispositions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cows_updated_at
BEFORE UPDATE ON public.cows
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_journal_entries_updated_at
BEFORE UPDATE ON public.journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();