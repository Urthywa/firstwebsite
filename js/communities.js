import { supabase } from './supabaseClient.js';
import { showToast } from './utils.js';

// Create a new community
export async function createCommunity(name, description, slug, iconUrl = null, bannerUrl = null) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('You must be logged in to create a community.');

    // Validate slug
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(slug)) {
      throw new Error('Slug must only contain lowercase letters, numbers, and hyphens (e.g. r-webdev).');
    }

    // Insert community
    const { data: community, error } = await supabase
      .from('communities')
      .insert({
        name,
        description,
        slug,
        icon_url: iconUrl,
        banner_url: bannerUrl,
        created_by: user.id
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('A community with this slug already exists.');
      }
      throw error;
    }

    // Creator automatically joins the community
    const { error: joinErr } = await supabase
      .from('community_members')
      .insert({
        community_id: community.id,
        user_id: user.id
      });
    
    if (joinErr) console.error('Failed to auto-join community:', joinErr);

    showToast('Community created successfully!', 'success');
    return { data: community, error: null };
  } catch (error) {
    showToast(error.message, 'error');
    return { data: null, error };
  }
}

// Fetch list of all communities (optionally filtered by search query)
export async function fetchCommunities(searchQuery = '') {
  try {
    let query = supabase.from('communities').select('*');
    
    if (searchQuery) {
      query = query.or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%,slug.ilike.%${searchQuery}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    showToast('Failed to load communities: ' + error.message, 'error');
    return { data: [], error };
  }
}

// Fetch single community by slug
export async function fetchCommunityBySlug(slug) {
  try {
    const { data, error } = await supabase
      .from('communities')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching community:', error);
    return { data: null, error };
  }
}

// Check membership state
export async function checkMembership(communityId, userId) {
  if (!userId) return false;
  try {
    const { data, error } = await supabase
      .from('community_members')
      .select('*')
      .eq('community_id', communityId)
      .eq('user_id', userId);
    
    if (error) throw error;
    return data && data.length > 0;
  } catch (error) {
    console.error('Error checking membership:', error);
    return false;
  }
}

// Join community
export async function joinCommunity(communityId, userId) {
  try {
    const { error } = await supabase
      .from('community_members')
      .insert({
        community_id: communityId,
        user_id: userId
      });
    
    if (error) throw error;
    showToast('Joined community', 'success');
    return true;
  } catch (error) {
    showToast(error.message, 'error');
    return false;
  }
}

// Leave community
export async function leaveCommunity(communityId, userId) {
  try {
    const { error } = await supabase
      .from('community_members')
      .delete()
      .eq('community_id', communityId)
      .eq('user_id', userId);

    if (error) throw error;
    showToast('Left community', 'success');
    return true;
  } catch (error) {
    showToast(error.message, 'error');
    return false;
  }
}

// Fetch member count
export async function getMemberCount(communityId) {
  try {
    const { count, error } = await supabase
      .from('community_members')
      .select('*', { count: 'exact', head: true })
      .eq('community_id', communityId);

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error('Error fetching member count:', error);
    return 0;
  }
}
