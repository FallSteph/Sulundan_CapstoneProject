import React from 'react';
import { Badge } from '@/components/ui/badge';
import { SyllabusStatus, STATUS_LABELS } from '@/types';
import { Clock, CheckCircle2, XCircle, Send, FileSearch } from 'lucide-react';

interface StatusBadgeProps {
  status: SyllabusStatus;
  className?: string;
  size?: 'default' | 'sm';
}

const getStatusConfig = (size: 'default' | 'sm'): Record<SyllabusStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' | 'muted'; icon: React.ReactNode }> => {
  const iconClass = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3';
  return {
    draft: { variant: 'muted', icon: <Clock className={iconClass} /> },
    submitted: { variant: 'info', icon: <Send className={iconClass} /> },
    under_review_peer: { variant: 'warning', icon: <FileSearch className={iconClass} /> },
    under_review_dept_head: { variant: 'warning', icon: <FileSearch className={iconClass} /> },
    under_review_dean: { variant: 'warning', icon: <FileSearch className={iconClass} /> },
    under_review_citl: { variant: 'warning', icon: <FileSearch className={iconClass} /> },
    under_review_vpaa: { variant: 'warning', icon: <FileSearch className={iconClass} /> },
    approved: { variant: 'success', icon: <CheckCircle2 className={iconClass} /> },
    returned: { variant: 'destructive', icon: <XCircle className={iconClass} /> },
  };
};

export function StatusBadge({ status, className = '', size = 'default' }: StatusBadgeProps) {
  const configs = getStatusConfig(size);
  const config = configs[status] || { variant: 'muted' as const, icon: <Clock className={size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'} /> };
  const label = STATUS_LABELS[status] || status;
  
  return (
    <Badge 
      variant={config.variant} 
      className={`gap-1.5 whitespace-nowrap font-medium ${size === 'sm' ? 'text-xs px-2 py-0.5' : ''} ${className}`}
    >
      {config.icon}
      {label}
    </Badge>
  );
}
