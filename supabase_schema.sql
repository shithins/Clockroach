-- ========================================================
-- CLOCKROACH SUPABASE DATABASE SCHEMA SETUP
-- ========================================================
-- Run this script inside the SQL Editor of your Supabase project.

-- 1. CLEAN UP (Optional)
drop table if exists public.time_entries cascade;
drop table if exists public.task_presets cascade;
drop table if exists public.projects cascade;
drop table if exists public.employees cascade;
drop table if exists public.departments cascade;

-- 2. CREATE TABLES
create table public.departments (
    department_id text primary key,
    department_name text not null unique,
    parent_department text references public.departments(department_name) on update cascade
);

create table public.employees (
    employee_id text primary key,
    email text not null unique,
    name text not null,
    department text references public.departments(department_name) on update cascade on delete set null,
    role text not null check (role in ('admin', 'employee')),
    active boolean not null default true
);

create table public.projects (
    project_id text primary key,
    project_name text not null,
    department text not null, -- Comma-separated list of departments, e.g. "Development, Marketing"
    active boolean not null default true
);

create table public.task_presets (
    task_id text primary key,
    task_name text not null,
    department text references public.departments(department_name) on update cascade on delete set null,
    active boolean not null default true
);

create table public.time_entries (
    entry_id text primary key,
    employee_email text not null references public.employees(email) on update cascade,
    project_id text not null,
    project_name text not null,
    department text not null,
    task_description text not null,
    start_time timestamp with time zone not null,
    end_time timestamp with time zone,
    duration_minutes integer
);

-- 3. ENABLE ROW-LEVEL SECURITY (RLS)
alter table public.departments enable row level security;
alter table public.employees enable row level security;
alter table public.projects enable row level security;
alter table public.task_presets enable row level security;
alter table public.time_entries enable row level security;

-- 4. HELPER FUNCTION TO CHECK IF CURRENT USER IS ADMIN
create or replace function public.is_admin()
returns boolean security definer as $$
begin
  return exists (
    select 1 
    from public.employees 
    where email = auth.jwt() ->> 'email' 
      and role = 'admin' 
      and active = true
  );
end;
$$ language plpgsql;

-- 5. CREATE POLICIES

-- DEPARTMENTS Policies
create policy "Allow read access to authenticated users" on public.departments
    for select to authenticated using (true);

create policy "Allow admin write access" on public.departments
    for all to authenticated using (public.is_admin());

-- EMPLOYEES Policies
create policy "Allow read access to authenticated employees" on public.employees
    for select to authenticated using (true);

create policy "Allow registration of first user as admin" on public.employees
    for insert to authenticated with check (
        -- If no employee records exist yet, let anyone sign up as admin
        (not exists (select 1 from public.employees)) or
        public.is_admin()
    );

create policy "Allow admin modifications" on public.employees
    for update to authenticated using (public.is_admin());

create policy "Allow admin deletes" on public.employees
    for delete to authenticated using (public.is_admin());

-- PROJECTS Policies
create policy "Allow projects read access to authenticated" on public.projects
    for select to authenticated using (true);

create policy "Allow projects admin access" on public.projects
    for all to authenticated using (public.is_admin());

-- TASK PRESETS Policies
create policy "Allow tasks read access to authenticated" on public.task_presets
    for select to authenticated using (true);

create policy "Allow tasks admin access" on public.task_presets
    for all to authenticated using (public.is_admin());

-- TIME ENTRIES Policies
create policy "Allow users to read their own entries, admins read all" on public.time_entries
    for select to authenticated using (
        employee_email = auth.jwt() ->> 'email' or public.is_admin()
    );

create policy "Allow users to log their own entries" on public.time_entries
    for insert to authenticated with check (
        employee_email = auth.jwt() ->> 'email'
    );

create policy "Allow users to update their own entries, admins update all" on public.time_entries
    for update to authenticated using (
        employee_email = auth.jwt() ->> 'email' or public.is_admin()
    );

create policy "Allow admins to delete entries" on public.time_entries
    for delete to authenticated using (public.is_admin());

-- 6. INSERT SEED DATA
insert into public.departments (department_id, department_name) values
('D1', 'Development'),
('D2', 'Marketing'),
('D3', 'Sales');

insert into public.projects (project_id, project_name, department, active) values
('P1', 'Project Alpha', 'Development, Marketing', true),
('P2', 'Project Beta', 'Development', true);

insert into public.task_presets (task_id, task_name, department, active) values
('T1', 'Research', 'Development', true),
('T2', 'Coding', 'Development', true),
('T3', 'Design', 'Development', true);
