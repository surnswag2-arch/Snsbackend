// Transform raw DB rows into API response shapes

export interface UserResponse {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string;
  locale: string;
  is_verified: boolean;
  followers_count: number;
  following_count: number;
  coin_balance: number;
  created_at: string;
  updated_at: string;
}

export interface CreatorResponse {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  is_verified: boolean;
  is_following?: boolean;
}

export interface VideoResponse {
  id: string;
  creator_id: string;
  caption: string;
  hashtags: string[];
  sound_id?: string | null;
  status: string;
  r2_key: string;
  stream_uid?: string | null;
  thumbnail_url: string;
  duration: number;
  width: number;
  height: number;
  privacy: string;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  views_count: number;
  created_at: string;
  updated_at: string;
  creator?: CreatorResponse;
  sound?: SoundResponse | null;
  is_liked?: boolean;
  is_bookmarked?: boolean;
  is_following?: boolean;
}

export interface SoundResponse {
  id: string;
  title: string;
  artist: string;
  cover_url: string;
  usage_count: number;
}

export interface CommentResponse {
  id: string;
  video_id: string;
  parent_id?: string | null;
  user_id: string;
  text: string;
  likes_count: number;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  user?: CreatorResponse;
  is_liked?: boolean;
  replies?: CommentResponse[];
}

export interface NotificationResponse {
  id: string;
  type: string;
  actor_id?: string;
  video_id?: string;
  comment_id?: string;
  message: string;
  read: boolean;
  created_at: string;
  actor?: CreatorResponse;
}

export function toUserResponse(row: Record<string, unknown>): UserResponse {
  return {
    id: String(row.id),
    username: String(row.username || ""),
    display_name: String(row.display_name || ""),
    bio: String(row.bio || ""),
    avatar_url: String(row.avatar_url || ""),
    locale: String(row.locale || "bn"),
    is_verified: Boolean(row.is_verified),
    followers_count: Number(row.followers_count || 0),
    following_count: Number(row.following_count || 0),
    coin_balance: Number(row.coin_balance || 0),
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || ""),
  };
}
