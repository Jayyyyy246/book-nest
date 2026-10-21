import React, { useState, useEffect, useRef } from 'react';
import { Book, UserSession } from '../types';
import { api } from '../api';

export interface BookDetailPageProps {
  bookId: string | number;
  allBooks: Book[];
  wishlist: number[];
  currentUser: UserSession | null;
  onAddToCart: (book: Book, quantity?: number) => void;
  onToggleWishlist: (bookId: number, title?: string) => void;
  onNavigateToCatalog: () => void;
  onNavigateToHome: () => void;
  onSelectCategory: (category: string) => void;
  onOpenBookDetail: (bookId: number | string) => void;
  onOpenAuth: () => void;
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
}

export const BookDetailPage: React.FC<BookDetailPageProps> = ({
  bookId,
  allBooks,
  wishlist,
  currentUser,
  onAddToCart,
  onToggleWishlist,
  onNavigateToCatalog,
  onNavigateToHome,
  onSelectCategory,
  onOpenBookDetail,
  onOpenAuth,
  showToast,
}) => {
  const [book, setBook] = useState<Book | null>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [qty, setQty] = useState(1);
  const [isAdded, setIsAdded] = useState(false);
  const [selectedAngle, setSelectedAngle] = useState<'cover' | 'spine' | 'jacket'>('cover');

  // Bundle offer
  const [bundleOffer, setBundleOffer] = useState<any | null>(null);
  const [bundleAdded, setBundleAdded] = useState(false);

  // Review form
  const [newRating, setNewRating] = useState(5);
  const [newTitle, setNewTitle] = useState('');
  const [newComment, setNewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  // Prevent duplicate analytics/fetch increments for the same bookId in StrictMode
  const loadedBookIdRef = useRef<string | number | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    if (book && !isLoading) {
      headingRef.current?.focus();
    }
  }, [book?.id, isLoading]);

  useEffect(() => {
    const cleanId = String(bookId).trim();
    if (!cleanId) {
      setError('Invalid book identifier.');
      setIsLoading(false);
      return;
    }

    if (loadedBookIdRef.current === cleanId && book) {
      return;
    }
    loadedBookIdRef.current = cleanId;

    setIsLoading(true);
    setError(null);
    setQty(1);
    setReviewMsg(null);
    setImageError(false);

    // Hydrate directly from backend endpoint
    api.getBookById(cleanId)
      .then(res => {
        if (!res.book) {
          setError('Book not found in campus catalog.');
          setBook(null);
        } else {
          setBook(res.book);
          setReviews(res.reviews || []);
          // Fetch co-purchase bundle
          api.getBundle(res.book.id)
            .then(bRes => setBundleOffer(bRes.bundle))
            .catch(() => setBundleOffer(null));
        }
      })
      .catch(err => {
        // Fallback: check if exists in in-memory catalog
        const numId = Number(cleanId);
        const local = allBooks.find(b => b.id === numId || b.isbn === cleanId);
        if (local) {
          setBook(local);
        } else {
          setError(err.message || 'Book not found in campus catalog.');
          setBook(null);
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [bookId, allBooks]);

  const finalPrice = book ? Math.round(book.price * (1 - (book.discount || 0) / 100)) : 0;
  const isWishlisted = book ? wishlist.includes(book.id) : false;

  const handleAddToCart = () => {
    if (!book || book.stock <= 0) return;
    onAddToCart(book, qty);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 1500);
  };

  const handleAddBundle = () => {
    if (bundleOffer) {
      onAddToCart(bundleOffer.currentBook, 1);
      onAddToCart(bundleOffer.companionBook, 1);
      setBundleAdded(true);
      showToast('Frequently Bought Together bundle added to cart!', 'success');
      setTimeout(() => setBundleAdded(false), 2000);
    }
  };

  const handleShareLink = () => {
    try {
      navigator.clipboard.writeText(window.location.href);
      showToast('Shareable book link copied to clipboard!', 'success');
    } catch {
      showToast('URL: ' + window.location.href, 'info');
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!book) return;
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    if (!newComment.trim()) return;

    setSubmittingReview(true);
    setReviewMsg(null);

    try {
      const res = await api.submitReview(
        book.id,
        newRating,
        newComment.trim(),
        newTitle.trim() || undefined
      );
      setReviews(prev => [res.review, ...prev]);
      setNewComment('');
      setNewTitle('');
      setReviewMsg('Thank you! Your verified academic review has been published.');
      showToast('Review posted successfully!', 'success');
    } catch (err: any) {
      setReviewMsg(err.message || 'Failed to submit review.');
    } finally {
      setSubmittingReview(false);
    }
  };

  // Related books from catalog
  const relatedBooks = book
    ? allBooks.filter(b => b.id !== book.id && (b.category.toLowerCase() === book.category.toLowerCase() || b.author === book.author)).slice(0, 4)
    : [];

  // ================= LOADING STATE =================
  if (isLoading) {
    return (
      <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full animate-pulse focus:outline-none" data-testid="book-detail-loading">
        <div className="h-6 w-64 bg-slate-200 rounded-lg mb-8"></div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-5 aspect-[3/4] bg-slate-200 rounded-3xl"></div>
          <div className="lg:col-span-7 space-y-4">
            <div className="h-8 w-3/4 bg-slate-200 rounded-lg"></div>
            <div className="h-4 w-1/3 bg-slate-200 rounded-lg"></div>
            <div className="h-10 w-40 bg-slate-200 rounded-lg mt-6"></div>
            <div className="h-24 w-full bg-slate-200 rounded-xl mt-6"></div>
          </div>
        </div>
      </main>
    );
  }

  // ================= ERROR / NOT FOUND STATE =================
  if (error || !book) {
    return (
      <main id="main-content" tabIndex={-1} className="flex-1 max-w-4xl mx-auto px-4 py-16 text-center focus:outline-none" data-testid="book-detail-error">
        <div className="bg-white border border-slate-200 rounded-3xl p-10 sm:p-14 shadow-sm space-y-5">
          <div className="w-20 h-20 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto text-3xl">
            <i className="fa-solid fa-book-skull"></i>
          </div>
          <h1 className="font-serif font-black text-2xl sm:text-3xl text-slate-900">
            Book Not Found in Campus Catalog
          </h1>
          <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
            The book identifier <span className="font-mono font-bold text-slate-700">"{bookId}"</span> does not correspond to an active title in our campus inventory or may have been archived.
          </p>
          <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={onNavigateToCatalog}
              data-testid="error-catalog-btn"
              className="px-6 py-3 rounded-xl bg-slate-900 hover:bg-amber-600 text-white font-bold text-xs shadow-md transition-colors flex items-center gap-2"
            >
              <i className="fa-solid fa-books"></i>
              <span>Browse Textbook Catalog</span>
            </button>
            <button
              onClick={onNavigateToHome}
              className="px-6 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors"
            >
              Back to Home Storefront
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full focus:outline-none" data-testid="book-detail-page">
      
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500 mb-8 overflow-x-auto whitespace-nowrap pb-1">
        <button onClick={onNavigateToHome} className="hover:text-amber-800 transition-colors flex items-center gap-1">
          <i className="fa-solid fa-house text-[10px]"></i>
          <span>Home</span>
        </button>
        <span className="text-slate-300">/</span>
        <button onClick={onNavigateToCatalog} className="hover:text-amber-800 transition-colors">
          Textbook Catalog
        </button>
        <span className="text-slate-300">/</span>
        <button
          onClick={() => {
            onSelectCategory(book.categorySlug || book.category.toLowerCase());
            onNavigateToCatalog();
          }}
          className="text-amber-800 font-semibold hover:underline"
        >
          {book.category}
        </button>
        <span className="text-slate-300">/</span>
        <span className="text-slate-800 font-bold truncate max-w-xs" title={book.title}>
          {book.title}
        </span>
      </nav>

      {/* Main 2-Column Product Showcase */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        
        {/* Left Column: Cover Presentation & Gallery Angles */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-3xl border border-slate-200/90 p-8 shadow-sm relative flex flex-col items-center justify-center overflow-hidden">
            
            {/* Ambient colored backdrop glow */}
            <div
              className="absolute inset-0 opacity-20 filter blur-3xl pointer-events-none scale-125"
              style={{ backgroundImage: `url(${book.coverImage})`, backgroundSize: 'cover' }}
            />

            {/* Book Cover Frame */}
            <div className="relative z-10 w-full max-w-[280px] aspect-[2/3] rounded-r-2xl rounded-l-md overflow-hidden book-shadow-3d book-spine border border-slate-900/10 transition-transform duration-300">
              {imageError || !book.coverImage ? (
                <div className="w-full h-full bg-gradient-to-br from-amber-700 via-amber-800 to-slate-900 p-6 flex flex-col justify-between text-white select-none">
                  <div>
                    <span className="text-xs uppercase font-bold text-amber-300 tracking-wider block">
                      {book.category}
                    </span>
                    <h2 className="font-serif font-black text-xl leading-snug mt-3 line-clamp-4">
                      {book.title}
                    </h2>
                  </div>
                  <div>
                    <p className="text-sm text-amber-200/90 font-medium line-clamp-2">
                      {book.author}
                    </p>
                    <span className="text-xs text-amber-300/60 font-mono block mt-2">
                      ISBN {book.isbn ? book.isbn.slice(-4) : 'N/A'}
                    </span>
                  </div>
                </div>
              ) : (
                <img
                  src={book.coverImage}
                  alt={book.title}
                  data-testid="book-detail-cover"
                  onError={() => setImageError(true)}
                  className={`w-full h-full object-cover transition-all duration-300 ${
                    selectedAngle === 'spine' ? 'scale-110 -rotate-3' : selectedAngle === 'jacket' ? 'scale-105' : 'scale-100'
                  }`}
                />
              )}
            </div>

            {/* Gallery Angle Pills */}
            <div className="relative z-10 mt-6 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedAngle('cover')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  selectedAngle === 'cover' ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Front Cover
              </button>
              <button
                type="button"
                onClick={() => setSelectedAngle('spine')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  selectedAngle === 'spine' ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Book Spine
              </button>
              <button
                type="button"
                onClick={() => setSelectedAngle('jacket')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  selectedAngle === 'jacket' ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Back Overview
              </button>
            </div>
          </div>

          {/* Direct Shareable Link Card */}
          <div className="bg-[#FAF8F5] border border-amber-900/10 rounded-2xl p-4 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-600 truncate">
              <i className="fa-solid fa-link text-amber-600 shrink-0"></i>
              <span className="truncate font-mono text-[11px] text-slate-500">
                #/book/{book.id}
              </span>
            </div>
            <button
              type="button"
              data-testid="share-link-btn"
              onClick={handleShareLink}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-amber-100 text-amber-950 border border-slate-200 text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5 shadow-2xs"
            >
              <i className="fa-regular fa-copy"></i>
              <span>Copy Link</span>
            </button>
          </div>
        </div>

        {/* Right Column: Book Specifications, Pricing & CTAs */}
        <div className="lg:col-span-7 space-y-6">
          
          <div className="bg-white rounded-3xl border border-slate-200/90 p-8 shadow-sm space-y-6">
            
            {/* Category Tag & Stock Status */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="px-3 py-1 rounded-full bg-amber-100/90 text-amber-900 font-bold text-xs uppercase tracking-wider">
                {book.category}
              </span>

              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                  book.stock > 0
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${book.stock > 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                  {book.stock > 0 ? `In Stock (${book.stock} Available)` : 'Out of Stock on Campus'}
                </span>
              </div>
            </div>

            {/* Title & Author */}
            <div>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="font-serif font-black text-3xl sm:text-4xl text-slate-950 leading-tight focus:outline-none"
                data-testid="book-detail-title"
              >
                {book.title}
              </h1>
              <p className="text-base text-slate-600 mt-2 font-medium" data-testid="book-detail-author">
                by <span className="font-bold text-slate-900">{book.author}</span>
              </p>
            </div>

            {/* Rating Stars & Reviews Count */}
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100 text-sm">
              <div className="flex items-center text-amber-500 gap-1">
                {[1, 2, 3, 4, 5].map(star => (
                  <i
                    key={star}
                    className={`fa-star ${star <= Math.round(book.rating) ? 'fa-solid' : 'fa-regular'} text-xs`}
                  ></i>
                ))}
                <span className="font-bold text-slate-900 ml-1.5">
                  {book.rating.toFixed(1)}
                </span>
              </div>
              <span className="text-slate-300">·</span>
              <a href="#verified-reviews" className="text-xs text-amber-800 hover:underline font-semibold">
                {reviews.length} {reviews.length === 1 ? 'Verified Review' : 'Verified Reviews'}
              </a>
            </div>

            {/* Pricing Details */}
            <div className="flex items-baseline gap-3">
              <span className="font-serif font-black text-4xl text-slate-950" data-testid="book-detail-price">
                ₹{finalPrice}
              </span>
              {book.discount > 0 && (
                <>
                  <span className="text-base text-slate-400 line-through">
                    ₹{book.price}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-xs">
                    {book.discount}% CAMPUS DISCOUNT
                  </span>
                </>
              )}
            </div>

            <p className="text-xs text-slate-500 -mt-2">
              Inclusive of all academic taxes &amp; GST. Free delivery for student orders over ₹499.
            </p>

            {/* Description Synopsis */}
            <div className="pt-2">
              <h3 className="font-serif font-bold text-sm text-slate-900 mb-2 uppercase tracking-wider">
                Course Synopsis &amp; Overview
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed font-sans" data-testid="book-detail-description">
                {book.description || 'Comprehensive university reference textbook covering core theoretical foundations and applied practical exercises.'}
              </p>
            </div>

            {/* Relational Catalog Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-100 text-xs">
              <div className="p-3 bg-slate-50/70 rounded-xl">
                <span className="text-slate-400 block text-[10px] font-bold uppercase">ISBN-13</span>
                <span className="font-mono font-bold text-slate-900">{book.isbn}</span>
              </div>
              <div className="p-3 bg-slate-50/70 rounded-xl">
                <span className="text-slate-400 block text-[10px] font-bold uppercase">Publisher</span>
                <span className="font-bold text-slate-900 truncate block">{book.publisher || 'Campus Press'}</span>
              </div>
              <div className="p-3 bg-slate-50/70 rounded-xl">
                <span className="text-slate-400 block text-[10px] font-bold uppercase">Publication Year</span>
                <span className="font-bold text-slate-900">{book.year || 2024}</span>
              </div>
              <div className="p-3 bg-slate-50/70 rounded-xl">
                <span className="text-slate-400 block text-[10px] font-bold uppercase">Page Count</span>
                <span className="font-bold text-slate-900">{book.pages || 320} Pages</span>
              </div>
              <div className="p-3 bg-slate-50/70 rounded-xl">
                <span className="text-slate-400 block text-[10px] font-bold uppercase">Language</span>
                <span className="font-bold text-slate-900">{book.language || 'English'}</span>
              </div>
              <div className="p-3 bg-slate-50/70 rounded-xl">
                <span className="text-slate-400 block text-[10px] font-bold uppercase">Campus Dispatch</span>
                <span className="font-bold text-emerald-800">&lt; 30 Mins</span>
              </div>
            </div>

            {/* Add to Cart, Quantity & Wishlist Action Bar */}
            <div className="pt-6 border-t border-slate-100 flex flex-wrap items-center gap-4">
              
              {/* Quantity Picker */}
              <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  disabled={qty <= 1}
                  aria-label="Decrease quantity"
                  className="w-9 h-9 rounded-xl bg-white hover:bg-slate-200 text-slate-700 disabled:opacity-40 flex items-center justify-center font-bold text-sm shadow-2xs"
                >
                  -
                </button>
                <span className="w-10 text-center font-bold text-sm text-slate-900" data-testid="detail-qty-display">
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQty(Math.min(book.stock, qty + 1))}
                  disabled={qty >= book.stock}
                  aria-label="Increase quantity"
                  className="w-9 h-9 rounded-xl bg-white hover:bg-slate-200 text-slate-700 disabled:opacity-40 flex items-center justify-center font-bold text-sm shadow-2xs"
                >
                  +
                </button>
              </div>

              {/* Add to Cart CTA */}
              <button
                type="button"
                data-testid="detail-add-cart-btn"
                onClick={handleAddToCart}
                disabled={book.stock <= 0}
                className={`flex-1 py-3.5 px-6 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-98 ${
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

              {/* Wishlist Toggle Button */}
              <button
                type="button"
                data-testid="detail-wishlist-btn"
                onClick={() => onToggleWishlist(book.id, book.title)}
                aria-label={isWishlisted ? `Remove ${book.title} from wishlist` : `Save ${book.title} to wishlist`}
                className={`w-12 h-12 rounded-2xl border flex items-center justify-center text-lg transition-colors shadow-2xs ${
                  isWishlisted
                    ? 'bg-rose-50 text-rose-600 border-rose-200'
                    : 'bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-500 border-slate-200'
                }`}
              >
                <i className={`${isWishlisted ? 'fa-solid text-rose-500' : 'fa-regular'} fa-heart`}></i>
              </button>
            </div>

          </div>

          {/* Frequently Bought Together Bundle */}
          {bundleOffer && (
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-3xl p-6 shadow-xs" data-testid="detail-bundle-card">
              <div className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <i className="fa-solid fa-sparkles text-amber-600"></i>
                <span>Frequently Bought Together (Save 10%)</span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <img
                    src={bundleOffer.companionBook.coverImage}
                    alt={bundleOffer.companionBook.title}
                    className="w-14 h-20 object-cover rounded-xl shadow-xs book-spine shrink-0"
                  />
                  <div>
                    <h4 className="font-serif font-bold text-sm text-slate-900">
                      {bundleOffer.companionBook.title}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      by {bundleOffer.companionBook.author} · <span className="text-amber-800 font-semibold">{bundleOffer.companionBook.category}</span>
                    </p>
                    <div className="mt-2 flex items-baseline gap-2.5 text-xs">
                      <span className="font-bold text-slate-900 text-sm">Bundle: ₹{bundleOffer.bundlePrice}</span>
                      <span className="text-slate-400 line-through">₹{bundleOffer.originalTotal}</span>
                      <span className="text-emerald-700 font-semibold">Save ₹{bundleOffer.savings}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  data-testid="detail-add-bundle-btn"
                  onClick={handleAddBundle}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-1.5 shrink-0"
                >
                  <i className={`fa-solid ${bundleAdded ? 'fa-check' : 'fa-layer-group'}`}></i>
                  <span>{bundleAdded ? 'Bundle Added!' : 'Add Both to Cart'}</span>
                </button>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* Related Books in Same Category Shelf */}
      {relatedBooks.length > 0 && (
        <section className="mt-14 pt-10 border-t border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <div>
              <span className="text-xs font-bold text-amber-700 uppercase tracking-widest">
                Explore Companion Titles
              </span>
              <h2 className="font-serif font-bold text-xl text-slate-900 mt-0.5">
                Related Books in {book.category}
              </h2>
            </div>
            <button
              onClick={() => {
                onSelectCategory(book.categorySlug || book.category.toLowerCase());
                onNavigateToCatalog();
              }}
              className="text-xs font-bold text-amber-800 hover:text-amber-950"
            >
              View Category Shelf →
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {relatedBooks.map(rel => {
              const relPrice = Math.round(rel.price * (1 - (rel.discount || 0) / 100));
              return (
                <div
                  key={rel.id}
                  data-testid="related-book-card"
                  onClick={() => onOpenBookDetail(rel.id)}
                  className="group bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs hover:shadow-lg transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div className="aspect-[3/4] overflow-hidden rounded-xl bg-slate-100 mb-3">
                    <img
                      src={rel.coverImage}
                      alt={rel.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <div>
                    <h3 className="font-serif font-bold text-xs text-slate-900 line-clamp-2 group-hover:text-amber-800">
                      {rel.title}
                    </h3>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">{rel.author}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900">₹{relPrice}</span>
                      <span className="text-amber-500 text-[10px] font-bold flex items-center gap-0.5">
                        <i className="fa-solid fa-star text-[8px]"></i>
                        {rel.rating.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Verified Reviews & Discussion Section */}
      <section id="verified-reviews" className="mt-14 pt-10 border-t border-slate-200 space-y-8" data-testid="verified-reviews-section">
        <div>
          <span className="text-xs font-bold text-amber-700 uppercase tracking-widest">
            Campus Peer Feedback
          </span>
          <h2 className="font-serif font-bold text-2xl text-slate-900 mt-1">
            Verified Student &amp; Faculty Reviews
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* Left: Write a Review Form */}
          <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm space-y-4">
            <h3 className="font-serif font-bold text-base text-slate-900">
              Share Your Academic Review
            </h3>
            <p className="text-xs text-slate-500">
              Help fellow scholars evaluate this title for upcoming semester coursework.
            </p>

            {reviewMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
                {reviewMsg}
              </div>
            )}

            <form onSubmit={handleSubmitReview} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Rating</label>
                <div className="flex items-center gap-1.5 text-amber-500 text-lg cursor-pointer">
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
                <label htmlFor="detail-review-headline" className="block text-slate-600 font-semibold mb-1">
                  Review Headline (Optional)
                </label>
                <input
                  id="detail-review-headline"
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="e.g. Essential textbook for semester exams"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label htmlFor="detail-review-comment" className="block text-slate-600 font-semibold mb-1">
                  Detailed Comments
                </label>
                <textarea
                  id="detail-review-comment"
                  required
                  rows={4}
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  placeholder="Discuss chapter clarity, practical code exercises, readability..."
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
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
                  data-testid="detail-submit-review-btn"
                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-amber-600 text-white font-bold text-xs ml-auto transition-colors"
                >
                  {submittingReview ? 'Publishing...' : currentUser ? 'Submit Review' : 'Sign In to Review'}
                </button>
              </div>
            </form>
          </div>

          {/* Right: Existing Reviews List */}
          <div className="lg:col-span-7 space-y-4">
            {reviews.length > 0 ? (
              <div className="space-y-4">
                {reviews.map((rev: any) => (
                  <div
                    key={rev.id}
                    data-testid="review-card"
                    className="p-5 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-900 font-bold flex items-center justify-center text-xs">
                          {rev.userName ? rev.userName[0].toUpperCase() : 'S'}
                        </div>
                        <div>
                          <div className="font-bold text-xs text-slate-900">{rev.userName || 'Campus Scholar'}</div>
                          <div className="text-[10px] text-slate-400">
                            {rev.date ? new Date(rev.date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Recent Review'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center text-amber-500 text-xs">
                        {[1, 2, 3, 4, 5].map(star => (
                          <i key={star} className={`fa-star ${star <= rev.rating ? 'fa-solid' : 'fa-regular'}`}></i>
                        ))}
                      </div>
                    </div>

                    {rev.title && (
                      <h4 className="font-serif font-bold text-xs text-slate-900">
                        {rev.title}
                      </h4>
                    )}

                    <p className="text-xs text-slate-600 leading-relaxed">
                      {rev.comment}
                    </p>

                    {rev.isVerified === 1 && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-semibold mt-1">
                        <i className="fa-solid fa-circle-check text-[9px]"></i>
                        Verified Campus Purchase
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center bg-white border border-slate-200 rounded-2xl text-slate-400 text-xs">
                <i className="fa-regular fa-comment-dots text-3xl mb-2 text-slate-300"></i>
                <p>No verified reviews yet for this title. Be the first to share your thoughts!</p>
              </div>
            )}
          </div>

        </div>
      </section>

    </main>
  );
};
