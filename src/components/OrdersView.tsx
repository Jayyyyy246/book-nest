import React, { useState } from 'react';
import { Package, Truck, Check, Clock, ArrowRight, Printer, X, FileText, ChevronRight } from 'lucide-react';
import { Book } from '../types';

export interface PlacedOrder {
  id: string | number;
  date: string;
  total?: number;
  totalAmount?: number;
  status: 'Confirmed' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';
  paymentMethod: string;
  items: { book: Book; quantity: number; price: number }[];
  address?: {
    name?: string;
    fullName?: string;
    phone?: string;
    address?: string;
    hostelBlock?: string;
    roomNo?: string;
    city?: string;
    pincode?: string;
    deliveryNotes?: string;
  };
}

interface OrdersViewProps {
  orders: PlacedOrder[];
  onNavigateToCatalog: () => void;
  onOrderAgain: (book: Book) => void;
}

export const OrdersView: React.FC<OrdersViewProps> = ({
  orders,
  onNavigateToCatalog,
  onOrderAgain
}) => {
  const [selectedInvoice, setSelectedInvoice] = useState<PlacedOrder | null>(null);

  if (orders.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="bg-white border border-[#E8E5DF] rounded-3xl p-12 max-w-lg mx-auto shadow-sm">
          <div className="w-20 h-20 bg-blue-50 text-blue-900 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">
            📦
          </div>
          <h2 className="font-serif text-2xl font-bold text-zinc-900 mb-2">
            No orders yet. Your next read could be here.
          </h2>
          <p className="text-sm text-zinc-500 mb-8 max-w-sm mx-auto leading-relaxed">
            When you complete checkout, your order confirmation, dispatch tracking, and printable GST tax invoices will appear here.
          </p>
          <button
            onClick={onNavigateToCatalog}
            className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm transition-all shadow-md inline-flex items-center gap-2"
          >
            <span>Explore Bookstore</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-serif text-3xl font-bold text-zinc-900">
            My Orders
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            {orders.length} {orders.length === 1 ? 'order' : 'orders'} placed with campus tracking
          </p>
        </div>

        <button
          onClick={onNavigateToCatalog}
          className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-semibold text-xs transition-all flex items-center gap-1.5"
        >
          <span>+ Browse More Books</span>
        </button>
      </div>

      {/* Orders List */}
      <div className="space-y-6">
        {orders.map((order) => (
          <div
            key={order.id}
            data-testid="order-card"
            className="bg-white border border-[#E8E5DF] rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
          >
            {/* Order Card Header */}
            <div className="bg-zinc-50 border-b border-[#E8E5DF] p-5 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex flex-wrap gap-6 sm:gap-10">
                <div>
                  <span className="text-zinc-400 block font-medium">ORDER PLACED</span>
                  <span className="font-semibold text-zinc-900">{order.date}</span>
                </div>
                <div>
                  <span className="text-zinc-400 block font-medium">TOTAL AMOUNT</span>
                  <span className="font-bold text-zinc-900">₹{order.total || (order as any).totalAmount || 0}</span>
                </div>
                <div>
                  <span className="text-zinc-400 block font-medium">SHIP TO</span>
                  <span className="font-semibold text-zinc-900">{order.address?.name || 'Campus Student'}</span>
                </div>
                <div>
                  <span className="text-zinc-400 block font-medium">PAYMENT</span>
                  <span className="font-semibold text-zinc-700">{order.paymentMethod}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-blue-900 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100">
                  {(order as any).orderNumber || (typeof order.id === 'number' ? `BN-${order.id}` : order.id)}
                </span>
                <button
                  onClick={() => setSelectedInvoice(order)}
                  className="px-3 py-1.5 rounded-lg border border-zinc-200 hover:bg-white text-zinc-700 font-medium flex items-center gap-1.5 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Invoice</span>
                </button>
              </div>
            </div>

            {/* Tracking progress bar */}
            <div className="p-6 border-b border-zinc-100">
              <div className="flex items-center justify-between text-xs mb-3 font-semibold">
                <div className="flex items-center gap-2 text-emerald-600">
                  <Check className="w-4 h-4" />
                  <span>{order.status}</span>
                </div>
                <span className="text-zinc-400">Estimated Delivery in 2-4 business days</span>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-800 font-bold border border-emerald-200">
                  ✓ Confirmed
                </div>
                <div className={`p-2 rounded-xl border ${order.status !== 'Confirmed' ? 'bg-emerald-50 text-emerald-800 font-bold border-emerald-200' : 'bg-blue-50 text-blue-900 font-bold border-blue-200'}`}>
                  📦 Processing
                </div>
                <div className="p-2 rounded-xl bg-zinc-50 text-zinc-400 border border-zinc-200">
                  🚚 Dispatched
                </div>
                <div className="p-2 rounded-xl bg-zinc-50 text-zinc-400 border border-zinc-200">
                  🏁 Delivered
                </div>
              </div>
            </div>

            {/* Item Rows */}
            <div className="p-6 divide-y divide-zinc-100">
              {order.items.map(({ book, quantity, price }) => (
                <div key={book.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <img
                      src={book.coverImage}
                      alt={book.title}
                      className="w-12 h-16 object-cover rounded-md border border-zinc-200 flex-shrink-0"
                    />
                    <div>
                      <h4 className="font-bold text-sm text-zinc-900 line-clamp-1">{book.title}</h4>
                      <p className="text-xs text-zinc-500">by {book.author}</p>
                      <span className="text-xs text-zinc-400 font-mono">
                        Qty: {quantity} × ₹{price}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => onOrderAgain(book)}
                    className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-900 hover:bg-blue-100 text-xs font-semibold transition-colors flex-shrink-0"
                  >
                    Buy Again
                  </button>
                </div>
              ))}
            </div>

          </div>
        ))}
      </div>

      {/* Invoice Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto border border-[#E8E5DF]">
            <button
              onClick={() => setSelectedInvoice(null)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 flex items-center justify-center font-bold"
            >
              ✕
            </button>

            <div className="flex items-center justify-between pb-4 border-b border-zinc-100 mb-6">
              <div>
                <div className="font-serif text-2xl font-bold text-zinc-900">
                  BookNest Tax Invoice
                </div>
                <div className="text-xs text-zinc-500">
                  Official original buyer receipt • Order {selectedInvoice.id}
                </div>
              </div>
              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-xs font-semibold flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 bg-zinc-50 p-4 rounded-2xl border border-zinc-200 text-xs mb-6">
              <div>
                <span className="text-zinc-400 block font-medium">Billed & Shipped To:</span>
                <strong className="text-zinc-900 text-sm block mt-0.5">{selectedInvoice.address?.name || 'Campus Student'}</strong>
                <div className="text-zinc-600 mt-1">{selectedInvoice.address?.address || selectedInvoice.address?.hostelBlock || 'University Campus'}</div>
                <div className="text-zinc-600">
                  {selectedInvoice.address?.city ? `${selectedInvoice.address.city} - ${selectedInvoice.address?.pincode || ''}` : selectedInvoice.address?.roomNo || ''}
                </div>
                <div className="text-zinc-500 mt-1">📞 {selectedInvoice.address?.phone || '+91 98765 43210'}</div>
              </div>

              <div>
                <span className="text-zinc-400 block font-medium">Invoice Details:</span>
                <div className="mt-1 space-y-1">
                  <div><strong>Invoice Date:</strong> {selectedInvoice.date}</div>
                  <div><strong>Payment Mode:</strong> {selectedInvoice.paymentMethod}</div>
                  <div><strong>Delivery Mode:</strong> Regional Express Campus Dispatch</div>
                  <div><strong>GST Compliance:</strong> 07AAAAA0000A1Z5</div>
                </div>
              </div>
            </div>

            <table className="w-full text-xs mb-6">
              <thead>
                <tr className="border-b-2 border-zinc-200 text-zinc-400 text-left uppercase">
                  <th className="py-2">Item</th>
                  <th className="py-2 text-center">Qty</th>
                  <th className="py-2 text-right">Price</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {selectedInvoice.items.map(({ book, quantity, price }) => (
                  <tr key={book.id}>
                    <td className="py-3 font-semibold text-zinc-900">
                      {book.title}
                      <span className="block text-[10px] text-zinc-400 font-normal">by {book.author}</span>
                    </td>
                    <td className="py-3 text-center">{quantity}</td>
                    <td className="py-3 text-right">₹{price}</td>
                    <td className="py-3 text-right font-bold">₹{price * quantity}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-zinc-200 font-bold text-sm">
                  <td colSpan={3} className="pt-3 text-right text-zinc-600">Grand Total:</td>
                  <td className="pt-3 text-right text-blue-900 text-base">₹{selectedInvoice.total}</td>
                </tr>
              </tfoot>
            </table>

            <div className="text-[11px] text-zinc-400 text-center border-t border-zinc-100 pt-4">
              Thank you for supporting BookNest campus bookstore! All rights reserved.
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
