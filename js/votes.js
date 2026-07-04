import { supabase } from './supabaseClient.js';
import { showToast } from './utils.js';

// Vote on a post
export async function voteOnPost(postId, value) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showToast('You must be logged in to vote.', 'error');
      return { success: false, newValue: 0, delta: 0 };
    }

    // Check if user already voted
    const { data: existingVote, error: checkError } = await supabase
      .from('post_votes')
      .select('value')
      .eq('post_id', postId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (checkError) throw checkError;

    let newValue = 0;
    let delta = 0;

    if (!existingVote) {
      // Cast new vote
      const { error } = await supabase
        .from('post_votes')
        .insert({
          post_id: postId,
          user_id: user.id,
          value: value
        });

      if (error) throw error;
      newValue = value;
      delta = value; // +1 or -1
    } else if (existingVote.value === value) {
      // Retract vote (click same button again)
      const { error } = await supabase
        .from('post_votes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', user.id);

      if (error) throw error;
      newValue = 0;
      delta = -value; // -1 if retracting upvote, +1 if retracting downvote
    } else {
      // Change vote (switch from up to down, or down to up)
      const { error } = await supabase
        .from('post_votes')
        .update({ value: value })
        .eq('post_id', postId)
        .eq('user_id', user.id);

      if (error) throw error;
      newValue = value;
      delta = value * 2; // +2 if upvoting from downvote, -2 if downvoting from upvote
    }

    return { success: true, newValue, delta };
  } catch (error) {
    showToast('Failed to save vote: ' + error.message, 'error');
    return { success: false, newValue: 0, delta: 0 };
  }
}

// Vote on a comment
export async function voteOnComment(commentId, value) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showToast('You must be logged in to vote.', 'error');
      return { success: false, newValue: 0, delta: 0 };
    }

    // Check if user already voted
    const { data: existingVote, error: checkError } = await supabase
      .from('comment_votes')
      .select('value')
      .eq('comment_id', commentId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (checkError) throw checkError;

    let newValue = 0;
    let delta = 0;

    if (!existingVote) {
      // Cast new vote
      const { error } = await supabase
        .from('comment_votes')
        .insert({
          comment_id: commentId,
          user_id: user.id,
          value: value
        });

      if (error) throw error;
      newValue = value;
      delta = value;
    } else if (existingVote.value === value) {
      // Retract vote
      const { error } = await supabase
        .from('comment_votes')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', user.id);

      if (error) throw error;
      newValue = 0;
      delta = -value;
    } else {
      // Change vote
      const { error } = await supabase
        .from('comment_votes')
        .update({ value: value })
        .eq('comment_id', commentId)
        .eq('user_id', user.id);

      if (error) throw error;
      newValue = value;
      delta = value * 2;
    }

    return { success: true, newValue, delta };
  } catch (error) {
    showToast('Failed to save vote: ' + error.message, 'error');
    return { success: false, newValue: 0, delta: 0 };
  }
}

// Attach voting event listeners to any list of post cards in the DOM
export function initVotingListeners(containerElement, onVoteSuccess = null) {
  if (!containerElement) return;

  containerElement.addEventListener('click', async (e) => {
    const voteBtn = e.target.closest('.vote-btn');
    if (!voteBtn) return;

    e.preventDefault();
    e.stopPropagation();

    const postId = voteBtn.dataset.postId;
    const isUpvote = voteBtn.classList.contains('up');
    const value = isUpvote ? 1 : -1;

    // Visual disabled feedback while loading
    voteBtn.style.pointerEvents = 'none';
    voteBtn.style.opacity = '0.5';

    const { success, newValue, delta } = await voteOnPost(postId, value);

    voteBtn.style.pointerEvents = '';
    voteBtn.style.opacity = '';

    if (success) {
      const card = document.getElementById(`post-${postId}`);
      if (card) {
        const upBtn = card.querySelector('.vote-btn.up');
        const downBtn = card.querySelector('.vote-btn.down');
        const scoreSpan = card.querySelector(`#score-${postId}`);

        // Update vote score text
        if (scoreSpan) {
          const currentScore = parseInt(scoreSpan.textContent) || 0;
          scoreSpan.textContent = currentScore + delta;
          
          // Reset score colors
          scoreSpan.classList.remove('up-active', 'down-active');
          if (newValue === 1) scoreSpan.classList.add('up-active');
          if (newValue === -1) scoreSpan.classList.add('down-active');
        }

        // Update button active states
        if (upBtn && downBtn) {
          upBtn.classList.remove('active');
          downBtn.classList.remove('active');
          
          if (newValue === 1) upBtn.classList.add('active');
          if (newValue === -1) downBtn.classList.add('active');
        }
      }

      if (onVoteSuccess) onVoteSuccess(postId, newValue, delta);
    }
  });
}
