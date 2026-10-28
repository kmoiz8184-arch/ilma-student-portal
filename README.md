# Campus Portal — ILMA-inspired independent demo

A learning/portfolio project built with HTML/CSS/JavaScript, Node.js + Express, MySQL, Nginx and Docker Compose. This is **not** an official ILMA University system and is not connected to its accounts or records. All seeded records are fictional demo data.

## Requirements
- Windows 10/11
- Docker Desktop running with Linux containers enabled
- PowerShell

## Run it
1. Extract the ZIP, open PowerShell in this folder.
2. Copy the environment template:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Open `.env` and replace `JWT_SECRET`, `DB_PASSWORD`, `ADMIN_PASSWORD`, and `STUDENT_PASSWORD` with your own strong local demo values. Set `MYSQL_ROOT_PASSWORD` in `.env` too (it is read by Compose but not in the example template; add `MYSQL_ROOT_PASSWORD=your-unique-root-password`). Keep `.env` private and never commit it to GitHub.
4. Start the containers:

   ```powershell
   docker compose up --build -d
   docker compose ps
   docker compose logs -f api
   ```

5. Open **http://localhost:8080**. API health check: **http://localhost:8080/health**.

## Seed demo logins
The initial demo accounts are created once when the database is empty. The password values come from `.env`:
- Student: `student@demo.local` / value of `STUDENT_PASSWORD` (template default `StudentDemo123!`)
- Admin: `admin@demo.local` / value of `ADMIN_PASSWORD` (template default `AdminDemo123!`)

These are development-only credentials. Change them before running the demo anywhere shared. If the database volume already contains users, changing the environment password will not update those existing accounts.

## Useful commands

```powershell
# Show containers
docker compose ps
# Follow API logs
docker compose logs -f api
# Stop containers but keep database data
docker compose down
# Stop and DELETE database data (destructive; resets demo accounts/data)
docker compose down -v
# Rebuild after code changes
docker compose up --build -d
```

## Included features
- Student/admin JWT login with bcrypt password hashes
- Student dashboard, results, timetable, attendance, fee ledger and notices
- Admin overview, student creation, notice publishing, result entry and fee entry
- MySQL persistence, Docker health check, Nginx reverse proxy and responsive layout
- Dark/light toggle

## Security / scope notes
- Local demo only; use unique secrets/passwords. Do not expose it to the public internet as-is.
- For production, add HTTPS, rate limiting, CSRF strategy if cookie auth is used, stronger validation, audit logs, migrations, backups, password reset, account lifecycle controls, and admin management for timetable/attendance.
- Fee records are informational sample records. There is no payment gateway.
- Timetable and attendance are read-only in this first iteration; admin can create students, notices, results and fee records.
