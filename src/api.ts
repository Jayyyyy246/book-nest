import { Book, UserSession } from './types';

const TOKEN_KEY = 'booknest_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(data?.error || `Request failed with status ${response.status}`, response.status, data);
  }

  return data as T;
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ user: UserSession; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (name: string, email: string, password: string, phone?: string) =>
    request<{ user: UserSession; token: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, phone }),
    }),

  logout: () =>
    request<{ message: string }>('/api/auth/logout', {
      method: 'POST',
    }),

  getMe: () => request<{ user: UserSession }>('/api/auth/me'),

  loginWithGoogle: (data: { credential: string }) =>
    request<{ user: UserSession; token: string }>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getDemoUsers: () => request<any>('/api/auth/demo-users'),

  // Books & Categories
  getBooks: (params: {
    category?: string;
    search?: string;
    maxPrice?: number;
    stockOnly?: boolean;
    sortBy?: string;
  } = {}) => {
    const query = new URLSearchParams();
    if (params.category && params.category !== 'all') query.set('category', params.category);
    if (params.search?.trim()) query.set('search', params.search.trim());
    if (params.maxPrice !== undefined) query.set('maxPrice', String(params.maxPrice));
    if (params.stockOnly) query.set('stockOnly', 'true');
    if (params.sortBy) query.set('sortBy', params.sortBy);

    const queryString = query.toString();
    return request<{ books: Book[]; count: number }>(`/api/books${queryString ? `?${queryString}` : ''}`);
  },

  getBookDetail: (idOrIsbn: string | number) =>
    request<{ book: Book; reviews: any[] }>(`/api/books/${idOrIsbn}`),

  getBookById: (idOrIsbn: string | number) =>
    request<{ book: Book; reviews: any[] }>(`/api/books/${idOrIsbn}`),

  searchBooks: (q: string) =>
    request<{ books: Book[]; count: number; query: string }>(`/api/books/search?q=${encodeURIComponent(q)}`),

  getBooksByCategory: (category: string) =>
    request<{ books: Book[]; count: number; category: string }>(`/api/books/category/${encodeURIComponent(category)}`),

  getCategories: () =>
    request<{ categories: any[]; totalBooks: number }>('/api/categories'),

  // Cart
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

  // Wishlist
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

  // Orders
  getOrders: () => request<{ orders: any[] }>('/api/orders'),

  getOrderById: (id: number | string) => request<{ order: any }>(`/api/orders/${id}`),

  cancelOrder: (id: number | string) =>
    request<{
      success: boolean;
      message: string;
      orderId: number;
      orderNumber?: string;
      status: string;
    }>(`/api/orders/${id}/cancel`, {
      method: 'POST',
    }),

  placeOrder: (orderPayload: {
    address: {
      fullName: string;
      hostelBlock: string;
      roomNo: string;
      phone: string;
      deliveryNotes?: string;
    };
    paymentMethod: string;
    items: Array<{ bookId: number; quantity: number }>;
    summary: any;
  }) =>
    request<{ success: boolean; order: any }>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(orderPayload),
    }),

  // Coupons
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

  // Reviews
  getReviews: (bookId: number) =>
    request<{ reviews: any[]; avgRating: number; totalReviews: number }>(`/api/reviews/book/${bookId}`),

  submitReview: (bookId: number, rating: number, comment: string, title?: string) =>
    request<{ success: boolean; message: string; review: any }>(`/api/reviews/book/${bookId}`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment, title }),
    }),

  updateReview: (reviewId: number, rating: number, comment: string, title?: string) =>
    request<{ success: boolean; message: string; review: any }>(`/api/reviews/${reviewId}`, {
      method: 'PUT',
      body: JSON.stringify({ rating, comment, title }),
    }),

  deleteReview: (reviewId: number) =>
    request<{ success: boolean; message: string; reviewId: number }>(`/api/reviews/${reviewId}`, {
      method: 'DELETE',
    }),

  // Recommendations & Bundles
  getBundle: (bookId: number) =>
    request<{ bundle: any }>(`/api/recommendations/bundle/${bookId}`),

  getAiRecommendations: (query: string, currentBookTitle?: string) =>
    request<{ recommendation: string; suggestedBooks: any[]; isAiGenerated: boolean }>('/api/recommendations/ai', {
      method: 'POST',
      body: JSON.stringify({ query, currentBookTitle }),
    }),

  // Scanner
  scanIsbn: async (isbn: string) => {
    try {
      return await request<{
        success: boolean;
        matched: boolean;
        matchType: string;
        confidence: number;
        evidence: string;
        book?: Book | null;
        candidates?: any[];
        isLocalCatalog?: boolean;
        error?: string;
        detectedIsbn?: string;
      }>('/api/scanner/isbn', {
        method: 'POST',
        body: JSON.stringify({ isbn }),
      });
    } catch (err: any) {
      if (err instanceof ApiError && err.data) {
        return err.data;
      }
      throw err;
    }
  },

  scanVision: async (imageBase64: string, mimeType?: string) => {
    try {
      return await request<{
        success: boolean;
        matched: boolean;
        matchType: string;
        confidence: number;
        evidence: string;
        book?: Book | null;
        candidates?: any[];
        detectedMetadata?: any;
        isLocalCatalog?: boolean;
        error?: string;
      }>('/api/scanner/analyze', {
        method: 'POST',
        body: JSON.stringify({ imageBase64, mimeType }),
      });
    } catch (err: any) {
      if (err instanceof ApiError && err.data) {
        return err.data;
      }
      throw err;
    }
  },

  matchText: async (queryOrData: string | { query?: string; title?: string; author?: string; isbn?: string; rawTextLines?: string[] }) => {
    try {
      const body = typeof queryOrData === 'string' ? { query: queryOrData } : queryOrData;
      return await request<{
        success: boolean;
        matched: boolean;
        matchType: string;
        confidence: number;
        evidence: string;
        book?: Book | null;
        candidates?: any[];
        error?: string;
      }>('/api/scanner/match-text', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    } catch (err: any) {
      if (err instanceof ApiError && err.data) {
        return err.data;
      }
      throw err;
    }
  },

  // Admin
  getAdminMetrics: () => request<{ metrics: any }>('/api/admin/metrics'),

  getAdminOrders: () => request<{ orders: any[] }>('/api/admin/orders'),

  updateAdminOrderStatus: (orderId: number, status: string) =>
    request<{ success: boolean; message: string; orderId: number; status: string }>(
      `/api/admin/orders/${orderId}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }
    ),

  addBook: (bookData: any) =>
    request<{ success: boolean; message: string; book: Book }>('/api/admin/books', {
      method: 'POST',
      body: JSON.stringify(bookData),
    }),

  updateBook: (bookId: number, bookData: any) =>
    request<{ success: boolean; message: string; book: Book }>(`/api/admin/books/${bookId}`, {
      method: 'PUT',
      body: JSON.stringify(bookData),
    }),

  updateStock: (bookId: number, stock: number) =>
    request<{ success: boolean; message: string; bookId: number; stock: number }>(`/api/admin/books/${bookId}/stock`, {
      method: 'PATCH',
      body: JSON.stringify({ stock }),
    }),

  deleteBook: (bookId: number) =>
    request<{ success: boolean; message: string; bookId: number }>(`/api/admin/books/${bookId}`, {
      method: 'DELETE',
    }),
};
