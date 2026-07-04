import { supabase } from './supabaseClient.js';
import { showToast } from './utils.js';

// Create a new comment or reply
export async function createComment(postId, parentCommentId = null, body) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('You must be logged in to comment.');

    const { data: comment, error } = await supabase
      .from('comments')
      .insert({
        post_id: postId,
        parent_comment_id: parentCommentId,
        author_id: user.id,
        body: body
      })
      .select()
      .single();

    if (error) throw error;
    showToast(parentCommentId ? 'Reply submitted!' : 'Comment posted!', 'success');
    return { data: comment, error: null };
  } catch (error) {
    showToast('Failed to post comment: ' + error.message, 'error');
    return { data: null, error };
  }
}

// Fetch all comments for a post, enrich with scores & user votes, and build the nested tree
export async function fetchCommentsTree(postId, sortBy = 'top') {
  try {
    // 1. Fetch all comments for post
    const { data: comments, error } = await supabase
      .from('comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true }); // chronological base load

    if (error) throw error;

    if (!comments || comments.length === 0) {
      return { data: [], error: null };
    }

    const commentIds = comments.map(c => c.id);

    // 2. Fetch scores from view
    const { data: scores } = await supabase
      .from('comment_scores')
      .select('*')
      .in('comment_id', commentIds);

    const scoreMap = {};
    if (scores) {
      scores.forEach(s => { scoreMap[s.comment_id] = s.score; });
    }

    // 3. Fetch user votes if logged in
    const userVoteMap = {};
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: votes } = await supabase
        .from('comment_votes')
        .select('comment_id, value')
        .eq('user_id', user.id)
        .in('comment_id', commentIds);
      
      if (votes) {
        votes.forEach(v => { userVoteMap[v.comment_id] = v.value; });
      }
    }

    // 4. Enrich comments and initialize children array
    const commentMap = {};
    const enrichedComments = comments.map(c => {
      const enriched = {
        ...c,
        score: scoreMap[c.id] || 0,
        userVote: userVoteMap[c.id] || 0,
        children: []
      };
      commentMap[c.id] = enriched;
      return enriched;
    });

    // 5. Build nested tree
    const rootComments = [];
    enrichedComments.forEach(c => {
      if (c.parent_comment_id) {
        const parent = commentMap[c.parent_comment_id];
        if (parent) {
          parent.children.push(c);
        } else {
          // If parent is somehow missing, render at root level
          rootComments.push(c);
        }
      } else {
        rootComments.push(c);
      }
    });

    // 6. Sort comments recursively
    sortCommentsTree(rootComments, sortBy);

    return { data: rootComments, error: null };
  } catch (error) {
    showToast('Failed to load comments: ' + error.message, 'error');
    return { data: [], error };
  }
}

// Recursive helper to sort comments and their children
function sortCommentsTree(nodes, sortBy) {
  if (sortBy === 'top') {
    nodes.sort((a, b) => b.score - a.score);
  } else if (sortBy === 'new') {
    nodes.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // Recursively sort children
  nodes.forEach(node => {
    if (node.children && node.children.length > 0) {
      sortCommentsTree(node.children, sortBy);
    }
  });
}
