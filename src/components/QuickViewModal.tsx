import React, { useState, useEffect } from 'react';
import { Book } from '../types';
import { api } from '../api';
import { useModalA11y } from '../hooks/useModalA11y';

interface QuickViewModalProps {
  book: Book | null;
  onClose: () => void;
  isWishlisted: boolean;
  onToggleWishlist: (bookId: number) => void;
  onAddToCart: (book: Book, quantity: number) => void;
  currentUser?: any;
  onOpenAuth?: () => void;
  allBooks?: Book[];
  onSelectBook?: (book: Book) => void;
  onViewFullDetails?: (book: Book) => void;
}

export const QuickViewModal: React.FC<QuickViewModalProps> = ({
  book,
  onClose,
  isWishlisted,
  onToggleWishlist,
  onAddToCart,
  currentUser,
  onOpenAuth,
  allBooks = [],
  onSelectBook,
  onViewFullDetails,
}) => {
  const [qty, setQty] = useState(1);
  const [isAdded, setIsAdded] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'reviews'>('details');
  const [selectedGalleryAngle, setSelectedGalleryAngle] = useState<'cover' | 'spine' | 'jacket'>('cover');

  // Reviews state
  const [reviews, setReviews] = useState<any[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);

  // Bundle offer state
  const [bundleOffer, setBundleOffer] = useState<any | null>(null);
  const [bundleAdded, setBundleAdded] = useState(false);

  // Modal accessibility: focus trapping, body scroll lock, Escape key, and focus restoration
  const { modalRef } = useModalA11y({
    isOpen: !!book,
    onClose,
  });

  useEffect(() => {
    if (book) {
      setQty(1);
      setActiveTab('details');
      setSelectedGalleryAngle('cover');
      setReviewMsg(null);

      // Load reviews
      setLoadingReviews(true);
      api.getReviews(book.id)
        .then(res => setReviews(res.reviews || []))
        .catch(() => setReviews([]))
        .finally(() => setLoadingReviews(false));

      // Load bundle recommendation
      api.getBundle(book.id)
        .then(res => setBundleOffer(res.bundle))
        .catch(() => setBundleOffer(null));
    }
  }, [book?.id]);

  if (!book) return null;

  const finalPrice = Math.round(book.price * (1 - book.discount / 100));

  // Related books from database catalog
  const relatedBooks = allBooks
    .filter(b => b.id !== book.id && (b.category.toLowerCase() === book.category.toLowerCase() || b.author === book.author))
    .slice(0, 3);

  const handleAdd = () => {
    if (book.stock <= 0) return;
    onAddToCart(book, qty);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 1500);
  };

  const handleAddBundle = () => {
    if (bundleOffer) {
      onAddToCart(bundleOffer.currentBook, 1);
      onAddToCart(bundleOffer.companionBook, 1);
      setBundleAdded(true);
      setTimeout(() => setBundleAdded(false), 2000);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    if (!currentUser) {
      if (onOpenAuth) onOpenAuth();
      return;
    }

    setSubmittingReview(true);
    setReviewMsg(null);
    try {
      const res = await api.submitReview(book.id, newRating, newComment, newTitle);
      setReviews(prev => [res.review, ...prev]);
      setNewComment('');
      setNewTitle('');
      setReviewMsg('Thank you! Your verified review has been published.');
      setTimeout(() => setReviewMsg(null), 3500);
    } catch (err: any) {
      setReviewMsg(err.message || 'Failed to submit review.');
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div 
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-book-title"
      data-testid="quick-view-modal"
      className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      {/* Modal Card */}
      <div className="relative w-full max-w-3xl bg-white rounded-3xl border border-slate-200/90 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-white/90 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <i className="fa-solid fa-xmark text-sm"></i>
        </button>

        {/* Tab Headers */}
        <div className="flex items-center gap-4 px-6 pt-5 pb-3 border-b border-slate-100 bg-[#FAF8F5]">
          <button
            onClick={() => setActiveTab('details')}
            className={`text-xs font-bold uppercase tracking-wider pb-2 border-b-2 transition-colors ${
              activeTab === 'details'
                ? 'border-amber-600 text-amber-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Overview &amp; Product Details
          </button>
          <button
            onClick={() => setActiveTab('reviews')}
            className={`text-xs font-bold uppercase tracking-wider pb-2 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'reviews'
                ? 'border-amber-600 text-amber-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Verified Reviews ({reviews.length})</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 sm:p-8 overflow-y-auto flex-1">
          {activeTab === 'details' ? (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                
                {/* Left Column: Product Gallery */}
                <div className="md:col-span-5 flex flex-col items-center justify-center">
                  <div className="relative w-48 sm:w-56 aspect-[2/3] rounded-r-lg rounded-l-xs overflow-hidden book-shadow-3d book-spine border border-slate-900/10">
                    <img
                      src={book.coverImage}
                      alt={`Cover of ${book.title}`}
                      className={`w-full h-full object-cover transition-all duration-300 ${
                        selectedGalleryAngle === 'spine' ? 'scale-110 object-left' :
                        selectedGalleryAngle === 'jacket' ? 'brightness-95 contrast-105' : 'scale-100'
                      }`}
                    />
                  </div>

                  {/* Gallery Thumbnails */}
                  <div className="mt-3 flex items-center gap-2">
                    {[
                      { id: 'cover', label: 'Front Cover' },
                      { id: 'spine', label: 'Spine & Binding' },
                      { id: 'jacket', label: 'ISBN Manifest' }
                    ].map((galleryView) => (
                      <button
                        key={galleryView.id}
                        type="button"
                        onClick={() => setSelectedGalleryAngle(galleryView.id as any)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
                          selectedGalleryAngle === galleryView.id
                            ? 'bg-amber-100 text-amber-900 border-amber-400 shadow-2xs'
                            : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {galleryView.label}
                      </button>
                    ))}
                  </div>

                  {book.discount > 0 && (
                    <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-bold">
                      <i className="fa-solid fa-tag text-amber-600"></i>
                      <span>Save {book.discount}% on Campus Edition</span>
                    </div>
                  )}
                </div>

                {/* Right Column: Book Details & Actions */}
                <div className="md:col-span-7 flex flex-col">
                  
                  <div className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-1">
                    {book.category}
                  </div>

                  <h2 id="modal-book-title" className="font-serif font-black text-2xl sm:text-3xl text-slate-950 leading-tight">
                    {book.title}
                  </h2>

                  <p className="text-sm text-slate-600 mt-1 font-sans">
                    by <span className="text-slate-900 font-semibold">{book.author}</span>
                  </p>

                  {/* Rating & Stock */}
                  <div className="flex items-center gap-3 mt-3 text-xs">
                    <div className="flex items-center text-amber-500 font-bold" aria-label={`Rated ${book.rating} out of 5 stars`}>
                      <i className="fa-solid fa-star text-xs mr-1"></i>
                      <span>{book.rating.toFixed(1)}</span>
                    </div>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-500">{book.pages} pages</span>
                    <span className="text-slate-300">·</span>
                    <span className={`font-semibold ${book.stock > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {book.stock > 0 ? `In Stock (${book.stock} available)` : 'Out of Stock'}
                    </span>
                  </div>

                  {/* Price Display */}
                  <div className="mt-4 flex items-baseline gap-2.5">
                    <span className="font-serif font-black text-3xl text-slate-950">
                      ₹{finalPrice}
                    </span>
                    {book.discount > 0 && (
                      <span className="text-sm text-slate-400 line-through">
                        ₹{book.price}
                      </span>
                    )}
                  </div>

                  {/* Description Synopsis */}
                  <div className="mt-4 text-xs text-slate-600 leading-relaxed font-sans">
                    {book.description}
                  </div>

                  {/* Relational Specs Grid */}
                  <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-100 text-xs text-slate-600">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">ISBN</span>
                      <span className="font-mono font-medium text-slate-900">{book.isbn}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Publisher</span>
                      <span className="font-medium text-slate-900 truncate block">{book.publisher}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Publication Year</span>
                      <span className="font-medium text-slate-900">{book.year}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Language</span>
                      <span className="font-medium text-slate-900">{book.language}</span>
                    </div>
                  </div>

                  {/* Action Buttons: Quantity, Add to Cart, Wishlist */}
                  <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-3">
                    
                    {/* Quantity */}
                    <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
                      <button
                        type="button"
                        onClick={() => setQty(Math.max(1, qty - 1))}
                        aria-label="Decrease quantity"
                        className="w-7 h-7 rounded-lg bg-white hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs"
                      >
                        -
                      </button>
                      <span className="w-8 text-center text-xs font-bold text-slate-900">
                        {qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => setQty(Math.min(book.stock, qty + 1))}
                        disabled={qty >= book.stock}
                        aria-label="Increase quantity"
                        className="w-7 h-7 rounded-lg bg-white hover:bg-slate-200 text-slate-700 disabled:opacity-40 flex items-center justify-center font-bold text-xs"
                      >
                        +
                      </button>
                    </div>

                    {/* Add to Cart */}
                    <button
                      type="button"
                      onClick={handleAdd}
                      disabled={book.stock <= 0}
                      className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-98 ${
                        book.stock <= 0
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                          : isAdded
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-900 hover:bg-amber-600 text-amber-50 hover:text-slate-950'
                      }`}
                    >
                      {book.stock <= 0 ? (
                        <span>Out of Stock</span>
                      ) : isAdded ? (
                        <>
                          <i className="fa-solid fa-check"></i>
                          <span>Added to Cart!</span>
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-bag-shopping"></i>
                          <span>Add to Cart (₹{finalPrice * qty})</span>
                        </>
                      )}
                    </button>

                    {/* Wishlist Toggle */}
                    <button
                      type="button"
                      onClick={() => onToggleWishlist(book.id)}
                      aria-label={isWishlisted ? `Remove ${book.title} from wishlist` : `Save ${book.title} to wishlist`}
                      className={`w-11 h-11 rounded-xl border flex items-center justify-center text-sm transition-colors ${
                        isWishlisted
                          ? 'bg-rose-50 text-rose-600 border-rose-200 shadow-2xs'
                          : 'bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-500 border-slate-200'
                      }`}
                    >
                      <i className={`${isWishlisted ? 'fa-solid text-rose-500' : 'fa-regular'} fa-heart`}></i>
                    </button>

                  </div>

                  {onViewFullDetails && (
                    <button
                      type="button"
                      data-testid="quickview-view-full-details-btn"
                      onClick={() => {
                        onClose();
                        onViewFullDetails(book);
                      }}
                      className="w-full mt-3 py-2 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 font-bold text-xs border border-amber-200/80 transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                    >
                      <span>View Full Book Details &amp; Shareable Link</span>
                      <i className="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                    </button>
                  )}

                </div>

              </div>

              {/* Related Books Shelf from Real Database Catalog */}
              {relatedBooks.length > 0 && (
                <div className="mt-8 pt-6 border-t border-slate-100">
                  <h4 className="font-serif font-bold text-sm text-slate-900 mb-3 flex items-center gap-2">
                    <i className="fa-solid fa-books text-amber-600"></i>
                    <span>Related Books in {book.category}</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {relatedBooks.map((relBook) => {
                      const relPrice = Math.round(relBook.price * (1 - relBook.discount / 100));
                      return (
                        <div
                          key={relBook.id}
                          onClick={() => {
                            if (onSelectBook) onSelectBook(relBook);
                          }}
                          className="p-3 rounded-xl border border-slate-200 hover:border-amber-400 bg-slate-50/50 hover:bg-white transition-all cursor-pointer flex items-center gap-3 group"
                        >
                          <img
                            src={relBook.coverImage}
                            alt={relBook.title}
                            className="w-10 h-14 object-cover rounded shadow-2xs shrink-0 book-spine"
                          />
                          <div className="min-w-0 flex-1">
                            <h5 className="font-serif font-bold text-xs text-slate-900 line-clamp-1 group-hover:text-amber-800">
                              {relBook.title}
                            </h5>
                            <p className="text-[10px] text-slate-500 line-clamp-1">{relBook.author}</p>
                            <span className="font-bold text-xs text-slate-900 mt-1 block">₹{relPrice}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Frequently Bought Together Bundle */}
              {bundleOffer && (
                <div className="mt-6 p-5 rounded-2xl bg-amber-50/70 border border-amber-200/80">
                  <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <i className="fa-solid fa-sparkles text-amber-600"></i>
                    <span>Frequently Bought Together (Save 10%)</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={bundleOffer.companionBook.coverImage}
                        alt={bundleOffer.companionBook.title}
                        className="w-12 h-16 object-cover rounded shadow-xs book-spine"
                      />
                      <div>
                        <h4 className="font-serif font-bold text-xs text-slate-900">
                          {bundleOffer.companionBook.title}
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          by {bundleOffer.companionBook.author} · <span className="text-amber-700">{bundleOffer.companionBook.category}</span>
                        </p>
                        <div className="mt-1 flex items-baseline gap-2 text-xs">
                          <span className="font-bold text-slate-900">Bundle Price: ₹{bundleOffer.bundlePrice}</span>
                          <span className="text-slate-400 line-through text-[11px]">₹{bundleOffer.originalTotal}</span>
                          <span className="text-emerald-700 font-semibold text-[10px]">Save ₹{bundleOffer.savings}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleAddBundle}
                      className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-1.5 shrink-0"
                    >
                      <i className={`fa-solid ${bundleAdded ? 'fa-check' : 'fa-layer-group'}`}></i>
                      <span>{bundleAdded ? 'Bundle Added!' : 'Add Both to Cart'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ================= TAB 2: VERIFIED REVIEWS ================= */
            <div className="space-y-6">
              
              {/* Write Review Form */}
              <div className="p-5 rounded-2xl bg-[#FAF8F5] border border-slate-200">
                <h3 className="font-serif font-bold text-sm text-slate-900 mb-1">
                  Share Your Academic Review
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Help fellow campus scholars evaluate this textbook and course reference.
                </p>

                {reviewMsg && (
                  <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
                    {reviewMsg}
                  </div>
                )}

                <form onSubmit={handleSubmitReview} className="space-y-3 text-xs">
                  <div>
                    <label id="rating-label" className="block text-slate-600 font-semibold mb-1">Rating</label>
                    <div className="flex items-center gap-1 text-amber-500 text-base cursor-pointer" aria-labelledby="rating-label">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          type="button"
                          key={star}
                          onClick={() => setNewRating(star)}
                          aria-label={`Set rating to ${star} stars`}
                          className="focus:outline-none"
                        >
                          <i className={`fa-star ${star <= newRating ? 'fa-solid' : 'fa-regular'}`}></i>
                        </button>
                      ))}
                      <span className="text-xs text-slate-600 ml-2 font-sans font-semibold">
                        {newRating} / 5 Stars
                      </span>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="review-headline" className="block text-slate-600 font-semibold mb-1">
                      Review Headline (Optional)
                    </label>
                    <input
                      id="review-headline"
                      type="text"
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      placeholder="e.g. Essential reference for semester exams"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="review-comments" className="block text-slate-600 font-semibold mb-1">
                      Your Detailed Comments
                    </label>
                    <textarea
                      id="review-comments"
                      required
                      rows={3}
                      value={newComment}
                      onChange={e => setNewComment(e.target.value)}
                      placeholder="Discuss readability, practical exercises, chapter clarity..."
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    {!currentUser && (
                      <span className="text-[11px] text-amber-800">
                        Sign in required to publish verified student reviews.
                      </span>
                    )}
                    <button
                      type="submit"
                      disabled={submittingReview}
                      className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-amber-600 text-white font-bold text-xs ml-auto transition-colors"
                    >
                      {submittingReview ? 'Publishing...' : currentUser ? 'Submit Review' : 'Sign in to Review'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Reviews List */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Campus Reader Reviews ({reviews.length})
                </h4>

                {loadingReviews ? (
                  <div className="py-8 text-center text-xs text-slate-400">Loading verified reviews...</div>
                ) : reviews.length > 0 ? (
                  <div className="divide-y divide-slate-100">
                    {reviews.map((rev) => (
                      <div key={rev.id} className="py-4 first:pt-0">
                        <div className="flex items-center justify-between gap-2 mb-1.5 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{rev.userName}</span>
                            {rev.isVerified === 1 && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 text-[10px] font-semibold border border-emerald-200">
                                <i className="fa-solid fa-circle-check text-[9px] text-emerald-600"></i>
                                Verified Reader
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {new Date(rev.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 text-amber-500 text-xs mb-1">
                          {[1, 2, 3, 4, 5].map(s => (
                            <i key={s} className={`fa-star ${s <= rev.rating ? 'fa-solid' : 'fa-regular'}`}></i>
                          ))}
                        </div>

                        {rev.title && (
                          <h5 className="font-bold text-xs text-slate-900 mb-1">{rev.title}</h5>
                        )}

                        <p className="text-xs text-slate-600 leading-relaxed font-sans">{rev.comment}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-500 bg-[#FAF8F5] rounded-2xl border border-dashed border-slate-200">
                    No verified reviews yet. Be the first scholar to review this book!
                  </div>
                )}
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  );
};
