import { HelpCircle, Book, MessageCircle, Mail, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function Help() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Help & Support</h1>
          <p className="text-muted-foreground">
            Get help with using the Dairy Cow Depreciation Tracker
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center space-y-0 pb-3">
            <div className="flex items-center space-x-2">
              <Book className="h-5 w-5" />
              <CardTitle className="text-lg">Documentation</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription className="mb-4">
              Learn how to use all features of the application
            </CardDescription>
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4 mr-2" />
              View Docs
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center space-y-0 pb-3">
            <div className="flex items-center space-x-2">
              <MessageCircle className="h-5 w-5" />
              <CardTitle className="text-lg">Live Chat</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription className="mb-4">
              Get instant help from our support team
            </CardDescription>
            <Button variant="outline" size="sm">
              Start Chat
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center space-y-0 pb-3">
            <div className="flex items-center space-x-2">
              <Mail className="h-5 w-5" />
              <CardTitle className="text-lg">Email Support</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription className="mb-4">
              Send us a detailed message for complex issues
            </CardDescription>
            <Button variant="outline" size="sm">
              Send Email
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center space-y-0 pb-3">
            <div className="flex items-center space-x-2">
              <HelpCircle className="h-5 w-5" />
              <CardTitle className="text-lg">FAQ</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription className="mb-4">
              Find answers to commonly asked questions
            </CardDescription>
            <Button variant="outline" size="sm">
              Browse FAQ
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Start Guide</CardTitle>
          <CardDescription>
            Follow these steps to get started with tracking your dairy cow depreciation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">1</div>
              <div>
                <h4 className="font-medium">Import Your Cow Data</h4>
                <p className="text-sm text-muted-foreground">Upload a CSV file with your cow information including tag numbers, birth dates, and purchase prices.</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">2</div>
              <div>
                <h4 className="font-medium">Review Your Dashboard</h4>
                <p className="text-sm text-muted-foreground">View your cow inventory and current depreciation status on the main dashboard.</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">3</div>
              <div>
                <h4 className="font-medium">Generate Reports</h4>
                <p className="text-sm text-muted-foreground">Create monthly depreciation reports and journal entries for your accounting system.</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">4</div>
              <div>
                <h4 className="font-medium">Record Dispositions</h4>
                <p className="text-sm text-muted-foreground">Track cow sales and deaths to calculate final gains or losses on disposal.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}