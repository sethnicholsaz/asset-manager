import { Settings as SettingsIcon, User, Bell, Lock, Database, DollarSign } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PurchasePriceSettings } from '@/components/PurchasePriceSettings';

export default function Settings() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">
            Manage your account and application preferences
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center space-y-0 pb-3">
            <div className="flex items-center space-x-2">
              <User className="h-5 w-5" />
              <CardTitle className="text-lg">Profile</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription className="mb-4">
              Manage your personal information and account details
            </CardDescription>
            <Button variant="outline" size="sm">
              Edit Profile
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center space-y-0 pb-3">
            <div className="flex items-center space-x-2">
              <Bell className="h-5 w-5" />
              <CardTitle className="text-lg">Notifications</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription className="mb-4">
              Configure how you receive notifications and alerts
            </CardDescription>
            <Button variant="outline" size="sm">
              Manage Notifications
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center space-y-0 pb-3">
            <div className="flex items-center space-x-2">
              <Lock className="h-5 w-5" />
              <CardTitle className="text-lg">Security</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription className="mb-4">
              Update your password and security preferences
            </CardDescription>
            <Button variant="outline" size="sm">
              Security Settings
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center space-y-0 pb-3">
            <div className="flex items-center space-x-2">
              <Database className="h-5 w-5" />
              <CardTitle className="text-lg">Data Management</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription className="mb-4">
              Export, import, and manage your cow data
            </CardDescription>
            <Button variant="outline" size="sm">
              Manage Data
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Purchase Price Defaults Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Purchase Price Configuration</h2>
          <p className="text-sm text-muted-foreground">
            Configure default purchase prices and daily accrual rates for automatic price calculations
          </p>
        </div>
        <PurchasePriceSettings />
      </div>
    </div>
  );
}