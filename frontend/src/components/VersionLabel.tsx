import React from 'react';
import { Badge } from '@/components/ui/badge';
import { SyllabusStatus } from '@/types';
import { FilePenLine } from 'lucide-react';

interface VersionLabelProps {
  version?: number;
  status?: SyllabusStatus;
  className?: string;
  size?: 'default' | 'sm';
}

/**
 * Displays the standardized Version badge: "Version 1", "Version 2", etc.
 */
export function VersionLabel({ version = 1, className = '', size = 'default' }: VersionLabelProps) {
  const versionNum = Math.max(1, Number(version) || 1);
  const iconClass = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3';
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : '';

  return (
    <Badge
      variant="outline"
      className={`gap-1.5 font-semibold border-amber-400/60 bg-amber-50/80 text-amber-700 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-300 whitespace-nowrap ${sizeClass} ${className}`}
    >
      <FilePenLine className={iconClass} />
      Version {versionNum}
    </Badge>
  );
}
