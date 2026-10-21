import { request } from './client';

export const ordersApi = {
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

  placeOrder: (
    orderPayload: {
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
    },
    idempotencyKey?: string
  ) => {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    return request<{ success: boolean; order: any }>('/api/orders', {
      method: 'POST',
      headers,
      body: JSON.stringify(orderPayload),
    });
  },
};
