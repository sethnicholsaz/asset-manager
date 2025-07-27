-- Clean up journal entries that were created by duplicate disposition records
-- These journal entries are now orphaned since the duplicate disposition records have been removed

-- First, identify journal entries that are no longer linked to valid disposition records
-- and remove their journal lines
DELETE FROM public.journal_lines 
WHERE journal_entry_id IN (
  SELECT je.id
  FROM public.journal_entries je
  LEFT JOIN public.cow_dispositions cd ON je.id = cd.journal_entry_id
  WHERE je.entry_type = 'disposition'
    AND cd.id IS NULL  -- No matching disposition record
);

-- Then remove the orphaned journal entries
DELETE FROM public.journal_entries 
WHERE id IN (
  SELECT je.id
  FROM public.journal_entries je
  LEFT JOIN public.cow_dispositions cd ON je.id = cd.journal_entry_id
  WHERE je.entry_type = 'disposition'
    AND cd.id IS NULL  -- No matching disposition record
);

-- Add a comment to document this cleanup
COMMENT ON TABLE public.journal_entries IS 
'Journal entries table. Disposition entries should always have a corresponding record in cow_dispositions table.'; 