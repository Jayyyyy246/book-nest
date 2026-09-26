import React, { useState } from 'react';
import { Book } from '../types';

interface BookCardProps {
  book: Book;
  isWishlisted: boolean;
  onAddToCart: (book: Book) => void;
  onToggleWishlist: (bookId: number) => void;
  onQuickView: (book: Book) => void;
}

export const BookCard: React.FC<BookCardProps> = ({
  book,
  isWishlisted,
  onAddToCart,
  onToggleWishlist,
  onQuickView,
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [addedAnimation, setAddedAnimation] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isWishlisting, setIsWishlisting] = useState(false);

  const finalPrice = Math.round(book.price * (1 - book.discount / 100));

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (book.stock <= 0 || isAdding) return;
    
    setIsAdding(true);
    onAddToCart(book);
    setAddedAnimation(true);

    setTimeout(() => {
      setAddedAnimation(false);
      setIsAdding(false);
    }, 1200);
  };

  const handleWishlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isWishlisting) return;

    setIsWishlisting(true);
    onToggleWishlist(book.id);

    setTimeout(() => {
      setIsWishlisting(false);
    }, 400);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onQuickView(book);
    }
  };

  // Stock status badge
  const getStockBadge = () => {
    if (book.stock <= 0) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
          Out of Stock
        </span>
      );
    }
    if (book.stock <= 5) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
          Only {book.stock} left
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
        In Stock ({book.stock})
      </span>
    );
  };

  return (
    <div
      tabIndex={0}
      role="button"
      aria-label={`View details for ${book.title} by ${book.author}`}
      onClick={() => onQuickView(book)}
      onKeyDown={handleKeyDown}
      className="group relative bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:shadow-xl hover:-translate-y-1 transition-all duration-200 flex flex-col cursor-pointer overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
    >
      {/* Top action row: Stock badge & Wishlist Heart */}
      <div className="flex items-center justify-between gap-2 mb-4 z-10">
        <div>{getStockBadge()}</div>

        <button
          type="button"
          disabled={isWishlisting}
          onClick={handleWishlist}
          aria-label={isWishlisted ? `Remove ${book.title} from wishlist` : `Add ${book.title} to wishlist`}
          title={isWishlisted ? "Remove from Wishlist" : "Save to Wishlist"}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${
            isWishlisting ? 'scale-110' : 'scale-100'
          } ${
            isWishlisted
              ? 'bg-rose-50 text-rose-600 shadow-xs border border-rose-200'
              : 'bg-white/95 text-slate-400 hover:text-rose-500 hover:bg-rose-50 border border-slate-200'
          }`}
        >
          <i className={`${isWishlisted ? 'fa-solid text-rose-500' : 'fa-regular'} fa-heart text-sm`}></i>
        </button>
      </div>

      {/* Book Cover Presentation */}
      <div className="relative mx-auto my-2 w-full max-w-[170px] aspect-[2/3] flex items-center justify-center">
        {/* Ambient shadow matching cover */}
        {!imageError && imageLoaded && (
          <div
            className="absolute inset-0 rounded-r-lg rounded-l-xs opacity-25 filter blur-xl scale-95 transition-all duration-300 group-hover:scale-105 group-hover:opacity-40 pointer-events-none"
            style={{ backgroundImage: `url(${book.coverImage})`, backgroundSize: 'cover' }}
          />
        )}

        {/* 3D Book with Spine Effect */}
        <div className="relative w-full h-full rounded-r-lg rounded-l-xs overflow-hidden book-shadow-3d book-spine border border-slate-900/10 transition-transform duration-200 group-hover:scale-[1.02]">
          
          {/* Skeleton Shimmer Loading Placeholder */}
          {!imageLoaded && !imageError && (
            <div className="absolute inset-0 bg-slate-100 animate-pulse flex flex-col items-center justify-center p-4 text-center">
              <i className="fa-solid fa-book-open text-2xl text-slate-300 mb-2"></i>
              <div className="w-3/4 h-2.5 bg-slate-200 rounded mb-1.5"></div>
              <div className="w-1/2 h-2 bg-slate-200 rounded"></div>
            </div>
          )}

          {/* Graceful Fallback if image fails to load */}
          {imageError ? (
            <div className="w-full h-full bg-gradient-to-br from-amber-700 via-amber-800 to-slate-900 p-4 flex flex-col justify-between text-white select-none">
              <div>
                <span className="text-[10px] uppercase font-bold text-amber-300 tracking-wider block">
                  {book.category}
                </span>
                <h4 className="font-serif font-black text-xs leading-snug mt-2 line-clamp-3">
                  {book.title}
                </h4>
              </div>
              <div>
                <p className="text-[10px] text-amber-200/90 font-medium line-clamp-1">
                  {book.author}
                </p>
                <span className="text-[9px] text-amber-300/60 font-mono block mt-1">
                  ISBN {book.isbn.slice(-4)}
                </span>
              </div>
            </div>
          ) : (
            <img
              src={book.coverImage}
              alt={`Cover of ${book.title}`}
              loading="lazy"
              onLoad={() => setImageLoaded(true)}
              onError={() => {
                setImageLoaded(true);
                setImageError(true);
              }}
              className={`w-full h-full object-cover select-none transition-opacity duration-300 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          )}

          {/* Quick View Hover Indicator */}
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center p-3 pointer-events-none">
            <span className="px-3 py-1.5 rounded-full bg-white text-slate-900 text-xs font-semibold shadow-lg flex items-center gap-1.5">
              <i className="fa-regular fa-eye text-amber-600"></i>
              Quick Preview
            </span>
          </div>

          {/* Discount Ribbon */}
          {book.discount > 0 && (
            <div className="absolute top-2 right-2 bg-amber-500 text-slate-950 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded shadow-sm tracking-wider">
              {book.discount}% OFF
            </div>
          )}
        </div>
      </div>

      {/* Book Metadata */}
      <div className="mt-4 flex-1 flex flex-col">
        {/* Category & ISBN */}
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
          <span className="font-semibold text-amber-800">
            {book.category}
          </span>
          <span className="font-mono text-[11px] text-slate-400">
            {book.isbn.slice(-4)}
          </span>
        </div>

        {/* Title */}
        <h3 className="font-serif font-bold text-slate-900 text-base line-clamp-2 leading-snug group-hover:text-amber-800 transition-colors">
          {book.title}
        </h3>

        {/* Author */}
        <p className="text-xs text-slate-600 mt-1 font-sans">
          by <span className="font-medium text-slate-800">{book.author}</span>
        </p>

        {/* Rating & Details Row */}
        <div className="flex items-center gap-2 mt-2 text-xs">
          <div className="flex items-center text-amber-500" aria-label={`Rated ${book.rating.toFixed(1)} out of 5 stars`}>
            <i className="fa-solid fa-star text-xs mr-1"></i>
            <span className="font-bold text-slate-900">{book.rating.toFixed(1)}</span>
          </div>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500 text-[11px]">
            {(book.reviewCount || book.reviews_count) ? `${book.reviewCount || book.reviews_count} reviews` : `${book.pages} pages`}
          </span>
        </div>

        {/* Price & Add to Cart footer */}
        <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-1.5">
              <span className="font-serif font-bold text-lg text-slate-900">
                ₹{finalPrice}
              </span>
              {book.discount > 0 && (
                <span className="text-xs text-slate-400 line-through">
                  ₹{book.price}
                </span>
              )}
            </div>
            <span className="text-[10px] text-emerald-700 font-medium">Free Campus Pickup</span>
          </div>

          <button
            type="button"
            disabled={book.stock <= 0 || isAdding}
            onClick={handleAddToCart}
            aria-label={book.stock <= 0 ? `${book.title} is out of stock` : `Add ${book.title} to bag for ₹${finalPrice}`}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 active:scale-95 ${
              book.stock <= 0
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                : addedAnimation
                ? 'bg-emerald-600 text-white shadow-emerald-200'
                : 'bg-slate-900 text-amber-50 hover:bg-amber-600 hover:text-slate-950 hover:shadow-amber-500/20'
            }`}
          >
            {addedAnimation ? (
              <>
                <i className="fa-solid fa-check text-xs"></i>
                <span>Added!</span>
              </>
            ) : book.stock <= 0 ? (
              <span>Sold Out</span>
            ) : (
              <>
                <i className="fa-solid fa-bag-shopping text-xs"></i>
                <span>Add</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
