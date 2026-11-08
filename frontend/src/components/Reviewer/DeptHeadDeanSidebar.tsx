import React, { useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Upload, Clock, CheckSquare, History,
  X, ChevronLeft, ChevronRight, FileSearch, BarChart3, Archive
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { ROLE_LABELS } from '@/types';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

interface DeptHeadDeanSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function DeptHeadDeanSidebar({ isOpen, onClose, isCollapsed, onToggleCollapse }: DeptHeadDeanSidebarProps) {
  const { user } = useAuth();
  const { syllabi, getSyllabiForRole } = useData();
  const location = useLocation();

  const isReturnedOrRevised = (s: any) =>
    s.status === 'returned' ||
    (s.status === 'draft' && ((Array.isArray(s.versionHistory) && s.versionHistory.length > 0) || (s.version && s.version > 1)));

  // Status page has updates if either Approved section or Returned section has >= 1 syllabus
  const statusHasUpdates = useMemo(() => {
    if (!user) return false;
    const myApproved = syllabi.filter(s => s.facultyId === user.id && s.status === 'approved').length;
    const collabApproved = syllabi.filter(s =>
      s.facultyId !== user.id &&
      Array.isArray(s.collaborators) &&
      s.collaborators.includes(user.id) &&
      s.status === 'approved'
    ).length;
    const myReturned = syllabi.filter(s => s.facultyId === user.id && isReturnedOrRevised(s)).length;
    const collabReturned = syllabi.filter(s =>
      s.facultyId !== user.id &&
      Array.isArray(s.collaborators) &&
      s.collaborators.includes(user.id) &&
      isReturnedOrRevised(s)
    ).length;
    return (myApproved + collabApproved + myReturned + collabReturned) > 0;
  }, [user, syllabi]);

  // Track page has updates if either My Syllabi or Collaborating section has >= 1 syllabus under review
  const trackHasUpdates = useMemo(() => {
    if (!user) return false;
    const myActive = syllabi.filter(s =>
      s.facultyId === user.id &&
      s.status !== 'draft' && s.status !== 'returned' && s.status !== 'approved'
    ).length;
    const collabActive = syllabi.filter(s =>
      s.facultyId !== user.id &&
      Array.isArray(s.collaborators) &&
      s.collaborators.includes(user.id) &&
      s.status !== 'draft' && s.status !== 'returned' && s.status !== 'approved'
    ).length;
    return (myActive + collabActive) > 0;
  }, [user, syllabi]);

  // Count pending review syllabi (reviewer view)
  const pendingReviewCount = useMemo(() => {
    if (!user) return 0;
    const mySyllabi = getSyllabiForRole(user.id, user.role, user.college, user.department);
    return mySyllabi.length;
  }, [user, getSyllabiForRole]);

  const facultyNavItems = [
    { label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" />, path: '/dashboard' },
    { label: 'Upload Syllabus', icon: <Upload className="h-5 w-5" />, path: '/faculty/upload' },
    { label: 'Track Syllabus', icon: <Clock className="h-5 w-5" />, path: '/faculty/track', badge: trackHasUpdates ? true : undefined },
    { label: 'Status', icon: <CheckSquare className="h-5 w-5" />, path: '/faculty/status', badge: statusHasUpdates ? true : undefined },
    { label: 'History', icon: <History className="h-5 w-5" />, path: '/faculty/history' },
  ];

  const reviewerNavItems = [
    { label: 'Review Syllabi', icon: <FileSearch className="h-5 w-5" />, path: '/reviewer/syllabi', badge: pendingReviewCount > 0 ? true : undefined },
    { label: 'Review History', icon: <History className="h-5 w-5" />, path: '/reviewer/history' },
    { label: 'Reports', icon: <BarChart3 className="h-5 w-5" />, path: '/reviewer/reports' },
    { label: 'Archive', icon: <Archive className="h-5 w-5" />, path: '/archive' },
  ];

  if (!user) return null;

  const renderNavItem = (item: typeof facultyNavItems[0]) => {
    const isActive = location.pathname === item.path;
    const linkContent = (
      <NavLink
        key={item.path}
        to={item.path}
        onClick={onClose}
        className={`
          flex items-center ${isCollapsed ? 'justify-center p-0 w-10 h-10 mx-auto' : 'gap-3 px-4 py-3'} rounded-xl
          transition-all duration-300 group relative
          ${isActive
            ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-soft'
            : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
          }
        `}
      >
        <span className={`flex items-center justify-center transition-transform group-hover:scale-110 flex-shrink-0 ${isActive ? 'text-sidebar-primary-foreground' : ''}`}>
          {item.icon}
        </span>
        <div className={`flex-1 flex items-center justify-between transition-all duration-300 overflow-hidden ${
          isCollapsed ? 'hidden' : 'max-w-xs opacity-100'
        }`}>
          <span className="font-medium whitespace-nowrap">{item.label}</span>
          {item.badge !== undefined && (
            <span className="ml-2 w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 shadow-sm animate-pulse" />
          )}
        </div>
        {isCollapsed && item.badge !== undefined && (
          <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full shadow-sm animate-pulse" />
        )}
      </NavLink>
    );

    if (isCollapsed) {
      return (
        <Tooltip key={item.path} delayDuration={0}>
          <TooltipTrigger asChild>
            {linkContent}
          </TooltipTrigger>
          <TooltipContent side="right" className="bg-popover text-popover-foreground">
            {item.label}
          </TooltipContent>
        </Tooltip>
      );
    }

    return linkContent;
  };

  return (
    <TooltipProvider delayDuration={0}>
      <>
        {isOpen && (
          <div
            className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 lg:hidden"
            onClick={onClose}
          />
        )}

        <aside className={`
          fixed inset-y-0 left-0 lg:relative lg:inset-auto
          h-full flex-shrink-0
          bg-sidebar text-sidebar-foreground
          transform transition-all duration-300 ease-in-out z-50
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${isCollapsed ? 'w-16' : 'w-64'}
          flex flex-col overflow-hidden
        `}>
          <div className={`h-16 flex items-center border-b border-sidebar-border ${isCollapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
            <div className={`flex items-center gap-2 overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
              <Logo size="sm" className="text-sidebar-foreground [&_span]:text-sidebar-foreground" />
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="lg:hidden text-sidebar-foreground hover:bg-sidebar-accent"
              >
                <X className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleCollapse}
                className="hidden lg:flex text-sidebar-foreground hover:bg-sidebar-accent"
              >
                {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
              </Button>
            </div>
          </div>

          <nav className={`flex-1 ${isCollapsed ? 'p-2' : 'p-4'} space-y-1 overflow-y-auto overflow-x-hidden sidebar-scrollbar`}>
            {/* My Syllabi Section */}
            <div className={`px-4 py-2 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider transition-all duration-300 overflow-hidden ${
              isCollapsed ? 'max-h-0 opacity-0 py-0' : 'max-h-10 opacity-100'
            }`}>
              My Syllabi
            </div>
            {facultyNavItems.map(renderNavItem)}

            <div className="my-2 border-t border-sidebar-border" />

            {/* Review Section */}
            <div className={`px-4 py-2 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider transition-all duration-300 overflow-hidden ${
              isCollapsed ? 'max-h-0 opacity-0 py-0' : 'max-h-10 opacity-100'
            }`}>
              Review
            </div>
            {reviewerNavItems.map(renderNavItem)}
          </nav>

          <div className={`border-t border-sidebar-border transition-all duration-300 overflow-hidden ${
            isCollapsed ? 'max-h-0 opacity-0 p-0 border-t-0' : 'max-h-24 p-4 opacity-100'
          }`}>
            <div className="px-4 py-3 rounded-xl bg-sidebar-accent/50">
              <p className="text-sm font-medium text-sidebar-foreground whitespace-nowrap">
                {ROLE_LABELS[user.role]}
              </p>
              <p className="text-xs text-sidebar-foreground/70 truncate whitespace-nowrap">
                {user.role === 'dept_head' ? user.department : user.college}
              </p>
            </div>
          </div>
        </aside>
      </>
    </TooltipProvider>
  );
}
