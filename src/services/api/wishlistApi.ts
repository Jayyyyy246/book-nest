import { request } from './client';

export const wishlistApi = {
  getWishlist: () => request<{ wishlist: number[] }>('/api/wishlist'),

  addToWishlist: (bookId: number) =>
    request<{ success: boolean; message: string; bookId: number }>(`/api/wishlist/${bookId}`, {
      method: 'POST',
    }),

  removeFromWishlist: (bookId: number) =>
    request<{ success: boolean; message: string; bookId: number }>(`/api/wishlist/${bookId}`, {
      method: 'DELETE',
    }),

  toggleWishlist: (bookId: number) =>
    request<{ action: 'added' | 'removed'; bookId: number; isWishlisted: boolean }>(`/api/wishlist/toggle/${bookId}`, {
      method: 'POST',
    }),

  syncWishlist: (guestWishlist: number[]) =>
    request<{ wishlist: number[] }>('/api/wishlist/sync', {
      method: 'POST',
      body: JSON.stringify({ guestWishlist }),
    }),
};
