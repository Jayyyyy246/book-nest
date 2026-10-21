import { request } from './client';
import { Book } from '../../types';

export const booksApi = {
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

  getBookById: (id: number | string) =>
    request<{ book: Book; reviews?: any[]; avgRating?: number; totalReviews?: number }>(`/api/books/${id}`),

  getBooksByCategory: (category: string) =>
    request<{ books: Book[]; count: number; category: string }>(`/api/books/category/${encodeURIComponent(category)}`),

  getCategories: () =>
    request<{ categories: any[]; totalBooks?: number }>('/api/categories'),

  // Reviews
  getReviews: (bookId: number | string) =>
    request<{ reviews: any[]; avgRating: number; totalReviews: number }>(`/api/reviews/book/${bookId}`),

  submitReview: (bookId: number | string, rating: number, comment: string, title?: string) =>
    request<{ success: boolean; message: string; review: any }>(`/api/reviews/book/${bookId}`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment, title }),
    }),

  updateReview: (reviewId: number | string, rating: number, comment: string, title?: string) =>
    request<{ success: boolean; message: string; review: any }>(`/api/reviews/${reviewId}`, {
      method: 'PUT',
      body: JSON.stringify({ rating, comment, title }),
    }),

  deleteReview: (reviewId: number | string) =>
    request<{ success: boolean; message: string; reviewId: number }>(`/api/reviews/${reviewId}`, {
      method: 'DELETE',
    }),
};
