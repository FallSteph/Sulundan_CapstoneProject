export type UserRole = 'admin' | 'faculty' | 'collaborator_reviewer' | 'faculty_peer_reviewer' | 'dept_head' | 'dean' | 'citl' | 'vpaa';

export type SyllabusStatus =
  | 'draft'
  | 'submitted'
  | 'under_review_peer'
  | 'under_review_dept_head'
  | 'under_review_dean'
  | 'under_review_citl'
  | 'under_review_vpaa'
  | 'approved'
  | 'returned';

export interface User {
  id: string;
  employeeId?: string;
  isSeniorFaculty?: boolean;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  college: string;
  department: string;
  isApproved: boolean;
  status?: 'active' | 'archived';
  isActive?: boolean;
  isLocked?: boolean;
  lastLogin?: string;
  updatedAt?: string;
  createdAt: string;
  notificationsEnabled: boolean;
  theme?: 'light' | 'dark';
  hasPassword?: boolean;
}

export interface Suggestion {
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
}

export interface Syllabus {
  id: string;
  trackingId?: string;
  courseCode: string;
  courseTitle: string;
  /** ID of the academic semester (from SemesterContext / semesterStorage) */
  semesterId: string;
  academicYear?: string;
  /** Incremental version number: 1 = original submission */
  version?: number;
  semesterPeriod: string;
  college: string;
  department: string;
  facultyId: string;
  facultyName: string;
  fileName: string;
  fileUrl?: string;
  status: SyllabusStatus;
  createdAt: string;
  updatedAt: string;
  feedback?: string;
  reviewHistory: ReviewAction[];
  form17Link?: string;
  form18Link?: string;
  form17Data?: any;
  form18Data?: any;
  aiAnalysis?: {
    score: number;
    status?: 'excellent' | 'good' | 'needs_improvement';
    suggestions: Suggestion[];
    missingSections?: string[];
    coAlignment?: { coCode: string; coDescription: string; slos: string[] }[];
    bloomData?: { coCode: string; slo?: string | null; level: string }[];
    tableAnalysis?: {
      pre_midterm: Record<string, number>;
      pre_final: Record<string, number>;
    } | null;
    appliedSuggestions: boolean;
  };
  openedBy?: string[];
  // Tracking timestamps for reviewer roles
  forwardedToSeniorFacultyAt?: string;
  forwardedToDeptHeadAt?: string;
  forwardedToDeanAt?: string;
  forwardedToCITLAt?: string;
  forwardedToVPAAAt?: string;
  // Scanned file link
  scannedFileLink?: string;
  // Claim info for Senior Faculty queue
  claimedBySeniorFacultyId?: string | null;
  claimedBySeniorFacultyName?: string | null;
  assignedPeerReviewers?: {
    reviewerId: string;
    reviewerName: string;
    hasForwarded?: boolean;
    action?: 'forwarded' | 'returned' | null;
    comment?: string;
    forwardedAt?: string;
  }[];
  /** User IDs of collaborators added by the owner */
  collaborators?: string[];
  /** Current stage in the review workflow (COLLABORATOR, SENIOR_FACULTY, DEPT_HEAD, DEAN, CITL, VPAA) */
  currentStage?: string;
}

export interface ReviewAction {
  id: string;
  reviewerId: string;
  reviewerName: string;
  reviewerRole: UserRole;
  /** Version of the syllabus when this action happened */
  version?: number;
  action: 'approved' | 'returned' | 'forwarded';
  comment?: string;
  timestamp: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  syllabusId?: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

export type ChangeRequestType = 'role' | 'college_department' | 'both';
export type ChangeRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export interface ChangeRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  type: ChangeRequestType;
  requestedRole?: 'FACULTY' | 'DEPT_HEAD' | 'DEAN' | 'CITL' | 'VPAA' | null;
  requestedCollege?: string;
  requestedDepartment?: string;
  status: ChangeRequestStatus;
  createdAt: string;
  updatedAt?: string;
}

export const COLLEGES = [
  'College of Arts and Sciences',
  'College of Business',
  'College of Education',
  'College of Nursing',
  'College of Law',
  'College of Technologies',
  'College of Public Administration and Governance',
] as const;

export const DEPARTMENTS: Record<string, string[]> = {
  'College of Arts and Sciences': [
    'BA in Economics',
    'BA in English Language',
    'BA in Philosophy Pre-Law',
    'BA in Philosophy Teaching Track',
    'BA in Sociology',
    'BS in Biology Major in Biotechnology',
    'BS in Community Development',
    'BS in Development Communication',
    'BS in Environmental Science major in Environmental Heritage Studies',
    'BS in Mathematics',
    'Doctor of Philosophy in English Language',
    'Master of Arts in English Language',
    'Master of Arts in Guidance and Counseling',
    'Master of Arts in Sociology',
  ],
  'College of Business': [
    'BS in Accountancy',
    'BS in Business Administration major in Financial Management',
    'BS in Hospitality Management',
    'Master of Business Administration',
  ],
  'College of Education': [
    'Bachelor of Early Childhood Education',
    'Bachelor of Elementary Education',
    'Bachelor of Physical Education',
    'Bachelor of Secondary Education Major in English',
    'Bachelor of Secondary Education Major in Filipino',
    'Bachelor of Secondary Education Major in Mathematics',
    'Bachelor of Secondary Education Major in Science',
    'Bachelor of Secondary Education Major in Social Studies',
    'Doctor of Philosophy in Education Major in Instructional Systems Design',
    'Doctor of Philosophy in Educational Administration',
    'Doctor of Philosophy in Science Education Major in Biology',
    'Doctor of Philosophy in Science Education Major in Mathematics',
    'Master of Arts in Education Major in Educational Administration',
    'Master of Arts in Education Major in English Language Teaching',
    'Master of Arts in Education Major in General Science',
    'Master of Arts in Education Major in Mathematics Education',
  ],
  'College of Nursing': [
    'BS in Nursing',
  ],
  'College of Law': [
    'Juris Doctor',
  ],
  'College of Technologies': [
    'BS in Automotive Technology',
    'BS in Electronics Technology',
    'BS in Entertainment and Multimedia Computing Major in Digital Animation Technology',
    'BS in Food Technology',
    'BS in Information Technology',
  ],
  'College of Public Administration and Governance': [
    'Bachelor of Public Administration',
    'Doctor of Public Administration',
    'Master of Public Administration',
  ],
};

export const SEMESTERS = [
  '1st Semester 2024-2025',
  '2nd Semester 2024-2025',
  'Summer 2025',
  '1st Semester 2025-2026',
];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  faculty: 'Faculty',
  collaborator_reviewer: 'Peer Reviewer',
  faculty_peer_reviewer: 'Senior Faculty Reviewer',
  dept_head: 'Department Head',
  dean: 'Dean',
  citl: 'CITL',
  vpaa: 'VPAA',
};

export const ACCOUNT_ROLES: UserRole[] = [
  'admin',
  'faculty',
  'dept_head',
  'dean',
  'citl',
  'vpaa',
];

export const STATUS_LABELS: Record<SyllabusStatus, string> = {
  draft: 'Not Submitted',
  submitted: 'Peer Review',
  under_review_peer: 'Senior Faculty Review',
  under_review_dept_head: 'Dept. Head Review',
  under_review_dean: 'Dean Review',
  under_review_citl: 'CITL Review',
  under_review_vpaa: 'VPAA Review',
  approved: 'Approved',
  returned: 'Returned',
};

export const STATUS_COLORS: Record<SyllabusStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-info/10 text-info',
  under_review_peer: 'bg-warning/10 text-warning',
  under_review_dept_head: 'bg-warning/10 text-warning',
  under_review_dean: 'bg-warning/10 text-warning',
  under_review_citl: 'bg-warning/10 text-warning',
  under_review_vpaa: 'bg-warning/10 text-warning',
  approved: 'bg-success/10 text-success',
  returned: 'bg-destructive/10 text-destructive',
};
