import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users, CheckCircle2, XCircle, Plus, Pencil, Archive, Search, Filter, Key, Copy, Building2, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, AlertCircle, Mail, ChevronUp, ChevronDown, Lock, Unlock, Clock, Shield, ArrowUpDown, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useData } from '@/contexts/DataContext';
import { useToast } from '@/hooks/use-toast';
import { ROLE_LABELS, ACCOUNT_ROLES, COLLEGES, DEPARTMENTS, UserRole, User, ChangeRequest } from '@/types';

export default function ManageUsersPage() {
  const { pendingUsers, allUsers, approveUser, rejectUser, addUser, updateUser, archiveUser, unarchiveUser, lockUser, unlockUser, requests, approveChangeRequest, rejectChangeRequest } = useData();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  // Basic filter states that I'll use throughout the component
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [collegeFilter, setCollegeFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');

  // Pagination setup - keeping it at 20 items per page for good balance
  const [currentPendingPage, setCurrentPendingPage] = useState(1);
  const [currentExistingPage, setCurrentExistingPage] = useState(1);
  const itemsPerPage = 20;

  // Dialog states for managing user interactions
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Confirmation dialog states - I separated these for clarity
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
  const [isLockConfirmOpen, setIsLockConfirmOpen] = useState(false);
  const [isUnlockConfirmOpen, setIsUnlockConfirmOpen] = useState(false);
  const [isApproveConfirmOpen, setIsApproveConfirmOpen] = useState(false);
  const [isRejectConfirmOpen, setIsRejectConfirmOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [userToAction, setUserToAction] = useState<{ id: string, name: string, type: 'approve' | 'reject' | 'archive' | 'lock' | 'unlock' } | null>(null);

  // Form state for adding/editing users
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role: 'faculty' as UserRole,
    college: '',
    department: '',
  });

  // Password generation state - keeping this separate from form data
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Sorting states for both tabs
  const [pendingSortOrder, setPendingSortOrder] = useState<'asc' | 'desc' | null>(null);
  const [existingSortOrder, setExistingSortOrder] = useState<'asc' | 'desc' | null>(null);
  const [activeTab, setActiveTab] = useState<string>(() => {
    try {
      // Priority 1: URL parameter
      const tabParam = searchParams.get('tab');
      if (tabParam === 'requests' || tabParam === 'pending' || tabParam === 'existing') {
        return tabParam;
      }
      // Priority 2: Local storage
      return localStorage.getItem('manage_users_tab') || 'pending';
    } catch {
      return 'pending';
    }
  });

  // Handle URL param changes
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'requests' || tabParam === 'pending' || tabParam === 'existing') {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  useEffect(() => {
    try {
      localStorage.setItem('manage_users_tab', activeTab);
    } catch { }
  }, [activeTab]);

  // Memoizing departments based on selected college to avoid recalculating
  const availableDepartments = useMemo(() => {
    if (!collegeFilter || collegeFilter === 'all') {
      return [];
    }
    return DEPARTMENTS[collegeFilter] || [];
  }, [collegeFilter]);

  // Helper to check if any filters are active - for the clear filters button
  const hasActiveFilters = searchQuery || roleFilter !== 'all' || statusFilter !== 'all' || collegeFilter !== 'all' || departmentFilter !== 'all';

  // Check if selected role is admin, CITL, or VPAA
  const isAdminRoleSelected = useMemo(() => {
    return roleFilter === 'admin' || roleFilter === 'citl' || roleFilter === 'vpaa';
  }, [roleFilter]);

  // Resetting all filters and pagination
  const clearFilters = () => {
    setSearchQuery('');
    setRoleFilter('all');
    setStatusFilter('all');
    setCollegeFilter('all');
    setDepartmentFilter('all');
    setCurrentPendingPage(1);
    setCurrentExistingPage(1);
    setPendingSortOrder(null);
    setExistingSortOrder(null);
  };

  // Simple password generator function
  const generatePassword = () => {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length);
      password += charset[randomIndex];
    }
    setGeneratedPassword(password);
    setShowPassword(true);
  };

  // Clipboard functionality for passwords
  const copyPasswordToClipboard = () => {
    if (!generatedPassword) return;
    navigator.clipboard.writeText(generatedPassword);
    toast({ title: 'Password Copied', description: 'Password has been copied to clipboard.' });
  };

  // Opening confirmation dialogs with user data
  const openArchiveConfirm = (userId: string, name: string) => {
    setUserToAction({ id: userId, name, type: 'archive' });
    setIsArchiveConfirmOpen(true);
  };

  const openApproveConfirm = (userId: string, name: string) => {
    setUserToAction({ id: userId, name, type: 'approve' });
    setIsApproveConfirmOpen(true);
  };

  const openRejectConfirm = (userId: string, name: string) => {
    setUserToAction({ id: userId, name, type: 'reject' });
    setIsRejectConfirmOpen(true);
  };

  const openLockConfirm = (userId: string, name: string) => {
    setUserToAction({ id: userId, name, type: 'lock' });
    setIsLockConfirmOpen(true);
  };

  const openUnlockConfirm = (userId: string, name: string) => {
    setUserToAction({ id: userId, name, type: 'unlock' });
    setIsUnlockConfirmOpen(true);
  };

  // Handling actions after user confirms
  const handleArchiveConfirm = async () => {
    if (!userToAction) return;

    setIsProcessing(true);
    toast({ title: 'Processing', description: `Archiving ${userToAction.name}...` });
    const success = await archiveUser(userToAction.id);
    if (success) {
      toast({ title: 'User Archived', description: `${userToAction.name} has been archived.` });
    } else {
      toast({ variant: 'destructive', title: 'Error', description: `Failed to archive ${userToAction.name}.` });
    }
    setIsProcessing(false);
    setIsArchiveConfirmOpen(false);
    setUserToAction(null);
  };

  const handleApproveConfirm = async () => {
    if (!userToAction) return;

    setIsProcessing(true);
    toast({ title: 'Processing', description: `Approving ${userToAction.name}...` });
    const success = await approveUser(userToAction.id);
    if (success) {
      toast({ title: 'User Approved', description: `${userToAction.name} can now log in.` });
    } else {
      toast({ variant: 'destructive', title: 'Error', description: `Failed to approve ${userToAction.name}.` });
    }
    setIsProcessing(false);
    setIsApproveConfirmOpen(false);
    setUserToAction(null);
  };

  const handleRejectConfirm = async () => {
    if (!userToAction) return;

    setIsProcessing(true);
    toast({ title: 'Processing', description: `Rejecting ${userToAction.name}...` });
    const success = await rejectUser(userToAction.id);
    if (success) {
      toast({ variant: 'destructive', title: 'User Rejected', description: `${userToAction.name}'s request has been rejected.` });
    } else {
      toast({ variant: 'destructive', title: 'Error', description: `Failed to reject ${userToAction.name}.` });
    }
    setIsProcessing(false);
    setIsRejectConfirmOpen(false);
    setUserToAction(null);
  };

  const handleLockConfirm = async () => {
    if (!userToAction) return;

    setIsProcessing(true);
    toast({ title: 'Processing', description: `Locking ${userToAction.name}...` });
    const success = await lockUser(userToAction.id);
    if (success) {
      toast({ title: 'User Locked', description: `${userToAction.name}'s account has been locked. They will be logged out automatically.` });
    } else {
      toast({ variant: 'destructive', title: 'Error', description: `Failed to lock ${userToAction.name}.` });
    }
    setIsProcessing(false);
    setIsLockConfirmOpen(false);
    setUserToAction(null);
  };

  const handleUnlockConfirm = async () => {
    if (!userToAction) return;

    setIsProcessing(true);
    toast({ title: 'Processing', description: `Unlocking ${userToAction.name}...` });
    const success = await unlockUser(userToAction.id);
    if (success) {
      toast({ title: 'User Unlocked', description: `${userToAction.name}'s account has been unlocked. They can log in now.` });
    } else {
      toast({ variant: 'destructive', title: 'Error', description: `Failed to unlock ${userToAction.name}.` });
    }
    setIsProcessing(false);
    setIsUnlockConfirmOpen(false);
    setUserToAction(null);
  };

  const handleApproveRequest = async (id: string, name: string) => {
    setIsProcessing(true);
    toast({ title: 'Processing', description: `Approving change request for ${name}...` });
    const success = await approveChangeRequest(id);
    if (success) {
      toast({ title: 'Request Approved', description: `Change request for ${name} has been approved.` });
    } else {
      toast({ variant: 'destructive', title: 'Error', description: `Failed to approve change request for ${name}.` });
    }
    setIsProcessing(false);
  };

  const handleRejectRequest = async (id: string, name: string) => {
    setIsProcessing(true);
    toast({ title: 'Processing', description: `Rejecting change request for ${name}...` });
    const success = await rejectChangeRequest(id);
    if (success) {
      toast({ variant: 'destructive', title: 'Request Rejected', description: `Change request for ${name} has been rejected.` });
    } else {
      toast({ variant: 'destructive', title: 'Error', description: `Failed to reject change request for ${name}.` });
    }
    setIsProcessing(false);
  };

  // Adding a new user with validation
  const handleAddUser = async () => {
    // Updated validation based on role
    const needsCollege = !['admin', 'citl', 'vpaa'].includes(formData.role);
    const needsDept = !['admin', 'dean', 'citl', 'vpaa'].includes(formData.role);

    if (!formData.firstName || !formData.lastName || !formData.email ||
      (needsCollege && !formData.college) ||
      (needsDept && !formData.department)) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please fill in all required fields.' });
      return;
    }

    const nameRegex = /\d/;
    if (nameRegex.test(formData.firstName) || nameRegex.test(formData.lastName)) {
      toast({ variant: 'destructive', title: 'Invalid character in name', description: 'First and last names cannot contain numbers.' });
      return;
    }

    setIsProcessing(true);
    toast({ title: 'Processing', description: `Adding ${formData.firstName} ${formData.lastName}...` });
    const newId = await addUser({
      ...formData,
      isApproved: true,
      notificationsEnabled: true,
    }, generatedPassword || undefined);

    if (newId) {
      toast({ 
        title: 'User Added', 
        description: generatedPassword 
          ? `${formData.firstName} ${formData.lastName} has been added. Password: ${generatedPassword}`
          : `${formData.firstName} ${formData.lastName} has been added.`,
        duration: generatedPassword ? 10000 : 3000,
      });
    } else {
      toast({ variant: 'destructive', title: 'Error', description: `Failed to add user.` });
    }
    setIsProcessing(false);
    setIsAddDialogOpen(false);
    resetForm();
  };

  // Updating existing user
  const handleEditUser = async () => {
    if (!selectedUser) return;

    // Updated validation based on role
    const needsCollege = !['admin', 'citl', 'vpaa'].includes(formData.role);
    const needsDept = !['admin', 'dean', 'citl', 'vpaa'].includes(formData.role);

    if (!formData.firstName || !formData.lastName || !formData.email ||
      (needsCollege && !formData.college) ||
      (needsDept && !formData.department)) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please fill in all required fields.' });
      return;
    }

    const nameRegex = /\d/;
    if (nameRegex.test(formData.firstName) || nameRegex.test(formData.lastName)) {
      toast({ variant: 'destructive', title: 'Invalid character in name', description: 'First and last names cannot contain numbers.' });
      return;
    }

    setIsProcessing(true);
    toast({ title: 'Processing', description: `Updating ${formData.firstName} ${formData.lastName}...` });
    const success = await updateUser(selectedUser.id, formData, undefined, generatedPassword || undefined);
    
    if (success) {
      toast({ 
        title: 'User Updated', 
        description: generatedPassword 
          ? `${formData.firstName} ${formData.lastName} has been updated. New password: ${generatedPassword}`
          : `${formData.firstName} ${formData.lastName} has been updated.`,
        duration: generatedPassword ? 10000 : 3000,
      });
    } else {
      toast({ variant: 'destructive', title: 'Error', description: `Failed to update user.` });
    }

    setIsProcessing(false);
    setIsEditDialogOpen(false);
    setSelectedUser(null);
    setGeneratedPassword('');
    setShowPassword(false);
    resetForm();
  };

  // Opening edit dialog with user data pre-filled
  const openEditDialog = (user: User) => {
    setSelectedUser(user);
    setFormData({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      college: user.college,
      department: user.department,
    });
    setGeneratedPassword('');
    setShowPassword(false);
    setIsEditDialogOpen(true);
  };

  // Resetting form to initial state
  const resetForm = () => {
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      role: 'faculty',
      college: '',
      department: '',
    });
    setGeneratedPassword('');
    setShowPassword(false);
  };

  // Filter existing users based on current filters
  const filteredUsers = useMemo(() => {
    return allUsers.filter(user => {
      // ONLY SHOW ACTIVE/APPROVED USERS IN THE EXISTING TAB
      if (user.isActive === false && user.status !== 'archived') return false;

      const matchesSearch =
        user.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (user.employeeId || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      const matchesCollege = collegeFilter === 'all' || user.college === collegeFilter;
      const matchesDepartment = departmentFilter === 'all' || user.department === departmentFilter;

      let matchesStatus = true;
      if (statusFilter === 'active') {
        matchesStatus = !user.isLocked && user.status !== 'archived';
      } else if (statusFilter === 'locked') {
        matchesStatus = !!user.isLocked;
      } else if (statusFilter === 'archived') {
        matchesStatus = user.status === 'archived';
      }

      return matchesSearch && matchesRole && matchesCollege && matchesDepartment && matchesStatus;
    });
  }, [allUsers, searchQuery, roleFilter, collegeFilter, departmentFilter, statusFilter]);

  // Filter pending users separately
  const filteredPendingUsers = useMemo(() => {
    return pendingUsers.filter(user => {
      const matchesSearch =
        user.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (user.employeeId || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      const matchesCollege = collegeFilter === 'all' || user.college === collegeFilter;
      const matchesDepartment = departmentFilter === 'all' || user.department === departmentFilter;

      let matchesStatus = true;
      if (statusFilter === 'active') {
        matchesStatus = !user.isLocked && user.status !== 'archived';
      } else if (statusFilter === 'locked') {
        matchesStatus = !!user.isLocked;
      } else if (statusFilter === 'archived') {
        matchesStatus = user.status === 'archived';
      }

      return matchesSearch && matchesRole && matchesCollege && matchesDepartment && matchesStatus;
    });
  }, [pendingUsers, searchQuery, roleFilter, collegeFilter, departmentFilter, statusFilter]);

  // Sort pending users by name
  const sortedPendingUsers = useMemo(() => {
    if (!pendingSortOrder) return filteredPendingUsers;

    return [...filteredPendingUsers].sort((a, b) => {
      const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
      const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();

      if (pendingSortOrder === 'asc') {
        return nameA.localeCompare(nameB);
      } else {
        return nameB.localeCompare(nameA);
      }
    });
  }, [filteredPendingUsers, pendingSortOrder]);

  // Sort existing users by name
  const sortedExistingUsers = useMemo(() => {
    if (!existingSortOrder) return filteredUsers;

    return [...filteredUsers].sort((a, b) => {
      const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
      const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();

      if (existingSortOrder === 'asc') {
        return nameA.localeCompare(nameB);
      } else {
        return nameB.localeCompare(nameA);
      }
    });
  }, [filteredUsers, existingSortOrder]);

  // Toggle sort order for pending users
  const togglePendingSort = () => {
    if (pendingSortOrder === null) {
      setPendingSortOrder('asc');
    } else if (pendingSortOrder === 'asc') {
      setPendingSortOrder('desc');
    } else {
      setPendingSortOrder(null);
    }
  };

  // Toggle sort order for existing users
  const toggleExistingSort = () => {
    if (existingSortOrder === null) {
      setExistingSortOrder('asc');
    } else if (existingSortOrder === 'asc') {
      setExistingSortOrder('desc');
    } else {
      setExistingSortOrder(null);
    }
  };

  // Pagination calculations
  const totalExistingPages = Math.ceil(sortedExistingUsers.length / itemsPerPage);
  const totalPendingPages = Math.ceil(sortedPendingUsers.length / itemsPerPage);

  // Getting current page items - reusable for both user lists
  const getCurrentPagePendingItems = () => {
    const startIndex = (currentPendingPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return sortedPendingUsers.slice(startIndex, endIndex);
  };

  const getCurrentPageExistingItems = () => {
    const startIndex = (currentExistingPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return sortedExistingUsers.slice(startIndex, endIndex);
  };

  // Reset to page 1 whenever filters change
  React.useEffect(() => {
    setCurrentPendingPage(1);
    setCurrentExistingPage(1);
  }, [searchQuery, roleFilter, statusFilter, collegeFilter, departmentFilter]);

  // Helper function to truncate text with ellipsis
  const truncateText = (text: string, maxLength: number = 25) => {
    if (!text || text === '-') return '-';
    if (text.length <= maxLength) return text;

    // Find the last space before maxLength to avoid cutting words
    const lastSpace = text.lastIndexOf(' ', maxLength - 3);
    const cutPoint = lastSpace > maxLength - 10 ? lastSpace : maxLength - 3;

    return text.substring(0, cutPoint) + '...';
  };

  // Helper function to shorten college/department names
  const shortenText = (text: string, maxLength: number = 25) => {
    if (!text || text === '-') return '-';

    // Remove common prefixes
    let shortened = text
      .replace('College of ', '')
      .replace('Department of ', '')
      .replace('Center for ', '')
      .replace('School of ', '');

    // Truncate if still too long
    return truncateText(shortened, maxLength);
  };

  const getRoleBadge = (role: UserRole) => {
    return (
      <Badge variant="secondary" className="font-medium text-xs whitespace-nowrap">
        {ROLE_LABELS[role] || role}
      </Badge>
    );
  };

  const getStatusBadge = (user: User) => {
    if (user.status === 'archived') {
      return (
        <Badge variant="outline" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25 text-xs gap-1 font-medium whitespace-nowrap">
          <Archive className="h-3 w-3" />
          Archived
        </Badge>
      );
    }
    if (user.isLocked) {
      return (
        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25 text-xs gap-1 font-medium whitespace-nowrap">
          <Lock className="h-3 w-3" />
          Locked
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 text-xs gap-1.5 font-medium whitespace-nowrap">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Active
      </Badge>
    );
  };

  // Mobile Card Component - Updated without profile icon
  const UserCard = ({ user, type = 'existing' }: { user: User; type?: 'pending' | 'existing' }) => (
    <Card key={user.id} className="overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        {/* Removed the profile icon section */}
        <div className="mb-3">
          <h3 className="font-semibold text-foreground">{user.firstName} {user.lastName}</h3>
          {user.employeeId && (
            <span className="inline-block mt-1 text-xs font-mono font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded">
              {user.employeeId}
            </span>
          )}
          <div className="flex items-center gap-1 mt-1">
            <Mail className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{user.email}</span>
          </div>
        </div>

        {/* Rest of the component remains the same */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Role</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="text-xs">
                {ROLE_LABELS[user.role]}
              </Badge>
              {user.status === 'archived' && (
                <Badge variant="destructive" className="text-xs">Archived</Badge>
              )}
              {user.isLocked && (
                <Badge variant="destructive" className="text-xs">Locked</Badge>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">College</p>
            <p className="text-sm truncate" title={user.college}>
              {shortenText(user.college, 20)}
            </p>
          </div>
        </div>

        {user.department && (
          <div className="mb-3">
            <p className="text-xs text-muted-foreground mb-1">Program</p>
            <p className="text-sm truncate" title={user.department}>
              {shortenText(user.department, 25)}
            </p>
          </div>
        )}

        <div className="flex gap-2 pt-3 border-t">
          {type === 'pending' ? (
            <>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => openApproveConfirm(user.id, `${user.firstName} ${user.lastName}`)}
                className="flex-1 gap-1"
                disabled={isProcessing}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {isProcessing && userToAction?.id === user.id && userToAction?.type === 'approve' ? 'Approving...' : 'Approve'}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => openRejectConfirm(user.id, `${user.firstName} ${user.lastName}`)}
                className="flex-1 gap-1"
                disabled={isProcessing}
              >
                <XCircle className="h-3.5 w-3.5" />
                {isProcessing && userToAction?.id === user.id && userToAction?.type === 'reject' ? 'Rejecting...' : 'Reject'}
              </Button>
            </>
          ) : (
            <>
              {user.status === 'archived' ? (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={async () => {
                    setIsProcessing(true);
                    toast({ title: 'Processing', description: `Unarchiving ${user.firstName}...` });
                    const success = await unarchiveUser(user.id);
                    if (success) {
                      toast({ title: 'User Unarchived', description: `${user.firstName} ${user.lastName} is now active.` });
                    } else {
                      toast({ variant: 'destructive', title: 'Error', description: `Failed to unarchive ${user.firstName}.` });
                    }
                    setIsProcessing(false);
                  }}
                  className="flex-1 gap-1"
                  disabled={isProcessing}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {isProcessing ? 'Processing...' : 'Unarchive'}
                </Button>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(user)}
                      className="w-full gap-1 px-1 text-xs"
                      disabled={isProcessing}
                    >
                      <Pencil className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">Edit</span>
                    </Button>
                    {user.isLocked ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openUnlockConfirm(user.id, `${user.firstName} ${user.lastName}`)}
                        className="w-full gap-1 px-1 text-xs text-emerald-600 border-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                        disabled={isProcessing}
                      >
                        <Unlock className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">Unlock</span>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openLockConfirm(user.id, `${user.firstName} ${user.lastName}`)}
                        className="w-full gap-1 px-1 text-xs text-orange-600 border-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                        disabled={isProcessing}
                      >
                        <Lock className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">Lock</span>
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => openArchiveConfirm(user.id, `${user.firstName} ${user.lastName}`)}
                      className="w-full gap-1 px-1 text-xs col-span-2 sm:col-span-1"
                      disabled={isProcessing}
                    >
                      <Archive className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">Archive</span>
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );

  // Pagination component - reusable for both tabs (matching Reports page layout)
  const Pagination = ({ totalPages, currentPage, onPageChange, itemsCount, tabType }: {
    totalPages: number;
    currentPage: number;
    onPageChange: (page: number) => void;
    itemsCount: number;
    tabType: 'pending' | 'existing';
  }) => {
    if (totalPages <= 1 && itemsCount === 0) return null;

    // Get the range of items being shown
    const startIndex = (currentPage - 1) * itemsPerPage + 1;
    const endIndex = Math.min(currentPage * itemsPerPage, itemsCount);

    // Generating page numbers with ellipsis for large page counts
    const getPageNumbers = () => {
      const pages = [];
      const maxVisible = 5;

      if (totalPages <= maxVisible) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
      } else {
        if (currentPage <= 3) {
          pages.push(1, 2, 3, 4, '...', totalPages);
        } else if (currentPage >= totalPages - 2) {
          pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
        } else {
          pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
        }
      }
      return pages;
    };

    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 mt-3 border-t border-border/70">
        {/* Showing X to Y of Z records */}
        <div className="text-xs text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{startIndex}</span> to{' '}
          <span className="font-semibold text-foreground">{endIndex}</span> of{' '}
          <span className="font-semibold text-foreground">{itemsCount}</span>{' '}
          {tabType === 'pending' ? 'pending users' : 'users'}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onPageChange(1)}
              disabled={currentPage === 1}
              className="h-8 w-8 p-0"
              title="First page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="h-8 w-8 p-0"
              title="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {getPageNumbers().map((page, index) => (
              page === '...' ? (
                <span key={`dots-${index}`} className="px-2 text-xs text-muted-foreground">...</span>
              ) : (
                <Button
                  type="button"
                  key={page}
                  variant={currentPage === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => onPageChange(page as number)}
                  className="h-8 w-8 p-0 text-xs"
                >
                  {page}
                </Button>
              )
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="h-8 w-8 p-0"
              title="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onPageChange(totalPages)}
              disabled={currentPage === totalPages}
              className="h-8 w-8 p-0"
              title="Last page"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">Manage Users</h1>
          <p className="text-muted-foreground text-sm">Manage user registrations and accounts</p>
        </div>

        {/* Add User Button */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 h-9 text-xs">
              <Plus className="h-4 w-4" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg p-5">
            <DialogHeader className="pb-1">
              <DialogTitle className="text-base font-semibold">Add New User</DialogTitle>
              <DialogDescription className="text-xs">
                Create a new user account. The user will be able to log in immediately.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-1">
              {/* Row 1: First Name & Last Name */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="add-firstName" className="text-xs font-medium">
                    First Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="add-firstName"
                    value={formData.firstName}
                    onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                    placeholder="John"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="add-lastName" className="text-xs font-medium">
                    Last Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="add-lastName"
                    value={formData.lastName}
                    onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                    placeholder="Doe"
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              {/* Row 2: Email & Role */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="add-email" className="text-xs font-medium">
                    Email <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="add-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="john.doe@sulundan.edu"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="add-role" className="text-xs font-medium">
                    Role <span className="text-destructive">*</span>
                  </Label>
                  <Select value={formData.role} onValueChange={(value: UserRole) => setFormData(prev => ({ ...prev, role: value }))}>
                    <SelectTrigger className="h-8 text-sm text-left">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {ACCOUNT_ROLES.map((r) => (
                        <SelectItem key={r} value={r} className="text-sm">{ROLE_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 3: College & Program */}
              {!['admin', 'citl', 'vpaa'].includes(formData.role) && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="add-college" className="text-xs font-medium">
                      College <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={formData.college}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, college: value, department: '' }))}
                    >
                      <SelectTrigger className="h-8 text-sm text-left">
                        <SelectValue placeholder="Select college" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[200px]">
                        {COLLEGES.map((college) => (
                          <SelectItem key={college} value={college} className="text-sm">{college}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {!['dean'].includes(formData.role) && (
                    <div className="space-y-1">
                      <Label htmlFor="add-department" className="text-xs font-medium">
                        Program <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={formData.department}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, department: value }))}
                        disabled={!formData.college || !DEPARTMENTS[formData.college]}
                      >
                        <SelectTrigger className="h-8 text-sm text-left">
                          <SelectValue placeholder={!formData.college ? "Select college first" : "Select program"} />
                        </SelectTrigger>
                        <SelectContent className="max-h-[200px]">
                          {formData.college && DEPARTMENTS[formData.college]?.map((dept) => (
                            <SelectItem key={dept} value={dept} className="text-sm">{dept}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {/* Row 4: Password Generator Section */}
              <div className="space-y-1.5 pt-1 border-t">
                <div className="flex items-center justify-between">
                  <Label htmlFor="add-password" className="text-xs font-medium">
                    Initial Password <span className="text-muted-foreground font-normal">(Optional)</span>
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={generatePassword}
                    className="h-7 text-xs gap-1.5 px-2 text-primary hover:text-primary hover:bg-primary/5"
                  >
                    <Key className="h-3 w-3" />
                    Generate
                  </Button>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <Input
                      id="add-password"
                      value={generatedPassword}
                      onChange={(e) => setGeneratedPassword(e.target.value)}
                      type={showPassword ? "text" : "password"}
                      className="h-8 text-sm font-mono pr-8"
                      placeholder="Enter or generate initial password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={!generatedPassword}
                    onClick={copyPasswordToClipboard}
                    className="h-8 w-8 shrink-0"
                    title="Copy password"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)} className="h-8 text-sm" disabled={isProcessing}>Cancel</Button>
              <Button type="button" onClick={handleAddUser} className="h-8 text-sm" disabled={isProcessing}>
                {isProcessing ? 'Adding...' : 'Add User'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters Card */}
      <Card className="shadow-soft">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between min-h-9">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Filters</CardTitle>
            </div>
            {hasActiveFilters ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                <X className="h-4 w-4 mr-1" />
                Clear all
              </Button>
            ) : (
              <div className="h-9"></div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            {/* Search input */}
            <div className="relative sm:col-span-2 lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search user or email (e.g. John Doe, jdoe@ustp.edu.ph)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10"
              />
            </div>

            {/* Status filter */}
            <div className="relative">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10 w-full min-w-0">
                  <div className="flex items-center w-full overflow-hidden">
                    <CheckCircle2 className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">
                      <SelectValue placeholder="Status" />
                    </span>
                  </div>
                </SelectTrigger>
                <SelectContent className="max-h-[300px] min-w-[var(--radix-select-trigger-width)]">
                  <SelectItem value="all" className="text-sm truncate">All Statuses</SelectItem>
                  <SelectItem value="active" className="text-sm truncate">Active</SelectItem>
                  <SelectItem value="locked" className="text-sm truncate">Locked</SelectItem>
                  <SelectItem value="archived" className="text-sm truncate">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Role filter */}
            <div className="relative">
              <Select value={roleFilter} onValueChange={(value) => {
                setRoleFilter(value);
                // If admin role is selected, reset college and department filters
                if (value === 'admin' || value === 'citl' || value === 'vpaa') {
                  setCollegeFilter('all');
                  setDepartmentFilter('all');
                }
              }}>
                <SelectTrigger className="h-10 w-full min-w-0">
                  <div className="flex items-center w-full overflow-hidden">
                    <Users className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">
                      <SelectValue placeholder="Role" />
                    </span>
                  </div>
                </SelectTrigger>
                <SelectContent className="max-h-[300px] min-w-[var(--radix-select-trigger-width)]">
                  <SelectItem value="all" className="text-sm truncate">All Roles</SelectItem>
                  {ACCOUNT_ROLES.map((r) => (
                    <SelectItem key={r} value={r} className="text-sm truncate">
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* College filter */}
            <div className="relative">
              <Select
                value={collegeFilter}
                onValueChange={(value) => {
                  setCollegeFilter(value);
                  setDepartmentFilter('all');
                }}
                disabled={isAdminRoleSelected}
              >
                <SelectTrigger className="h-10 w-full min-w-0">
                  <div className="flex items-center w-full overflow-hidden">
                    <Building2 className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">
                      <SelectValue
                        placeholder={isAdminRoleSelected ? "Not applicable for selected role" : "College"}
                      />
                    </span>
                  </div>
                </SelectTrigger>
                <SelectContent className="max-h-[300px] min-w-[var(--radix-select-trigger-width)]">
                  <SelectItem value="all" className="text-sm truncate">All Colleges</SelectItem>
                  {COLLEGES.map(college => (
                    <SelectItem key={college} value={college} className="text-sm truncate">
                      {college}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Department filter */}
            <div className="relative">
              <Select
                value={departmentFilter}
                onValueChange={setDepartmentFilter}
                disabled={isAdminRoleSelected || collegeFilter === 'all' || availableDepartments.length === 0}
              >
                <SelectTrigger className="h-10 w-full min-w-0">
                  <div className="flex items-center w-full overflow-hidden">
                    <Filter className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">
                      <SelectValue
                        placeholder={
                          isAdminRoleSelected ? "Not applicable for selected role" :
                            collegeFilter === 'all' || availableDepartments.length === 0 ?
                              "Select college first" : "Program"
                        }
                      />
                    </span>
                  </div>
                </SelectTrigger>
                <SelectContent className="max-h-[300px] min-w-[var(--radix-select-trigger-width)]">
                  <SelectItem value="all" className="text-sm truncate">All Programs</SelectItem>
                  {availableDepartments.map(dept => (
                    <SelectItem key={dept} value={dept} className="text-sm truncate">
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for Pending and Existing Users */}
      <Tabs value={activeTab} className="space-y-4" onValueChange={(val) => {
        setActiveTab(val);
        setCurrentPendingPage(1);
        setCurrentExistingPage(1);
        setPendingSortOrder(null);
        setExistingSortOrder(null);
      }}>
        <TabsList className="grid w-full grid-cols-3 max-w-2xl h-10">
          <TabsTrigger value="pending" className="gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4" />
            Pending Approval ({filteredPendingUsers.length})
          </TabsTrigger>
          <TabsTrigger value="existing" className="gap-2 text-sm">
            <Users className="h-4 w-4" />
            Existing Users ({filteredUsers.length})
          </TabsTrigger>
          <TabsTrigger value="requests" className="gap-2 text-sm">
            <Mail className="h-4 w-4" />
            Change Requests ({requests.length})
          </TabsTrigger>
        </TabsList>

        {/* Pending Users Tab */}
        <TabsContent value="pending">
          <Card className="shadow-soft">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CheckCircle2 className="h-5 w-5" />
                  Pending Registration Approval
                </CardTitle>
                {hasActiveFilters && filteredPendingUsers.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {filteredPendingUsers.length} result{filteredPendingUsers.length !== 1 ? 's' : ''} found
                    </span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {filteredPendingUsers.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No pending users</h3>
                  <p className="text-muted-foreground">All user registrations have been processed.</p>
                </div>
              ) : (
                <>
                  {/* Mobile Cards View - hidden on large screens */}
                  <div className="lg:hidden space-y-3">
                    {getCurrentPagePendingItems().map((user) => (
                      <UserCard key={user.id} user={user} type="pending" />
                    ))}
                  </div>

                  {/* Desktop Table View - hidden on mobile */}
                  <div className="hidden lg:block min-h-[550px]">
                    <div className="rounded-xl border border-border/70 overflow-hidden shadow-xs">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/60 hover:bg-muted/60">
                            <TableHead className="font-semibold text-xs py-3 px-4 w-[90px]">ID</TableHead>
                            <TableHead className="font-semibold text-xs py-3 px-4">
                              <button
                                type="button"
                                className="flex items-center gap-1.5 font-semibold text-xs hover:text-primary transition-colors cursor-pointer group"
                                onClick={togglePendingSort}
                              >
                                <span>User</span>
                                <div className="p-0.5 rounded group-hover:bg-muted transition-colors">
                                  {pendingSortOrder === 'asc' ? (
                                    <ChevronUp className="h-3.5 w-3.5 text-primary" />
                                  ) : pendingSortOrder === 'desc' ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-primary" />
                                  ) : (
                                    <ArrowUpDown className="h-3 w-3 text-muted-foreground/60" />
                                  )}
                                </div>
                              </button>
                            </TableHead>
                            <TableHead className="font-semibold text-xs py-3 px-4 w-[140px]">Role</TableHead>
                            <TableHead className="font-semibold text-xs py-3 px-4">Academic Unit</TableHead>
                            <TableHead className="font-semibold text-xs py-3 px-4 w-[190px] text-center">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {getCurrentPagePendingItems().map((user) => (
                            <TableRow key={user.id} className="border-b border-border/50 hover:bg-muted/40 transition-colors">
                              <TableCell className="py-3 px-4">
                                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 whitespace-nowrap">
                                  {user.employeeId || '—'}
                                </span>
                              </TableCell>
                              <TableCell className="py-3 px-4">
                                <div className="flex items-center gap-3">
                                  <div className="h-9 w-9 rounded-full bg-primary/10 text-primary font-semibold text-xs flex items-center justify-center shrink-0 border border-primary/20">
                                    {(user.firstName?.[0] || '').toUpperCase()}{(user.lastName?.[0] || '').toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-medium text-sm text-foreground truncate">
                                      {user.firstName} {user.lastName}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate" title={user.email}>
                                      {user.email}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="py-3 px-4">
                                {getRoleBadge(user.role)}
                              </TableCell>
                              <TableCell className="py-3 px-4">
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-foreground truncate" title={user.college}>
                                    {user.college || '—'}
                                  </p>
                                  {user.department && (
                                    <p className="text-[11px] text-muted-foreground truncate mt-0.5" title={user.department}>
                                      {user.department}
                                    </p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="py-3 px-4">
                                <div className="flex items-center justify-center gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => openApproveConfirm(user.id, `${user.firstName} ${user.lastName}`)}
                                    className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-xs transition-all"
                                    disabled={isProcessing}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    {isProcessing && userToAction?.id === user.id && userToAction?.type === 'approve' ? 'Approving...' : 'Approve'}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => openRejectConfirm(user.id, `${user.firstName} ${user.lastName}`)}
                                    className="h-8 px-3 text-xs gap-1.5 shadow-xs transition-all"
                                    disabled={isProcessing}
                                  >
                                    <XCircle className="h-3.5 w-3.5" />
                                    {isProcessing && userToAction?.id === user.id && userToAction?.type === 'reject' ? 'Rejecting...' : 'Reject'}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <Pagination
                    totalPages={totalPendingPages}
                    currentPage={currentPendingPage}
                    onPageChange={setCurrentPendingPage}
                    itemsCount={sortedPendingUsers.length}
                    tabType="pending"
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Existing Users Tab */}
        <TabsContent value="existing">
          <Card className="shadow-soft">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="h-5 w-5" />
                  Existing Users
                </CardTitle>
                {hasActiveFilters && filteredUsers.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {filteredUsers.length} result{filteredUsers.length !== 1 ? 's' : ''} found
                    </span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {filteredUsers.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No users found matching your filters.</p>
                </div>
              ) : (
                <>
                  {/* Mobile Cards View - hidden on large screens */}
                  <div className="lg:hidden space-y-3">
                    {getCurrentPageExistingItems().map((user) => (
                      <UserCard key={user.id} user={user} type="existing" />
                    ))}
                  </div>

                  {/* Desktop Table View - hidden on mobile */}
                  <div className="hidden lg:block min-h-[550px]">
                    <div className="rounded-xl border border-border/70 overflow-hidden shadow-xs">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/60 hover:bg-muted/60">
                            <TableHead className="font-semibold text-xs py-3 px-4 w-[90px]">ID</TableHead>
                            <TableHead className="font-semibold text-xs py-3 px-4">
                              <button
                                type="button"
                                className="flex items-center gap-1.5 font-semibold text-xs hover:text-primary transition-colors cursor-pointer group"
                                onClick={toggleExistingSort}
                              >
                                <span>User</span>
                                <div className="p-0.5 rounded group-hover:bg-muted transition-colors">
                                  {existingSortOrder === 'asc' ? (
                                    <ChevronUp className="h-3.5 w-3.5 text-primary" />
                                  ) : existingSortOrder === 'desc' ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-primary" />
                                  ) : (
                                    <ArrowUpDown className="h-3 w-3 text-muted-foreground/60" />
                                  )}
                                </div>
                              </button>
                            </TableHead>
                            <TableHead className="font-semibold text-xs py-3 px-4 w-[130px]">Role</TableHead>
                            <TableHead className="font-semibold text-xs py-3 px-4">Academic Unit</TableHead>
                            <TableHead className="font-semibold text-xs py-3 px-4 w-[110px]">Status</TableHead>
                            <TableHead className="font-semibold text-xs py-3 px-4 w-[210px] text-center">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {getCurrentPageExistingItems().map((user) => (
                            <TableRow key={user.id} className="border-b border-border/50 hover:bg-muted/40 transition-colors">
                              <TableCell className="py-3 px-4">
                                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 whitespace-nowrap">
                                  {user.employeeId || '—'}
                                </span>
                              </TableCell>
                              <TableCell className="py-3 px-4">
                                <div className="flex items-center gap-3">
                                  <div className="h-9 w-9 rounded-full bg-primary/10 text-primary font-semibold text-xs flex items-center justify-center shrink-0 border border-primary/20">
                                    {(user.firstName?.[0] || '').toUpperCase()}{(user.lastName?.[0] || '').toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-medium text-sm text-foreground truncate">
                                      {user.firstName} {user.lastName}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate" title={user.email}>
                                      {user.email}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="py-3 px-4">
                                {getRoleBadge(user.role)}
                              </TableCell>
                              <TableCell className="py-3 px-4">
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-foreground truncate" title={user.college}>
                                    {user.college || '—'}
                                  </p>
                                  {user.department && (
                                    <p className="text-[11px] text-muted-foreground truncate mt-0.5" title={user.department}>
                                      {user.department}
                                    </p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="py-3 px-4">
                                {getStatusBadge(user)}
                              </TableCell>
                              <TableCell className="py-3 px-4">
                                <div className="flex items-center justify-center gap-1.5">
                                  {user.status === 'archived' ? (
                                    <Button
                                      type="button"
                                      variant="default"
                                      size="sm"
                                      onClick={async () => {
                                        setIsProcessing(true);
                                        toast({ title: 'Processing', description: `Unarchiving ${user.firstName}...` });
                                        const success = await unarchiveUser(user.id);
                                        if (success) {
                                          toast({ title: 'User Unarchived', description: `${user.firstName} ${user.lastName} is now active.` });
                                        } else {
                                          toast({ variant: 'destructive', title: 'Error', description: `Failed to unarchive ${user.firstName}.` });
                                        }
                                        setIsProcessing(false);
                                      }}
                                      className="h-8 px-3 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                                      disabled={isProcessing}
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      {isProcessing ? '...' : 'Unarchive'}
                                    </Button>
                                  ) : (
                                    <>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => openEditDialog(user)}
                                        className="h-8 px-2.5 text-xs gap-1 hover:bg-accent"
                                        disabled={isProcessing}
                                        title="Edit user details"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                        <span>Edit</span>
                                      </Button>
                                      {user.isLocked ? (
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          onClick={() => openUnlockConfirm(user.id, `${user.firstName} ${user.lastName}`)}
                                          className="h-8 px-2.5 text-xs gap-1 text-emerald-600 border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                                          disabled={isProcessing}
                                          title="Unlock user account"
                                        >
                                          <Unlock className="h-3.5 w-3.5" />
                                          <span>Unlock</span>
                                        </Button>
                                      ) : (
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          onClick={() => openLockConfirm(user.id, `${user.firstName} ${user.lastName}`)}
                                          className="h-8 px-2.5 text-xs gap-1 text-amber-600 border-amber-500/30 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                                          disabled={isProcessing}
                                          title="Lock user account"
                                        >
                                          <Lock className="h-3.5 w-3.5" />
                                          <span>Lock</span>
                                        </Button>
                                      )}
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => openArchiveConfirm(user.id, `${user.firstName} ${user.lastName}`)}
                                        className="h-8 px-2.5 text-xs gap-1 text-rose-600 border-rose-500/30 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                                        disabled={isProcessing}
                                        title="Archive user"
                                      >
                                        <Archive className="h-3.5 w-3.5" />
                                        <span>Archive</span>
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <Pagination
                    totalPages={totalExistingPages}
                    currentPage={currentExistingPage}
                    onPageChange={setCurrentExistingPage}
                    itemsCount={sortedExistingUsers.length}
                    tabType="existing"
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Change Requests Tab */}
        <TabsContent value="requests">
          <Card className="shadow-soft">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Mail className="h-5 w-5" />
                  Role/Assignment Change Requests
                </CardTitle>
                <span className="text-sm text-muted-foreground">{requests.length} pending</span>
              </div>
            </CardHeader>
            <CardContent>
              {requests.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No pending requests</h3>
                  <p className="text-muted-foreground">All change requests have been processed.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-border/70 overflow-hidden shadow-xs">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/60 hover:bg-muted/60">
                        <TableHead className="font-semibold text-xs py-3 px-4">User</TableHead>
                        <TableHead className="font-semibold text-xs py-3 px-4 w-[160px]">Request Type</TableHead>
                        <TableHead className="font-semibold text-xs py-3 px-4">Requested Changes</TableHead>
                        <TableHead className="font-semibold text-xs py-3 px-4 w-[190px] text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requests.map((r) => (
                        <TableRow key={r.id} className="border-b border-border/50 hover:bg-muted/40 transition-colors">
                          <TableCell className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-full bg-primary/10 text-primary font-semibold text-xs flex items-center justify-center shrink-0 border border-primary/20">
                                {(r.userName?.[0] || 'U').toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-sm text-foreground truncate">{r.userName}</p>
                                <p className="text-xs text-muted-foreground truncate">{r.userEmail}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-3 px-4">
                            <Badge variant="outline" className="text-xs font-medium bg-muted/60">
                              {r.type === 'both' ? 'Role & Academic Unit' : r.type === 'role' ? 'Role Change' : 'Academic Unit'}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-3 px-4">
                            <div className="space-y-1 text-xs">
                              {(r.type === 'role' || r.type === 'both') && r.requestedRole && (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-muted-foreground">New Role:</span>
                                  {getRoleBadge(r.requestedRole as UserRole)}
                                </div>
                              )}
                              {(r.type === 'college_department' || r.type === 'both') && (
                                <div className="text-xs">
                                  <span className="text-muted-foreground">Unit: </span>
                                  <span className="font-medium text-foreground">{r.requestedCollege || ''}</span>
                                  {r.requestedDepartment && (
                                    <span className="text-muted-foreground"> / {r.requestedDepartment}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-3 px-4">
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => handleApproveRequest(r.id, r.userName)}
                                className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-xs"
                                disabled={isProcessing}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                {isProcessing ? '...' : 'Approve'}
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => handleRejectRequest(r.id, r.userName)}
                                className="h-8 px-3 text-xs gap-1.5 shadow-xs"
                                disabled={isProcessing}
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                {isProcessing ? '...' : 'Reject'}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-lg p-5">
          <DialogHeader className="pb-1">
            <DialogTitle className="text-base font-semibold">Edit User</DialogTitle>
            <DialogDescription className="text-xs">
              Update user account information. Generate a new password if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {/* Row 1: First Name & Last Name */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-firstName" className="text-xs font-medium">
                  First Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edit-firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                  placeholder="John"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-lastName" className="text-xs font-medium">
                  Last Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edit-lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                  placeholder="Doe"
                  className="h-8 text-sm"
                />
              </div>
            </div>

            {/* Row 2: Email & Role */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-email" className="text-xs font-medium">
                  Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="john.doe@sulundan.edu"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-role" className="text-xs font-medium">
                  Role <span className="text-destructive">*</span>
                </Label>
                <Select value={formData.role} onValueChange={(value: UserRole) => setFormData(prev => ({ ...prev, role: value }))}>
                  <SelectTrigger className="h-8 text-sm text-left">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {ACCOUNT_ROLES.map((r) => (
                      <SelectItem key={r} value={r} className="text-sm">{ROLE_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 3: College & Program */}
            {!['admin', 'citl', 'vpaa'].includes(formData.role) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="edit-college" className="text-xs font-medium">
                    College <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={formData.college}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, college: value, department: '' }))}
                  >
                    <SelectTrigger className="h-8 text-sm text-left">
                      <SelectValue placeholder="Select college" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {COLLEGES.map((college) => (
                        <SelectItem key={college} value={college} className="text-sm">{college}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!['dean'].includes(formData.role) && (
                  <div className="space-y-1">
                    <Label htmlFor="edit-department" className="text-xs font-medium">
                      Program <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={formData.department}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, department: value }))}
                      disabled={!formData.college || !DEPARTMENTS[formData.college]}
                    >
                      <SelectTrigger className="h-8 text-sm text-left">
                        <SelectValue placeholder={!formData.college ? "Select college first" : "Select program"} />
                      </SelectTrigger>
                      <SelectContent className="max-h-[200px]">
                        {formData.college && DEPARTMENTS[formData.college]?.map((dept) => (
                          <SelectItem key={dept} value={dept} className="text-sm">{dept}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {/* Row 4: Password Reset Section */}
            <div className="space-y-1.5 pt-1 border-t">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-password" className="text-xs font-medium">
                  New Password <span className="text-muted-foreground font-normal">(Leave blank to keep current)</span>
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={generatePassword}
                  className="h-7 text-xs gap-1.5 px-2 text-primary hover:text-primary hover:bg-primary/5"
                >
                  <Key className="h-3 w-3" />
                  Generate
                </Button>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <Input
                    id="edit-password"
                    value={generatedPassword}
                    onChange={(e) => setGeneratedPassword(e.target.value)}
                    type={showPassword ? "text" : "password"}
                    className="h-8 text-sm font-mono pr-8"
                    placeholder="Enter or generate new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={!generatedPassword}
                  onClick={copyPasswordToClipboard}
                  className="h-8 w-8 shrink-0"
                  title="Copy password"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)} className="h-8 text-sm" disabled={isProcessing}>Cancel</Button>
            <Button type="button" onClick={handleEditUser} className="h-8 text-sm" disabled={isProcessing}>
              {isProcessing ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Confirmation Dialog */}
      <Dialog open={isArchiveConfirmOpen} onOpenChange={setIsArchiveConfirmOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Archive User
            </DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to archive this user?
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive" className="bg-destructive/10">
            <AlertDescription className="text-sm">
              Archiving <span className="font-semibold">{userToAction?.name}</span> will:
              <ul className="list-disc pl-5 mt-2 space-y-1 text-xs">
                <li>Remove the user from active lists</li>
                <li>Preserve their data in the system</li>
                <li>Prevent them from logging in</li>
                <li>Can be restored by an administrator if needed</li>
              </ul>
            </AlertDescription>
          </Alert>
          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsArchiveConfirmOpen(false)}
              className="h-8 text-sm"
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleArchiveConfirm}
              className="h-8 text-sm"
              disabled={isProcessing}
            >
              {isProcessing ? 'Archiving...' : 'Archive User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Confirmation Dialog */}
      <Dialog open={isApproveConfirmOpen} onOpenChange={setIsApproveConfirmOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              Approve User
            </DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to approve this user registration?
            </DialogDescription>
          </DialogHeader>
          <Alert className="bg-success/10 border-success/20">
            <AlertDescription className="text-sm">
              Approving <span className="font-semibold">{userToAction?.name}</span> will:
              <ul className="list-disc pl-5 mt-2 space-y-1 text-xs">
                <li>Grant them access to log in to the system</li>
                <li>Allow them to create and manage syllabi</li>
                <li>Send them a confirmation email (if configured)</li>
                <li>Move them to the active users list</li>
              </ul>
            </AlertDescription>
          </Alert>
          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsApproveConfirmOpen(false)}
              className="h-8 text-sm"
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={handleApproveConfirm}
              className="h-8 text-sm bg-success hover:bg-success/90"
              disabled={isProcessing}
            >
              {isProcessing ? 'Approving...' : 'Approve User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Confirmation Dialog */}
      <Dialog open={isRejectConfirmOpen} onOpenChange={setIsRejectConfirmOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-base flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Reject User
            </DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to reject this user registration?
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive" className="bg-destructive/10">
            <AlertDescription className="text-sm">
              Rejecting <span className="font-semibold">{userToAction?.name}</span> will:
              <ul className="list-disc pl-5 mt-2 space-y-1 text-xs">
                <li>Permanently delete their registration request</li>
                <li>Remove them from the pending users list</li>
                <li>Send them a rejection email (if configured)</li>
                <li>Require them to submit a new registration if they want to join</li>
              </ul>
            </AlertDescription>
          </Alert>
          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsRejectConfirmOpen(false)}
              className="h-8 text-sm"
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleRejectConfirm}
              className="h-8 text-sm"
              disabled={isProcessing}
            >
              {isProcessing ? 'Rejecting...' : 'Reject User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lock Confirmation Dialog */}
      <Dialog open={isLockConfirmOpen} onOpenChange={setIsLockConfirmOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-base flex items-center gap-2">
              <Lock className="h-5 w-5 text-orange-600" />
              Lock User
            </DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to lock this user account?
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive" className="bg-orange-600/10 text-orange-600 border-orange-600/20">
            <AlertDescription className="text-sm">
              Locking <span className="font-semibold">{userToAction?.name}</span> will:
              <ul className="list-disc pl-5 mt-2 space-y-1 text-xs">
                <li>Immediately log them out if they are currently online</li>
                <li>Prevent any future logins until unlocked</li>
                <li>Display a prompt for them to contact an administrator</li>
              </ul>
            </AlertDescription>
          </Alert>
          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsLockConfirmOpen(false)}
              className="h-8 text-sm"
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={handleLockConfirm}
              className="h-8 text-sm bg-orange-600 hover:bg-orange-700 text-white"
              disabled={isProcessing}
            >
              {isProcessing ? 'Locking...' : 'Lock User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unlock Confirmation Dialog */}
      <Dialog open={isUnlockConfirmOpen} onOpenChange={setIsUnlockConfirmOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-base flex items-center gap-2">
              <Unlock className="h-5 w-5 text-emerald-600" />
              Unlock User
            </DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to unlock this user account?
            </DialogDescription>
          </DialogHeader>
          <Alert className="bg-emerald-600/10 text-emerald-700 border-emerald-600/20">
            <AlertDescription className="text-sm">
              Unlocking <span className="font-semibold">{userToAction?.name}</span> will:
              <ul className="list-disc pl-5 mt-2 space-y-1 text-xs">
                <li>Restore their ability to log into the system</li>
                <li>Allow them to resume their workflow</li>
              </ul>
            </AlertDescription>
          </Alert>
          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsUnlockConfirmOpen(false)}
              className="h-8 text-sm"
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={handleUnlockConfirm}
              className="h-8 text-sm bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={isProcessing}
            >
              {isProcessing ? 'Unlocking...' : 'Unlock User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

