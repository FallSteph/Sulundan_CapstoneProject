import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { DataProvider } from "@/contexts/DataContext";
import { SemesterProvider } from "@/contexts/SemesterContext";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import Index from "./pages/Index";
import NotFound from "@/components/Layout/NotFound";

// Auth Pages
import LoginPage from "./pages/Auth/LoginPage";
import SignupPage from "./pages/Auth/SignupPage";
import ForgotPasswordPage from "./pages/Auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/Auth/ResetPasswordPage";

// Shared Pages
import ProfileSettingsPage from "@/components/Layout/Profile&SettingsPage";
import SyllabusViewPage from "./pages/Syllabus/SyllabusView";

// Admin Pages
import AdminDashboard from "./pages/Admin/Dashboard";
import ManageUsersPage from "./pages/Admin/ManageUsers";
import AdminReportsPage from "./pages/Admin/Reports";
import SemesterConfigPage from "./pages/Admin/SemesterConfigPage";
import TemplatesAdminPage from "./pages/Admin/Templates";
import ArchivePage from "./pages/Admin/Archive";
import BackupsPage from "./pages/Admin/Backups";

// Faculty Pages
import FacultyDashboard from "./pages/Faculty/Dashboard";
import UploadSyllabusPage from "./pages/Faculty/UploadSyllabus";
import TrackSyllabusPage from "./pages/Faculty/TrackSyllabus";
import FacultyStatusPage from "./pages/Faculty/Status";
import FacultyHistoryPage from "./pages/Faculty/History";
import TrackingIDPage from "./pages/Faculty/TrackingDetails";
import FormsEditorPage from "./pages/Faculty/FormsEditor";

// Reviewer Pages
import ReviewerDashboard from "./pages/Reviewer/Dashboard";
import ReviewSyllabiPage from "./pages/Reviewer/ReviewSyllabi";
import SyllabusReviewPage from "./pages/Reviewer/SyllabusReview";
import ReviewerHistoryPage from "./pages/Reviewer/History";
import ReportsPage from "./pages/Reviewer/Reports";

// Faculty Peer Review Pages
import PeerReviewQueuePage from "./pages/Faculty/PeerReviewQueue";

// Dashboard Router
import DashboardRouter from "./pages/Dashboard/DashboardRouter";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <SemesterProvider>
          <DataProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/signup" element={<SignupPage />} />
                  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                  
                  {/* Fullscreen Review Page (no Dashboard layout) */}
                  <Route path="/reviewer/syllabi/:id/review" element={<SyllabusReviewPage />} />
                  
                  {/* Protected Dashboard Routes */}
                  <Route element={<DashboardLayout />}>
                    <Route path="/dashboard" element={<DashboardRouter />} />
                    <Route path="/admin" element={<AdminDashboard />} />
                    <Route path="/faculty" element={<FacultyDashboard />} />
                    <Route path="/reviewer" element={<ReviewerDashboard />} />
                    <Route path="/profile" element={<ProfileSettingsPage />} />
                    <Route path="/syllabus/:id" element={<SyllabusViewPage />} />
                    
                    {/* Admin Routes */}
                    <Route path="/admin/users" element={<ManageUsersPage />} />
                    <Route path="/admin/reports" element={<AdminReportsPage />} />
                    <Route path="/archive" element={<ArchivePage />} />
                    <Route path="/admin/semesters" element={<SemesterConfigPage />} />
                    <Route path="/admin/templates" element={<TemplatesAdminPage />} />
                    <Route path="/admin/backups" element={<BackupsPage />} />
                    
                    {/* Faculty Routes */}
                    <Route path="/faculty/upload" element={<UploadSyllabusPage />} />
                    <Route path="/faculty/track" element={<TrackSyllabusPage />} />
                    <Route path="/faculty/status" element={<FacultyStatusPage />} />
                    <Route path="/faculty/history" element={<FacultyHistoryPage />} />
                    <Route path="/faculty/tracking/:id" element={<TrackingIDPage />} />
                    <Route path="/faculty/forms-editor/:id" element={<FormsEditorPage />} />
                    
                    {/* Reviewer Routes */}
                    <Route path="/reviewer/syllabi" element={<ReviewSyllabiPage />} />
                    <Route path="/reviewer/history" element={<ReviewerHistoryPage />} />
                    <Route path="/reviewer/reports" element={<ReportsPage />} />

                    {/* Faculty Peer Review Routes */}
                    <Route path="/faculty/peer-review" element={<PeerReviewQueuePage />} />
                  </Route>

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </TooltipProvider>
          </DataProvider>
        </SemesterProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
