# Hyna Studio Management System

Enterprise-grade, database-driven team and project management platform built with React, Vite, TypeScript, Tailwind CSS, and Supabase PostgreSQL with strict Row Level Security (RLS).

---

## 📁 Project Structure

```
hyna-Management/
├── hyna-frontend/                 # Frontend React SPA
│   ├── public/                    # Static assets & icons
│   ├── src/
│   │   ├── assets/                # Brand assets
│   │   ├── components/            # UI & layout component library
│   │   │   ├── auth/              # Role-guarded route protection
│   │   │   ├── layout/            # Sidebar, Header, CommandPalette, AppLayout
│   │   │   └── ui/                # Reusable Radix/Tailwind components
│   │   ├── lib/                   # Supabase client & utilities
│   │   ├── pages/                 # Role workspaces & module pages
│   │   │   ├── admin/             # CEO / CTO / COO / CPO Executive Command Center
│   │   │   ├── manager/           # Manager Project & Sprint Review Hub
│   │   │   ├── member/            # Team Member Dashboard & Tasks
│   │   │   ├── projects/          # Project & Module Tracking
│   │   │   ├── tasks/             # Kanban & Task Deliverables
│   │   │   ├── attendance/        # Live Attendance & Timesheets
│   │   │   ├── leave/             # Leave Requests & Approvals
│   │   │   ├── meetings/          # Meeting Scheduler & Agendas
│   │   │   ├── messages/          # Channels & Direct Messages
│   │   │   ├── reports/           # Daily Progress Reports
│   │   │   ├── files/             # Document Drive & Cloud Storage
│   │   │   ├── announcements/     # Company-wide Broadcasts
│   │   │   ├── members/           # Organization Directory
│   │   │   ├── settings/          # Profile & Preference Management
│   │   │   └── LoginPage.tsx      # Authenticated Login & Registration
│   │   ├── services/              # Supabase database API services
│   │   ├── stores/                # Zustand client state & auth store
│   │   ├── types/                 # Shared TypeScript interfaces
│   │   ├── App.tsx                # Application routes & role router
│   │   ├── index.css              # Global styles & theme variables
│   │   └── main.tsx               # App entrypoint
│   ├── .env.example               # Example Supabase configuration
│   ├── index.html                 # HTML entrypoint
│   ├── package.json               # Frontend dependencies & scripts
│   ├── tsconfig.json              # TypeScript configuration
│   └── vite.config.ts             # Vite & PWA configuration
│
├── supabase/                      # Supabase Database & Migrations
│   ├── migrations/                # Versioned SQL migrations
│   │   ├── 20260925000000_hyna_init.sql       # Initial schema & RLS policies
│   │   └── 20260925000001_fix_auth_trigger.sql # Auth trigger & profile RLS patch
│   ├── complete_migration.sql     # Consolidated one-click SQL script
│   └── fix_auth_trigger.sql       # Standalone trigger & RLS fix script
│
├── .gitignore                     # Repository-wide ignore rules
└── README.md                      # Project documentation
```

---

## 🔐 Role-Based Access Hierarchy

1. **Executive / Admin** (`/admin/dashboard`):
   - Reserved strictly for **CEO, CTO, CPO, COO**.
   - Full organization oversight, executive analytics, company-wide project creation, user management, and team settings.
   - The **very first user** to register in an empty database is automatically designated as **CEO (Admin)**.

2. **Manager** (`/manager/dashboard`):
   - Accessible by users with `manager` role or managerial designations.
   - Project sprint oversight, task assignment, deliverable reviews, and attendance oversight.

3. **Member** (`/member/dashboard`):
   - Standard team members.
   - Assigned tasks, task submissions, personal attendance check-in/out, daily work reports, leave applications, and communications.

---

## 🚀 Getting Started

### 1. Database Setup (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor** -> **New Query**.
3. Copy the contents of [`supabase/complete_migration.sql`](supabase/complete_migration.sql) and click **Run**.
4. *(Optional for instant sign-in without email confirmation)*: Go to **Authentication -> Providers -> Email** and disable **Confirm email**.

### 2. Frontend Configuration

1. In `hyna-frontend/`:
   ```bash
   cp .env.example .env
   ```
2. Populate `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with your Supabase credentials.

### 3. Install & Run Locally

```bash
cd hyna-frontend
npm install
npm run dev
```

Visit `http://localhost:5173` to sign in or register your workspace.
