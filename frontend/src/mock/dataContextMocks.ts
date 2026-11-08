import { Syllabus, Notification, User } from '@/types';

export const INITIAL_SYLLABI: Syllabus[] = [
  // ========== FOR DR. MARIA SANTOS (Dept Head - Computer Science) ==========
  {
    id: '1',
    semesterId: '1',
    courseCode: 'CS101',
    courseTitle: 'Introduction to Computer Science',
    semesterPeriod: '1st Semester 2024-2025',
    college: 'College of Technologies',
    department: 'Department of Computer Science', // Dr. Maria Santos' department
    facultyId: '2',
    facultyName: 'John Smith',
    fileName: 'CS101_Syllabus.docx',
    status: 'under_review_dept_head', // Pending with Dr. Maria Santos
    createdAt: '2024-10-15',
    updatedAt: '2024-10-15',
    reviewHistory: [],
  },
  {
    id: '2',
    semesterId: '1',
    courseCode: 'CS201',
    courseTitle: 'Data Structures and Algorithms',
    semesterPeriod: '1st Semester 2024-2025',
    college: 'College of Technologies',
    department: 'Department of Computer Science', // Dr. Maria Santos' department
    facultyId: '2',
    facultyName: 'John Smith',
    fileName: 'CS201_Syllabus.docx',
    status: 'under_review_dept_head', // Pending with Dr. Maria Santos
    createdAt: '2024-10-18',
    updatedAt: '2024-10-18',
    reviewHistory: [],
  },
  {
    id: '3',
    semesterId: '1',
    courseCode: 'CS301',
    courseTitle: 'Object-Oriented Programming',
    semesterPeriod: '1st Semester 2024-2025',
    college: 'College of Technologies',
    department: 'Department of Computer Science', // Dr. Maria Santos' department
    facultyId: '15', // Another faculty in CS
    facultyName: 'Dr. James Lee',
    fileName: 'CS301_Syllabus.docx',
    status: 'under_review_dept_head', // Pending with Dr. Maria Santos
    createdAt: '2024-10-17',
    updatedAt: '2024-10-17',
    reviewHistory: [],
  },
  
  // ========== FOR JOHN SMITH (Faculty) ==========
  {
    id: '4',
    semesterId: '1',
    courseCode: 'CS401',
    courseTitle: 'Database Systems',
    semesterPeriod: '1st Semester 2024-2025',
    college: 'College of Technologies',
    department: 'Department of Computer Science',
    facultyId: '2', // John Smith
    facultyName: 'John Smith',
    fileName: 'CS401_Syllabus.docx',
    status: 'returned', // Returned for John Smith
    createdAt: '2024-10-10',
    updatedAt: '2024-10-17',
    feedback: 'Please add more hands-on programming exercises.',
    reviewHistory: [
      {
        id: 'r1',
        reviewerId: '3',
        reviewerName: 'Dr. Maria Santos',
        reviewerRole: 'dept_head',
        action: 'returned',
        comment: 'Please add more hands-on programming exercises.',
        timestamp: '2024-10-17',
      },
    ],
  },
  {
    id: '5',
    semesterId: '1',
    courseCode: 'CS501',
    courseTitle: 'Software Engineering',
    semesterPeriod: '1st Semester 2024-2025',
    college: 'College of Technologies',
    department: 'Department of Computer Science',
    facultyId: '2', // John Smith
    facultyName: 'John Smith',
    fileName: 'CS501_Syllabus.docx',
    status: 'returned', // Returned for John Smith
    createdAt: '2024-10-05',
    updatedAt: '2024-10-16',
    feedback: 'Need more case studies.',
    reviewHistory: [
      {
        id: 'r2',
        reviewerId: '3',
        reviewerName: 'Dr. Maria Santos',
        reviewerRole: 'dept_head',
        action: 'forwarded',
        timestamp: '2024-10-12',
      },
      {
        id: 'r3',
        reviewerId: '4',
        reviewerName: 'Dr. Robert Cruz',
        reviewerRole: 'dean',
        action: 'returned',
        comment: 'Need more case studies.',
        timestamp: '2024-10-16',
      },
    ],
  },
  
  // ========== FOR DR. ROBERT CRUZ (Dean) ==========
  {
    id: '6',
    semesterId: '1',
    courseCode: 'CS102',
    courseTitle: 'Programming Fundamentals',
    semesterPeriod: '1st Semester 2024-2025',
    college: 'College of Technologies',
    department: 'Department of Computer Science',
    facultyId: '2',
    facultyName: 'John Smith',
    fileName: 'CS102_Syllabus.docx',
    status: 'under_review_dean', // Pending with Dr. Robert Cruz
    createdAt: '2024-10-14',
    updatedAt: '2024-10-17',
    reviewHistory: [
      {
        id: 'r4',
        reviewerId: '3',
        reviewerName: 'Dr. Maria Santos',
        reviewerRole: 'dept_head',
        action: 'forwarded',
        comment: 'Well-structured syllabus.',
        timestamp: '2024-10-17',
      },
    ],
  },
  {
    id: '7',
    semesterId: '1',
    courseCode: 'ARCH101',
    courseTitle: 'Introduction to Architecture',
    semesterPeriod: '1st Semester 2024-2025',
    college: 'College of Technologies',
    department: 'Department of Architecture',
    facultyId: '16',
    facultyName: 'Miguel Torres',
    fileName: 'ARCH101_Syllabus.docx',
    status: 'under_review_dean', // Pending with Dr. Robert Cruz
    createdAt: '2024-10-18',
    updatedAt: '2024-10-18',
    reviewHistory: [
      {
        id: 'r5',
        reviewerId: '17',
        reviewerName: 'Dr. Sofia Ramirez',
        reviewerRole: 'dept_head',
        action: 'forwarded',
        comment: 'Approved at department level.',
        timestamp: '2024-10-18',
      },
    ],
  },
  
  // ========== FOR DR. ANNA REYES (CITL) ==========
  {
    id: '8',
    semesterId: '1',
    courseCode: 'IT301',
    courseTitle: 'Web Development',
    semesterPeriod: '1st Semester 2024-2025',
    college: 'College of Technologies',
    department: 'Department of Information Technology',
    facultyId: '7',
    facultyName: 'Sarah Johnson',
    fileName: 'IT301_Syllabus.docx',
    status: 'under_review_citl', // Pending with Dr. Anna Reyes
    createdAt: '2024-10-05',
    updatedAt: '2024-10-14',
    reviewHistory: [
      {
        id: 'r6',
        reviewerId: '8',
        reviewerName: 'Dr. James Lee',
        reviewerRole: 'dept_head',
        action: 'forwarded',
        comment: 'Approved. Forwarding to Dean.',
        timestamp: '2024-10-08',
      },
      {
        id: 'r7',
        reviewerId: '4',
        reviewerName: 'Dr. Robert Cruz',
        reviewerRole: 'dean',
        action: 'forwarded',
        comment: 'Excellent syllabus. Forwarding to CITL.',
        timestamp: '2024-10-14',
      },
    ],
  },
  
  // ========== FOR DR. CARLOS GARCIA (VPAA) ==========
  {
    id: '9',
    semesterId: '1',
    courseCode: 'BUS101',
    courseTitle: 'Principles of Management',
    semesterPeriod: '1st Semester 2024-2025',
    college: 'College of Business',
    department: 'Department of Business Administration',
    facultyId: '9',
    facultyName: 'Michael Brown',
    fileName: 'BUS101_Syllabus.docx',
    status: 'under_review_vpaa', // Pending with Dr. Carlos Garcia
    createdAt: '2024-09-20',
    updatedAt: '2024-10-15',
    reviewHistory: [
      {
        id: 'r8',
        reviewerId: '10',
        reviewerName: 'Dr. Lisa Wong',
        reviewerRole: 'dept_head',
        action: 'forwarded',
        timestamp: '2024-09-25',
      },
      {
        id: 'r9',
        reviewerId: '11',
        reviewerName: 'Dr. Mark Davis',
        reviewerRole: 'dean',
        action: 'forwarded',
        timestamp: '2024-09-30',
      },
      {
        id: 'r10',
        reviewerId: '5',
        reviewerName: 'Dr. Anna Reyes',
        reviewerRole: 'citl',
        action: 'forwarded',
        comment: 'Well-structured syllabus.',
        timestamp: '2024-10-15',
      },
    ],
  },
  
  // ========== APPROVED SYLLABI ==========
  {
    id: '10',
    semesterId: '1',
    courseCode: 'EDU202',
    courseTitle: 'Educational Psychology',
    semesterPeriod: '1st Semester 2024-2025',
    college: 'College of Education',
    department: 'Department of Elementary Education',
    facultyId: '12',
    facultyName: 'Emily Chen',
    fileName: 'EDU202_Syllabus.docx',
    status: 'approved',
    createdAt: '2024-09-15',
    updatedAt: '2024-10-10',
    reviewHistory: [
      {
        id: 'r11',
        reviewerId: '13',
        reviewerName: 'Dr. Rose Garcia',
        reviewerRole: 'dept_head',
        action: 'forwarded',
        timestamp: '2024-09-20',
      },
      {
        id: 'r12',
        reviewerId: '14',
        reviewerName: 'Dr. Peter Tan',
        reviewerRole: 'dean',
        action: 'forwarded',
        timestamp: '2024-09-25',
      },
      {
        id: 'r13',
        reviewerId: '5',
        reviewerName: 'Dr. Anna Reyes',
        reviewerRole: 'citl',
        action: 'forwarded',
        timestamp: '2024-10-01',
      },
      {
        id: 'r14',
        reviewerId: '6',
        reviewerName: 'Dr. Carlos Garcia',
        reviewerRole: 'vpaa',
        action: 'approved',
        comment: 'Final approval granted.',
        timestamp: '2024-10-10',
      },
    ],
  },
];

export const INITIAL_NOTIFICATIONS: Notification[] = [
  // For Dr. Maria Santos (dept_head)
  {
    id: 'n1',
    userId: '3',
    title: 'New Syllabus Submitted',
    message: 'John Smith submitted CS101 syllabus for review.',
    syllabusId: '1',
    isRead: false,
    createdAt: '2024-10-15T10:30:00',
  },
  {
    id: 'n2',
    userId: '3',
    title: 'New Syllabus Submitted',
    message: 'John Smith submitted CS201 syllabus for review.',
    syllabusId: '2',
    isRead: false,
    createdAt: '2024-10-18T09:15:00',
  },
  {
    id: 'n3',
    userId: '3',
    title: 'New Syllabus Submitted',
    message: 'Dr. James Lee submitted CS301 syllabus for review.',
    syllabusId: '3',
    isRead: false,
    createdAt: '2024-10-17T14:20:00',
  },
  
  // For John Smith (faculty)
  {
    id: 'n4',
    userId: '2',
    title: 'Syllabus Returned for Revision',
    message: 'CS401 Database Systems has been returned by Department Head.',
    syllabusId: '4',
    isRead: false,
    createdAt: '2024-10-17T11:30:00',
  },
  {
    id: 'n5',
    userId: '2',
    title: 'Syllabus Returned for Revision',
    message: 'CS501 Software Engineering has been returned by Dean.',
    syllabusId: '5',
    isRead: false,
    createdAt: '2024-10-16T15:20:00',
  },
  
  // For Dr. Robert Cruz (dean)
  {
    id: 'n6',
    userId: '4',
    title: 'Syllabus Ready for Review',
    message: 'CS102 Programming Fundamentals has been forwarded from Department Head.',
    syllabusId: '6',
    isRead: false,
    createdAt: '2024-10-17T16:45:00',
  },
  {
    id: 'n7',
    userId: '4',
    title: 'Syllabus Ready for Review',
    message: 'ARCH101 Introduction to Architecture has been forwarded from Department Head.',
    syllabusId: '7',
    isRead: false,
    createdAt: '2024-10-18T10:10:00',
  },
  
  // For Dr. Anna Reyes (CITL)
  {
    id: 'n8',
    userId: '5',
    title: 'Syllabus Pending CITL Review',
    message: 'IT301 Web Development syllabus is ready for your review.',
    syllabusId: '8',
    isRead: true,
    createdAt: '2024-10-14T09:15:00',
  },
  
  // For Dr. Carlos Garcia (VPAA)
  {
    id: 'n9',
    userId: '6',
    title: 'Syllabus Pending Final Approval',
    message: 'BUS101 Principles of Management is ready for final approval.',
    syllabusId: '9',
    isRead: false,
    createdAt: '2024-10-15T16:45:00',
  },
];

// Keep your INITIAL_PENDING_USERS the same...
