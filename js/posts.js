import { supabase } from './supabaseClient.js';
import { showToast } from './utils.js';

// Create a new post
export async function createPost(communityId, title, postType, body = null, linkUrl = null, imageFile = null) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('You must be logged in to create a post.');

    let imageUrl = null;

    // Handle image upload if type is image and file is selected
    if (postType === 'image' && imageFile) {
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('post-images')
        .upload(filePath, imageFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data } = supabase.storage
        .from('post-images')
        .getPublicUrl(filePath);
      
      imageUrl = data.publicUrl;
    }

    // Insert post into the database
    const { data: post, error } = await supabase
      .from('posts')
      .insert({
        community_id: communityId,
        author_id: user.id,
        title,
        post_type: postType,
        body: postType === 'text' ? body : null,
        link_url: postType === 'link' ? linkUrl : null,
        image_url: imageUrl
      })
      .select()
      .single();

    if (error) throw error;
    
    showToast('Post created successfully!', 'success');
    return { data: post, error: null };
  } catch (error) {
    showToast('Failed to create post: ' + error.message, 'error');
    return { data: null, error };
  }
}

// Fetch posts based on filters and sorting
export async function fetchPosts(filters = {}) {
  try {
    const { communityId, sortBy = 'new', searchQuery = '' } = filters;

    // Start building query
    let query = supabase
      .from('posts')
      .select('*, communities(name, slug)');

    if (communityId) {
      query = query.eq('community_id', communityId);
    }

    if (searchQuery) {
      query = query.or(`title.ilike.%${searchQuery}%,body.ilike.%${searchQuery}%`);
    }

    // Always fetch latest first from DB as a base
    query = query.order('created_at', { ascending: false });

    const { data: posts, error } = await query;
    if (error) throw error;

    if (!posts || posts.length === 0) {
      return { data: [], error: null };
    }

    // Extract post IDs
    const postIds = posts.map(p => p.id);

    // Fetch scores from view
    const { data: scores, error: scoresError } = await supabase
      .from('post_scores')
      .select('*')
      .in('post_id', postIds);

    if (scoresError) console.error('Error fetching post scores:', scoresError);

    // Fetch comment counts from comments table
    const { data: comments, error: commentsError } = await supabase
      .from('comments')
      .select('post_id')
      .in('post_id', postIds);

    if (commentsError) console.error('Error fetching comments for count:', commentsError);

    // Fetch user votes if user is logged in
    let userVotes = {};
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: votes, error: votesError } = await supabase
        .from('post_votes')
        .select('post_id, value')
        .eq('user_id', user.id)
        .in('post_id', postIds);
      
      if (!votesError && votes) {
        votes.forEach(v => {
          userVotes[v.post_id] = v.value;
        });
      }
    }

    // Map stats to posts
    const scoreMap = {};
    if (scores) {
      scores.forEach(s => { scoreMap[s.post_id] = s.score; });
    }

    const commentCountMap = {};
    if (comments) {
      comments.forEach(c => {
        commentCountMap[c.post_id] = (commentCountMap[c.post_id] || 0) + 1;
      });
    }

    const enrichedPosts = posts.map(post => {
      return {
        ...post,
        score: scoreMap[post.id] || 0,
        commentCount: commentCountMap[post.id] || 0,
        userVote: userVotes[post.id] || 0
      };
    });

    // Apply sorting client-side
    if (sortBy === 'top') {
      // Sort by score desc
      enrichedPosts.sort((a, b) => b.score - a.score);
    } else if (sortBy === 'hot') {
      // Hot sorting algorithm: Score / (Age_in_hours + 2)^1.5
      const now = Date.now();
      const getHotScore = (post) => {
        const ageHours = (now - new Date(post.created_at).getTime()) / 3600000;
        return post.score / Math.pow(ageHours + 2, 1.5);
      };
      
      enrichedPosts.sort((a, b) => getHotScore(b) - getHotScore(a));
    }
    // 'new' is already sorted correctly from the DB call (created_at desc)

    return { data: enrichedPosts, error: null };
  } catch (error) {
    showToast('Error loading feed: ' + error.message, 'error');
    return { data: [], error };
  }
}

// Fetch single post details
export async function fetchPostById(postId) {
  try {
    const { data: post, error } = await supabase
      .from('posts')
      .select('*, communities(name, slug)')
      .eq('id', postId)
      .single();

    if (error) throw error;

    // Fetch score
    const { data: scoreData } = await supabase
      .from('post_scores')
      .select('score')
      .eq('post_id', postId)
      .maybeSingle();

    // Fetch user vote if logged in
    let userVote = 0;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: voteData } = await supabase
        .from('post_votes')
        .select('value')
        .eq('post_id', postId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (voteData) userVote = voteData.value;
    }

    return {
      data: {
        ...post,
        score: scoreData ? scoreData.score : 0,
        userVote
      },
      error: null
    };
  } catch (error) {
    console.error('Error loading post details:', error);
    return { data: null, error };
  }
}

// Helper to render post cards dynamically
export function renderPostCardHTML(post) {
  const isUpvoted = post.userVote === 1;
  const isDownvoted = post.userVote === -1;
  
  let contentHTML = '';
  if (post.post_type === 'link') {
    contentHTML = `
      <a href="${post.link_url}" target="_blank" class="post-link-badge">
        <i class="fas fa-external-link-alt"></i> ${post.link_url}
      </a>
    `;
  } else if (post.post_type === 'image' && post.image_url) {
    contentHTML = `
      <div class="post-image-container">
        <img src="${post.image_url}" alt="Post Image" loading="lazy">
      </div>
    `;
  } else if (post.post_type === 'text' && post.body) {
    contentHTML = `
      <p class="post-body">${post.body}</p>
    `;
  }

  // Check if community exists (in case it was deleted)
  const communityName = post.communities ? `s/${post.communities.slug}` : 's/deleted';
  const communityLink = post.communities ? `community.html?slug=${post.communities.slug}` : '#';

  return `
    <div class="post-card" id="post-${post.id}">
      <div class="vote-panel">
        <button class="vote-btn up ${isUpvoted ? 'active' : ''}" data-post-id="${post.id}" aria-label="Upvote">
          <i class="fas fa-arrow-up"></i>
        </button>
        <span class="vote-score ${isUpvoted ? 'up-active' : ''} ${isDownvoted ? 'down-active' : ''}" id="score-${post.id}">${post.score}</span>
        <button class="vote-btn down ${isDownvoted ? 'active' : ''}" data-post-id="${post.id}" aria-label="Downvote">
          <i class="fas fa-arrow-down"></i>
        </button>
      </div>
      <div class="post-content-area">
        <div class="post-meta">
          <a href="${communityLink}" class="post-community">${communityName}</a>
          <span class="post-divider">•</span>
          <span class="post-author" title="Internal user references are protected">Posted by Anonymous</span>
          <span class="post-divider">•</span>
          <span class="post-time">${new Date(post.created_at).toLocaleDateString()}</span>
        </div>
        <a href="post.html?id=${post.id}">
          <h3 class="post-title">${post.title}</h3>
        </a>
        ${contentHTML}
        <div class="post-footer">
          <button class="post-footer-btn" onclick="window.location.href='post.html?id=${post.id}'">
            <i class="fas fa-comments"></i>
            <span>${post.commentCount || 0} Comments</span>
          </button>
        </div>
      </div>
    </div>
  `;
}
