import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, User, Settings, LogOut, Moon, Sun, Menu, Download, Calendar, ChevronDown, Check, FileText, Eye, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useData } from '@/contexts/DataContext';
import { useSemester } from '@/contexts/SemesterContext';
import { ROLE_LABELS } from '@/types';
import type { Notification } from '@/types';

interface TopBarProps {
  onMenuClick?: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const navigate = useNavigate();
  const { user, logout, updateUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const { notifications, markNotificationRead, updateUser: updateUserServer } = useData();
  const { semesters, selectedSemester, selectSemester } = useSemester();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:5000';

  // Helper to format semester display name
  const formatSemesterName = (sem: any) => {
    if (!sem) return '';
    const name = sem.name || '';
    const code = sem.code || '';
    // If code looks like a school year (e.g. 2024-2025 or 2024-2025-1ST), extract the year part
    const yearMatch = code.match(/\d{4}-\d{4}|\d{4}/);
    const yearPart = yearMatch ? yearMatch[0] : '';
    
    if (yearPart && !name.includes(yearPart)) {
      return `${name} ${yearPart}`;
    }
    return name;
  };

  const userNotifications = user ? notifications.filter(n => n.userId === user.id) : [];
  const unreadCount = userNotifications.filter(n => !n.isRead).length;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleNotificationClick = (n: Notification) => {
    markNotificationRead(n.id);
    setNotificationsOpen(false);
    
    const syllabusId = (n as any).syllabusId || n.syllabusId;
    
    if (syllabusId) {
        // Roles that are also faculty (can upload/track their own syllabi)
        const isFacultyRole = user?.role === 'faculty' || user?.role === 'dept_head' || user?.role === 'dean';
        
        if (isFacultyRole) {
          const isPeerReviewNotify = n.title.toLowerCase().includes('pending review') || 
                                     n.message.toLowerCase().includes('waiting for your review') ||
                                     n.title.toLowerCase().includes('peer review') ||
                                     n.message.toLowerCase().includes('peer review') ||
                                     n.title.toLowerCase().includes('syllabus assigned');
          
          // For dept_head/dean: also check if it's a review request from their reviewer role
          const isReviewerNotify = (user?.role === 'dept_head' || user?.role === 'dean') && (
            n.title.toLowerCase().includes('ready for review') ||
            n.message.toLowerCase().includes('requires your review') ||
            n.title.toLowerCase().includes('awaiting your review') ||
            n.message.toLowerCase().includes('awaiting your review')
          );
          
          if (isPeerReviewNotify) {
            navigate(`/reviewer/syllabi/${syllabusId}/review`);
          } else if (isReviewerNotify) {
            navigate(`/reviewer/syllabi/${syllabusId}/review`);
          } else {
            // If syllabus is fully approved, go to Status page, otherwise Tracking Details
            const isApproved = n.title.toLowerCase().includes('fully approved') || 
                              n.message.toLowerCase().includes('fully approved');
            
            if (isApproved) {
              navigate('/faculty/status');
            } else {
              navigate(`/faculty/tracking/${syllabusId}`);
            }
          }
        } else if (['citl', 'vpaa'].includes(user?.role || '')) {
          // Pure reviewers go to the review page
          navigate(`/reviewer/syllabi/${syllabusId}/review`);
        } else {
          // Default fallback
          navigate(`/syllabus/${syllabusId}`);
        }
        return;
      }


    const msg = n.message || '';
    const title = n.title || '';
    
    // Check if it's an account/profile update notification
    const isAccountUpdate = title.toLowerCase().includes('account update') || 
                           title.toLowerCase().includes('profile update') ||
                           title.toLowerCase().includes('account approved') ||
                           msg.toLowerCase().includes('account has been updated') ||
                           title.toLowerCase().includes('account status');
    
    // Check if it's a change request (Admin only: role, college, department)
    const isChangeRequest = (
      title.toLowerCase().includes('request') || 
      msg.toLowerCase().includes('request')
    ) && (
      title.toLowerCase().includes('role') || 
      msg.toLowerCase().includes('role') ||
      title.toLowerCase().includes('college') || 
      msg.toLowerCase().includes('college') ||
      title.toLowerCase().includes('department') || 
      msg.toLowerCase().includes('department') ||
      title.toLowerCase().includes('dept') || 
      msg.toLowerCase().includes('dept')
    ) && user?.role === 'admin';

    // Check if it's a new user registration (Admin only)
    const isNewRegistration = (
      title.toLowerCase().includes('new user registration') ||
      title.toLowerCase().includes('registration pending') ||
      msg.toLowerCase().includes('pending approval')
    ) && user?.role === 'admin' && !isChangeRequest && !isAccountUpdate;

    if (isAccountUpdate) {
      navigate('/profile');
      return;
    }

    if (isChangeRequest) {
      navigate('/admin/users?tab=requests');
      return;
    }

    if (isNewRegistration) {
      navigate('/admin/users?tab=pending');
      return;
    }

    if (n.link) {
      try {
        window.open(n.link, '_blank', 'noopener,noreferrer');
        return;
      } catch {}
    }

    const urlMatch = msg.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
      const url = urlMatch[0];
      try {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      } catch {}
    }
  };

  const detectTemplateType = (n: Notification): 'syllabus' | 'form17' | 'form18' | null => {
    const text = `${n.title} ${n.message}`.toLowerCase();
    if (text.includes('form 17') || text.includes('form17')) return 'form17';
    if (text.includes('form 18') || text.includes('form18')) return 'form18';
    if (text.includes('syllabus')) return 'syllabus';
    const m = text.match(/\(type:\s*(syllabus|form17|form18)\)/);
    return (m?.[1] as any) || null;
  };

  async function handleTemplateDownload(n: Notification) {
    const msg = n.message || '';
    const urlMatch = msg.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
      // Direct link present; download it
      const a = document.createElement('a');
      a.href = urlMatch[0];
      a.download = '';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    const t = detectTemplateType(n);
    if (!t) return;
    try {
      const res = await fetch(`${API_BASE}/templates-api?type=${encodeURIComponent(t)}`);
      const data = await res.json();
      const active = Array.isArray(data?.templates) ? data.templates.find((it: any) => it.isActive) || data.templates[0] : null;
      if (active?.url) {
        const a = document.createElement('a');
        a.href = active.url;
        a.download = '';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error("Failed to download template:", error);
    }
  }

  return (
    <header className="h-16 border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-40">
      <div className="h-full px-4 md:px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            className="lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="hidden md:block">
            <h2 className="text-lg font-semibold text-foreground">
              Welcome back, {user?.firstName}
            </h2>
            <p className="text-sm text-muted-foreground">
              {user && ROLE_LABELS[user.role]}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 md:gap-2">
          {/* ── Semester Selector ─────────────────────────── */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="gap-1.5 sm:gap-2 h-8 px-2 sm:px-2.5 text-xs border-border/60 hover:bg-muted/60 max-w-[130px] sm:max-w-[240px] rounded-lg shadow-none focus-visible:ring-0"
              >
                <Calendar className="h-3.5 w-3.5 text-foreground/70 flex-shrink-0" />
                <span className="truncate font-medium text-foreground/90">
                  {selectedSemester ? formatSemesterName(selectedSemester) : 'Select Semester'}
                </span>
                <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 bg-popover border shadow-lg p-1 rounded-xl animate-in fade-in slide-in-from-top-2">
              <DropdownMenuLabel className="text-muted-foreground text-[9px] font-bold uppercase tracking-widest px-2.5 py-1.5">
                School Year & Semester
              </DropdownMenuLabel>
              <div className="max-h-56 overflow-y-auto pr-1 sidebar-scrollbar space-y-0.5">
                {semesters.map((sem) => {
                  const isSelected = selectedSemester?.id === sem.id;
                  return (
                    <DropdownMenuItem
                      key={sem.id}
                      onClick={() => selectSemester(sem.id)}
                      className={`cursor-pointer flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 transition-all outline-none focus:bg-muted/40 ${
                        isSelected ? 'bg-muted/80' : ''
                      }`}
                    >
                      <span className={`truncate text-[13px] font-medium ${isSelected ? 'text-foreground' : 'text-foreground/70'}`}>
                        {formatSemesterName(sem)}
                      </span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {sem.isCurrent && (
                          <Badge
                            variant="outline"
                            className="text-[8px] px-1.5 py-0 border-border text-muted-foreground font-bold tracking-tight h-4 uppercase rounded-full bg-background"
                          >
                            Current
                          </Badge>
                        )}
                        {isSelected && (
                          <Check className="h-3.5 w-3.5 text-foreground/70" />
                        )}
                      </div>
                    </DropdownMenuItem>
                  );
                })}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            onClick={() => {
              const next = theme === 'dark' ? 'light' : 'dark';
              setTheme(next);
              if (user) {
                updateUserServer(user.id, { theme: next }, true);
                updateUser({ theme: next });
              }
            }}
            className="text-muted-foreground hover:text-foreground rounded-lg h-8 w-8 p-0 flex items-center justify-center"
          >
            {theme === 'dark' ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
          </Button>

          <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="relative text-muted-foreground hover:text-foreground h-8 w-8 p-0 flex items-center justify-center rounded-lg">
                <Bell className="h-4.5 w-4.5" />
                {unreadCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 h-3.5 w-3.5 rounded-full bg-destructive text-destructive-foreground text-[8px] flex items-center justify-center font-bold">
                    {unreadCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0 bg-popover border shadow-lg">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Notifications</h3>
                {unreadCount > 0 && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-xs h-7 px-2 text-primary hover:text-primary hover:bg-primary/10"
                    onClick={() => {
                      userNotifications.filter(n => !n.isRead).forEach(n => markNotificationRead(n.id));
                    }}
                  >
                    Mark all as read
                  </Button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {userNotifications.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No notifications
                  </div>
                ) : (
                  userNotifications.map(notification => {
                    const match = (notification.message || '').match(/https?:\/\/[^\s]+/i);
                    const url = match ? match[0] : null;
                    // Hide raw URLs in rendered message
                    const displayMsg = (notification.message || '').replace(/https?:\/\/\S+/g, '(attachment)');
                    const hasUrl = !!url;
                    const tmplType = detectTemplateType(notification);
                    const isDownloadable = hasUrl || !!tmplType;
                    const syllabusId = (notification as any).syllabusId;

                    return (
                      <div
                        key={notification.id}
                        className={`w-full p-4 text-left transition-colors border-b border-border last:border-0 relative group ${
                          !notification.isRead ? 'bg-primary/5' : ''
                        }`}
                      >
                        <div 
                          className="flex items-start gap-3 cursor-pointer"
                          onClick={() => handleNotificationClick(notification)}
                        >
                          <div className={`h-2 w-2 mt-2 rounded-full flex-shrink-0 ${notification.isRead ? 'bg-muted' : 'bg-primary'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-medium text-sm text-foreground leading-tight">{notification.title}</p>
                                <p className="text-sm text-muted-foreground whitespace-pre-line break-words mt-1 line-clamp-2">{displayMsg}</p>
                                <p className="text-[10px] text-muted-foreground mt-1.5">
                                  {new Date(notification.createdAt).toLocaleString(undefined, {
                                    month: 'short', day: 'numeric', year: 'numeric',
                                    hour: 'numeric', minute: '2-digit', hour12: true
                                  })}
                                </p>
                              </div>
                              <div className="flex flex-col items-center gap-2 shrink-0">
                                <div className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center transition-colors" title="View details">
                                  <Eye className="h-4 w-4 text-primary/70" />
                                </div>
                                {!notification.isRead && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      markNotificationRead(notification.id);
                                    }}
                                    title="Mark as read"
                                  >
                                    <CheckCircle2 className="h-4 w-4 text-muted-foreground hover:text-primary" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="p-2 border-t border-border">
                <Button 
                  variant="ghost" 
                  className="w-full text-xs text-primary hover:bg-primary/5 h-8"
                  onClick={() => {
                    setNotificationsOpen(false);
                    navigate('/profile?tab=notifications');
                  }}
                >
                  See all notifications
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 h-8 px-1.5 md:px-2 rounded-lg flex items-center justify-center hover:bg-muted/40">
                <div className="h-7 w-7 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-semibold text-xs shrink-0">
                  {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
                </div>
                <span className="hidden md:inline text-foreground font-medium text-xs">
                  {user?.firstName} {user?.lastName}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-popover border shadow-lg">
              <DropdownMenuLabel className="text-foreground">My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/profile?tab=profile')} className="cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/profile?tab=settings')} className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
