import { request } from './client';
import { Book } from '../../types';

export const adminApi = {
  getAdminMetrics: () => request<{ metrics: any }>('/api/admin/metrics'),

  getAdminOrders: () => request<{ orders: any[] }>('/api/admin/orders'),

  updateAdminOrderStatus: (orderId: number | string, status: string) =>
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

  updateBook: (bookId: number | string, bookData: any) =>
    request<{ success: boolean; message: string; book: Book }>(`/api/admin/books/${bookId}`, {
      method: 'PUT',
      body: JSON.stringify(bookData),
    }),

  updateStock: (bookId: number | string, stock: number) =>
    request<{ success: boolean; message: string; bookId: number; stock: number }>(`/api/admin/books/${bookId}/stock`, {
      method: 'PATCH',
      body: JSON.stringify({ stock }),
    }),

  deleteBook: (bookId: number | string) =>
    request<{ success: boolean; message: string; bookId: number }>(`/api/admin/books/${bookId}`, {
      method: 'DELETE',
    }),
};
