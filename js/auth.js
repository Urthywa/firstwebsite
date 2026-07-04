import { supabase } from './supabaseClient.js';
import { showToast } from './utils.js';

// ─── Auth Functions ───────────────────────────────────────────────────────────

export async function signUp(email, password, username, role = 'user') {
  try {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { username: username || email.split('@')[0], role } }
    });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    showToast(error.message, 'error');
    return { data: null, error };
  }
}

export async function logIn(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    showToast(error.message, 'error');
    return { data: null, error };
  }
}

export async function logOut() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    showToast('Signed out successfully', 'success');
    setTimeout(() => { window.location.href = 'index.html'; }, 800);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function isAuthenticated() {
  return !!(await getCurrentUser());
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    showToast('You must be signed in to view this page.', 'error');
    setTimeout(() => {
      window.location.href = `login.html?redirect=${encodeURIComponent(window.location.href)}`;
    }, 1200);
    return null;
  }
  return user;
}

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    showToast('You must be signed in.', 'error');
    setTimeout(() => { window.location.href = 'login.html'; }, 1000);
    return null;
  }
  const role = user.user_metadata?.role || 'user';
  if (role !== 'admin') {
    showToast('Access denied: Admin only area.', 'error');
    setTimeout(() => { window.location.href = 'index.html'; }, 1000);
    return null;
  }
  return user;
}


// ─── Karma Calculation ────────────────────────────────────────────────────────

export async function getUserKarma(userId) {
  if (!userId) return 0;
  try {
    const { data: posts } = await supabase.from('posts').select('id').eq('author_id', userId);
    const { data: comments } = await supabase.from('comments').select('id').eq('author_id', userId);

    let karma = 0;

    if (posts?.length) {
      const { data: postScores } = await supabase
        .from('post_scores').select('score').in('post_id', posts.map(p => p.id));
      if (postScores) karma += postScores.reduce((s, i) => s + (i.score || 0), 0);
    }

    if (comments?.length) {
      const { data: commentScores } = await supabase
        .from('comment_scores').select('score').in('comment_id', comments.map(c => c.id));
      if (commentScores) karma += commentScores.reduce((s, i) => s + (i.score || 0), 0);
    }

    return karma;
  } catch (err) {
    console.error('Karma error:', err);
    return 0;
  }
}

// ─── Layout Injection ─────────────────────────────────────────────────────────

export async function initLayout() {
  const user = await getCurrentUser();
  const role = user?.user_metadata?.role || 'user';
  const isAdmin = role === 'admin';

  const navEl    = document.getElementById('navbar-placeholder');
  const leftEl   = document.getElementById('sidebar-left-placeholder');
  const rightEl  = document.getElementById('sidebar-right-placeholder');

  // ── Navbar ──
  if (navEl) {
    navEl.innerHTML = `
      <nav class="navbar">
        <a href="index.html" class="logo-container" style="text-decoration:none;">
          <div class="logo-mark">S</div>
          <span class="logo-text">SUP</span>
        </a>
        <div class="search-bar">
          <i class="fas fa-search search-icon"></i>
          <input type="text" id="global-search" placeholder="Search communities & posts...">
        </div>
        <div class="nav-actions" id="nav-actions">
          <span style="color:var(--text-muted);font-size:13px;">Loading...</span>
        </div>
      </nav>
    `;

    const searchInput = document.getElementById('global-search');
    if (searchInput) {
      searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          const q = searchInput.value.trim();
          if (q) window.location.href = `index.html?search=${encodeURIComponent(q)}`;
        }
      });
    }

    const actionsEl = document.getElementById('nav-actions');
    if (actionsEl) {
      if (user) {
        const karma = await getUserKarma(user.id);
        actionsEl.innerHTML = `
          <div class="badge badge-karma" style="cursor:default;" title="Your karma score">
            <i class="fas fa-star"></i> ${karma}
          </div>
          ${isAdmin ? `<div class="badge badge-admin" style="cursor:default;"><i class="fas fa-crown"></i> Admin</div>` : ''}
          <div class="user-menu-wrap">
            <button class="user-menu-trigger" id="user-menu-trigger">
              <div class="user-avatar-sm"><i class="fas fa-user-secret"></i></div>
              <i class="fas fa-chevron-down" style="font-size:11px; color:var(--text-muted);"></i>
            </button>
            <div class="user-menu-dropdown" id="user-menu-dropdown">
              <div style="padding:10px 12px 8px; border-bottom:1px solid var(--border-subtle); margin-bottom:6px;">
                <p style="font-size:11px; color:var(--text-muted);">Signed in as</p>
                <p style="font-size:14px; font-weight:600; color:var(--text-bright);">Anonymous</p>
                ${isAdmin
                  ? `<span class="badge badge-admin" style="margin-top:4px;"><i class="fas fa-crown"></i> Admin</span>`
                  : `<span class="badge badge-user" style="margin-top:4px;"><i class="fas fa-user"></i> User</span>`}
              </div>
              <button class="user-menu-item" onclick="window.location.href='profile.html'">
                <span class="mi-icon"><i class="fas fa-chart-line"></i></span> My Activity
              </button>
              <button class="user-menu-item" onclick="window.location.href='create-post.html'">
                <span class="mi-icon"><i class="fas fa-pen-nib"></i></span> Create Post
              </button>
              <button class="user-menu-item" onclick="window.location.href='create-community.html'">
                <span class="mi-icon"><i class="fas fa-users-cog"></i></span> New Community
              </button>
              <div class="user-menu-sep"></div>
              <button class="user-menu-item danger" id="btn-logout">
                <span class="mi-icon"><i class="fas fa-sign-out-alt"></i></span> Sign Out
              </button>
            </div>
          </div>
        `;

        document.getElementById('btn-logout').addEventListener('click', logOut);

        const trigger  = document.getElementById('user-menu-trigger');
        const dropdown = document.getElementById('user-menu-dropdown');
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.classList.toggle('active');
        });
        document.addEventListener('click', () => dropdown.classList.remove('active'));

      } else {
        actionsEl.innerHTML = `
          <a href="login.html" class="btn btn-ghost">Sign In</a>
          <a href="signup.html" class="btn btn-primary">Get Started</a>
        `;
      }
    }
  }

  // ── Left Sidebar ──
  if (leftEl) {
    const p = window.location.pathname;
    const isHome    = p.endsWith('index.html') || p.endsWith('/');
    const isProfile = p.endsWith('profile.html');

    leftEl.innerHTML = `
      <aside class="sidebar-left">
        <div class="sidebar-card">
          <p class="sidebar-heading">Navigate</p>
          <ul class="sidebar-menu">
            <li class="${isHome ? 'active' : ''}">
              <a href="index.html"><span class="menu-icon"><i class="fas fa-house"></i></span> Home</a>
            </li>
            <li id="menu-comm">
              <a href="index.html?view=communities"><span class="menu-icon"><i class="fas fa-compass"></i></span> Explore</a>
            </li>
            <li class="${isProfile ? 'active' : ''}">
              <a href="profile.html"><span class="menu-icon"><i class="fas fa-chart-line"></i></span> My Activity</a>
            </li>
          </ul>
        </div>

        <div class="sidebar-card" style="background:linear-gradient(145deg,rgba(232,96,138,0.06),rgba(22,17,31,0.99));border-color:rgba(232,96,138,0.12);">
          <p class="sidebar-heading" style="color:var(--sakura-deep);">Quick Actions</p>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <button class="btn btn-primary btn-sm" style="justify-content:center;" id="qs-create-post">
              <i class="fas fa-pen-nib"></i> New Post
            </button>
            <button class="btn btn-glass btn-sm" style="justify-content:center;" id="qs-create-comm">
              <i class="fas fa-plus"></i> New Community
            </button>
          </div>
        </div>

        <div class="sidebar-card" id="user-joined-communities-section" style="display:none;">
          <p class="sidebar-heading">My Communities</p>
          <ul class="sidebar-menu" id="user-joined-communities-list">
            <li style="color:var(--text-muted);font-size:12px;padding:6px 12px;">Loading...</li>
          </ul>
        </div>
      </aside>
    `;

    const qs1 = document.getElementById('qs-create-post');
    const qs2 = document.getElementById('qs-create-comm');
    if (qs1) qs1.addEventListener('click', () => {
      if (user) window.location.href = 'create-post.html';
      else { showToast('Sign in to create a post','error'); setTimeout(()=>{window.location.href='login.html';},900); }
    });
    if (qs2) qs2.addEventListener('click', () => {
      if (user) window.location.href = 'create-community.html';
      else { showToast('Sign in to create a community','error'); setTimeout(()=>{window.location.href='login.html';},900); }
    });

    if (user) loadJoinedCommunities(user.id);
  }

  // ── Right Sidebar ──
  if (rightEl) {
    rightEl.innerHTML = `
      <aside class="sidebar-right">
        <div class="sidebar-card" style="position:relative;overflow:hidden;background:linear-gradient(145deg,rgba(30,23,41,0.97),rgba(22,17,31,0.99));">
          <div style="position:absolute;top:-30px;right:-30px;width:160px;height:160px;background:radial-gradient(circle,rgba(232,96,138,0.08) 0%,transparent 70%);border-radius:50%;pointer-events:none;"></div>
          <div style="position:relative;z-index:1;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
              <div class="logo-mark" style="width:36px;height:36px;font-size:16px;">S</div>
              <span class="logo-text" style="font-size:20px;">SUP</span>
            </div>
            <p style="font-size:13px;color:var(--text-secondary);line-height:1.7;margin-bottom:16px;">
              An anonymous community platform. Share anything — your identity stays protected behind <em style="color:var(--sakura-mid);">"Anonymous"</em>.
            </p>
            <div style="display:flex;gap:8px;flex-direction:column;">
              <button class="btn btn-primary btn-sm" id="btn-create-post-sidebar" style="justify-content:center;">
                <i class="fas fa-pen-nib"></i> Create a Post
              </button>
              <button class="btn btn-glass btn-sm" id="btn-create-comm-sidebar" style="justify-content:center;">
                <i class="fas fa-users-cog"></i> Create Community
              </button>
            </div>
          </div>
        </div>

        <div class="sidebar-card">
          <p class="sidebar-heading">Community Rules</p>
          <ul style="list-style:none;display:flex;flex-direction:column;gap:10px;">
            ${['Be respectful to all','Stay on topic','No spam or self-promo','Credit original creators','Embrace anonymity'].map((r,i) => `
              <li style="display:flex;gap:10px;align-items:flex-start;">
                <span style="width:20px;height:20px;border-radius:50%;background:rgba(232,96,138,0.1);border:1px solid rgba(232,96,138,0.2);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--sakura-rose);flex-shrink:0;">${i+1}</span>
                <span style="font-size:13px;color:var(--text-secondary);line-height:1.4;">${r}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      </aside>
    `;

    const cpBtn = document.getElementById('btn-create-post-sidebar');
    const ccBtn = document.getElementById('btn-create-comm-sidebar');
    if (cpBtn) cpBtn.addEventListener('click', () => {
      if (user) window.location.href = 'create-post.html';
      else { showToast('Sign in to create a post','error'); setTimeout(()=>{window.location.href='login.html';},900); }
    });
    if (ccBtn) ccBtn.addEventListener('click', () => {
      if (user) window.location.href = 'create-community.html';
      else { showToast('Sign in to create a community','error'); setTimeout(()=>{window.location.href='login.html';},900); }
    });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loadJoinedCommunities(userId) {
  try {
    const { data: memberships, error } = await supabase
      .from('community_members')
      .select('community_id, communities(name, slug)')
      .eq('user_id', userId);

    if (error) throw error;

    const listEl    = document.getElementById('user-joined-communities-list');
    const sectionEl = document.getElementById('user-joined-communities-section');

    if (listEl && sectionEl) {
      if (memberships?.length) {
        sectionEl.style.display = 'block';
        listEl.innerHTML = memberships.map(m => `
          <li>
            <a href="community.html?slug=${m.communities.slug}">
              <span class="menu-icon" style="font-size:11px;"><i class="fas fa-hashtag"></i></span>
              s/${m.communities.slug}
            </a>
          </li>
        `).join('');
      } else {
        sectionEl.style.display = 'none';
      }
    }
  } catch (err) {
    console.error('Sidebar communities error:', err);
  }
}
