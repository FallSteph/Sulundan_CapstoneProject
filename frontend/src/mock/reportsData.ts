// Mock data for Faculty Syllabus Reports page
// Each row = one faculty–subject assignment

export type ReportApprovalStatus =
  | 'not_yet_submitted'
  | 'submitted_pending_dept'
  | 'approved_dept_head'
  | 'forwarded_citl'
  | 'approved_citl'
  | 'forwarded_vpaa'
  | 'approved_vpaa'
  | 'returned_for_revision';

export const REPORT_STATUS_LABELS: Record<ReportApprovalStatus, string> = {
  not_yet_submitted: 'Not Yet Submitted',
  submitted_pending_dept: 'Submitted – Pending Dept. Review',
  approved_dept_head: 'Approved by Department Head',
  forwarded_citl: 'Forwarded to CITL',
  approved_citl: 'Approved by CITL',
  forwarded_vpaa: 'Forwarded to VPAA',
  approved_vpaa: 'Approved by VPAA',
  returned_for_revision: 'Returned for Revision',
};

export const REPORT_STATUS_COLORS: Record<ReportApprovalStatus, { bg: string; text: string }> = {
  not_yet_submitted:       { bg: 'bg-gray-100 dark:bg-gray-800',   text: 'text-gray-500 dark:text-gray-400' },
  submitted_pending_dept:  { bg: 'bg-yellow-50 dark:bg-yellow-950', text: 'text-yellow-700 dark:text-yellow-400' },
  approved_dept_head:      { bg: 'bg-sky-50 dark:bg-sky-950',      text: 'text-sky-700 dark:text-sky-400' },
  forwarded_citl:          { bg: 'bg-orange-50 dark:bg-orange-950', text: 'text-orange-700 dark:text-orange-400' },
  approved_citl:           { bg: 'bg-teal-50 dark:bg-teal-950',    text: 'text-teal-700 dark:text-teal-400' },
  forwarded_vpaa:          { bg: 'bg-purple-50 dark:bg-purple-950', text: 'text-purple-700 dark:text-purple-400' },
  approved_vpaa:           { bg: 'bg-green-50 dark:bg-green-950',  text: 'text-green-700 dark:text-green-400' },
  returned_for_revision:   { bg: 'bg-red-50 dark:bg-red-950',      text: 'text-red-700 dark:text-red-400' },
};

export interface FacultyReportRow {
  id: string;
  trackingId?: string;
  facultyId: string;
  facultyName: string;
  employmentStatus: 'Active' | 'Inactive';
  /** ID of the academic semester (from SemesterContext / semesterStorage) */
  semesterId: string;
  /** The display name of the semester, e.g. "1st Semester 2024-2025" */
  semesterPeriod: string;
  college: string;
  department: string;
  subjectCode: string;
  subjectName: string;
  version?: number;
  section: string;
  syllabusSubmitted: boolean;
  approvalStatus: ReportApprovalStatus;
  rawStatus?: string;
  remarks: string;
}

export const MOCK_FACULTY_REPORTS: FacultyReportRow[] = [
  // ========== College of Technologies — Dept of Computer Science ==========
  // John Smith — 5 subjects
  {
    id: 'r1', facultyId: '2', facultyName: 'John Smith', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Technologies',
    department: 'Department of Computer Science',
    subjectCode: 'CS101', subjectName: 'Introduction to Computer Science',
    section: 'BSCS 1A', syllabusSubmitted: true,
    approvalStatus: 'approved_vpaa', remarks: 'Fully approved',
  },
  {
    id: 'r2', facultyId: '2', facultyName: 'John Smith', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Technologies',
    department: 'Department of Computer Science',
    subjectCode: 'CS201', subjectName: 'Data Structures and Algorithms',
    section: 'BSCS 2A', syllabusSubmitted: true,
    approvalStatus: 'submitted_pending_dept', remarks: '',
  },
  {
    id: 'r3', facultyId: '2', facultyName: 'John Smith', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Technologies',
    department: 'Department of Computer Science',
    subjectCode: 'CS301', subjectName: 'Database Systems',
    section: 'BSCS 3A', syllabusSubmitted: true,
    approvalStatus: 'approved_dept_head', remarks: '',
  },
  {
    id: 'r4', facultyId: '2', facultyName: 'John Smith', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Technologies',
    department: 'Department of Computer Science',
    subjectCode: 'CS401', subjectName: 'Operating Systems',
    section: 'BSCS 4A', syllabusSubmitted: true,
    approvalStatus: 'approved_vpaa', remarks: 'Fully approved',
  },
  {
    id: 'r5', facultyId: '2', facultyName: 'John Smith', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Technologies',
    department: 'Department of Computer Science',
    subjectCode: 'CS501', subjectName: 'Artificial Intelligence',
    section: 'BSCS 4B', syllabusSubmitted: true,
    approvalStatus: 'forwarded_citl', remarks: '',
  },

  // ========== College of Technologies — Dept of Information Technology ==========
  // Sarah Johnson — 3 subjects
  {
    id: 'r6', facultyId: '61', facultyName: 'Sarah Johnson', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Technologies',
    department: 'Department of Information Technology',
    subjectCode: 'IT101', subjectName: 'Introduction to Information Technology',
    section: 'BSIT 1A', syllabusSubmitted: true,
    approvalStatus: 'submitted_pending_dept', remarks: '',
  },
  {
    id: 'r7', facultyId: '61', facultyName: 'Sarah Johnson', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Technologies',
    department: 'Department of Information Technology',
    subjectCode: 'IT201', subjectName: 'Web Development',
    section: 'BSIT 2A', syllabusSubmitted: true,
    approvalStatus: 'approved_vpaa', remarks: 'Fully approved',
  },
  {
    id: 'r8', facultyId: '61', facultyName: 'Sarah Johnson', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Technologies',
    department: 'Department of Information Technology',
    subjectCode: 'IT301', subjectName: 'Systems Analysis and Design',
    section: 'BSIT 3A', syllabusSubmitted: false,
    approvalStatus: 'not_yet_submitted', remarks: 'Faculty notified',
  },

  // Kevin Ong — 2 subjects (Electronics Technology — under College of Tech)
  {
    id: 'r9', facultyId: '62', facultyName: 'Kevin Ong', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Technologies',
    department: 'Department of Electronics Technology',
    subjectCode: 'ET101', subjectName: 'Basic Electronics',
    section: 'BSET 1A', syllabusSubmitted: true,
    approvalStatus: 'forwarded_vpaa', remarks: '',
  },
  {
    id: 'r10', facultyId: '62', facultyName: 'Kevin Ong', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Technologies',
    department: 'Department of Electronics Technology',
    subjectCode: 'ET201', subjectName: 'Circuit Analysis',
    section: 'BSET 2A', syllabusSubmitted: true,
    approvalStatus: 'returned_for_revision', remarks: 'Needs revised learning outcomes',
  },

  // Christine Yu — 2 subjects (Food Technology — under College of Tech)
  {
    id: 'r11', facultyId: '63', facultyName: 'Christine Yu', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Inactive', college: 'College of Technologies',
    department: 'Department of Food Technology',
    subjectCode: 'FT101', subjectName: 'Food Science Fundamentals',
    section: 'BSFT 1A', syllabusSubmitted: false,
    approvalStatus: 'not_yet_submitted', remarks: 'On leave',
  },
  {
    id: 'r12', facultyId: '63', facultyName: 'Christine Yu', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Inactive', college: 'College of Technologies',
    department: 'Department of Food Technology',
    subjectCode: 'FT201', subjectName: 'Food Processing Technology',
    section: 'BSFT 2A', syllabusSubmitted: false,
    approvalStatus: 'not_yet_submitted', remarks: 'On leave',
  },

  // ========== College of Arts and Sciences ==========
  // Patricia Villanueva — 3 subjects (English Language)
  {
    id: 'r13', facultyId: '12', facultyName: 'Patricia Villanueva', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Arts and Sciences',
    department: 'Department of English Language',
    subjectCode: 'ENG101', subjectName: 'Communication Arts',
    section: 'AB Eng 1A', syllabusSubmitted: true,
    approvalStatus: 'approved_citl', remarks: '',
  },
  {
    id: 'r14', facultyId: '12', facultyName: 'Patricia Villanueva', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Arts and Sciences',
    department: 'Department of English Language',
    subjectCode: 'ENG201', subjectName: 'Technical Writing',
    section: 'AB Eng 2A', syllabusSubmitted: true,
    approvalStatus: 'forwarded_citl', remarks: '',
  },
  {
    id: 'r15', facultyId: '12', facultyName: 'Patricia Villanueva', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Arts and Sciences',
    department: 'Department of English Language',
    subjectCode: 'ENG301', subjectName: 'World Literature',
    section: 'AB Eng 3A', syllabusSubmitted: false,
    approvalStatus: 'not_yet_submitted', remarks: '',
  },

  // Lorna Diaz — 2 subjects (Biology)
  {
    id: 'r16', facultyId: '14', facultyName: 'Lorna Diaz', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Arts and Sciences',
    department: 'Department of Biology',
    subjectCode: 'BIO101', subjectName: 'General Biology',
    section: 'BS Bio 1A', syllabusSubmitted: true,
    approvalStatus: 'approved_vpaa', remarks: 'Fully approved',
  },
  {
    id: 'r17', facultyId: '14', facultyName: 'Lorna Diaz', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Arts and Sciences',
    department: 'Department of Biology',
    subjectCode: 'BIO201', subjectName: 'Microbiology',
    section: 'BS Bio 2A', syllabusSubmitted: true,
    approvalStatus: 'submitted_pending_dept', remarks: '',
  },

  // Jerome Pascual — 2 subjects (Philosophy — maps loosely to Mathematics dept)
  {
    id: 'r18', facultyId: '15', facultyName: 'Jerome Pascual', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Inactive', college: 'College of Arts and Sciences',
    department: 'Department of Mathematics',
    subjectCode: 'MATH101', subjectName: 'College Algebra',
    section: 'BSM 1A', syllabusSubmitted: true,
    approvalStatus: 'returned_for_revision', remarks: 'Needs updated references',
  },
  {
    id: 'r19', facultyId: '15', facultyName: 'Jerome Pascual', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Inactive', college: 'College of Arts and Sciences',
    department: 'Department of Mathematics',
    subjectCode: 'MATH201', subjectName: 'Calculus I',
    section: 'BSM 2A', syllabusSubmitted: false,
    approvalStatus: 'not_yet_submitted', remarks: 'On sabbatical',
  },

  // ========== College of Business ==========
  // Michael Brown — 3 subjects (Business Administration)
  {
    id: 'r20', facultyId: '22', facultyName: 'Michael Brown', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Business',
    department: 'Department of Business Administration',
    subjectCode: 'BUS101', subjectName: 'Principles of Management',
    section: 'BSBA 1A', syllabusSubmitted: true,
    approvalStatus: 'approved_vpaa', remarks: 'Fully approved',
  },
  {
    id: 'r21', facultyId: '22', facultyName: 'Michael Brown', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Business',
    department: 'Department of Business Administration',
    subjectCode: 'BUS201', subjectName: 'Marketing Management',
    section: 'BSBA 2A', syllabusSubmitted: true,
    approvalStatus: 'forwarded_vpaa', remarks: '',
  },
  {
    id: 'r22', facultyId: '22', facultyName: 'Michael Brown', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Business',
    department: 'Department of Business Administration',
    subjectCode: 'BUS301', subjectName: 'Strategic Management',
    section: 'BSBA 3A', syllabusSubmitted: true,
    approvalStatus: 'approved_dept_head', remarks: '',
  },

  // Angela Reyes — 2 subjects (Hospitality Management)
  {
    id: 'r23', facultyId: '23', facultyName: 'Angela Reyes', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Business',
    department: 'Department of Hospitality Management',
    subjectCode: 'HM101', subjectName: 'Introduction to Hospitality',
    section: 'BSHM 1A', syllabusSubmitted: true,
    approvalStatus: 'approved_citl', remarks: '',
  },
  {
    id: 'r24', facultyId: '23', facultyName: 'Angela Reyes', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Business',
    department: 'Department of Hospitality Management',
    subjectCode: 'HM201', subjectName: 'Food and Beverage Management',
    section: 'BSHM 2A', syllabusSubmitted: false,
    approvalStatus: 'not_yet_submitted', remarks: '',
  },

  // ========== College of Education ==========
  // Emily Chen — 3 subjects (Elementary Education)
  {
    id: 'r25', facultyId: '32', facultyName: 'Emily Chen', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Education',
    department: 'Department of Elementary Education',
    subjectCode: 'EDU101', subjectName: 'Foundations of Education',
    section: 'BEEd 1A', syllabusSubmitted: true,
    approvalStatus: 'approved_vpaa', remarks: 'Fully approved',
  },
  {
    id: 'r26', facultyId: '32', facultyName: 'Emily Chen', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Education',
    department: 'Department of Elementary Education',
    subjectCode: 'EDU201', subjectName: 'Child Development',
    section: 'BEEd 2A', syllabusSubmitted: true,
    approvalStatus: 'forwarded_citl', remarks: '',
  },
  {
    id: 'r27', facultyId: '32', facultyName: 'Emily Chen', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Education',
    department: 'Department of Elementary Education',
    subjectCode: 'EDU301', subjectName: 'Curriculum Development',
    section: 'BEEd 3A', syllabusSubmitted: true,
    approvalStatus: 'returned_for_revision', remarks: 'OBE alignment needed',
  },

  // Diana Fernandez — 2 subjects (Physical Education)
  {
    id: 'r28', facultyId: '34', facultyName: 'Diana Fernandez', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Education',
    department: 'Department of Physical Education',
    subjectCode: 'PE101', subjectName: 'Physical Fitness',
    section: 'BSEd PE 1A', syllabusSubmitted: true,
    approvalStatus: 'approved_dept_head', remarks: '',
  },
  {
    id: 'r30', facultyId: '34', facultyName: 'Diana Fernandez', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Education',
    department: 'Department of Physical Education',
    subjectCode: 'PE201', subjectName: 'Team Sports',
    section: 'BSEd PE 2A', syllabusSubmitted: false,
    approvalStatus: 'not_yet_submitted', remarks: '',
  },

  // ========== College of Nursing ==========
  // Nicole Soriano — 3 subjects
  {
    id: 'r31', facultyId: '42', facultyName: 'Nicole Soriano', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Nursing',
    department: 'Department of Nursing',
    subjectCode: 'NUR101', subjectName: 'Fundamentals of Nursing',
    section: 'BSN 1A', syllabusSubmitted: true,
    approvalStatus: 'approved_vpaa', remarks: 'Fully approved',
  },
  {
    id: 'r32', facultyId: '42', facultyName: 'Nicole Soriano', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Nursing',
    department: 'Department of Nursing',
    subjectCode: 'NUR201', subjectName: 'Medical-Surgical Nursing',
    section: 'BSN 2A', syllabusSubmitted: true,
    approvalStatus: 'forwarded_vpaa', remarks: '',
  },
  {
    id: 'r33', facultyId: '42', facultyName: 'Nicole Soriano', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Nursing',
    department: 'Department of Nursing',
    subjectCode: 'NUR301', subjectName: 'Community Health Nursing',
    section: 'BSN 3A', syllabusSubmitted: true,
    approvalStatus: 'approved_citl', remarks: '',
  },

  // ========== College of Law ==========
  // Francisco Mercado — 2 subjects
  {
    id: 'r34', facultyId: '51', facultyName: 'Francisco Mercado', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Law',
    department: 'Department of Law',
    subjectCode: 'LAW101', subjectName: 'Introduction to Law',
    section: 'JD 1A', syllabusSubmitted: true,
    approvalStatus: 'approved_vpaa', remarks: 'Fully approved',
  },
  {
    id: 'r35', facultyId: '51', facultyName: 'Francisco Mercado', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Law',
    department: 'Department of Law',
    subjectCode: 'LAW201', subjectName: 'Constitutional Law',
    section: 'JD 2A', syllabusSubmitted: true,
    approvalStatus: 'submitted_pending_dept', remarks: '',
  },

  // ========== College of Public Administration and Governance ==========
  // Benjamin Torres — 2 subjects
  {
    id: 'r36', facultyId: '72', facultyName: 'Benjamin Torres', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Public Administration and Governance',
    department: 'Department of Public Administration',
    subjectCode: 'PA101', subjectName: 'Introduction to Public Administration',
    section: 'BSPA 1A', syllabusSubmitted: true,
    approvalStatus: 'approved_vpaa', remarks: 'Fully approved',
  },
  {
    id: 'r37', facultyId: '72', facultyName: 'Benjamin Torres', semesterId: '1', semesterPeriod: '1st Semester 2024-2025',
    employmentStatus: 'Active', college: 'College of Public Administration and Governance',
    department: 'Department of Public Administration',
    subjectCode: 'PA201', subjectName: 'Public Policy Analysis',
    section: 'BSPA 2A', syllabusSubmitted: true,
    approvalStatus: 'forwarded_citl', remarks: '',
  },
];
