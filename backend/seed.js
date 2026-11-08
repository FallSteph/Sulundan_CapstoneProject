const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const User = require("./models/User");
const Syllabus = require("./models/Syllabus");

const MOCK_USERS = [
  {
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@sulundan.edu',
    role: 'ADMIN',
    college: 'Administration', // Placeholder, admins see all
    department: 'IT Services',
  },
  {
    firstName: 'John',
    lastName: 'Smith',
    email: 'faculty@sulundan.edu',
    role: 'FACULTY',
    college: 'College of Technologies',
    department: 'Department of Computer Science',
  },
  {
    firstName: 'Sarah',
    lastName: 'Johnson',
    email: 'sjohnson@sulundan.edu',
    role: 'FACULTY',
    college: 'College of Technologies',
    department: 'Department of Information Technology',
  },
  {
    firstName: 'Patricia',
    lastName: 'Villanueva',
    email: 'pvillanueva@sulundan.edu',
    role: 'FACULTY',
    college: 'College of Arts and Sciences',
    department: 'Department of English',
  },
  {
    firstName: 'Lorna',
    lastName: 'Diaz',
    email: 'ldiaz@sulundan.edu',
    role: 'FACULTY',
    college: 'College of Arts and Sciences',
    department: 'Department of Biology',
  },
  {
    firstName: 'Michael',
    lastName: 'Brown',
    email: 'mbrown@sulundan.edu',
    role: 'FACULTY',
    college: 'College of Business',
    department: 'Department of Business Administration',
  },
  {
    firstName: 'Emily',
    lastName: 'Chen',
    email: 'echen@sulundan.edu',
    role: 'FACULTY',
    college: 'College of Education',
    department: 'Department of Elementary Education',
  },
  {
    firstName: 'Nicole',
    lastName: 'Soriano',
    email: 'nsoriano@sulundan.edu',
    role: 'FACULTY',
    college: 'College of Nursing',
    department: 'Department of Nursing',
  },
  {
    firstName: 'Francisco',
    lastName: 'Mercado',
    email: 'fmercado@sulundan.edu',
    role: 'FACULTY',
    college: 'College of Law',
    department: 'Department of Law',
  },
  {
    firstName: 'Benjamin',
    lastName: 'Torres',
    email: 'btorres@sulundan.edu',
    role: 'FACULTY',
    college: 'College of Public Administration & Governance',
    department: 'Department of Public Administration',
  },
  {
    firstName: 'Dr. Maria',
    lastName: 'Santos',
    email: 'depthead@sulundan.edu',
    role: 'DEPT_HEAD',
    college: 'College of Technologies',
    department: 'Department of Computer Science',
  },
  {
    firstName: 'Dr. Robert',
    lastName: 'Cruz',
    email: 'dean@sulundan.edu',
    role: 'DEAN',
    college: 'College of Technologies',
    department: 'Department of Computer Science',
  },
  {
    firstName: 'Dr. Anna',
    lastName: 'Reyes',
    email: 'citl@sulundan.edu',
    role: 'CITL',
    college: 'College of Technologies',
    department: 'Department of Information Technology',
  },
  {
    firstName: 'Dr. Carlos',
    lastName: 'Garcia',
    email: 'vpaa@sulundan.edu',
    role: 'VPAA',
    college: 'College of Public Administration & Governance',
    department: 'Department of Public Administration',
  },
];

const MOCK_SYLLABI = [
  // John Smith (Computer Science)
  { courseCode: 'CS101', courseTitle: 'Introduction to Computer Science', semester: '1st Semester 2024-2025', facultyEmail: 'faculty@sulundan.edu', status: 'APPROVED', currentStage: null, aiScore: 92 },
  { courseCode: 'CS201', courseTitle: 'Data Structures and Algorithms', semester: '1st Semester 2024-2025', facultyEmail: 'faculty@sulundan.edu', status: 'FOR_REVIEW', currentStage: 'DEPT_HEAD', aiScore: 85 },
  { courseCode: 'CS301', courseTitle: 'Database Systems', semester: '1st Semester 2024-2025', facultyEmail: 'faculty@sulundan.edu', status: 'FOR_REVIEW', currentStage: 'DEPT_HEAD', aiScore: 82 },
  
  // Sarah Johnson (IT)
  { courseCode: 'IT101', courseTitle: 'Introduction to Information Technology', semester: '1st Semester 2024-2025', facultyEmail: 'sjohnson@sulundan.edu', status: 'FOR_REVIEW', currentStage: 'DEPT_HEAD', aiScore: 80 },
  { courseCode: 'IT201', courseTitle: 'Web Development', semester: '1st Semester 2024-2025', facultyEmail: 'sjohnson@sulundan.edu', status: 'APPROVED', currentStage: null, aiScore: 88 },
  
  // Patricia Villanueva (English)
  { courseCode: 'ENG101', courseTitle: 'Communication Arts', semester: '1st Semester 2024-2025', facultyEmail: 'pvillanueva@sulundan.edu', status: 'APPROVED', currentStage: null, aiScore: 90 },
  
  // Lorna Diaz (Biology)
  { courseCode: 'BIO101', courseTitle: 'General Biology', semester: '1st Semester 2024-2025', facultyEmail: 'ldiaz@sulundan.edu', status: 'APPROVED', currentStage: null, aiScore: 95 },
  
  // Michael Brown (Business)
  { courseCode: 'BUS101', courseTitle: 'Principles of Management', semester: '1st Semester 2024-2025', facultyEmail: 'mbrown@sulundan.edu', status: 'APPROVED', currentStage: null, aiScore: 87 },
  
  // Emily Chen (Education)
  { courseCode: 'EDU101', courseTitle: 'Foundations of Education', semester: '1st Semester 2024-2025', facultyEmail: 'echen@sulundan.edu', status: 'APPROVED', currentStage: null, aiScore: 89 },
  
  // Nicole Soriano (Nursing)
  { courseCode: 'NUR101', courseTitle: 'Fundamentals of Nursing', semester: '1st Semester 2024-2025', facultyEmail: 'nsoriano@sulundan.edu', status: 'APPROVED', currentStage: null, aiScore: 93 },
  
  // Francisco Mercado (Law)
  { courseCode: 'LAW101', courseTitle: 'Introduction to Law', semester: '1st Semester 2024-2024', facultyEmail: 'fmercado@sulundan.edu', status: 'APPROVED', currentStage: null, aiScore: 91 },
  
  // Benjamin Torres (Public Admin)
  { courseCode: 'PA101', courseTitle: 'Introduction to Public Administration', semester: '1st Semester 2024-2025', facultyEmail: 'btorres@sulundan.edu', status: 'APPROVED', currentStage: null, aiScore: 86 },
];

async function seed() {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not defined in .env");

    await mongoose.connect(uri);
    console.log("Connected to MongoDB...");

    // Clear existing data for these mock accounts to avoid duplicates or stale data
    const userEmails = MOCK_USERS.map(u => u.email.toLowerCase().trim());
    await User.deleteMany({ email: { $in: userEmails } });
    
    // Also delete any existing syllabi associated with these faculty members to prevent duplicates
    const facultyMembers = await User.find({ email: { $in: userEmails } });
    const facultyIds = facultyMembers.map(f => f._id);
    await Syllabus.deleteMany({ 
      $or: [
        { course_code: { $in: MOCK_SYLLABI.map(s => s.courseCode) } },
        { faculty_id: { $in: facultyIds } }
      ]
    });
    
    console.log("Cleared existing mock data...");

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash("password123", salt);

    // Seed Users
    for (const u of MOCK_USERS) {
      const email = u.email.toLowerCase().trim();
      const newUser = new User({
        first_name: u.firstName,
        last_name: u.lastName,
        email: email,
        password_hash: password_hash,
        role: u.role,
        college: u.college,
        department: u.department,
        is_active: true,
        status: "ACTIVE"
      });

      await newUser.save();
      console.log(`Inserted user: ${email}`);
    }

    // Seed Syllabi
    for (const s of MOCK_SYLLABI) {
      const faculty = await User.findOne({ email: s.facultyEmail });
      if (!faculty) {
        console.log(`Faculty ${s.facultyEmail} not found, skipping syllabus ${s.courseCode}...`);
        continue;
      }

      const existingSyllabus = await Syllabus.findOne({ 
        course_code: s.courseCode, 
        faculty_id: faculty._id 
      });

      if (existingSyllabus) {
        console.log(`Syllabus ${s.courseCode} already exists, skipping...`);
        continue;
      }

      const newSyllabus = new Syllabus({
        faculty_id: faculty._id,
        college: faculty.college,
        department: faculty.department,
        course_code: s.courseCode,
        course_title: s.courseTitle,
        semester: s.semester,
        semester_id: "1",
        status: s.status,
        current_stage: s.currentStage,
        ai_compliance_score: s.aiScore,
        file_path: `uploads/syllabi/${s.courseCode}_Syllabus.docx`
      });

      await newSyllabus.save();
      console.log(`Inserted syllabus: ${s.courseCode}`);
    }

    console.log("Seeding completed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed:", err);
    process.exit(1);
  }
}

seed();
