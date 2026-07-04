import { supabase } from './supabaseClient.js';
import { showToast } from './utils.js';

// Fetch private history of posts created by the current user
export async function fetchUserPosts(userId) {
  try {
    // 1. Fetch posts
    const { data: posts, error } = await supabase
      .from('posts')
      .select('*, communities(name, slug)')
      .eq('author_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!posts || posts.length === 0) return { data: [], error: null };

    const postIds = posts.map(p => p.id);

    // 2. Fetch scores
    const { data: scores } = await supabase
      .from('post_scores')
      .select('*')
      .in('post_id', postIds);

    const scoreMap = {};
    if (scores) {
      scores.forEach(s => { scoreMap[s.post_id] = s.score; });
    }

    // 3. Fetch comment counts
    const { data: comments } = await supabase
      .from('comments')
      .select('post_id')
      .in('post_id', postIds);

    const commentCountMap = {};
    if (comments) {
      comments.forEach(c => {
        commentCountMap[c.post_id] = (commentCountMap[c.post_id] || 0) + 1;
      });
    }

    // 4. Fetch user's own votes on their own posts (they might upvote their own posts)
    const { data: votes } = await supabase
      .from('post_votes')
      .select('post_id, value')
      .eq('user_id', userId)
      .in('post_id', postIds);

    const voteMap = {};
    if (votes) {
      votes.forEach(v => { voteMap[v.post_id] = v.value; });
    }

    const enriched = posts.map(p => ({
      ...p,
      score: scoreMap[p.id] || 0,
      commentCount: commentCountMap[p.id] || 0,
      userVote: voteMap[p.id] || 0
    }));

    return { data: enriched, error: null };
  } catch (error) {
    showToast('Failed to load post history: ' + error.message, 'error');
    return { data: [], error };
  }
}

// Fetch private history of comments posted by the current user
export async function fetchUserComments(userId) {
  try {
    // 1. Fetch comments with referenced post details
    const { data: comments, error } = await supabase
      .from('comments')
      .select('*, posts(id, title)')
      .eq('author_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!comments || comments.length === 0) return { data: [], error: null };

    const commentIds = comments.map(c => c.id);

    // 2. Fetch comment scores
    const { data: scores } = await supabase
      .from('comment_scores')
      .select('*')
      .in('comment_id', commentIds);

    const scoreMap = {};
    if (scores) {
      scores.forEach(s => { scoreMap[s.comment_id] = s.score; });
    }

    // 3. Fetch user's votes on their comments
    const { data: votes } = await supabase
      .from('comment_votes')
      .select('comment_id, value')
      .eq('user_id', userId)
      .in('comment_id', commentIds);

    const voteMap = {};
    if (votes) {
      votes.forEach(v => { voteMap[v.comment_id] = v.value; });
    }

    const enriched = comments.map(c => ({
      ...c,
      score: scoreMap[c.id] || 0,
      userVote: voteMap[c.id] || 0
    }));

    return { data: enriched, error: null };
  } catch (error) {
    showToast('Failed to load comment history: ' + error.message, 'error');
    return { data: [], error };
  }
}
