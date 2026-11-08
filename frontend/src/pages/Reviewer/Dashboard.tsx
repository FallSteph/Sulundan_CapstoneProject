import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FileText, Clock, CheckCircle2, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { VersionLabel } from '@/components/VersionLabel';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { ROLE_LABELS } from '@/types';

export default function ReviewerDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { syllabi, getSyllabiForRole } = useData();

  if (!user) return null;

  const mySyllabi = getSyllabiForRole(user.id, user.role, user.college, user.department);
  
  const pendingReview = mySyllabi
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const reviewed = mySyllabi.filter(s => s.reviewHistory.some(r => r.reviewerRole === user.role));

  const stats = {
    pending: pendingReview.length,
    reviewed: reviewed.length,
    total: mySyllabi.length,
    approved: mySyllabi.filter(s => s.status === 'approved').length,
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">{ROLE_LABELS[user.role]} Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Review and approve syllabi submissions</p>
        </div>
        {stats.pending > 0 && (
          <Button onClick={() => navigate('/reviewer/syllabi')} className="gap-2 h-9 text-xs">
            <FileText className="h-4 w-4" />
            Review Pending ({stats.pending})
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Pending Review" value={stats.pending} icon={Clock} variant="warning" />
        <StatCard title="Reviewed" value={stats.reviewed} icon={CheckCircle2} variant="success" />
        <StatCard title="Total Visible" value={stats.total} icon={FileText} variant="info" />
        <StatCard title="Fully Approved" value={stats.approved} icon={CheckCircle2} variant="primary" />
      </div>

      <Card className="shadow-soft">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Pending Reviews</CardTitle>
            <CardDescription>Syllabi awaiting your review</CardDescription>
          </div>
          <Button variant="ghost" onClick={() => navigate('/reviewer/syllabi')}>
            View All <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {pendingReview.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-4" />
              <p className="text-muted-foreground">No syllabi pending your review</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingReview.slice(0, 5).map((syllabus) => (
                <div 
                  key={syllabus.id} 
                  className="flex items-center justify-between p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer" 
                  onClick={() => navigate(`/reviewer/syllabi/${syllabus.id}/review`, { state: { from: location.pathname } })}
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-warning" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{syllabus.courseCode}</p>
                      <p className="text-sm text-muted-foreground">{syllabus.courseTitle}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <VersionLabel version={syllabus.version} size="sm" />
                    <StatusBadge status={syllabus.status} size="sm" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
