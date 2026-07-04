import { supabase } from './supabaseClient.js';

// ─── Fetch all posts (admin view) ─────────────────────────────────────────────
export async function adminFetchAllPosts(page = 0, limit = 30) {
  const from = page * limit;
  const to   = from + limit - 1;

  const { data: posts, error, count } = await supabase
    .from('posts')
    .select('*, communities(name, slug)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) return { data: [], count: 0, error };

  const postIds = posts.map(p => p.id);
  let scoreMap = {}, commentMap = {};

  if (postIds.length) {
    const { data: scores } = await supabase
      .from('post_scores').select('post_id, score').in('post_id', postIds);
    if (scores) scores.forEach(s => { scoreMap[s.post_id] = s.score; });

    const { data: comments } = await supabase
      .from('comments').select('post_id').in('post_id', postIds);
    if (comments) comments.forEach(c => { commentMap[c.post_id] = (commentMap[c.post_id]||0)+1; });
  }

  const enriched = posts.map(p => ({
    ...p,
    score: scoreMap[p.id] || 0,
    commentCount: commentMap[p.id] || 0
  }));

  return { data: enriched, count, error: null };
}

// ─── Delete a post (admin) ────────────────────────────────────────────────────
export async function adminDeletePost(postId) {
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  return !error;
}

// ─── Fetch all communities ────────────────────────────────────────────────────
export async function adminFetchAllCommunities() {
  const { data, error } = await supabase
    .from('communities')
    .select('*')
    .order('created_at', { ascending: false });
  return { data: data || [], error };
}

// ─── Update community ─────────────────────────────────────────────────────────
export async function adminUpdateCommunity(communityId, updates) {
  const { data, error } = await supabase
    .from('communities')
    .update(updates)
    .eq('id', communityId)
    .select()
    .single();
  return { data, error };
}

// ─── Delete community ─────────────────────────────────────────────────────────
export async function adminDeleteCommunity(communityId) {
  const { error } = await supabase.from('communities').delete().eq('id', communityId);
  return !error;
}

// ─── Fetch all comments ───────────────────────────────────────────────────────
export async function adminFetchAllComments(page = 0, limit = 30) {
  const from = page * limit;
  const to   = from + limit - 1;

  const { data, error, count } = await supabase
    .from('comments')
    .select('*, posts(id, title)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  return { data: data || [], count, error };
}

// ─── Delete a comment ─────────────────────────────────────────────────────────
export async function adminDeleteComment(commentId) {
  const { error } = await supabase.from('comments').delete().eq('id', commentId);
  return !error;
}

// ─── Get platform stats ───────────────────────────────────────────────────────
export async function adminGetStats() {
  const [
    { count: postCount },
    { count: commentCount },
    { count: communityCount },
    { count: memberCount }
  ] = await Promise.all([
    supabase.from('posts').select('*', { count: 'exact', head: true }),
    supabase.from('comments').select('*', { count: 'exact', head: true }),
    supabase.from('communities').select('*', { count: 'exact', head: true }),
    supabase.from('community_members').select('*', { count: 'exact', head: true })
  ]);

  return {
    posts:       postCount      || 0,
    comments:    commentCount   || 0,
    communities: communityCount || 0,
    members:     memberCount    || 0
  };
}

// ─── Fetch users (via author_ids from posts+comments) ────────────────────────
export async function adminFetchUsers() {
  // Get distinct author_ids with their post and comment counts
  const { data: posts }    = await supabase.from('posts').select('author_id, created_at');
  const { data: comments } = await supabase.from('comments').select('author_id, created_at');

  const userMap = {};

  (posts || []).forEach(p => {
    if (!userMap[p.author_id]) {
      userMap[p.author_id] = { id: p.author_id, postCount: 0, commentCount: 0, firstSeen: p.created_at };
    }
    userMap[p.author_id].postCount++;
    if (new Date(p.created_at) < new Date(userMap[p.author_id].firstSeen)) {
      userMap[p.author_id].firstSeen = p.created_at;
    }
  });

  (comments || []).forEach(c => {
    if (!userMap[c.author_id]) {
      userMap[c.author_id] = { id: c.author_id, postCount: 0, commentCount: 0, firstSeen: c.created_at };
    }
    userMap[c.author_id].commentCount++;
    if (new Date(c.created_at) < new Date(userMap[c.author_id].firstSeen)) {
      userMap[c.author_id].firstSeen = c.created_at;
    }
  });

  return Object.values(userMap).sort((a,b) =>
    (b.postCount + b.commentCount) - (a.postCount + a.commentCount)
  );
}

// ─── Delete all content by a user ────────────────────────────────────────────
export async function adminDeleteUserContent(userId) {
  await supabase.from('comments').delete().eq('author_id', userId);
  await supabase.from('posts').delete().eq('author_id', userId);
}
