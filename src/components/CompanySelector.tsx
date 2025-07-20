import { useState } from 'react';
import { Check, ChevronsUpDown, Plus, LogOut, Settings, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export function CompanySelector() {
  const { user, companies, currentCompany, setCurrentCompany, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getUserName = () => {
    const firstName = user?.user_metadata?.first_name || '';
    const lastName = user?.user_metadata?.last_name || '';
    return `${firstName} ${lastName}`.trim() || user?.email || 'User';
  };

  const getCurrentMembership = () => {
    return companies.find(m => m.company.id === currentCompany?.id);
  };

  return (
    <div className="flex items-center gap-4">
      {/* Company Selector */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-[250px] justify-between"
          >
            {currentCompany ? (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-primary rounded flex items-center justify-center text-xs text-primary-foreground">
                  {getInitials(currentCompany.name)}
                </div>
                <span className="truncate">{currentCompany.name}</span>
              </div>
            ) : (
              "Select company..."
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0">
          <Command>
            <CommandInput placeholder="Search companies..." className="h-9" />
            <CommandList className="max-h-[200px]">
              <CommandEmpty>No companies found.</CommandEmpty>
              <CommandGroup heading="Your Companies">
                {companies.map((membership) => (
                  <CommandItem
                    key={membership.company.id}
                    value={membership.company.name}
                    onSelect={() => {
                      setCurrentCompany(membership.company);
                      setOpen(false);
                    }}
                    className="flex items-center gap-3 p-3"
                  >
                    <div className="w-8 h-8 bg-primary rounded flex items-center justify-center text-xs text-primary-foreground">
                      {getInitials(membership.company.name)}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-sm font-medium truncate">{membership.company.name}</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="capitalize">{membership.role}</span>
                        {membership.company.subscription_status === 'trial' && (
                          <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">
                            Trial
                          </span>
                        )}
                        {membership.company.subscription_status === 'active' && (
                          <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                            Active
                          </span>
                        )}
                      </div>
                    </div>
                    <Check
                      className={cn(
                        "ml-auto h-4 w-4",
                        currentCompany?.id === membership.company.id
                          ? "opacity-100"
                          : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup>
                <CommandItem className="p-3">
                  <Plus className="mr-2 h-4 w-4" />
                  Create new company
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Subscription Status */}
      {currentCompany && (
        <div className="hidden md:flex items-center">
          {currentCompany.subscription_status === 'trial' && (
            <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full">
              Trial
            </span>
          )}
          {currentCompany.subscription_status === 'active' && (
            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
              Active
            </span>
          )}
        </div>
      )}

      {/* User Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-8 w-8 rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary text-primary-foreground">
                {getInitials(getUserName())}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <div className="flex items-center justify-start gap-2 p-2">
            <div className="flex flex-col space-y-1 leading-none">
              <p className="font-medium text-sm">{getUserName()}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
              {getCurrentMembership() && (
                <p className="text-xs text-muted-foreground capitalize">
                  {getCurrentMembership()?.role} • {currentCompany?.name}
                </p>
              )}
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <User className="mr-2 h-4 w-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}