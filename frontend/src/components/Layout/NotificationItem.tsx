import React from 'react';
import { Bell, FileText, CheckCircle2, AlertCircle, Clock, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'review' | 'approval';

interface NotificationItemProps {
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  isRead?: boolean;
  onClick?: () => void;
}

const typeConfig: Record<NotificationType, { icon: React.ElementType; className: string }> = {
  info: { icon: Bell, className: 'bg-info/10 text-info' },
  success: { icon: CheckCircle2, className: 'bg-success/10 text-success' },
  warning: { icon: AlertCircle, className: 'bg-warning/10 text-warning' },
  error: { icon: AlertCircle, className: 'bg-destructive/10 text-destructive' },
  review: { icon: FileText, className: 'bg-primary/10 text-primary' },
  approval: { icon: CheckCircle2, className: 'bg-success/10 text-success' },
};

export function NotificationItem({ 
  type, 
  title, 
  message, 
  timestamp, 
  isRead = false, 
  onClick 
}: NotificationItemProps) {
  const config = typeConfig[type];
  const Icon = config.icon;

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 p-3 rounded-xl transition-colors cursor-pointer",
        isRead 
          ? "bg-muted/30 hover:bg-muted/50" 
          : "bg-primary/5 hover:bg-primary/10 border-l-2 border-primary"
      )}
    >
      <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", config.className)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={cn("font-medium text-sm truncate", !isRead && "text-foreground")}>
            {title}
          </p>
          {!isRead && (
            <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {message}
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          {timestamp}
        </p>
      </div>
    </div>
  );
}
