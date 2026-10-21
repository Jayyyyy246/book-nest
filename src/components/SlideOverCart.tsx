import React, { useState } from 'react';
import { Book, CartSummaryData } from '../types';
import { api } from '../api';
import { useModalA11y } from '../hooks/useModalA11y';

interface SlideOverCartProps {
  isOpen: boolean;
  onClose: () => void;
  cart: Record<number, number>;
  books: Book[];
  summary: CartSummaryData;
  appliedCoupon: string | null;
  onUpdateQty: (bookId: number, qty: number) => void;
  onRemoveItem: (bookId: number, title: string) => void;
  onApplyCoupon: (code: string) => void;
  onRemoveCoupon: () => void;
  onProceedToCheckout: () => void;
  onNavigateToCatalog: () => void;
  onOpenBookDetail: (book: Book) => void;
  onSaveForLater?: (book: Book) => void;
}

export const SlideOverCart: React.FC<SlideOverCartProps> = ({
  isOpen,
  onClose,
  cart,
  books,
  summary,
  appliedCoupon,
  onUpdateQty,
  onRemoveItem,
  onApplyCoupon,
  onRemoveCoupon,
  onProceedToCheckout,
  onNavigateToCatalog,
  onOpenBookDetail,
  onSaveForLater,
}) => {
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState('');

  const { modalRef } = useModalA11y({
    isOpen,
    onClose,
    autoFocusSelector: '[data-testid="close-cart-btn"]',
  });

  if (!isOpen) return null;

  const cartEntries = Object.entries(cart)
    .filter(([_, qty]) => qty > 0)
    .map(([bookIdStr, qty]) => {
      const id = parseInt(bookIdStr, 10);
      const book = books.find(b => b.id === id);
      return { id, book, quantity: qty };
    })
    .filter(item => item.book !== undefined) as { id: number; book: Book; quantity: number }[];

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setCouponError('');
    const code = couponInput.trim().toUpperCase();
    if (!code) return;

    try {
      const res = await api.validateCoupon(code, summary.subtotal);
      if (res.valid) {
        onApplyCoupon(code);
        setCouponInput('');
      } else {
        setCouponError(res.message || 'Invalid coupon code');
      }
    } catch {
      setCouponError('Error validating coupon. Please try again.');
    }
  };

  return (
    <div 
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cart-drawer-heading"
      className="fixed inset-0 z-50 overflow-hidden"
    >
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300">
          
          {/* Drawer Header */}
          <div className="p-5 border-b border-slate-200/80 flex items-center justify-between bg-[#FAF8F5]">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shadow-xs">
                <i className="fa-solid fa-bag-shopping text-sm"></i>
              </div>
              <div>
                <h2 id="cart-drawer-heading" className="font-serif font-bold text-lg text-slate-900">
                  Shopping Bag
                </h2>
                <p className="text-[11px] text-slate-500">
                  {summary.itemCount} {summary.itemCount === 1 ? 'item' : 'items'} selected
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              aria-label="Close cart drawer"
              data-testid="close-cart-btn"
              className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>

          {/* Dynamic Free Delivery Meter */}
          <div className="px-5 py-3.5 bg-amber-50/70 border-b border-amber-200/60">
            <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
              <span className="flex items-center gap-1.5 text-amber-950 font-semibold">
                <i className="fa-solid fa-truck-fast text-amber-600"></i>
                {summary.isFreeDelivery ? (
                  <span className="text-emerald-700 font-bold">🎉 Free Campus Delivery Unlocked!</span>
                ) : (
                  <span>
                    Add <span className="font-bold text-amber-900">₹{summary.amountNeededForFreeDelivery}</span> more for Free Delivery
                  </span>
                )}
              </span>
              <span className="text-[11px] text-slate-500">
                Threshold: ₹499
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 bg-amber-200/60 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-amber-500 to-amber-600 rounded-full transition-all duration-300"
                style={{ width: `${summary.freeDeliveryProgress}%` }}
              />
            </div>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-5 divide-y divide-slate-100">
            {cartEntries.length > 0 ? (
              cartEntries.map(({ id, book, quantity }) => {
                const finalPrice = Math.round(book.price * (1 - book.discount / 100));
                const itemTotal = finalPrice * quantity;
                const isMaxStock = quantity >= book.stock;

                return (
                  <div key={id} className="py-4 first:pt-0 last:pb-0 flex gap-4 group">
                    
                    {/* Cover thumbnail */}
                    <div 
                      onClick={() => {
                        onClose();
                        onOpenBookDetail(book);
                      }}
                      className="w-16 h-22 shrink-0 rounded-r-md rounded-l-xs overflow-hidden book-shadow-3d book-spine border border-slate-900/10 cursor-pointer hover:scale-105 transition-transform"
                    >
                      <img 
                        src={book.coverImage} 
                        alt={book.title} 
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Book Info & Quantity Controls */}
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 
                            onClick={() => {
                              onClose();
                              onOpenBookDetail(book);
                            }}
                            className="font-serif font-bold text-sm text-slate-900 hover:text-amber-800 cursor-pointer line-clamp-1"
                          >
                            {book.title}
                          </h3>
                          <button
                            type="button"
                            onClick={() => onRemoveItem(id, book.title)}
                            className="text-slate-400 hover:text-rose-600 p-1 transition-colors"
                            aria-label={`Remove ${book.title} from cart`}
                            title="Remove item"
                          >
                            <i className="fa-regular fa-trash-can text-xs"></i>
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-1">
                          {book.author} · <span className="text-amber-700">{book.category}</span>
                        </p>
                        
                        {isMaxStock && (
                          <span className="text-[10px] text-amber-700 font-semibold block mt-0.5">
                            Max available campus stock reached ({book.stock})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-3 pt-2">
                        {/* Dynamic Quantity Counter */}
                        <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                          <button
                            type="button"
                            onClick={() => onUpdateQty(id, quantity - 1)}
                            aria-label="Decrease quantity"
                            className="w-6 h-6 rounded-md bg-white hover:bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold transition-colors shadow-2xs"
                          >
                            -
                          </button>
                          <span className="w-8 text-center text-xs font-bold text-slate-900">
                            {quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => onUpdateQty(id, quantity + 1)}
                            disabled={isMaxStock}
                            aria-label="Increase quantity"
                            className="w-6 h-6 rounded-md bg-white hover:bg-slate-200 text-slate-700 disabled:opacity-40 flex items-center justify-center text-xs font-bold transition-colors shadow-2xs"
                          >
                            +
                          </button>
                        </div>

                        {/* Save for later action */}
                        {onSaveForLater && (
                          <button
                            type="button"
                            onClick={() => onSaveForLater(book)}
                            className="text-[11px] text-amber-800 hover:text-amber-950 font-medium hover:underline flex items-center gap-1"
                          >
                            <i className="fa-regular fa-heart text-[10px]"></i>
                            <span>Save for later</span>
                          </button>
                        )}

                        {/* Price */}
                        <div className="text-right">
                          <div className="font-serif font-bold text-sm text-slate-900">
                            ₹{itemTotal}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            ₹{finalPrice} each
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                );
              })
            ) : (
              /* Thoughtful Empty State */
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center text-2xl mb-4">
                  <i className="fa-solid fa-basket-shopping"></i>
                </div>
                <h3 className="font-serif font-bold text-lg text-slate-900 mb-1">
                  Your bag is waiting for its first book.
                </h3>
                <p className="text-xs text-slate-500 max-w-xs mb-6">
                  Explore our curated shelves and find your next inspiring academic or literary read.
                </p>
                <button
                  onClick={() => {
                    onClose();
                    onNavigateToCatalog();
                  }}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-amber-600 text-amber-100 hover:text-slate-950 font-semibold text-xs shadow-md transition-all"
                >
                  Browse Bookstore Catalog →
                </button>
              </div>
            )}
          </div>

          {/* Drawer Footer with Promo Code & Totals */}
          {cartEntries.length > 0 && (
            <div className="p-5 border-t border-slate-200/80 bg-[#FAF8F5] space-y-4">
              
              {/* Promo Code Input */}
              <div>
                {appliedCoupon ? (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
                    <span className="font-semibold text-emerald-800 flex items-center gap-1.5">
                      <i className="fa-solid fa-tag"></i>
                      <span>Coupon &ldquo;{appliedCoupon}&rdquo; Applied</span>
                    </span>
                    <button
                      onClick={onRemoveCoupon}
                      className="text-emerald-700 hover:text-emerald-900 font-bold"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleApplyCoupon} className="flex gap-2">
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      placeholder="Promo code (try WELCOME10)"
                      className="flex-1 py-2 px-3 rounded-xl border border-slate-200 bg-white text-xs uppercase font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-amber-600 text-amber-50 hover:text-slate-950 font-bold text-xs transition-colors"
                    >
                      Apply
                    </button>
                  </form>
                )}
                {couponError && (
                  <p className="text-[11px] text-rose-600 mt-1">{couponError}</p>
                )}
              </div>

              {/* Price Calculation Summary */}
              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-medium text-slate-900">₹{summary.subtotal}</span>
                </div>
                {summary.couponDiscount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>Coupon Discount</span>
                    <span>-₹{summary.couponDiscount}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Campus Delivery</span>
                  <span>{summary.isFreeDelivery ? <span className="text-emerald-700 font-bold">FREE</span> : `₹${summary.deliveryFee}`}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200/80 font-serif text-base font-bold text-slate-950">
                  <span>Total Amount</span>
                  <span className="font-mono text-lg text-amber-950">₹{summary.grandTotal}</span>
                </div>
              </div>

              {/* Checkout Action Button */}
              <button
                data-testid="proceed-checkout-btn"
                onClick={() => {
                  onClose();
                  onProceedToCheckout();
                }}
                className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm shadow-md hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2 active:scale-98 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                <span>Proceed to 3-Step Checkout</span>
                <i className="fa-solid fa-arrow-right text-xs"></i>
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
