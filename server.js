require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const cors = require('cors');

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true }));
app.use(express.json({ limit: '100kb' }));
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'unsafe-local-demo-secret-change-me';
let pool;

const schema = `
CREATE TABLE IF NOT EXISTS users (
 id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL,
 email VARCHAR(190) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
 role ENUM('student','admin') NOT NULL DEFAULT 'student', student_id VARCHAR(40) UNIQUE NULL,
 program VARCHAR(120) DEFAULT 'BS Computer Science', semester INT DEFAULT 4,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS results (
 id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, course_code VARCHAR(30) NOT NULL,
 course_name VARCHAR(150) NOT NULL, marks DECIMAL(5,2) NOT NULL DEFAULT 0,
 total_marks DECIMAL(5,2) NOT NULL DEFAULT 100, grade VARCHAR(5) NOT NULL DEFAULT 'A',
 semester INT NOT NULL DEFAULT 4, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS timetable (
 id INT AUTO_INCREMENT PRIMARY KEY, course_code VARCHAR(30) NOT NULL, course_name VARCHAR(150) NOT NULL,
 day_name VARCHAR(20) NOT NULL, start_time VARCHAR(10) NOT NULL, end_time VARCHAR(10) NOT NULL,
 room VARCHAR(50) NOT NULL, instructor VARCHAR(120) NOT NULL
);
CREATE TABLE IF NOT EXISTS attendance (
 id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, course_code VARCHAR(30) NOT NULL,
 course_name VARCHAR(150) NOT NULL, attended INT NOT NULL DEFAULT 0, total_classes INT NOT NULL DEFAULT 0,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS fees (
 id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, term VARCHAR(80) NOT NULL,
 amount DECIMAL(10,2) NOT NULL, due_date DATE NOT NULL, status ENUM('Paid','Pending','Overdue') NOT NULL DEFAULT 'Pending',
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS notices (
 id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(180) NOT NULL, body TEXT NOT NULL,
 category VARCHAR(60) NOT NULL DEFAULT 'General', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`;

async function waitForDb() {
  for (let i = 0; i < 30; i++) {
    try {
      pool = mysql.createPool({ host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || 'portal_user', password: process.env.DB_PASSWORD || 'change_demo_db_password',
        database: process.env.DB_NAME || 'student_portal', waitForConnections: true, connectionLimit: 10, decimalNumbers: true });
      await pool.query('SELECT 1'); return;
    } catch (e) { if (pool) { try { await pool.end(); } catch {} } pool = null; await new Promise(r => setTimeout(r, 2000)); }
  }
  throw new Error('Database did not become ready in time');
}
async function initDb() {
  for (const statement of schema.split(';').map(s => s.trim()).filter(Boolean)) await pool.query(statement);
  const [users] = await pool.query('SELECT id FROM users LIMIT 1');
  if (users.length === 0) {
    const adminHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'AdminDemo123!', 12);
    const studentHash = await bcrypt.hash(process.env.STUDENT_PASSWORD || 'StudentDemo123!', 12);
    await pool.query('INSERT INTO users (name,email,password_hash,role,student_id,program,semester) VALUES (?,?,?,?,?,?,?)',
      ['Portal Administrator', process.env.ADMIN_EMAIL || 'admin@demo.local', adminHash, 'admin', null, 'Administration', 0]);
    const [s] = await pool.query('INSERT INTO users (name,email,password_hash,role,student_id,program,semester) VALUES (?,?,?,?,?,?,?)',
      ['Demo Student', process.env.STUDENT_EMAIL || 'student@demo.local', studentHash, 'student', 'DEMO-2026-001', 'BS Computer Science', 4]);
    const uid = s.insertId;
    await pool.query('INSERT INTO results (user_id,course_code,course_name,marks,total_marks,grade,semester) VALUES ?', [[
      [uid,'CS201','Data Structures & Algorithms',86,100,'A',4], [uid,'CS2210','Web Engineering I',82,100,'A-',4],
      [uid,'AS222','Linear Algebra',77,100,'B+',4], [uid,'AS321','Numerical Computing',89,100,'A',4]]]);
    await pool.query('INSERT INTO attendance (user_id,course_code,course_name,attended,total_classes) VALUES ?', [[
      [uid,'CS201','Data Structures & Algorithms',18,20], [uid,'CS2210','Web Engineering I',16,20],
      [uid,'AS222','Linear Algebra',17,20], [uid,'AS321','Numerical Computing',19,20]]]);
    await pool.query('INSERT INTO fees (user_id,term,amount,due_date,status) VALUES ?', [[
      [uid,'Fall 2026 Tuition',85000,'2026-11-15','Pending'], [uid,'Student Services',5000,'2026-09-15','Paid']]]);
    await pool.query('INSERT INTO timetable (course_code,course_name,day_name,start_time,end_time,room,instructor) VALUES ?', [[
      ['CS201','Data Structures & Algorithms','Monday','09:00','10:30','Lab 2','Mr. Ahmed'],
      ['CS2210','Web Engineering I','Tuesday','11:00','12:30','Room 204','Ms. Sana'],
      ['AS222','Linear Algebra','Wednesday','09:00','10:30','Room 105','Dr. Ali'],
      ['AS321','Numerical Computing','Thursday','13:00','14:30','Room 302','Mr. Bilal']]]);
    await pool.query('INSERT INTO notices (title,body,category) VALUES ?', [[
      ['Welcome to the Student Portal Demo','This is a sample notice in an independent practice project.','General'],
      ['Midterm preparation week','Please check your course pages and class timetable for this demo.','Academic'],
      ['Fee record reminder','This is sample fee data only. No real payment can be made through this portal.','Finance']]]);
  }
}
function auth(req,res,next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'Please log in to continue.' }); }
}
function adminOnly(req,res,next) { if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' }); next(); }
function asyncRoute(fn) { return (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next); }
app.get('/health', (req,res) => res.json({ status: 'ok', service: 'student-portal-api' }));
app.get('/api/health', (req,res) => res.json({ status: 'ok' }));
app.post('/api/auth/login', asyncRoute(async (req,res) => {
  const email = String(req.body.email || '').trim().toLowerCase(); const password = String(req.body.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const [rows] = await pool.query('SELECT id,name,email,password_hash,role,student_id,program,semester FROM users WHERE email=?', [email]);
  if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
  const u = rows[0]; const token = jwt.sign({ id:u.id, role:u.role, email:u.email, name:u.name }, JWT_SECRET, { expiresIn:'8h' });
  delete u.password_hash; res.json({ token, user:u });
}));
app.get('/api/me', auth, asyncRoute(async (req,res) => {
  const [rows] = await pool.query('SELECT id,name,email,role,student_id,program,semester FROM users WHERE id=?',[req.user.id]);
  if (!rows.length) return res.status(404).json({error:'User not found'}); res.json(rows[0]);
}));
app.get('/api/dashboard', auth, asyncRoute(async (req,res) => {
  const id=req.user.id;
  const [[r]] = await pool.query('SELECT COUNT(*) AS subjects, ROUND(AVG(marks/total_marks*100),1) AS average_marks FROM results WHERE user_id=?',[id]);
  const [[a]] = await pool.query('SELECT COALESCE(SUM(attended),0) AS attended, COALESCE(SUM(total_classes),0) AS total FROM attendance WHERE user_id=?',[id]);
  const [[f]] = await pool.query("SELECT COALESCE(SUM(CASE WHEN status!='Paid' THEN amount ELSE 0 END),0) AS due FROM fees WHERE user_id=?",[id]);
  const [n] = await pool.query('SELECT id,title,body,category,created_at FROM notices ORDER BY created_at DESC LIMIT 5');
  res.json({ subjects:r.subjects, averageMarks:r.average_marks || 0, attendance:a.total?Math.round(a.attended/a.total*100):0, feeDue:f.due, notices:n });
}));
app.get('/api/results', auth, asyncRoute(async (req,res) => { const [rows]=await pool.query('SELECT id,course_code,course_name,marks,total_marks,grade,semester FROM results WHERE user_id=? ORDER BY semester DESC,id',[req.user.id]); res.json(rows); }));
app.get('/api/timetable', auth, asyncRoute(async (req,res) => { const [rows]=await pool.query('SELECT id,course_code,course_name,day_name,start_time,end_time,room,instructor FROM timetable ORDER BY FIELD(day_name,"Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"),start_time'); res.json(rows); }));
app.get('/api/attendance', auth, asyncRoute(async (req,res) => { const [rows]=await pool.query('SELECT id,course_code,course_name,attended,total_classes,ROUND(attended/NULLIF(total_classes,0)*100,1) AS percentage FROM attendance WHERE user_id=?',[req.user.id]); res.json(rows); }));
app.get('/api/fees', auth, asyncRoute(async (req,res) => { const [rows]=await pool.query('SELECT id,term,amount,due_date,status FROM fees WHERE user_id=? ORDER BY due_date DESC',[req.user.id]); res.json(rows); }));
app.get('/api/notices', auth, asyncRoute(async (req,res) => { const [rows]=await pool.query('SELECT id,title,body,category,created_at FROM notices ORDER BY created_at DESC'); res.json(rows); }));
app.get('/api/admin/overview', auth, adminOnly, asyncRoute(async (req,res) => {
  const [[u]]=await pool.query("SELECT COUNT(*) AS totalStudents FROM users WHERE role='student'");
  const [[n]]=await pool.query('SELECT COUNT(*) AS totalNotices FROM notices');
  const [[f]]=await pool.query("SELECT COALESCE(SUM(amount),0) AS unpaidFees FROM fees WHERE status!='Paid'");
  res.json({totalStudents:u.totalStudents,totalNotices:n.totalNotices,unpaidFees:f.unpaidFees});
}));
app.get('/api/admin/students', auth, adminOnly, asyncRoute(async (req,res) => { const [rows]=await pool.query("SELECT id,name,email,student_id,program,semester FROM users WHERE role='student' ORDER BY id"); res.json(rows); }));
app.post('/api/admin/students', auth, adminOnly, asyncRoute(async (req,res) => {
  const {name,email,password,studentId,program,semester}=req.body;
  if(!name||!email||!password||!studentId) return res.status(400).json({error:'Name, email, password and student ID are required.'});
  if(String(password).length<8) return res.status(400).json({error:'Password must be at least 8 characters.'});
  const hash=await bcrypt.hash(String(password),12);
  const [r]=await pool.query('INSERT INTO users (name,email,password_hash,role,student_id,program,semester) VALUES (?,?,?,?,?,?,?)',[String(name).trim(),String(email).trim().toLowerCase(),hash,'student',String(studentId).trim(),String(program||'BS Computer Science'),Number(semester)||1]);
  res.status(201).json({id:r.insertId,message:'Demo student created.'});
}));
app.post('/api/admin/notices', auth, adminOnly, asyncRoute(async (req,res) => { const {title,body,category}=req.body; if(!title||!body) return res.status(400).json({error:'Title and body are required.'}); const [r]=await pool.query('INSERT INTO notices (title,body,category) VALUES (?,?,?)',[String(title).trim(),String(body).trim(),String(category||'General').trim()]); res.status(201).json({id:r.insertId,message:'Notice published.'}); }));
app.post('/api/admin/results', auth, adminOnly, asyncRoute(async (req,res) => {
 const {studentId,courseCode,courseName,marks,totalMarks,grade,semester}=req.body;
 if(!studentId||!courseCode||!courseName||marks===undefined) return res.status(400).json({error:'Student ID, course code, course name and marks are required.'});
 const [u]=await pool.query("SELECT id FROM users WHERE student_id=? AND role='student'",[String(studentId)]); if(!u.length) return res.status(404).json({error:'Student ID not found.'});
 const m=Number(marks), total=Number(totalMarks||100); if(!Number.isFinite(m)||!Number.isFinite(total)||m<0||total<=0||m>total) return res.status(400).json({error:'Marks must be between 0 and total marks.'});
 const [r]=await pool.query('INSERT INTO results (user_id,course_code,course_name,marks,total_marks,grade,semester) VALUES (?,?,?,?,?,?,?)',[u[0].id,String(courseCode),String(courseName),m,total,String(grade||'Pending'),Number(semester)||1]); res.status(201).json({id:r.insertId,message:'Result added.'});
}));
app.post('/api/admin/fees', auth, adminOnly, asyncRoute(async (req,res) => { const {studentId,term,amount,dueDate,status}=req.body; if(!studentId||!term||amount===undefined||!dueDate) return res.status(400).json({error:'Student ID, term, amount and due date are required.'}); const [u]=await pool.query("SELECT id FROM users WHERE student_id=? AND role='student'",[String(studentId)]); if(!u.length) return res.status(404).json({error:'Student ID not found.'}); const a=Number(amount); if(!Number.isFinite(a)||a<0) return res.status(400).json({error:'Amount must be zero or greater.'}); const s=['Paid','Pending','Overdue'].includes(status)?status:'Pending'; const [r]=await pool.query('INSERT INTO fees (user_id,term,amount,due_date,status) VALUES (?,?,?, ?,?)',[u[0].id,String(term),a,String(dueDate),s]); res.status(201).json({id:r.insertId,message:'Fee record added.'}); }));
app.use((err,req,res,next)=>{ console.error(err.message); if(err.code==='ER_DUP_ENTRY') return res.status(409).json({error:'Email or student ID already exists.'}); res.status(500).json({error:'Server error. Check API logs for details.'}); });
(async()=>{ try { await waitForDb(); await initDb(); app.listen(PORT,'0.0.0.0',()=>console.log(`Student portal API listening on ${PORT}`)); } catch(e) { console.error(e); process.exit(1); } })();
