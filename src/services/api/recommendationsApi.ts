import { request } from './client';

export const recommendationsApi = {
  getBundle: (bookId: number | string) =>
    request<{ bundle: any }>(`/api/recommendations/bundle/${bookId}`),

  getAiRecommendations: (query: string, currentBookTitle?: string) =>
    request<{ recommendation: string; suggestedBooks: any[]; isAiGenerated: boolean }>('/api/recommendations/ai', {
      method: 'POST',
      body: JSON.stringify({ query, currentBookTitle }),
    }),
};
