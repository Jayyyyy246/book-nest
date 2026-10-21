import { request } from './client';
import { UserSession } from '../../types';

export const authApi = {
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
};
