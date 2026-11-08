import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, 
  Users, 
  CheckCircle2,
  Clock,
  ArrowRight,
  AlertCircle,
  Building2,
  Settings,
  RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/StatCard';
import { Badge } from '@/components/ui/badge';
import { useData } from '@/contexts/DataContext';
import { COLLEGES } from '@/types';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { syllabi, pendingUsers, requests } = useData();

  const pendingRequests = requests.filter(r => r.status === 'PENDING');

  const stats = {
    totalSyllabi: syllabi.length,
    pendingUsers: pendingUsers.length,
    pendingRequests: pendingRequests.length,
    approved: syllabi.filter(s => s.status === 'approved').length,
    inProgress: syllabi.filter(s => s.status.startsWith('under_review')).length,
  };

  // Group syllabi by college
  const syllabiByCollege = COLLEGES.reduce((acc, college) => {
    acc[college] = syllabi.filter(s => s.college === college).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            System overview and user management
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Syllabi"
          value={stats.totalSyllabi}
          icon={FileText}
          variant="primary"
        />
        <StatCard
          title="Pending Users"
          value={stats.pendingUsers}
          icon={Users}
          variant="warning"
        />
        <StatCard
          title="Approved"
          value={stats.approved}
          icon={CheckCircle2}
          variant="success"
        />
        <StatCard
          title="In Progress"
          value={stats.inProgress}
          icon={Clock}
          variant="info"
        />
      </div>

      {/* Pending User Approvals & Change Requests */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {stats.pendingUsers > 0 && (
          <Card className="shadow-soft border-warning/20 bg-warning/5">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <CardTitle>Pending User Approvals ({stats.pendingUsers})</CardTitle>
                  <CardDescription>New users awaiting verification</CardDescription>
                </div>
              </div>
              <Button onClick={() => navigate('/admin/users?tab=pending')}>
                Review All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pendingUsers.slice(0, 3).map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-4 rounded-xl bg-card border border-border"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-medium">
                        {user.firstName.charAt(0)}{user.lastName.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{user.firstName} {user.lastName}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="warning">{user.role}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {stats.pendingRequests > 0 && (
          <Card className="shadow-soft border-info/20 bg-info/5">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-info/10 flex items-center justify-center">
                  <RefreshCw className="h-5 w-5 text-info" />
                </div>
                <div>
                  <CardTitle>Pending Change Requests ({stats.pendingRequests})</CardTitle>
                  <CardDescription>Role or assignment update requests</CardDescription>
                </div>
              </div>
              <Button onClick={() => navigate('/admin/users?tab=requests')}>
                Review All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pendingRequests.slice(0, 3).map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between p-4 rounded-xl bg-card border border-border"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-info/10 text-info flex items-center justify-center font-medium">
                        {req.userName.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{req.userName}</p>
                        <p className="text-xs text-muted-foreground">Type: {req.type.replace('_', ' & ')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="info">PENDING</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick Actions / Admin Tools */}
      <Card className="shadow-soft">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Admin Tools</CardTitle>
            <CardDescription>Manage system templates and configuration</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/admin/templates')} className="gap-2">
              <FileText className="h-4 w-4" />
              Templates
            </Button>
            <Button variant="outline" onClick={() => navigate('/admin/semesters')} className="gap-2">
              <Settings className="h-4 w-4" />
              Semester Config
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Syllabi by College */}
      <Card className="shadow-soft">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Syllabi by College</CardTitle>
            <CardDescription>Distribution across academic units</CardDescription>
          </div>
          <Button variant="ghost" onClick={() => navigate('/admin/reports')}>
            View Reports
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {COLLEGES.map((college) => {
              const count = syllabiByCollege[college];
              const percentage = stats.totalSyllabi > 0 
                ? Math.round((count / stats.totalSyllabi) * 100) 
                : 0;
              
              return (
                <div key={college} className="space-y-2">
                  {/* Mobile layout - improved */}
                  <div className="sm:hidden">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 max-w-[70%]">
                        <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm font-medium text-foreground break-words">
                          {college}
                        </span>
                      </div>
                      <span className="text-sm text-muted-foreground whitespace-nowrap flex-shrink-0 pl-2">
                        {count} syllabi
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden mt-2">
                      <div 
                        className="h-full gradient-primary transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                  
                  {/* Desktop layout - original */}
                  <div className="hidden sm:block">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground">{college}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">{count} syllabi</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden mt-2">
                      <div 
                        className="h-full gradient-primary transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
