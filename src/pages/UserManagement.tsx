import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Users, UserPlus, Mail, Trash2, Shield } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface CompanyMember {
  id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  invited_at: string | null;
  accepted_at: string | null;
  profile: {
    email: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
}

export default function UserManagement() {
  const { currentCompany, user } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [isInviting, setIsInviting] = useState(false);

  useEffect(() => {
    if (currentCompany) {
      fetchMembers();
    }
  }, [currentCompany]);

  const fetchMembers = async () => {
    if (!currentCompany) return;

    try {
      const { data, error } = await supabase
        .from('company_memberships')
        .select(`
          id,
          user_id,
          role,
          invited_at,
          accepted_at
        `)
        .eq('company_id', currentCompany.id)
        .order('role', { ascending: true });

      if (error) throw error;
      
      // Fetch profiles separately to avoid relation issues
      const memberData = data || [];
      const userIds = memberData.map(m => m.user_id).filter(id => id !== '00000000-0000-0000-0000-000000000000');
      
      let profiles: any[] = [];
      if (userIds.length > 0) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('user_id, email, first_name, last_name')
          .in('user_id', userIds);
        profiles = profileData || [];
      }

      const membersWithProfiles = memberData.map(member => ({
        ...member,
        role: member.role as 'owner' | 'admin' | 'member',
        profile: profiles.find(p => p.user_id === member.user_id) || null
      }));

      setMembers(membersWithProfiles);
    } catch (error) {
      console.error('Error fetching members:', error);
      toast({
        title: "Error",
        description: "Failed to load team members",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCompany || !inviteEmail.trim()) return;

    setIsInviting(true);
    try {
      // Check if user already exists
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('email', inviteEmail.trim())
        .single();

      if (existingProfile) {
        // User exists, add them directly
        const { error: membershipError } = await supabase
          .from('company_memberships')
          .insert({
            company_id: currentCompany.id,
            user_id: existingProfile.user_id,
            role: inviteRole,
            invited_by: user?.id,
            invited_at: new Date().toISOString(),
            accepted_at: new Date().toISOString()
          });

        if (membershipError) throw membershipError;

        toast({
          title: "User added!",
          description: `${inviteEmail} has been added to your company.`,
        });
      } else {
        // User doesn't exist, create invitation record
        const { error: membershipError } = await supabase
          .from('company_memberships')
          .insert({
            company_id: currentCompany.id,
            user_id: '00000000-0000-0000-0000-000000000000', // Placeholder for pending invite
            role: inviteRole,
            invited_by: user?.id,
            invited_at: new Date().toISOString()
          });

        if (membershipError) throw membershipError;

        toast({
          title: "Invitation sent!",
          description: `An invitation has been sent to ${inviteEmail}. They'll be added when they sign up.`,
        });
      }

      setInviteEmail('');
      setInviteRole('member');
      fetchMembers();
    } catch (error) {
      console.error('Error inviting user:', error);
      toast({
        title: "Error",
        description: "Failed to invite user. They may already be a member.",
        variant: "destructive",
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleUpdateRole = async (membershipId: string, newRole: 'owner' | 'admin' | 'member') => {
    try {
      const { error } = await supabase
        .from('company_memberships')
        .update({ role: newRole })
        .eq('id', membershipId);

      if (error) throw error;

      toast({
        title: "Role updated",
        description: "User role has been updated successfully.",
      });
      fetchMembers();
    } catch (error) {
      console.error('Error updating role:', error);
      toast({
        title: "Error",
        description: "Failed to update user role",
        variant: "destructive",
      });
    }
  };

  const handleRemoveMember = async (membershipId: string) => {
    try {
      const { error } = await supabase
        .from('company_memberships')
        .delete()
        .eq('id', membershipId);

      if (error) throw error;

      toast({
        title: "Member removed",
        description: "User has been removed from the company.",
      });
      fetchMembers();
    } catch (error) {
      console.error('Error removing member:', error);
      toast({
        title: "Error",
        description: "Failed to remove user",
        variant: "destructive",
      });
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'owner': return 'default';
      case 'admin': return 'secondary';
      case 'member': return 'outline';
      default: return 'outline';
    }
  };

  const getDisplayName = (member: CompanyMember) => {
    if (member.profile?.first_name || member.profile?.last_name) {
      return `${member.profile.first_name || ''} ${member.profile.last_name || ''}`.trim();
    }
    return member.profile?.email || 'Unknown User';
  };

  const currentUserMembership = members.find(m => m.user_id === user?.id);
  const canManageUsers = currentUserMembership?.role === 'owner' || currentUserMembership?.role === 'admin';

  if (!currentCompany) {
    return <div>Please select a company first.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground">
            Manage team members and their access to {currentCompany.name}
          </p>
        </div>
        <Users className="h-8 w-8 text-muted-foreground" />
      </div>

      {canManageUsers && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Invite New User
            </CardTitle>
            <CardDescription>
              Add new team members to your company. They'll receive access based on their role.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInviteUser} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="user@company.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={inviteRole} onValueChange={(value: 'admin' | 'member') => setInviteRole(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={isInviting} className="w-full">
                    {isInviting ? "Inviting..." : "Send Invite"}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>
            Current members of {currentCompany.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  {canManageUsers && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">
                      {getDisplayName(member)}
                    </TableCell>
                    <TableCell>{member.profile?.email || 'N/A'}</TableCell>
                    <TableCell>
                      {canManageUsers && member.role !== 'owner' && member.user_id !== user?.id ? (
                        <Select
                          value={member.role}
                          onValueChange={(value: 'owner' | 'admin' | 'member') => 
                            handleUpdateRole(member.id, value)
                          }
                        >
                          <SelectTrigger className="w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={getRoleBadgeVariant(member.role)}>
                          {member.role}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {member.accepted_at ? (
                        <Badge variant="outline" className="text-green-600">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-yellow-600">
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                    {canManageUsers && (
                      <TableCell>
                        {member.role !== 'owner' && member.user_id !== user?.id && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to remove this user from the company? 
                                  This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleRemoveMember(member.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Role Permissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div>
              <h4 className="font-medium text-sm">Owner</h4>
              <p className="text-sm text-muted-foreground">
                Full access to all features, can manage users, and transfer ownership
              </p>
            </div>
            <div>
              <h4 className="font-medium text-sm">Admin</h4>
              <p className="text-sm text-muted-foreground">
                Can manage users, cows, dispositions, and reports
              </p>
            </div>
            <div>
              <h4 className="font-medium text-sm">Member</h4>
              <p className="text-sm text-muted-foreground">
                Can view and edit cows, dispositions, and reports
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}