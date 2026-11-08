import React from 'react';
import { FileText, User, Calendar, Building2, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { VersionLabel } from '@/components/VersionLabel';
import { SyllabusStatus } from '@/types';
import { cn } from '@/lib/utils';

interface SyllabusCardProps {
  id: string;
  courseCode: string;
  courseTitle: string;
  facultyName: string;
  department: string;
  college: string;
  status: SyllabusStatus;
  version?: number;
  submittedAt: string;
  onClick?: () => void;
  variant?: 'default' | 'compact';
  showActions?: boolean;
}

export function SyllabusCard({
  id,
  courseCode,
  courseTitle,
  facultyName,
  department,
  college,
  status,
  version = 1,
  submittedAt,
  onClick,
  variant = 'default',
  showActions = true,
}: SyllabusCardProps) {
  if (variant === 'compact') {
    return (
      <div
        onClick={onClick}
        className="flex items-center justify-between p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-medium text-foreground">{courseCode}</p>
            <p className="text-sm text-muted-foreground">{courseTitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden md:block">
            <p className="text-sm font-medium text-foreground">{facultyName}</p>
            <p className="text-xs text-muted-foreground">{department}</p>
          </div>
          <VersionLabel version={version} size="sm" />
          <StatusBadge status={status} />
        </div>
      </div>
    );
  }

  return (
    <Card className="shadow-soft hover:shadow-medium transition-shadow cursor-pointer" onClick={onClick}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="font-semibold text-foreground">{courseCode}</h3>
                <VersionLabel version={version} size="sm" />
                <StatusBadge status={status} size="sm" />
              </div>
              <p className="text-sm text-muted-foreground truncate">{courseTitle}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="h-4 w-4" />
            <span className="truncate">{facultyName}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Building2 className="h-4 w-4" />
            <span className="truncate">{department}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground col-span-2">
            <Calendar className="h-4 w-4" />
            <span>{new Date(submittedAt).toLocaleDateString()}</span>
          </div>
        </div>

        {showActions && (
          <div className="mt-4 pt-4 border-t border-border">
            <Button variant="ghost" size="sm" className="w-full justify-between">
              View Details
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
