# SUP - Anonymous Reddit-Style Social Platform

SUP is a client-side-only, Reddit-style community platform where contributions (posts, comments, voting) are fully anonymous. Users can sign up, log in, join communities, upvote/downvote, and write threaded comments, but all public views label contributions under the name **"Anonymous"**. A private dashboard allows logged-in users to review their own post/comment history and total accumulated karma score.

The app uses vanilla HTML5, CSS3, and modern ES modules (JavaScript) with **Supabase** acting as the backend (Auth, PostgreSQL database, and Storage).

---

## Getting Started

Follow these steps to set up the backend database, authentication, and image storage, and deploy the application.

### Step 1: Create a Supabase Project

1. Go to [Supabase](https://supabase.com/) and sign up or sign in.
2. Click **New Project** and select your organization.
3. Choose a project name, database password, and your preferred hosting region.
4. Click **Create new project**.
5. Once initialized, navigate to **Project Settings** (gear icon in sidebar) > **API**.
6. Copy the **Project URL** and the **anon (public)** key.

> [!NOTE]
> These credentials are already configured in `js/supabaseClient.js`. If you are migrating this to your own custom Supabase project, replace the constants `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `js/supabaseClient.js` with your copied values.

---

### Step 2: Initialize the Database Schema

1. Inside your Supabase Dashboard, click on the **SQL Editor** tab (terminal icon `>_` on the left navigation sidebar).
2. Click **New Query**.
3. Copy and paste the following SQL schema containing all tables, indexes, views, and Row Level Security policies:

```sql
-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================
-- PROFILES
-- ============================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  avatar_url text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- Auto-create profile row on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- COMMUNITIES
-- ============================================
create table public.communities (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  name text not null,
  description text,
  icon_url text,
  banner_url text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

alter table public.communities enable row level security;

create policy "Communities are viewable by everyone"
  on public.communities for select using (true);

create policy "Authenticated users can create communities"
  on public.communities for insert with check (auth.uid() = created_by);

create policy "Creators can update their community"
  on public.communities for update using (auth.uid() = created_by);

-- ============================================
-- COMMUNITY MEMBERSHIPS
-- ============================================
create table public.community_members (
  community_id uuid references public.communities(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (community_id, user_id)
);

alter table public.community_members enable row level security;

create policy "Memberships are viewable by everyone"
  on public.community_members for select using (true);

create policy "Users can join communities"
  on public.community_members for insert with check (auth.uid() = user_id);

create policy "Users can leave communities"
  on public.community_members for delete using (auth.uid() = user_id);

-- ============================================
-- POSTS
-- ============================================
create table public.posts (
  id uuid primary key default uuid_generate_v4(),
  community_id uuid references public.communities(id) on delete cascade not null,
  author_id uuid references public.profiles(id) on delete set null,
  title text not null,
  post_type text not null check (post_type in ('text', 'link', 'image')),
  body text,
  link_url text,
  image_url text,
  created_at timestamptz default now()
);

alter table public.posts enable row level security;

create policy "Posts are viewable by everyone"
  on public.posts for select using (true);

create policy "Authenticated users can create posts"
  on public.posts for insert with check (auth.uid() = author_id);

create policy "Authors can update their own posts"
  on public.posts for update using (auth.uid() = author_id);

create policy "Authors can delete their own posts"
  on public.posts for delete using (auth.uid() = author_id);

create index posts_community_idx on public.posts(community_id);
create index posts_created_at_idx on public.posts(created_at desc);

-- ============================================
-- COMMENTS (self-referencing for nested replies)
-- ============================================
create table public.comments (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid references public.posts(id) on delete cascade not null,
  parent_comment_id uuid references public.comments(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null,
  created_at timestamptz default now()
);

alter table public.comments enable row level security;

create policy "Comments are viewable by everyone"
  on public.comments for select using (true);

create policy "Authenticated users can comment"
  on public.comments for insert with check (auth.uid() = author_id);

create policy "Authors can update their own comments"
  on public.comments for update using (auth.uid() = author_id);

create policy "Authors can delete their own comments"
  on public.comments for delete using (auth.uid() = author_id);

create index comments_post_idx on public.comments(post_id);
create index comments_parent_idx on public.comments(parent_comment_id);

-- ============================================
-- VOTES (posts)
-- ============================================
create table public.post_votes (
  post_id uuid references public.posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);

alter table public.post_votes enable row level security;

create policy "Post votes are viewable by everyone"
  on public.post_votes for select using (true);

create policy "Users can vote on posts"
  on public.post_votes for insert with check (auth.uid() = user_id);

create policy "Users can change their post vote"
  on public.post_votes for update using (auth.uid() = user_id);

create policy "Users can remove their post vote"
  on public.post_votes for delete using (auth.uid() = user_id);

-- ============================================
-- VOTES (comments)
-- ============================================
create table public.comment_votes (
  comment_id uuid references public.comments(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz default now(),
  primary key (comment_id, user_id)
);

alter table public.comment_votes enable row level security;

create policy "Comment votes are viewable by everyone"
  on public.comment_votes for select using (true);

create policy "Users can vote on comments"
  on public.comment_votes for insert with check (auth.uid() = user_id);

create policy "Users can change their comment vote"
  on public.comment_votes for update using (auth.uid() = user_id);

create policy "Users can remove their comment vote"
  on public.comment_votes for delete using (auth.uid() = user_id);

-- ============================================
-- HELPFUL VIEWS: scores
-- ============================================
create or replace view public.post_scores as
select
  post_id,
  coalesce(sum(value), 0) as score
from public.post_votes
group by post_id;

create or replace view public.comment_scores as
select
  comment_id,
  coalesce(sum(value), 0) as score
from public.comment_votes
group by comment_id;
```

---

### Step 2b: Enable Admin Moderation Policies (Optional but Recommended)

By default, RLS (Row Level Security) restricts editing/deleting to the original authors. To allow users with the `admin` role to moderate posts, comments, and communities directly from their client-side dashboard:

1. Inside your Supabase Dashboard, go to **SQL Editor**.
2. Click **New Query**.
3. Copy, paste, and run the following SQL statements to append admin access policies:

```sql
-- Allow admins to delete and update any post
create policy "Admins can delete any post"
  on public.posts for delete using (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text);

create policy "Admins can update any post"
  on public.posts for update using (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text);

-- Allow admins to delete and update any comment
create policy "Admins can delete any comment"
  on public.comments for delete using (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text);

create policy "Admins can update any comment"
  on public.comments for update using (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text);

-- Allow admins to delete and update any community
create policy "Admins can delete any community"
  on public.communities for delete using (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text);

create policy "Admins can update any community"
  on public.communities for update using (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text);
```

4. Click **Run** to execute the statements.

---

### Step 3: Enable Email Authentication

1. Go to **Authentication** > **Providers** in your Supabase dashboard.
2. Ensure **Email** is turned ON.
3. Adjust your Auth settings if desired:
   - For immediate logins, you can turn off **Confirm email** (though confirming email is recommended for production).

---

### Step 4: Configure Storage for Image Uploads

1. Go to **Storage** in the left sidebar of your Supabase dashboard.
2. Click **New Bucket**.
3. Name it **`post-images`**.
4. Set the toggle for **Public Bucket** to **Active** (this is important so anyone can view the images).
5. Once created, click on **Policies** (or navigate to SQL Editor and run the SQL below to authorize access):

```sql
insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do nothing;

create policy "Public read access to post images"
  on storage.objects for select
  using (bucket_id = 'post-images');

create policy "Authenticated users can upload post images"
  on storage.objects for insert
  with check (bucket_id = 'post-images' and auth.role() = 'authenticated');
```

---

### Step 5: Test Locally

Since the application uses standard JavaScript ES Modules, opening the HTML files directly (e.g. double-clicking `index.html`) will trigger CORS and module loader restrictions. You must run a basic HTTP server.

You can run one of the following commands in the project directory:

**Using Python:**
```bash
python -m http.server 8000
```
Then visit: `http://localhost:8000`

**Using Node (npx):**
```bash
npx http-server -p 8000
```
Then visit: `http://localhost:8000`

---

### Step 6: Deploy to GitHub Pages

1. Create a new repository on GitHub.
2. Initialize Git in your project folder, add files, and commit:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```
3. Set your repository origin and push to the `main` branch:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git branch -M main
   git push -u origin main
   ```
4. Navigate to your repository page on GitHub.
5. Go to **Settings** > **Pages** (in the left-side Code and automation section).
6. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
7. Set the branch dropdown to **`main`** and the directory to **`/ (root)`** (or `/docs` if you moved your files there).
8. Click **Save**.
9. In a few moments, your site will be live at `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/`.
