import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  CheckCircle2,
  Clock,
  User,
  HandHelping,
  Search,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { useToast } from '@/hooks/use-toast';

export default function PeerReviewQueuePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { syllabi, refreshSyllabi } = useData();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [isClaiming, setIsClaiming] = useState<string | null>(null);

  const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:5000';

  if (!user) return null;

  const availableSyllabi = useMemo(() => {
    return syllabi.filter((s) => {
      if (s.status !== 'under_review_peer' || s.department !== user.department || s.facultyId === user.id || s.claimedBySeniorFacultyId) {
        return false;
      }
      // If there are assigned peer reviewers, the current user must be one of them
      if (s.assignedPeerReviewers && s.assignedPeerReviewers.length > 0) {
        if (!s.assignedPeerReviewers.some(apr => apr.reviewerId === user.id)) {
          return false;
        }
      }
      return (
        searchTerm === '' || 
        s.courseCode.toLowerCase().includes(searchTerm.toLowerCase()) || 
        s.courseTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.facultyName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [syllabi, user.department, user.id, searchTerm]);

  const handleClaim = async (syllabusId: string) => {
    try {
      setIsClaiming(syllabusId);
      const res = await fetch(`${API_BASE}/syllabi/${syllabusId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seniorFacultyId: user.id,
          seniorFacultyName: `${user.firstName} ${user.lastName}`,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to claim syllabus');
      }

      toast({
        title: 'Syllabus Claimed',
        description: 'You can now proceed to review this syllabus in your Review Syllabi page.',
      });

      // Refresh data
      await refreshSyllabi();
      
      // Navigate to review page
      navigate('/reviewer/syllabi');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Claim Failed',
        description: error.message,
      });
    } finally {
      setIsClaiming(null);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">Peer Review Queue</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Select syllabi from your department to review
        </p>
      </div>

      <div className="flex items-center gap-4 bg-card p-4 rounded-xl border border-border shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by course code, title, or faculty..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-4">
        {availableSyllabi.length === 0 ? (
          <Card className="shadow-soft">
            <CardContent className="p-12 text-center">
              <CheckCircle2 className="h-16 w-16 text-success mx-auto mb-4" />
              <h3 className="text-xl font-semibold">Queue is empty</h3>
              <p className="text-muted-foreground">
                No new syllabi pending peer review in your department.
              </p>
            </CardContent>
          </Card>
        ) : (
          availableSyllabi.map((syllabus) => {
            const isClaimedBySomeoneElse = syllabus.claimedBySeniorFacultyId && syllabus.claimedBySeniorFacultyId !== user.id;
            const isClaimedByMe = syllabus.claimedBySeniorFacultyId === user.id;

            return (
              <Card key={syllabus.id} className={`shadow-soft overflow-hidden border-l-4 ${isClaimedBySomeoneElse ? 'border-l-muted opacity-80' : isClaimedByMe ? 'border-l-success' : 'border-l-primary'}`}>
                <CardContent className="p-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-start gap-4">
                      <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${isClaimedBySomeoneElse ? 'bg-muted' : 'bg-primary/10'}`}>
                        <FileText className={`h-6 w-6 ${isClaimedBySomeoneElse ? 'text-muted-foreground' : 'text-primary'}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground flex items-center gap-2">
                            {syllabus.courseCode} – {syllabus.courseTitle}
                            {syllabus.version && syllabus.version > 1 && (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold bg-yellow-50 text-yellow-600 border border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-900/50 align-middle shrink-0 ml-1">
                                v{syllabus.version}
                              </span>
                            )}
                          </h3>
                          {isClaimedByMe && (
                            <span className="text-[10px] bg-success/20 text-success font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                              Your Claim
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5" />
                            <span>{syllabus.facultyName}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            <span>Submitted: {new Date(syllabus.createdAt).toLocaleDateString()}</span>
                          </div>
                          {isClaimedBySomeoneElse && (
                            <div className="flex items-center gap-1.5 col-span-full mt-1 text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded w-fit">
                              <HandHelping className="h-3.5 w-3.5" />
                              <span>Claimed by: {syllabus.claimedBySeniorFacultyName}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {isClaimedBySomeoneElse ? (
                        <Button variant="ghost" disabled className="gap-2 cursor-not-allowed">
                          Unavailable
                        </Button>
                      ) : isClaimedByMe ? (
                        <Button 
                          className="gap-2 bg-success hover:bg-success/90"
                          onClick={() => navigate('/reviewer/syllabi')}
                        >
                          Already Claimed - Review Now
                        </Button>
                      ) : (
                        <Button 
                          className="gap-2"
                          onClick={() => handleClaim(syllabus.id)}
                          disabled={isClaiming === syllabus.id}
                        >
                          {isClaiming === syllabus.id ? (
                            <span className="animate-pulse">Claiming...</span>
                          ) : (
                            <>
                              <HandHelping className="h-4 w-4" />
                              Claim Syllabus
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
