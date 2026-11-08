import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { Syllabus, Notification, User, SyllabusStatus, ReviewAction, UserRole, ChangeRequest } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useSemester } from '@/contexts/SemesterContext';
import { isSyllabusInSemester } from '@/utils/semesterStorage';
import { io } from 'socket.io-client';
import { useToast } from '@/hooks/use-toast';

interface DataContextType {
    syllabi: Syllabus[];
    allSyllabi: Syllabus[];
    notifications: Notification[];
    requests: ChangeRequest[];
    pendingUsers: User[];
    allUsers: User[];
    addSyllabus: (syllabus: Omit<Syllabus, 'id' | 'createdAt' | 'updatedAt' | 'reviewHistory'>) => string;
    addSyllabusWithId: (id: string, syllabus: Omit<Syllabus, 'id' | 'createdAt' | 'updatedAt' | 'reviewHistory'>) => string;
    submitSyllabus: (id: string, assignedReviewers?: { reviewerId: string; reviewerName: string }[]) => Promise<void>;
    submitBatchSyllabi: (ids: string[], assignedReviewers?: { reviewerId: string; reviewerName: string }[]) => Promise<void>;
    approveSyllabus: (id: string, userRole: UserRole, reviewerId: string, reviewerName: string, comment?: string) => void;
    returnSyllabus: (id: string, userRole: UserRole, reviewerId: string, reviewerName: string, feedback: string) => void;
    updateSyllabusStatus: (id: string, status: SyllabusStatus, feedback?: string) => void;
    addReviewAction: (syllabusId: string, action: Omit<ReviewAction, 'id' | 'timestamp'>) => void;
    getSyllabiForRole: (userId: string, role: UserRole, college: string, department: string, sortOrder?: 'asc' | 'desc') => Syllabus[];
    getNotificationsForUser: (userId: string) => Notification[];
    markNotificationRead: (id: string) => void;
    approveUser: (userId: string) => Promise<boolean>;
    rejectUser: (userId: string) => Promise<boolean>;
    addUser: (user: Omit<User, 'id' | 'createdAt'>, password?: string) => Promise<string | null>;
    updateUser: (userId: string, updates: Partial<User>, selfUpdate?: boolean, newPassword?: string) => Promise<boolean>;
    archiveUser: (userId: string) => Promise<boolean>;
    unarchiveUser: (userId: string) => Promise<boolean>;
    lockUser: (userId: string) => Promise<boolean>;
    unlockUser: (userId: string) => Promise<boolean>;
    approveChangeRequest: (requestId: string) => Promise<boolean>;
    rejectChangeRequest: (requestId: string) => Promise<boolean>;
    reuploadSyllabus: (id: string, file: File, aiAnalysis?: any) => Promise<boolean>;
    newVersion: (id: string) => Promise<{ success: boolean; syllabusId?: string }>;
    uploadScannedSyllabus: (id: string, fileData: string, fileName: string) => Promise<boolean>;
    uploadSyllabus: (syllabus: Omit<Syllabus, 'id' | 'createdAt' | 'updatedAt' | 'reviewHistory'>, file: File) => Promise<string | null>;
    refreshSyllabi: () => Promise<void>;
    getSyllabusById: (id: string) => Promise<Syllabus | null>;
    saveAiAnalysis: (id: string, aiAnalysis: any) => Promise<boolean>;
    markAsOpened: (id: string, userId: string) => Promise<void>;
    deleteSyllabus: (id: string) => Promise<{success: boolean, error?: string}>;
    updateCollaborators: (id: string, collaboratorIds: string[]) => Promise<boolean>;
    isLoading: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
    const [allSyllabi, setAllSyllabi] = useState<Syllabus[]>([]);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [requests, setRequests] = useState<ChangeRequest[]>([]);
    const [pendingUsers, setPendingUsers] = useState<User[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [isSyllabiLoading, setIsSyllabiLoading] = useState(true);
    const [isUsersLoading, setIsUsersLoading] = useState(true);
    const allSyllabiRef = React.useRef<Syllabus[]>([]);
    const allUsersRef = React.useRef<User[]>([]);

    useEffect(() => {
        allSyllabiRef.current = allSyllabi;
    }, [allSyllabi]);

    useEffect(() => {
        allUsersRef.current = allUsers;
    }, [allUsers]);

    const { selectedSemester } = useSemester();

    // Expose syllabi filtered by the globally selected semester
    const syllabi = useMemo(() => {
        if (!selectedSemester) return allSyllabi;
        return allSyllabi.filter((s) => isSyllabusInSemester(s, selectedSemester));
    }, [allSyllabi, selectedSemester]);

    const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

    const mapServerSyllabus = (s: any): Syllabus => {
        const rawStatus = String(s.status || '').toLowerCase();
        const stage = String(s.currentStage || s.current_stage || '').toUpperCase();

        let clientStatus: SyllabusStatus = 'draft';

        // Check if it's already a client status (from my recent backend update)
        const validClientStatuses: SyllabusStatus[] = [
            'draft', 'submitted', 'under_review_peer', 'under_review_dept_head', 'under_review_dean',
            'under_review_citl', 'under_review_vpaa', 'approved', 'returned'
        ];

        if (validClientStatuses.includes(rawStatus as SyllabusStatus)) {
            clientStatus = rawStatus as SyllabusStatus;
        }
        // Fallback for raw DB statuses (for compatibility with older seeds or other endpoints)
        else {
            const dbStatus = rawStatus.toUpperCase();
            if (dbStatus === 'FOR_REVIEW') {
                if (stage === 'SENIOR_FACULTY') clientStatus = 'under_review_peer';
                else if (stage === 'DEPT_HEAD') clientStatus = 'under_review_dept_head';
                else if (stage === 'DEAN') clientStatus = 'under_review_dean';
                else if (stage === 'CITL') clientStatus = 'under_review_citl';
                else if (stage === 'VPAA') clientStatus = 'under_review_vpaa';
                else clientStatus = 'submitted';
            } else if (dbStatus === 'APPROVED') {
                clientStatus = 'approved';
            } else if (dbStatus === 'RETURNED') {
                clientStatus = 'returned';
            }
        }
        const fileUrl = s.fileUrl ?? s.file_url ?? undefined;
        let fileName = s.fileName ?? s.file_name ?? '';

        // If fileName is missing but fileUrl exists, try to extract it
        if (!fileName && fileUrl) {
            try {
                const url = new URL(fileUrl);
                fileName = decodeURIComponent(url.pathname.split('/').pop() || '');
            } catch {
                // If not a full URL, just split by /
                fileName = fileUrl.split('/').pop() || '';
            }
        }

        return {
            id: String(s.id || s._id),
            trackingId: s.trackingId ?? s.tracking_id ?? '',
            courseCode: s.courseCode ?? s.course_code ?? '',
            courseTitle: s.courseTitle ?? s.course_title ?? '',
            semesterId: s.semesterId ?? s.semester_id ?? "1",
            academicYear: s.academicYear ? String(s.academicYear) : (s.academic_year ? String(s.academic_year) : undefined),
            openedBy: Array.isArray(s.openedBy) ? s.openedBy.map((o: any) => String(o?._id || o?.id || o)) : [],
            semesterPeriod: s.semesterPeriod ?? s.semester ?? '',
            status: clientStatus,
            college: s.college ?? '',
            department: s.department ?? '',
            facultyId: String(typeof s.facultyId === 'object' && s.facultyId !== null ? (s.facultyId._id || s.facultyId.id) : (s.facultyId ?? s.faculty_id ?? '')),
            facultyName: s.facultyName ?? s.faculty_name ?? '',
            fileName,
            fileUrl,
            createdAt: s.createdAt ?? new Date().toISOString(),
            updatedAt: s.updatedAt ?? new Date().toISOString(),
            version: s.version ?? 1,
            feedback: s.feedback ?? undefined,
            reviewHistory: Array.isArray(s.reviewHistory)
                ? s.reviewHistory.map((ra: any) => ({
                    id: String(ra.id || ra._id || `ra${Date.now()}`),
                    reviewerId: String(ra.reviewerId ?? ra.reviewer_id ?? ''),
                    reviewerName: ra.reviewerName ?? ra.reviewer_name ?? '',
                    reviewerRole: ra.reviewerRole as UserRole,
                    version: ra.version ?? ra.v ?? 1,
                    action: ra.action,
                    comment: ra.comment ?? undefined,
                    timestamp: ra.timestamp ?? new Date().toISOString(),
                }))
                : Array.isArray((s as any).review_history)
                    ? (s as any).review_history.map((ra: any) => ({
                        id: String(ra.id || ra._id || `ra${Date.now()}`),
                        reviewerId: String(ra.reviewerId ?? ra.reviewer_id ?? ''),
                        reviewerName: ra.reviewerName ?? ra.reviewer_name ?? '',
                        reviewerRole: ((): UserRole => {
                            const m: Record<string, UserRole> = { FACULTY: 'faculty', SENIOR_FACULTY: 'faculty', DEPT_HEAD: 'dept_head', DEAN: 'dean', CITL: 'citl', VPAA: 'vpaa' };
                            const raw = String(ra.reviewerRole ?? ra.reviewer_role ?? '').toUpperCase();
                            return m[raw] || 'faculty';
                        })(),
                        version: ra.version ?? ra.v ?? 1,
                        action: ra.action,
                        comment: ra.comment ?? undefined,
                        timestamp: ra.timestamp ?? new Date().toISOString(),
                    }))
                    : [],
            form17Link: s.form17Link ?? s.form17_link ?? undefined,
            form18Link: s.form18Link ?? s.form18_link ?? undefined,
            form17Data: s.form17Data ?? s.form17_data ?? undefined,
            form18Data: s.form18Data ?? s.form18_data ?? undefined,
            aiAnalysis: s.aiAnalysis ?? undefined,
            forwardedToSeniorFacultyAt: s.forwardedToSeniorFacultyAt ?? s.forwarded_to_senior_faculty_at ?? undefined,
            forwardedToDeptHeadAt: s.forwardedToDeptHeadAt ?? s.forwarded_to_dept_head_at ?? undefined,
            forwardedToDeanAt: s.forwardedToDeanAt ?? s.forwarded_to_dean_at ?? undefined,
            forwardedToCITLAt: s.forwardedToCITLAt ?? s.forwarded_to_citl_at ?? undefined,
            forwardedToVPAAAt: s.forwardedToVPAAAt ?? s.forwarded_to_vpaa_at ?? undefined,
            scannedFileLink: s.scannedFileUrl ?? s.scannedFileLink ?? s.scanned_file_link ?? undefined,
            claimedBySeniorFacultyId: s.claimedBySeniorFacultyId ?? s.claimed_by_senior_faculty_id ?? null,
            claimedBySeniorFacultyName: s.claimedBySeniorFacultyName ?? s.claimed_by_senior_faculty_name ?? null,
            assignedPeerReviewers: Array.isArray(s.assignedPeerReviewers)
                ? s.assignedPeerReviewers.map((apr: any) => ({
                    reviewerId: String(apr.reviewerId ?? apr.reviewer_id),
                    reviewerName: apr.reviewerName ?? apr.reviewer_name,
                    hasForwarded: apr.hasForwarded ?? apr.has_forwarded ?? false,
                    action: apr.action ?? null,
                    comment: apr.comment ?? "",
                    forwardedAt: apr.forwardedAt ?? apr.forwarded_at ?? undefined
                }))
                : Array.isArray(s.assigned_peer_reviewers)
                    ? s.assigned_peer_reviewers.map((apr: any) => ({
                        reviewerId: String(apr.reviewerId ?? apr.reviewer_id),
                        reviewerName: apr.reviewerName ?? apr.reviewer_name,
                        hasForwarded: apr.hasForwarded ?? apr.has_forwarded ?? false,
                        action: apr.action ?? null,
                        comment: apr.comment ?? "",
                        forwardedAt: apr.forwardedAt ?? apr.forwarded_at ?? undefined
                    }))
                    : [],
            collaborators: Array.isArray(s.collaborators) ? s.collaborators.map((c: any) => String(c?._id || c?.id || c)) : [],
            currentStage: String(s.currentStage || s.current_stage || '').toUpperCase() || undefined,
        };
    };

    const refreshSyllabi = async () => {
        try {
            const res = await fetch(`${API_BASE}/syllabi`);
            const data = await res.json();
            let apiSyllabi: Syllabus[] = [];
            if (data?.success && Array.isArray(data.syllabi)) {
                apiSyllabi = data.syllabi.map(mapServerSyllabus);
            } else if (Array.isArray((data as any))) {
                apiSyllabi = (data as any).map(mapServerSyllabus);
            }

            if (data?.success || Array.isArray(data)) {
                setAllSyllabi(apiSyllabi);
            }
        } catch (err) {
            console.error("Failed to fetch syllabi:", err);
        } finally {
            setIsSyllabiLoading(false);
        }
    };

    const markAsOpened = async (id: string, userId: string) => {
        try {
            const res = await fetch(`${API_BASE}/syllabi/${encodeURIComponent(id)}/opened`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });
            if (res.ok) {
                setAllSyllabi(prev => prev.map(s => {
                    if (s.id === id) {
                        const openedBy = s.openedBy || [];
                        if (!openedBy.includes(userId)) {
                            return { ...s, openedBy: [...openedBy, userId] };
                        }
                    }
                    return s;
                }));
            }
        } catch (err) {
            console.error("Failed to mark syllabus as opened:", err);
        }
    };

    const getSyllabusById = async (id: string): Promise<Syllabus | null> => {
        // Check local state first (by id or trackingId)
        const existing = allSyllabiRef.current.find(s => s.id === id || s.trackingId === id);
        if (existing) return existing;

        // Fetch from API
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`${API_BASE}/syllabi/${encodeURIComponent(id)}`, {
                headers: {
                    'Authorization': token ? `Bearer ${token}` : ''
                }
            });
            const data = await res.json();
            if (res.ok && data.success && data.syllabus) {
                const syllabus = mapServerSyllabus(data.syllabus);
                // Add to local state if missing
                setAllSyllabi(prev => {
                    if (prev.some(s => s.id === syllabus.id)) return prev;
                    return [syllabus, ...prev];
                });
                return syllabus;
            }
        } catch (err) {
            console.error(`Failed to fetch syllabus by ID ${id}:`, err);
        }
        return null;
    };

    const [tickSyllabi, setTickSyllabi] = useState(0);
    const [tickNotifications, setTickNotifications] = useState(0);
    const [tickUsers, setTickUsers] = useState(0);
    const [tickRequests, setTickRequests] = useState(0);

    // Socket Initialization
    useEffect(() => {
        const socket = io(API_BASE, {
            withCredentials: true,
        });

        socket.on("update_syllabi", () => {
            console.log("[Socket] update_syllabi received");
            setTickSyllabi(t => t + 1);
        });

        socket.on("update_notifications", () => {
            console.log("[Socket] update_notifications received");
            setTickNotifications(t => t + 1);
        });

        socket.on("update_users", () => {
            console.log("[Socket] update_users received");
            setTickUsers(t => t + 1);
        });

        socket.on("update_requests", () => {
            console.log("[Socket] update_requests received");
            setTickRequests(t => t + 1);
        });

        socket.on("update_semesters", () => {
            console.log("[Socket] update_semesters received");
            // If the semester configuration changed, we should probably re-fetch syllabi
            // because maybe the current semester changed and we need to update the list.
            setTickSyllabi(t => t + 1);
        });

        return () => {
            socket.disconnect();
        };
    }, [API_BASE]);

    useEffect(() => {
        refreshSyllabi();
    }, [tickSyllabi]);

    const mapServerUser = (u: any): User => {
        const roleMap: Record<string, UserRole> = {
            FACULTY: 'faculty',
            SENIOR_FACULTY: 'faculty',
            DEPT_HEAD: 'dept_head',
            DEAN: 'dean',
            CITL: 'citl',
            VPAA: 'vpaa',
            ADMIN: 'admin',
        };
        const rawRole = String(u.role || '').toUpperCase().replace(/[\s_]+/g, '_');
        const mappedRole = roleMap[rawRole] || (u.role as UserRole) || 'faculty';

        return {
            id: String(u.id || u._id),
            employeeId: u.employeeId ?? u.employee_id ?? '',
            isSeniorFaculty: u.isSeniorFaculty ?? u.is_senior_faculty ?? false,
            firstName: u.firstName ?? u.first_name ?? '',
            lastName: u.lastName ?? u.last_name ?? '',
            email: u.email ?? '',
            role: mappedRole,
            college: u.college ?? '',
            department: u.department ?? '',
            isApproved: true,
            status: u.status === 'archived' ? 'archived' : (u.status === 'ARCHIVED' ? 'archived' : 'active'),
            isActive: u.isActive ?? u.is_active ?? (u.status === 'ARCHIVED' ? false : true),
            isLocked: u.isLocked ?? u.is_locked ?? false,
            lastLogin: u.lastLogin ?? u.last_login ?? undefined,
            updatedAt: u.updatedAt ?? u.updated_at ?? undefined,
            createdAt: u.createdAt ?? new Date().toISOString().split('T')[0],
            notificationsEnabled: (u.notificationsEnabled ?? u.notifications_enabled ?? true) as boolean,
            theme: (u.theme ?? u.theme_preference ?? 'light') as 'light' | 'dark',
            hasPassword: u.hasPassword ?? (u.password_hash ? true : false),
        };
    };

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${API_BASE}/users`);
                const data = await res.json();
                let apiUsers: User[] = [];
                if (data?.success && Array.isArray(data.users)) {
                    apiUsers = data.users.map(mapServerUser);
                } else if (Array.isArray(data)) {
                    apiUsers = data.map(mapServerUser);
                }

                if (apiUsers.length > 0) {
                    setAllUsers(prev => {
                        // Use email as unique identifier for users
                        const apiEmails = new Set(apiUsers.map(u => u.email.toLowerCase()));
                        const filteredPrev = prev.filter(u => !apiEmails.has(u.email.toLowerCase()));
                        return [...apiUsers, ...filteredPrev];
                    });
                }
            } catch (err) {
                console.error("Failed to fetch users:", err);
            } finally {
                setIsUsersLoading(false);
            }
        })();
    }, [tickUsers]);
    useEffect(() => {
        setPendingUsers(allUsers.filter(u => u.isActive === false && u.status !== 'archived'));
    }, [allUsers]);

    const { user: authUser, logout, updateUser: updateAuthUser } = useAuth();
    const { toast } = useToast();

    useEffect(() => {
        if (!authUser?.id) return;
        const currentData = allUsers.find(u => u.id === authUser.id);
        if (!currentData) return;

        if (currentData.isLocked) {
            logout();
            toast({
                variant: 'destructive',
                title: "Account Locked",
                description: "Your account is locked. Please contact the administrator for clarifications.",
            });
            return;
        }

        // Check for role or assignment changes (Approved Change Request)
        const roleChanged = currentData.role !== authUser.role;
        const collegeChanged = currentData.college !== authUser.college;
        const departmentChanged = currentData.department !== authUser.department;

        if (roleChanged || collegeChanged || departmentChanged) {
            // Update the local auth user so the UI reflects changes
            updateAuthUser({
                role: currentData.role,
                college: currentData.college,
                department: currentData.department
            });

            toast({
                title: "Account Updated",
                description: "Your role or assignment has been updated by an administrator. Redirecting to your dashboard...",
            });

            // Redirect to dashboard to ensure the correct view is loaded for the new role
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 2000);
        }
    }, [allUsers, authUser?.id, authUser?.role, authUser?.college, authUser?.department, logout, updateAuthUser, toast]);
    useEffect(() => {
        (async () => {
            if (!authUser?.id) {
                setNotifications([]);
                return;
            }
            try {
                const res = await fetch(`${API_BASE}/notifications/${authUser.id}`);
                const data = await res.json();
                if (data?.success && Array.isArray(data.notifications)) {
                    const mapped: Notification[] = data.notifications.map((n: any) => ({
                        id: String(n.id || n._id),
                        userId: String(n.userId || n.user_id),
                        title: n.title,
                        message: n.message,
                        syllabusId: n.syllabusId || n.syllabus_id,
                        link: n.link,
                        isRead: !!(n.isRead ?? n.is_read),
                        createdAt: n.createdAt ?? new Date().toISOString(),
                    }));
                    setNotifications(mapped);
                } else {
                    setNotifications([]);
                }
            } catch {
                setNotifications([]);
            }
        })();
    }, [authUser?.id, tickNotifications]);
    useEffect(() => {
        (async () => {
            if (!authUser?.id) {
                setRequests([]);
                return;
            }
            // Only admins fetch change requests
            if (authUser.role !== 'admin') {
                setRequests([]);
                return;
            }
            try {
                const res = await fetch(`${API_BASE}/requests`);
                const data = await res.json();
                if (data?.success && Array.isArray(data.requests)) {
                    const mapped: ChangeRequest[] = data.requests.map((r: any) => ({
                        id: String(r.id),
                        userId: String(r.userId),
                        userName: r.userName || '',
                        userEmail: r.userEmail || '',
                        type: r.type,
                        requestedRole: r.requestedRole,
                        requestedCollege: r.requestedCollege,
                        requestedDepartment: r.requestedDepartment,
                        status: r.status,
                        createdAt: r.createdAt || new Date().toISOString(),
                        updatedAt: r.updatedAt || undefined,
                    }));
                    setRequests(mapped);
                } else {
                    setRequests([]);
                }
            } catch {
                setRequests([]);
            }
        })();
    }, [authUser?.role, tickRequests]);

    const isMatchingUnit = (userVal: string, syllabusVal: string) => {
        const u = (userVal || '').toLowerCase().trim();
        const s = (syllabusVal || '').toLowerCase().trim();
        if (!u || !s || u === 'n/a' || s === 'n/a') return false;

        // Exact match or includes
        if (u === s || u.includes(s) || s.includes(u)) return true;

        // Split into words and check if any significant words match (OBE standards)
        const uWords = u.split(/\s+/).filter(w => w.length > 3 && !['college', 'department', 'of', 'and', '&'].includes(w));
        const sWords = s.split(/\s+/).filter(w => w.length > 3 && !['college', 'department', 'of', 'and', '&'].includes(w));

        return uWords.some(uw => sWords.some(sw => uw.includes(sw) || sw.includes(uw)));
    };

    // Helper function to send notifications to users
    const sendNotification = async (userId: string, title: string, message: string, syllabusId?: string) => {
        // Only used for client-side local notifications if needed, 
        // but we now rely on the backend for persistent notifications and emails.
        console.log(`[sendNotification] Notification requested for user ${userId}: ${title}`);
    };

    const triggerReviewWorkflowNotification = async (syllabus: Syllabus, nextStatus: SyllabusStatus, reviewerName?: string) => {
        // We now rely on the backend (syllabiController.js) to trigger these notifications
        // when the status changes via PATCH/POST requests. 
        // This prevents double notifications.
        console.log(`[triggerReviewWorkflowNotification] Backend will handle notification for status: ${nextStatus}`);
    };

    // Helper function to notify department head (legacy wrapper)
    const notifyDepartmentHead = async (syllabus: Syllabus) => {
        await triggerReviewWorkflowNotification(syllabus, 'under_review_dept_head');
    };

    // Add a new syllabus (Faculty creates or submits directly)
    const addSyllabus = (syllabus: Omit<Syllabus, 'id' | 'createdAt' | 'updatedAt' | 'reviewHistory'>) => {
        const newSyllabus: Syllabus = {
            ...syllabus,
            id: `s${Date.now()}`,
            // FIXED: Use the status passed from the component
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            reviewHistory: [],
        };

        // If syllabus is submitted for review (not draft), add initial review action
        if (syllabus.status === 'under_review_peer') {
            newSyllabus.reviewHistory = [
                {
                    id: `ra${Date.now()}`,
                    reviewerId: syllabus.facultyId,
                    reviewerName: syllabus.facultyName,
                    reviewerRole: 'faculty',
                    action: 'forwarded',
                    comment: 'Submitted for peer review',
                    timestamp: new Date().toISOString(),
                    version: syllabus.version || 1,
                }
            ];
        }

        setAllSyllabi(prev => [newSyllabus, ...prev]);
        return newSyllabus.id;
    };

    const addSyllabusWithId = (id: string, syllabus: Omit<Syllabus, 'id' | 'createdAt' | 'updatedAt' | 'reviewHistory'>) => {
        const newSyllabus: Syllabus = {
            ...syllabus,
            id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            reviewHistory: [],
        };
        if (syllabus.status === 'under_review_peer') {
            newSyllabus.reviewHistory = [
                {
                    id: `ra${Date.now()}`,
                    reviewerId: syllabus.facultyId,
                    reviewerName: syllabus.facultyName,
                    reviewerRole: 'faculty',
                    action: 'forwarded',
                    comment: 'Submitted for peer review',
                    timestamp: new Date().toISOString(),
                    version: syllabus.version || 1,
                }
            ];
        }
        setAllSyllabi(prev => [newSyllabus, ...prev]);
        return newSyllabus.id;
    };

    // Faculty submits syllabus for review (from draft status)
    const submitSyllabus = async (id: string, assignedReviewers?: { reviewerId: string; reviewerName: string }[]) => {
        // 1. Wait for syllabus to exist in state if needed
        let syllabus = allSyllabiRef.current.find(s => s.id === id);
        if (!syllabus) {
            console.log(`[submitSyllabus] ID ${id} not found. Waiting...`);
            for (let i = 0; i < 20; i++) {
                await new Promise(r => setTimeout(r, 100));
                syllabus = allSyllabiRef.current.find(s => s.id === id);
                if (syllabus) break;
            }
        }

        if (!syllabus) {
            console.error(`[submitSyllabus] ID ${id} still not found.`);
            return;
        }

        const hasCollaborators = syllabus.collaborators && syllabus.collaborators.length > 0;
        const newStatus = hasCollaborators ? 'submitted' : 'under_review_peer';

        // 2. Optimistic local update
        setAllSyllabi(prev => prev.map(s => {
            if (s.id !== id) return s;
            
            const nextStage = hasCollaborators ? 'COLLABORATOR' : 'SENIOR_FACULTY';
            const hadPreviousReturn = s.reviewHistory && s.reviewHistory.some(r => r.action === 'returned');
            const nextVersion = hadPreviousReturn ? (s.version ?? 1) + 1 : (s.version ?? 1);
            
            return {
                ...s,
                version: nextVersion,
                status: newStatus,
                currentStage: nextStage,
                // If it goes to collaborator first, we save the reviewer for later
                claimedBySeniorFacultyId: hasCollaborators && assignedReviewers?.length ? assignedReviewers[0].reviewerId : s.claimedBySeniorFacultyId,
                claimedBySeniorFacultyName: hasCollaborators && assignedReviewers?.length ? assignedReviewers[0].reviewerName : s.claimedBySeniorFacultyName,
                // Only assign peer reviewers immediately if we skip the collaborator stage
                assignedPeerReviewers: !hasCollaborators && assignedReviewers?.length ? assignedReviewers : [],
                updatedAt: new Date().toISOString()
            };
        }));

        // 3. Update backend - Backend will handle the notification automatically
        try {
            const res = await fetch(`${API_BASE}/syllabi/${encodeURIComponent(id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: newStatus,
                    assignedPeerReviewers: assignedReviewers,
                    reviewAction: {
                        reviewerId: syllabus.facultyId,
                        reviewerName: syllabus.facultyName,
                        reviewerRole: 'faculty',
                        action: 'forwarded',
                        comment: hasCollaborators ? 'Submitted to collaborators for review' : 'Submitted for peer review',
                    },
                }),
            });

            if (!res.ok) {
                throw new Error(`Failed to submit syllabus: ${res.statusText}`);
            }

            const data = await res.json();
            if (data.success && data.syllabus) {
                const mapped = mapServerSyllabus(data.syllabus);
                setAllSyllabi(prev => prev.map(s => s.id === mapped.id ? mapped : s));
            }
        } catch (err) {
            console.error("Error submitting syllabus:", err);
            // Revert if failed
            refreshSyllabi();
        }
    };

    const submitBatchSyllabi = async (ids: string[], assignedReviewers?: { reviewerId: string; reviewerName: string }[]) => {
        // Sequentially submit each syllabus
        // In a real app, you might want a batch endpoint on the server
        for (const id of ids) {
            await submitSyllabus(id, assignedReviewers);
        }
    };

    // Approve syllabus and move to next stage
    const approveSyllabus = (id: string, userRole: UserRole, reviewerId: string, reviewerName: string, comment?: string) => {
        setAllSyllabi(prev => prev.map(s => {
            if (s.id !== id) return s;

            let nextStatus: SyllabusStatus = s.status;
            let action: 'approved' | 'forwarded' = 'approved';
            let defaultComment = comment || `Approved by ${userRole}`;
            const isPeerReviewer = (userRole === 'faculty' || userRole === 'faculty_peer_reviewer') && s.status === 'under_review_peer';
            const isCollaborator = userRole === 'faculty' && s.facultyId !== reviewerId && Array.isArray(s.collaborators) && s.collaborators.includes(reviewerId);

            let allCollaboratorsApproved = false;

            // Determine next status based on current status and user role
            if (isCollaborator && (s.status === 'submitted' || s.status === 'draft')) {
                action = 'forwarded';
                defaultComment = comment || 'Collaborator approved';
                
                // Check if all other collaborators have approved (plus this current one)
                const collaboratorApprovals = (s.reviewHistory || []).filter(
                    r => r.action === 'forwarded' && r.reviewerRole === 'faculty' && s.collaborators?.includes(r.reviewerId) && (r.version ?? 1) === (s.version ?? 1)
                );
                
                // If the number of existing unique approvals + 1 (current) >= total collaborators
                const uniqueApprovers = new Set(collaboratorApprovals.map(a => a.reviewerId));
                uniqueApprovers.add(reviewerId);
                
                if (uniqueApprovers.size >= (s.collaborators?.length || 1)) {
                    allCollaboratorsApproved = true;
                    nextStatus = 'under_review_peer';
                }
            }
            else if (isPeerReviewer) {
                // For peer reviewers, don't change status yet - wait for all
                action = 'forwarded';
                defaultComment = comment || 'Forwarded to Department Head for review';
            }
            else if (userRole === 'dept_head' && s.status === 'under_review_dept_head') {
                nextStatus = 'under_review_dean';
                action = 'forwarded';
                defaultComment = comment || 'Forwarded to Dean for review';
            }
            else if (userRole === 'dean' && s.status === 'under_review_dean') {
                nextStatus = 'under_review_citl';
                action = 'forwarded';
                defaultComment = comment || 'Forwarded to CITL for review';
            }
            else if (userRole === 'citl' && s.status === 'under_review_citl') {
                nextStatus = 'under_review_vpaa';
                action = 'forwarded';
                defaultComment = comment || 'Forwarded to VPAA for final approval';
            }
            else if (userRole === 'vpaa' && s.status === 'under_review_vpaa') {
                nextStatus = 'approved';
                action = 'approved';
                defaultComment = comment || 'Final approval granted';
            } else {
                // If no status change, return early
                return s;
            }

            // Create notification for next reviewer or faculty (only if not peer reviewer or we actually changed status)
            if (!isPeerReviewer && (!isCollaborator || allCollaboratorsApproved)) {
                triggerReviewWorkflowNotification(s, nextStatus, reviewerName);
            }

            // Update the assignedPeerReviewers in the local state
            const updatedAssignedPeerReviewers = (s.assignedPeerReviewers || []).map(apr => {
                if (apr.reviewerId === reviewerId) {
                    return {
                        ...apr,
                        hasForwarded: action === 'forwarded',
                        action: (action === 'forwarded' ? 'forwarded' : 'returned') as 'forwarded' | 'returned',
                        comment: defaultComment,
                        forwardedAt: new Date().toISOString()
                    };
                }
                return apr;
            });

            (async () => {
                try {
                    const res = await fetch(`${API_BASE}/syllabi/${encodeURIComponent(id)}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            // Backend will handle the status update via reviewAction for all reviewers
                            // to prevent double progression bugs.
                            reviewAction: {
                                reviewerId,
                                reviewerName,
                                reviewerRole: userRole === 'faculty_peer_reviewer' ? 'faculty' : userRole,
                                action,
                                comment: defaultComment,
                            },
                        }),
                    });
                    const data = await res.json();
                    if (data.success && data.syllabus) {
                        const updated = mapServerSyllabus(data.syllabus);
                        setAllSyllabi(prev => prev.map(old => old.id === id ? updated : old));
                    }
                } catch (err) {
                    console.error("Failed to sync syllabus after review action:", err);
                }
            })();
            // Add review action to history
            const newAction: ReviewAction = {
                id: crypto.randomUUID(),
                reviewerId,
                reviewerName,
                reviewerRole: userRole,
                action,
                comment: defaultComment,
                timestamp: new Date().toISOString(),
                version: s.version || 1
            };

            // If we just moved to under_review_peer due to collaborator approvals, update stage fields
            let additionalUpdates: any = {};
            if (nextStatus === 'under_review_peer' && s.status !== 'under_review_peer') {
                // Build the assignedPeerReviewers list from claimedBySeniorFacultyId (saved when syllabus was submitted)
                const restoredReviewers = s.claimedBySeniorFacultyId
                    ? [{
                        reviewerId: s.claimedBySeniorFacultyId,
                        reviewerName: s.claimedBySeniorFacultyName || '',
                        hasForwarded: false,
                        action: undefined,
                        comment: ''
                    }]
                    : [];
                additionalUpdates = {
                    currentStage: 'SENIOR_FACULTY',           // ← critical: lets senior faculty see it now
                    forwardedToSeniorFacultyAt: new Date().toISOString(),
                    assignedPeerReviewers: restoredReviewers,  // restore the selected senior faculty
                };
            }

            return {
                ...s,
                status: nextStatus,
                updatedAt: new Date().toISOString(),
                forwardedToSeniorFacultyAt: s.forwardedToSeniorFacultyAt,
                forwardedToDeptHeadAt: nextStatus === 'under_review_dept_head' ? new Date().toISOString() : s.forwardedToDeptHeadAt,
                forwardedToDeanAt: nextStatus === 'under_review_dean' ? new Date().toISOString() : s.forwardedToDeanAt,
                forwardedToCITLAt: nextStatus === 'under_review_citl' ? new Date().toISOString() : s.forwardedToCITLAt,
                forwardedToVPAAAt: nextStatus === 'under_review_vpaa' ? new Date().toISOString() : s.forwardedToVPAAAt,
                assignedPeerReviewers: updatedAssignedPeerReviewers,
                reviewHistory: [...(s.reviewHistory || []), newAction],
                ...additionalUpdates
            };
        }));
    };

    // Return syllabus for revisions
    const returnSyllabus = (id: string, userRole: UserRole, reviewerId: string, reviewerName: string, feedback: string) => {
        // All reviewers are allowed to return syllabi
        if (userRole === 'admin') {
            console.warn(`Role ${userRole} is not authorized to return syllabi.`);
            return;
        }

        setAllSyllabi(prev => prev.map(s => {
            if (s.id !== id) return s;

            const isPeerReviewer = (userRole === 'faculty' || userRole === 'faculty_peer_reviewer') && s.status === 'under_review_peer';

            // Trigger notification for return
            if (!isPeerReviewer) {
                triggerReviewWorkflowNotification(s, 'returned', reviewerName);
            }

            // Update the assignedPeerReviewers in the local state if it's a peer reviewer
            const updatedAssignedPeerReviewers = isPeerReviewer ? (s.assignedPeerReviewers || []).map(apr => {
                if (apr.reviewerId === reviewerId) {
                    return {
                        ...apr,
                        hasForwarded: false,
                        action: 'returned' as const,
                        comment: feedback,
                        forwardedAt: undefined
                    };
                }
                return apr;
            }) : s.assignedPeerReviewers;

            (async () => {
                try {
                    await fetch(`${API_BASE}/syllabi/${encodeURIComponent(id)}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            // Backend will handle the status update via reviewAction
                            // ...(!isPeerReviewer && { status: 'returned' }),
                            reviewAction: {
                                reviewerId,
                                reviewerName,
                                reviewerRole: userRole === 'faculty_peer_reviewer' ? 'faculty' : userRole,
                                action: 'returned',
                                comment: feedback,
                            },
                            // Don't send assignedPeerReviewers for peer reviewer actions -
                            // the backend updates the individual reviewer atomically from reviewAction
                        }),
                    });
                } catch { }
            })();

            return {
                ...s,
                status: isPeerReviewer ? s.status : 'returned',
                feedback: isPeerReviewer ? s.feedback : feedback,
                updatedAt: new Date().toISOString(),
                // Update assignedPeerReviewers locally
                assignedPeerReviewers: updatedAssignedPeerReviewers,
                reviewHistory: [
                    ...s.reviewHistory,
                    {
                        id: `ra${Date.now()}`,
                        reviewerId,
                        reviewerName,
                        reviewerRole: userRole,
                        action: 'returned',
                        comment: feedback,
                        timestamp: new Date().toISOString(),
                        version: s.version || 1,
                    }
                ]
            };
        }));
    };

    // Legacy function for compatibility
    const updateSyllabusStatus = (id: string, status: SyllabusStatus, feedback?: string) => {
        setAllSyllabi(prev => prev.map(s =>
            s.id === id
                ? { ...s, status, feedback, updatedAt: new Date().toISOString() }
                : s
        ));

        // If status is under_review_dept_head, notify department head
        if (status === 'under_review_dept_head') {
            const syllabus = allSyllabi.find(s => s.id === id);
            if (syllabus) {
                notifyDepartmentHead({ ...syllabus, status });
            }
        }
    };

    // Legacy function for compatibility
    const addReviewAction = (syllabusId: string, action: Omit<ReviewAction, 'id' | 'timestamp'>) => {
        const newAction: ReviewAction = {
            ...action,
            id: `ra${Date.now()}`,
            timestamp: new Date().toISOString(),
        };
        setAllSyllabi(prev => prev.map(s =>
            s.id === syllabusId
                ? { ...s, reviewHistory: [...s.reviewHistory, newAction] }
                : s
        ));
    };

    // Get syllabi based on user role
    const getSyllabiForRole = (
        userId: string,
        role: UserRole,
        college: string,
        department: string,
        sortOrder: 'asc' | 'desc' = 'desc'
    ): Syllabus[] => {
        // Apply semester filtering to ALL roles.
        // If faculty uploads to 1st sem, the reviewer must also have 1st sem selected to see it.
        const bySemester = (list: Syllabus[]) =>
            selectedSemester ? list.filter((s) => isSyllabusInSemester(s, selectedSemester)) : list;

        // Helper to check if department/college matches (flexible)
        const isMatch = isMatchingUnit;

        let filteredSyllabi: Syllabus[] = [];

        switch (role) {
            case 'admin':
                filteredSyllabi = bySemester(allSyllabi);
                break;

            case 'faculty':
            case 'faculty_peer_reviewer':
                // Faculty as peer reviewer: ONLY sees syllabi they are assigned to (via assignedPeerReviewers and haven't acted on yet) or claimed (via claimedBySeniorFacultyId)
                // IMPORTANT: Exclude syllabi still in COLLABORATOR stage (waiting for collaborators to approve)
                // Note: A user can be both a collaborator AND an assigned senior faculty reviewer on the same syllabus.
                filteredSyllabi = bySemester(
                    allSyllabi.filter(
                        (s) =>
                            s.status === 'under_review_peer' &&
                            s.currentStage !== 'COLLABORATOR' &&
                            s.facultyId !== userId &&
                            (
                                (s.assignedPeerReviewers && s.assignedPeerReviewers.length > 0 &&
                                    s.assignedPeerReviewers.some(apr =>
                                        apr.reviewerId === userId && !apr.action // only show if reviewer hasn't acted yet
                                    )) ||
                                (s.claimedBySeniorFacultyId === userId)
                            )
                    )
                );
                break;

            case 'dept_head':
                filteredSyllabi = bySemester(
                    allSyllabi.filter(
                        (s) =>
                            isMatch(s.department, department) &&
                            s.status === 'under_review_dept_head'
                    ),
                );
                break;

            case 'dean':
                filteredSyllabi = bySemester(
                    allSyllabi.filter(
                        (s) =>
                            isMatch(s.college, college) &&
                            s.status === 'under_review_dean'
                    ),
                );
                break;

            case 'citl':
                filteredSyllabi = bySemester(
                    allSyllabi.filter(
                        (s) =>
                            s.status === 'under_review_citl'
                    ),
                );
                break;

            case 'vpaa':
                filteredSyllabi = bySemester(
                    allSyllabi.filter(
                        (s) =>
                            s.status === 'under_review_vpaa'
                    ),
                );
                break;

            default:
                return [];
        }

        // Sort based on role-specific forwarded timestamp
        return filteredSyllabi.sort((a, b) => {
            let timeA = 0;
            let timeB = 0;

            switch (role) {
                case 'faculty':
                    timeA = new Date(a.forwardedToSeniorFacultyAt || a.createdAt).getTime();
                    timeB = new Date(b.forwardedToSeniorFacultyAt || b.createdAt).getTime();
                    break;
                case 'dept_head':
                    timeA = new Date(a.forwardedToDeptHeadAt || a.createdAt).getTime();
                    timeB = new Date(b.forwardedToDeptHeadAt || b.createdAt).getTime();
                    break;
                case 'dean':
                    timeA = new Date(a.forwardedToDeanAt || a.createdAt).getTime();
                    timeB = new Date(b.forwardedToDeanAt || b.createdAt).getTime();
                    break;
                case 'citl':
                    timeA = new Date(a.forwardedToCITLAt || a.createdAt).getTime();
                    timeB = new Date(b.forwardedToCITLAt || b.createdAt).getTime();
                    break;
                case 'vpaa':
                    timeA = new Date(a.forwardedToVPAAAt || a.createdAt).getTime();
                    timeB = new Date(b.forwardedToVPAAAt || b.createdAt).getTime();
                    break;
                default:
                    timeA = new Date(a.updatedAt).getTime();
                    timeB = new Date(b.updatedAt).getTime();
            }

            return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
        });
    };

    const getNotificationsForUser = (userId: string): Notification[] => {
        return notifications.filter(n => n.userId === userId);
    };

    const markNotificationRead = (id: string) => {
        (async () => {
            try {
                await fetch(`${API_BASE}/notifications/${id}/read`, { method: 'POST' });
                setNotifications(prev => prev.map(n =>
                    n.id === id ? { ...n, isRead: true } : n
                ));
            } catch {
                setNotifications(prev => prev.map(n =>
                    n.id === id ? { ...n, isRead: true } : n
                ));
            }
        })();
    };

    const approveUser = async (userId: string): Promise<boolean> => {
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`${API_BASE}/users/${userId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ isActive: true, status: 'active' }),
            });
            const data = await res.json();
            if (data?.success && data.user) {
                const mapped = mapServerUser(data.user);
                setAllUsers(prev => prev.map(u => (u.id === userId ? { ...u, ...mapped } : u)));
                return true;
            } else {
                setAllUsers(prev => prev.map(u => (u.id === userId ? { ...u, isActive: true, status: 'active' } : u)));
                return true;
            }
        } catch {
            setAllUsers(prev => prev.map(u => (u.id === userId ? { ...u, isActive: true, status: 'active' } : u)));
            return false;
        }
    };

    const rejectUser = async (userId: string): Promise<boolean> => {
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`${API_BASE}/users/${userId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ status: 'archived', isActive: false, rejectRegistration: true }),
            });
            const data = await res.json();
            if (data?.success) {
                if (data.deleted) {
                    setAllUsers(prev => prev.filter(u => u.id !== userId));
                } else if (data.user) {
                    const mapped = mapServerUser(data.user);
                    setAllUsers(prev => prev.map(u => (u.id === userId ? { ...u, ...mapped } : u)));
                }
                return true;
            } else {
                setAllUsers(prev => prev.filter(u => u.id !== userId));
                return false;
            }
        } catch {
            setAllUsers(prev => prev.filter(u => u.id !== userId));
            return false;
        }
    };

    const addUser = async (user: Omit<User, 'id' | 'createdAt'>, password?: string): Promise<string | null> => {
        try {
            const body = {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                password: password || 'TempPass123!',
                role: user.role,
                college: user.college,
                department: user.department,
                isApproved: user.isApproved,
            };

            const token = localStorage.getItem('auth_token');
            const res = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (data?.success && data.user) {
                const mapped = mapServerUser(data.user);
                setAllUsers(prev => [...prev, mapped]);
                return mapped.id;
            } else {
                const newUser: User = {
                    ...user,
                    id: `u${Date.now()}`,
                    createdAt: new Date().toISOString().split('T')[0],
                };
                setAllUsers(prev => [...prev, newUser]);
                return newUser.id;
            }
        } catch {
            const fallback: User = {
                ...user,
                id: `u${Date.now()}`,
                createdAt: new Date().toISOString().split('T')[0],
            };
            setAllUsers(prev => [...prev, fallback]);
            return fallback.id;
        }
    };

    const updateUser = async (userId: string, updates: Partial<User>, selfUpdate?: boolean, newPassword?: string): Promise<boolean> => {
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`${API_BASE}/users/${userId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    firstName: updates.firstName,
                    lastName: updates.lastName,
                    email: updates.email,
                    role: updates.role,
                    college: updates.college,
                    department: updates.department,
                    status: updates.status,
                    isActive: updates.isActive,
                    isLocked: updates.isLocked,
                    notificationsEnabled: updates.notificationsEnabled,
                    theme: updates.theme,
                    selfUpdate,
                    newPassword,
                }),
            });
            const data = await res.json();
            if (data?.success && data.user) {
                const mapped = mapServerUser(data.user);
                setAllUsers(prev => prev.map(u => (u.id === userId ? { ...u, ...mapped } : u)));
                return true;
            } else {
                setAllUsers(prev => prev.map(u => (u.id === userId ? { ...u, ...updates } : u)));
                return false;
            }
        } catch {
            setAllUsers(prev => prev.map(u => (u.id === userId ? { ...u, ...updates } : u)));
            return false;
        }
    };

    const archiveUser = async (userId: string): Promise<boolean> => {
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`${API_BASE}/users/${userId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ status: 'archived' }),
            });
            const data = await res.json();
            if (data?.success && data.user) {
                const mapped = mapServerUser(data.user);
                setAllUsers(prev => prev.map(u => (u.id === userId ? { ...u, ...mapped } : u)));
                return true;
            } else {
                setAllUsers(prev => prev.map(u => (u.id === userId ? { ...u, status: 'archived' } : u)));
                return false;
            }
        } catch {
            setAllUsers(prev => prev.map(u => (u.id === userId ? { ...u, status: 'archived' } : u)));
            return false;
        }
    };

    const unarchiveUser = async (userId: string): Promise<boolean> => {
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`${API_BASE}/users/${userId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ status: 'active', isActive: true }),
            });
            const data = await res.json();
            if (data?.success && data.user) {
                const mapped = mapServerUser(data.user);
                setAllUsers(prev => prev.map(u => (u.id === userId ? { ...u, ...mapped } : u)));
                return true;
            } else {
                setAllUsers(prev => prev.map(u => (u.id === userId ? { ...u, status: 'active', isActive: true } : u)));
                return false;
            }
        } catch {
            setAllUsers(prev => prev.map(u => (u.id === userId ? { ...u, status: 'active', isActive: true } : u)));
            return false;
        }
    };

    const lockUser = async (userId: string): Promise<boolean> => {
        return updateUser(userId, { isLocked: true });
    };

    const unlockUser = async (userId: string): Promise<boolean> => {
        return updateUser(userId, { isLocked: false });
    };

    const refreshUsers = async () => {
        try {
            const res = await fetch(`${API_BASE}/users`);
            const data = await res.json();
            if (data?.success && Array.isArray(data.users)) {
                setAllUsers(data.users.map(mapServerUser));
            }
        } catch { }
    };

    const approveChangeRequest = async (requestId: string) => {
        try {
            const res = await fetch(`${API_BASE}/requests/${requestId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'approve' }),
            });
            const data = await res.json();
            if (data?.success) {
                setRequests(prev => prev.filter(r => r.id !== requestId));
                await refreshUsers();
                return true;
            }
            return false;
        } catch {
            return false;
        }
    };

    const rejectChangeRequest = async (requestId: string) => {
        try {
            const res = await fetch(`${API_BASE}/requests/${requestId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reject' }),
            });
            const data = await res.json();
            if (data?.success) {
                setRequests(prev => prev.filter(r => r.id !== requestId));
                return true;
            }
            return false;
        } catch {
            return false;
        }
    };

    const saveAiAnalysis = async (id: string, aiAnalysis: any): Promise<boolean> => {
        try {
            const res = await fetch(`${API_BASE}/syllabi/${id}/ai-analysis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ aiAnalysis }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setAllSyllabi(prev => prev.map(s => s.id === id ? { ...s, aiAnalysis } : s));
                return true;
            }
            return false;
        } catch {
            return false;
        }
    };

    const reuploadSyllabus = async (id: string, file: File, aiAnalysis?: any): Promise<boolean> => {
        try {
            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve, reject) => {
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
            });
            reader.readAsDataURL(file);
            const fileData = await base64Promise;

            const res = await fetch(`${API_BASE}/syllabi/${id}/reupload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileData, fileName: file.name, aiAnalysis }),
            });

            const data = await res.json();
            if (res.ok && data.success && data.syllabus) {
                const updatedSyllabus = data.syllabus;
                setAllSyllabi(prev => prev.map(s =>
                    s.id === id
                        ? {
                            ...s,
                            ...updatedSyllabus,
                            status: 'draft',
                            updatedAt: new Date().toISOString(),
                        }
                        : s
                ));

                return true;
            }
            return false;
        } catch (error) {
            console.error("Error re-uploading syllabus:", error);
            return false;
        }
    };

    const newVersion = async (id: string): Promise<{ success: boolean; syllabusId?: string }> => {
        try {
            const res = await fetch(`${API_BASE}/syllabi/${id}/new-version`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            if (res.ok && data.success && data.syllabus) {
                setAllSyllabi(prev => prev.map(s =>
                    s.id === id
                        ? { ...s, status: data.syllabus.status, version: data.syllabus.version, fileUrl: data.syllabus.fileUrl, updatedAt: new Date().toISOString() }
                        : s
                ));
                return { success: true, syllabusId: id };
            }
            return { success: false };
        } catch (error) {
            console.error('[newVersion] Error:', error);
            return { success: false };
        }
    };

    const updateCollaborators = async (id: string, collaboratorIds: string[]): Promise<boolean> => {
        try {
            const res = await fetch(`${API_BASE}/syllabi/${id}/collaborators`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ collaboratorIds }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setAllSyllabi(prev => prev.map(s =>
                    s.id === id ? { ...s, collaborators: data.collaborators } : s
                ));
                return true;
            }
            return false;
        } catch (error) {
            console.error('[updateCollaborators] Error:', error);
            return false;
        }
    };

    const uploadScannedSyllabus = async (id: string, fileData: string, fileName: string): Promise<boolean> => {
        try {
            const res = await fetch(`${API_BASE}/syllabi/${id}/scanned`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileData, fileName }),
            });

            const data = await res.json();
            if (res.ok && data.success && data.syllabus) {
                setAllSyllabi(prev => prev.map(s =>
                    s.id === id
                        ? {
                            ...s,
                            scannedFileLink: data.syllabus.scannedFileUrl,
                            updatedAt: new Date().toISOString(),
                        }
                        : s
                ));
                return true;
            }
            return false;
        } catch (error) {
            console.error("Error uploading scanned syllabus:", error);
            return false;
        }
    };

    const deleteSyllabus = async (id: string): Promise<{success: boolean, error?: string}> => {
        try {
            const res = await fetch(`${API_BASE}/syllabi/${id}`, {
                method: 'DELETE',
            });
            
            const text = await res.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                return { success: false, error: `Invalid JSON response: ${text.substring(0, 50)}...` };
            }

            if (res.ok && data.success) {
                setAllSyllabi(prev => prev.filter(s => s.id !== id));
                return { success: true };
            }
            return { success: false, error: data.error || `HTTP ${res.status}` };
        } catch (error: any) {
            console.error("Error deleting syllabus:", error);
            return { success: false, error: error.message };
        }
    };

    const uploadSyllabus = async (syllabus: Omit<Syllabus, 'id' | 'createdAt' | 'updatedAt' | 'reviewHistory'>, file: File): Promise<string | null> => {
        try {
            // 1. Read file as base64
            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve, reject) => {
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
            });
            reader.readAsDataURL(file);
            const fileData = await base64Promise;

            // 2. Prepare payload
            const payload = {
                facultyId: syllabus.facultyId,
                facultyName: syllabus.facultyName,
                facultyEmail: authUser?.email,
                college: syllabus.college,
                department: syllabus.department,
                courseCode: syllabus.courseCode,
                courseTitle: syllabus.courseTitle,
                semester: syllabus.semesterPeriod,
                semesterId: (syllabus as any).semesterId || "1",
                fileName: file.name,
                fileData: fileData,
                status: syllabus.status,
                aiAnalysis: syllabus.aiAnalysis,
            };

            // 3. POST to /syllabi
            const res = await fetch(`${API_BASE}/syllabi`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await res.json();
            if (res.ok && data.success && data.syllabus) {
                const newSyllabus = mapServerSyllabus(data.syllabus);
                setAllSyllabi(prev => [newSyllabus, ...prev]);
                return newSyllabus.id;
            }
            return null;
        } catch (error) {
            console.error("Error uploading syllabus:", error);
            return null;
        }
    };

    return (
        <DataContext.Provider value={{
            syllabi,
            allSyllabi,
            notifications,
            requests,
            pendingUsers,
            allUsers,
            addSyllabus,
            addSyllabusWithId,
            submitSyllabus,
            approveSyllabus,
            returnSyllabus,
            updateSyllabusStatus,
            addReviewAction,
            getSyllabiForRole,
            getNotificationsForUser,
            markNotificationRead,
            approveUser,
            rejectUser,
            addUser,
            updateUser,
            archiveUser,
            unarchiveUser,
            lockUser,
            unlockUser,
            approveChangeRequest,
            rejectChangeRequest,
            reuploadSyllabus,
            newVersion,
            uploadScannedSyllabus,
            uploadSyllabus,
            refreshSyllabi,
            submitBatchSyllabi,
            getSyllabusById,
            saveAiAnalysis,
            markAsOpened,
            deleteSyllabus,
            updateCollaborators,
            isLoading: isSyllabiLoading || isUsersLoading,
        }}>
            {children}
        </DataContext.Provider>
    );
}

export function useData() {
    const context = useContext(DataContext);
    if (context === undefined) {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
}
