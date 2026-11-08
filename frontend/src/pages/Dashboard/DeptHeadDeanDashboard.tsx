import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  FileText, Clock, CheckCircle2, XCircle,
  Upload, ArrowRight, TrendingUp
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { VersionLabel } from '@/components/VersionLabel';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { ROLE_LABELS } from '@/types';

export default function DeptHeadDeanDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { syllabi, getSyllabiForRole } = useData();

  if (!user) return null;

  // --- Faculty view: syllabi this user submitted ---
  const mySyllabi = syllabi.filter(s => s.facultyId === user.id);
  const myStats = {
    total: mySyllabi.length,
    pending: mySyllabi.filter(s => s.status.startsWith('under_review')).length,
    approved: mySyllabi.filter(s => s.status === 'approved').length,
    returned: mySyllabi.filter(s => s.status === 'returned').length,
  };
  const recentSyllabi = mySyllabi.slice(0, 5);

  // --- Reviewer view: syllabi pending this user's review ---
  const pendingReview = getSyllabiForRole(user.id, user.role, user.college, user.department)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">{ROLE_LABELS[user.role]} Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your syllabi submissions and review pending syllabi
          </p>
        </div>
        <Button onClick={() => navigate('/faculty/upload')} className="gap-2 h-9 text-xs">
          <Upload className="h-4 w-4" />
          Upload Syllabus
        </Button>
      </div>

      {/* ── My Syllabi Section ───────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground border-b border-border pb-2">
          My Syllabi
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Syllabi" value={myStats.total} icon={FileText} variant="primary" />
          <StatCard title="Under Review" value={myStats.pending} icon={Clock} variant="warning" />
          <StatCard title="Approved" value={myStats.approved} icon={CheckCircle2} variant="success" />
          <StatCard title="Returned" value={myStats.returned} icon={XCircle} variant="info" />
        </div>

        <Card className="shadow-soft">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Syllabi</CardTitle>
              <CardDescription>Your recently submitted syllabi</CardDescription>
            </div>
            <Button variant="ghost" onClick={() => navigate('/faculty/history')}>
              View All <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {recentSyllabi.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No syllabi submitted yet</p>
                <Button className="mt-4" onClick={() => navigate('/faculty/upload')}>
                  Upload Your First Syllabus
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {recentSyllabi.map((syllabus) => (
                  <div
                    key={syllabus.id}
                    className="flex items-center justify-between p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/syllabus/${syllabus.id}`)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{syllabus.courseCode}</p>
                        <p className="text-sm text-muted-foreground">{syllabus.courseTitle}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 md:gap-4 flex-wrap justify-end">
                      <VersionLabel version={syllabus.version} size="sm" />
                      <StatusBadge status={syllabus.status} size="sm" />
                      <span className="text-sm text-muted-foreground hidden md:block">
                        {new Date(syllabus.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="shadow-soft hover-lift cursor-pointer" onClick={() => navigate('/faculty/track')}>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-warning/10 flex items-center justify-center">
                  <Clock className="h-6 w-6 text-warning" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Track Progress</h3>
                  <p className="text-sm text-muted-foreground">Monitor your syllabi through the approval workflow</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-soft hover-lift cursor-pointer" onClick={() => navigate('/faculty/status')}>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-success/10 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-success" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">View Status</h3>
                  <p className="text-sm text-muted-foreground">Check approval status and reviewer feedback</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Pending Reviews Section ──────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground border-b border-border pb-2">
          Syllabi Pending Your Review
        </h2>

        <Card className="shadow-soft">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Pending Reviews</CardTitle>
              <CardDescription>Syllabi awaiting your review as {ROLE_LABELS[user.role]}</CardDescription>
            </div>
            {pendingReview.length > 0 && (
              <Button onClick={() => navigate('/reviewer/syllabi')} size="sm">
                View All ({pendingReview.length}) <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
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
      </section>
    </div>
  );
}
