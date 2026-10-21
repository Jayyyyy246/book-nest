import { request } from './client';

export const cartApi = {
  getCart: () => request<{ items: any[]; cart: Record<number, number>; count: number }>('/api/cart'),

  addToCart: (bookId: number, quantity = 1) =>
    request<{ success: boolean; bookId: number; quantity: number }>('/api/cart/items', {
      method: 'POST',
      body: JSON.stringify({ bookId, quantity }),
    }),

  updateCartQty: (bookId: number, quantity: number) =>
    request<{ success: boolean; bookId: number; quantity: number }>(`/api/cart/items/${bookId}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity }),
    }),

  removeFromCart: (bookId: number) =>
    request<{ success: boolean; bookId: number }>(`/api/cart/items/${bookId}`, {
      method: 'DELETE',
    }),

  clearCart: () => request<{ success: boolean }>('/api/cart', { method: 'DELETE' }),

  syncCart: (guestCart: Record<number, number>) =>
    request<{ success: boolean; cart: Record<number, number> }>('/api/cart/sync', {
      method: 'POST',
      body: JSON.stringify({ guestCart }),
    }),

  validateCoupon: (code: string, subtotal: number) =>
    request<{
      valid: boolean;
      code: string;
      discountType: string;
      discountValue: number;
      calculatedDiscount: number;
      message: string;
    }>('/api/coupons/validate', {
      method: 'POST',
      body: JSON.stringify({ code, subtotal }),
    }),
};
