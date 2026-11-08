import React, { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { TopBar } from './TopBar';
import { useAuth } from '@/contexts/AuthContext';
import { AdminSidebar } from '@/components/Admin/AdminSidebar';
import { FacultySidebar } from '@/components/Faculty/FacultySidebar';
import { ReviewerSidebar } from '@/components/Reviewer/ReviewerSidebar';
import { FinalReviewerSidebar } from '@/components/Reviewer/FinalReviewerSidebar';
import { DeptHeadDeanSidebar } from '@/components/Reviewer/DeptHeadDeanSidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useData } from '@/contexts/DataContext';
import { Loader2 } from 'lucide-react';

export function DashboardLayout() {
  const { isAuthenticated, initialized, user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();
  const { isLoading } = useData();

  useEffect(() => {
    try {
      localStorage.setItem('last_path', `${location.pathname}${location.search}`);
    } catch {}
  }, [location.pathname, location.search]);

  if (!initialized) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <span className="text-primary font-medium animate-pulse">Loading data...</span>
      </div>
    );
  }

  const isFullScreenReview = (() => {
    const p = location.pathname || '';
    return p.startsWith('/reviewer/syllabi/') && p.endsWith('/review');
  })();

  if (isFullScreenReview) {
    return (
      <TooltipProvider>
        <div className="h-screen w-screen bg-background overflow-hidden">
          <Outlet />
        </div>
      </TooltipProvider>
    );
  }

  const sidebarProps = {
    isOpen: sidebarOpen,
    onClose: () => setSidebarOpen(false),
    isCollapsed: sidebarCollapsed,
    onToggleCollapse: () => setSidebarCollapsed(!sidebarCollapsed),
  };

  const renderSidebar = () => {
    if (!user) return null;
    
    switch (user.role) {
      case 'admin':
        return <AdminSidebar {...sidebarProps} />;
      case 'faculty':
        return <FacultySidebar {...sidebarProps} />;
      case 'citl':
      case 'vpaa':
        return <FinalReviewerSidebar {...sidebarProps} />;
      case 'dept_head':
      case 'dean':
        return <DeptHeadDeanSidebar {...sidebarProps} />;
      default:
        return null;
    }
  };

  return (
    <TooltipProvider>
      <div className="h-screen bg-background flex overflow-hidden">
        {renderSidebar()}
        <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
          <TopBar onMenuClick={() => setSidebarOpen(true)} />
          <main className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8 overflow-y-auto overflow-x-hidden sidebar-scrollbar">
            <div className="max-w-7xl mx-auto animate-fade-in w-full">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
