import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  User, Mail, Building2, Briefcase, Bell, Lock, Save, Check, 
  Sun, Moon, Eye, EyeOff, ChevronLeft, ChevronRight, AlertCircle, 
  Settings, Send, Loader2, ExternalLink 
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/hooks/use-toast';
import { ROLE_LABELS, COLLEGES, DEPARTMENTS, UserRole } from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function ProfileSettingsPage() {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'profile';
  const { user, updateUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const { updateUser: updateUserServer } = useData();
  
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [notificationsEnabled, setNotificationsEnabled] = useState(user?.notificationsEnabled ?? true);
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [isPasswordSaving, setIsPasswordSaving] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [reqType, setReqType] = useState<'role' | 'college_department' | 'both'>('role');
  const [reqRole, setReqRole] = useState<UserRole>('faculty');
  const [reqCollege, setReqCollege] = useState<string>('');
  const [reqDepartment, setReqDepartment] = useState<string>('');
  const [isRequesting, setIsRequesting] = useState(false);

  // Pagination for notifications
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const { notifications, markNotificationRead } = useData();
  const userNotifications = user ? notifications.filter(n => n.userId === user.id) : [];
  const totalPages = Math.ceil(userNotifications.length / itemsPerPage);
  
  const paginatedNotifications = userNotifications
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Logic for showing college/department in request form
  const targetRole = (reqType === 'role' || reqType === 'both') ? reqRole : user?.role;
  const showReqCollege = targetRole && !['citl', 'vpaa'].includes(targetRole);
  const showReqDepartment = targetRole && !['dean', 'citl', 'vpaa'].includes(targetRole);

  const handleSaveProfile = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      toast({
        title: "Required Fields Missing",
        description: "First Name, Last Name, and Email Address cannot be blank.",
        variant: "destructive",
      });
      return;
    }

    const nameRegex = /\d/;
    if (nameRegex.test(firstName) || nameRegex.test(lastName)) {
      toast({
        title: "Invalid character in name",
        description: "First and last names cannot contain numbers.",
        variant: "destructive",
      });
      return;
    }

    setIsProfileSaving(true);
    try {
      if (user) {
        updateUserServer(user.id, { firstName, lastName, email }, true);
      }
      updateUser({
        firstName,
        lastName,
        email,
        notificationsEnabled,
      });
      toast({
        title: "Profile updated",
        description: "Your profile information has been saved successfully.",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to save profile changes.",
        variant: "destructive",
      });
    } finally {
      setIsProfileSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "New passwords do not match.",
        variant: "destructive",
      });
      return;
    }
    
    if (newPassword.length < 8) {
      toast({
        title: "Error",
        description: "Password must be at least 8 characters long.",
        variant: "destructive",
      });
      return;
    }

    setIsPasswordSaving(true);
    try {
      const response = await fetch(`${API_BASE}/users/${user.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          selfUpdate: true
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update password');
      }

      toast({
        title: "Password changed",
        description: "Your password has been updated successfully.",
      });
      
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update password. Please check your current password.",
        variant: "destructive",
      });
    } finally {
      setIsPasswordSaving(false);
    }
  };

  const handleNotificationToggle = (checked: boolean) => {
    setNotificationsEnabled(checked);
    if (user) {
      updateUserServer(user.id, { notificationsEnabled: checked }, true);
    }
    updateUser({ notificationsEnabled: checked });
    toast({
      title: checked ? "Notifications enabled" : "Notifications disabled",
      description: checked 
        ? "You will receive notifications for syllabus updates."
        : "You will no longer receive notifications.",
    });
  };

  const handleDarkModeToggle = (checked: boolean) => {
    const nextTheme = checked ? 'dark' : 'light';
    setTheme(nextTheme);
    if (user) {
      updateUserServer(user.id, { theme: nextTheme }, true);
      updateUser({ theme: nextTheme });
    }
    toast({
      title: checked ? "Dark mode enabled" : "Light mode enabled",
      description: `Switched to ${checked ? 'dark' : 'light'} mode.`,
    });
  };

  const submitChangeRequest = async () => {
    if (!user) return;
    
    if ((reqType === 'role' || reqType === 'both') && !reqRole) {
      toast({ title: 'Error', description: 'Please select a role', variant: 'destructive' });
      return;
    }

    // Validation for College/Department based on visibility
    if ((reqType === 'college_department' || reqType === 'both')) {
      if (showReqCollege && !reqCollege) {
        toast({ title: 'Error', description: 'Please select a college', variant: 'destructive' });
        return;
      }
      if (showReqDepartment && !reqDepartment) {
        toast({ title: 'Error', description: 'Please select a department', variant: 'destructive' });
        return;
      }
    }

    setIsRequesting(true);
    try {
      const res = await fetch(`${API_BASE}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          type: reqType,
          requestedRole: reqRole,
          requestedCollege: reqCollege,
          requestedDepartment: reqDepartment,
        }),
      });
      const data = await res.json();
      if (!data?.success) {
        toast({ title: 'Error', description: data?.error || 'Failed to submit request', variant: 'destructive' });
      } else {
        toast({ title: 'Request submitted', description: 'Your change request is now pending review.' });
        setReqType('role');
        setReqRole('faculty');
        setReqCollege('');
        setReqDepartment('');
      }
    } catch {
      toast({ title: 'Error', description: 'Unable to contact server', variant: 'destructive' });
    } finally {
      setIsRequesting(false);
    }
  };

  const handleNotificationClick = (n: any) => {
    markNotificationRead(n.id);
    
    const syllabusId = n.syllabusId;
    if (syllabusId) {
      if (user?.role === 'faculty') {
        const isPeerReviewNotify = n.title.toLowerCase().includes('pending review') || 
                                   n.message.toLowerCase().includes('waiting for your review');
        if (isPeerReviewNotify) {
          navigate(`/reviewer/syllabi/${syllabusId}/review`);
        } else {
          const isApproved = n.title.toLowerCase().includes('fully approved') || 
                            n.message.toLowerCase().includes('fully approved');
          if (isApproved) {
            navigate('/faculty/status');
          } else {
            navigate(`/faculty/tracking/${syllabusId}`);
          }
        }
      } else if (['dept_head', 'dean', 'citl', 'vpaa'].includes(user?.role || '')) {
        navigate(`/reviewer/syllabi/${syllabusId}/review`);
      } else {
        navigate(`/syllabus/${syllabusId}`);
      }
      return;
    }

    const msg = n.message || '';
    const title = n.title || '';
    
    const isAccountUpdate = title.toLowerCase().includes('account update') || 
                           title.toLowerCase().includes('profile update') ||
                           title.toLowerCase().includes('account approved') ||
                           msg.toLowerCase().includes('account has been updated') ||
                           title.toLowerCase().includes('account status');
    
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

    const isNewRegistration = (
      title.toLowerCase().includes('new user registration') ||
      title.toLowerCase().includes('registration pending') ||
      msg.toLowerCase().includes('pending approval')
    ) && user?.role === 'admin' && !isChangeRequest && !isAccountUpdate;

    if (isAccountUpdate) {
      navigate('/profile?tab=profile');
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
      window.open(n.link, '_blank', 'noopener,noreferrer');
      return;
    }

    const urlMatch = msg.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
      window.open(urlMatch[0], '_blank', 'noopener,noreferrer');
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Render content based on activeTab parameter */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center">
              <User className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Profile Settings</h2>
              <p className="text-sm text-muted-foreground">Manage your personal information and security</p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Personal Information */}
            <Card className="shadow-soft">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Personal Information</CardTitle>
                    <CardDescription>Update your personal details</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Enter first name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Enter last name"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      placeholder="Enter email"
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="text-muted-foreground">User ID</Label>
                  <p className="text-sm font-mono bg-muted px-3 py-2 rounded-lg">{user.employeeId || user.id}</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground">Role</Label>
                  <p className="text-sm font-medium">{ROLE_LABELS[user.role]}</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      College
                    </Label>
                    <p className="text-sm">{user.college}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground flex items-center gap-2">
                      <Briefcase className="h-4 w-4" />
                      Program
                    </Label>
                    <p className="text-sm">{user.department}</p>
                  </div>
                </div>

                <Button 
                  onClick={handleSaveProfile} 
                  className="w-full mt-4"
                  disabled={
                    isProfileSaving || 
                    !firstName.trim() || 
                    !lastName.trim() || 
                    !email.trim() ||
                    (firstName.trim() === (user?.firstName || '') && 
                     lastName.trim() === (user?.lastName || '') && 
                     email.trim() === (user?.email || ''))
                  }
                >
                  {isProfileSaving ? (
                    <>Saving...</>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Request Changes - Only for non-admins */}
            {user.role !== 'admin' && (
              <Card className="shadow-soft">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center">
                      <Briefcase className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Request Role/Assignment Change</CardTitle>
                      <CardDescription>Ask admin to update your role or college/program</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Request Type</Label>
                    <Select value={reqType} onValueChange={(v: any) => setReqType(v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select request type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="role">Role Change</SelectItem>
                        <SelectItem value="college_department">College & Program Change</SelectItem>
                        <SelectItem value="both">All</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {(reqType === 'role' || reqType === 'both') && (
                    <div className="space-y-2">
                      <Label>Requested Role</Label>
                      <Select value={reqRole} onValueChange={(v: any) => setReqRole(v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          {(['faculty', 'dept_head', 'dean', 'citl', 'vpaa'] as UserRole[]).map(r => (
                            <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {(reqType === 'college_department' || reqType === 'both') && (
                    <>
                      {showReqCollege && (
                        <div className="space-y-2">
                          <Label>Requested College</Label>
                          <Select value={reqCollege} onValueChange={(v: string) => { setReqCollege(v); setReqDepartment(''); }}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select college" />
                            </SelectTrigger>
                            <SelectContent>
                              {COLLEGES.map(c => (
                                <SelectItem key={c} value={c}>{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      
                      {showReqDepartment && (
                        <div className="space-y-2">
                          <Label>Requested Program</Label>
                          <Select value={reqDepartment} onValueChange={(v: string) => setReqDepartment(v)} disabled={!reqCollege}>
                            <SelectTrigger>
                              <SelectValue placeholder={reqCollege ? 'Select program' : 'Select college first'} />
                            </SelectTrigger>
                            <SelectContent>
                              {(DEPARTMENTS[reqCollege] || []).map(d => (
                                <SelectItem key={d} value={d}>{d}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </>
                  )}

                  <Button 
                    onClick={submitChangeRequest} 
                    disabled={isRequesting}
                    className="w-full mt-4"
                  >
                    {isRequesting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Submitting Request...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Submit Request
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Change Password / Google Auth Info */}
            {user.hasPassword !== false ? (
              <Card className="shadow-soft">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-warning/10 flex items-center justify-center">
                      <Lock className="h-5 w-5 text-warning" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Change Password</CardTitle>
                      <CardDescription>Update your account password</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <div className="relative">
                      <Input
                        id="currentPassword"
                        type={showCurrentPassword ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter current password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-10 w-10 hover:bg-transparent"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      >
                        {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-10 w-10 hover:bg-transparent"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-10 w-10 hover:bg-transparent"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <Button 
                    onClick={handleChangePassword} 
                    className="w-full mt-4"
                    disabled={isPasswordSaving || !currentPassword || !newPassword || !confirmPassword}
                  >
                    {isPasswordSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Updating Password...
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4 mr-2" />
                        Update Password
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="shadow-soft border-primary/20 bg-primary/5">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Lock className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Google Linked Account</CardTitle>
                      <CardDescription>Your account uses Google Sign-In</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 rounded-lg bg-background/50 border border-border/50 text-sm mb-4">
                    <p className="text-muted-foreground">
                      Because you signed up using Google, you don't have a separate password for this system.
                    </p>
                  </div>
                  <Button 
                    onClick={() => window.open('https://myaccount.google.com/security', '_blank')} 
                    variant="default"
                    className="w-full mt-4"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Manage Google Account Settings
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-info/10 flex items-center justify-center">
                <Bell className="h-5 w-5 text-info" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">Notifications</h2>
                <p className="text-sm text-muted-foreground">Stay updated with your activities</p>
              </div>
            </div>
            {userNotifications.filter(n => !n.isRead).length > 0 && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => userNotifications.filter(n => !n.isRead).forEach(n => markNotificationRead(n.id))}
              >
                Mark all as read
              </Button>
            )}
          </div>

          <Card className="shadow-soft">
            <CardContent className="p-0">
              {userNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Bell className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium text-foreground">No notifications yet</h3>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    When you receive updates about syllabus reviews or account changes, they will appear here.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {paginatedNotifications.map((notification) => (
                    <div 
                      key={notification.id}
                      className={`p-4 transition-colors hover:bg-muted/30 cursor-pointer ${!notification.isRead ? 'bg-primary/5' : ''}`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`h-2 w-2 mt-2 rounded-full flex-shrink-0 ${notification.isRead ? 'bg-muted' : 'bg-primary'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-sm text-foreground">{notification.title}</p>
                              <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line break-words">
                                {notification.message.replace(/https?:\/\/\S+/g, '(attachment)')}
                              </p>
                              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                                <Check className="h-3 w-3" />
                                {new Date(notification.createdAt).toLocaleString()}
                              </p>
                            </div>
                            {!notification.isRead && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs text-primary h-8"
                                onClick={() => markNotificationRead(notification.id)}
                              >
                                Mark as read
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground mx-4">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center">
              <Settings className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">System Settings</h2>
              <p className="text-sm text-muted-foreground">Customize your app experience</p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Notifications */}
            <Card className="shadow-soft">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-info/10 flex items-center justify-center">
                    <Bell className="h-5 w-5 text-info" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Notifications</CardTitle>
                    <CardDescription>Manage notification preferences</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">Enable Notifications</p>
                    <p className="text-sm text-muted-foreground">
                      Receive updates about syllabus reviews and approvals
                    </p>
                  </div>
                  <Switch
                    checked={notificationsEnabled}
                    onCheckedChange={handleNotificationToggle}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Dark Mode */}
            <Card className="shadow-soft">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-accent/50 flex items-center justify-center">
                    {theme === 'dark' ? (
                      <Moon className="h-5 w-5 text-accent-foreground" />
                    ) : (
                      <Sun className="h-5 w-5 text-accent-foreground" />
                    )}
                  </div>
                  <div>
                    <CardTitle className="text-lg">Appearance</CardTitle>
                    <CardDescription>Toggle between light and dark mode</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">Dark Mode</p>
                    <p className="text-sm text-muted-foreground">
                      Switch to {theme === 'dark' ? 'light' : 'dark'} theme
                    </p>
                  </div>
                  <Switch
                    checked={theme === 'dark'}
                    onCheckedChange={handleDarkModeToggle}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
