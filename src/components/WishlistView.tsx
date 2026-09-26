import React from 'react';
import { Heart, ShoppingCart, Trash2, Star, ArrowRight } from 'lucide-react';
import { Book } from '../types';

interface WishlistViewProps {
  wishlist: number[];
  books: Book[];
  onMoveToCart: (book: Book) => void;
  onRemoveFromWishlist: (bookId: number, title: string) => void;
  onAddAllToCart: () => void;
  onNavigateToCatalog: () => void;
  onOpenBookDetail: (book: Book) => void;
}

export const WishlistView: React.FC<WishlistViewProps> = ({
  wishlist,
  books,
  onMoveToCart,
  onRemoveFromWishlist,
  onAddAllToCart,
  onNavigateToCatalog,
  onOpenBookDetail
}) => {
  const wishlistBooks = books.filter(b => wishlist.includes(b.id));

  if (wishlistBooks.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="bg-white border border-[#E8E5DF] rounded-3xl p-12 max-w-lg mx-auto shadow-sm">
          <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">
            ♡
          </div>
          <h1 className="font-serif text-2xl font-bold text-zinc-900 mb-2">
            Your reading list is waiting.
          </h1>
          <p className="text-sm text-zinc-500 mb-8 max-w-sm mx-auto leading-relaxed">
            Click the heart icon on any title while exploring the catalog to save it to your personal reading list.
          </p>
          <button
            onClick={onNavigateToCatalog}
            className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm transition-all shadow-md inline-flex items-center gap-2"
          >
            <span>Explore Bookstore Catalog</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-serif text-3xl font-bold text-zinc-900">
            My Wishlist
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            {wishlistBooks.length} {wishlistBooks.length === 1 ? 'saved book' : 'saved books'}
          </p>
        </div>

        <button
          onClick={onAddAllToCart}
          className="px-4 py-2 rounded-xl bg-blue-900 hover:bg-blue-950 text-white font-semibold text-xs transition-all shadow-sm flex items-center gap-2"
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          <span>Add All to Cart</span>
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {wishlistBooks.map(book => {
          const finalPrice = Math.round(book.price * (1 - book.discount / 100));
          const inStock = book.stock > 0;

          return (
            <div 
              key={book.id}
              className="bg-white border border-[#E8E5DF] rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between group"
            >
              {/* Image & Remove button */}
              <div className="relative aspect-[3/4] bg-zinc-100 overflow-hidden">
                <img
                  src={book.coverImage}
                  alt={book.title}
                  onClick={() => onOpenBookDetail(book)}
                  className="w-full h-full object-cover cursor-pointer group-hover:scale-105 transition-transform duration-300"
                />

                <button
                  onClick={() => onRemoveFromWishlist(book.id, book.title)}
                  className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/90 hover:bg-white text-rose-600 flex items-center justify-center shadow-md transition-transform hover:scale-110"
                  title="Remove from wishlist"
                >
                  ✕
                </button>

                {book.discount > 0 && (
                  <span className="absolute top-2.5 left-2.5 bg-rose-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm">
                    {book.discount}% OFF
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-blue-900 uppercase tracking-wide">
                    {book.category}
                  </span>
                  <h3
                    onClick={() => onOpenBookDetail(book)}
                    className="font-bold text-sm text-zinc-900 line-clamp-2 mt-1 cursor-pointer hover:text-blue-900 leading-snug"
                  >
                    {book.title}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">by {book.author}</p>

                  <div className="flex items-center justify-between mt-2 text-xs">
                    <div className="flex items-center gap-1 text-amber-500 font-bold">
                      <Star className="w-3.5 h-3.5 fill-amber-400" />
                      <span>{book.rating}</span>
                    </div>

                    {inStock ? (
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                        In Stock ({book.stock})
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                        Out of Stock
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline gap-2 mt-3">
                    <span className="text-base font-bold text-zinc-900">₹{finalPrice}</span>
                    {book.discount > 0 && (
                      <span className="text-xs text-zinc-400 line-through">₹{book.price}</span>
                    )}
                  </div>
                </div>

                {/* Move to cart */}
                <div className="mt-4 pt-3 border-t border-zinc-100">
                  <button
                    onClick={() => onMoveToCart(book)}
                    disabled={!inStock}
                    className={`w-full py-2 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors ${
                      inStock 
                        ? 'bg-blue-900 hover:bg-blue-950 text-white' 
                        : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                    }`}
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>{inStock ? 'Move to Cart' : 'Out of Stock'}</span>
                  </button>
                </div>

              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
};
