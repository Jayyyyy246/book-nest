import React from 'react';
import { Book, AppView } from '../../types';
import { HeroSection } from '../../components/HeroSection';
import { CategoryGrid } from '../../components/CategoryGrid';
import { BookCard } from '../../components/BookCard';

interface StoreHomeViewProps {
  books: Book[];
  featuredBook: Book;
  featuredBooks: Book[];
  popularBooks: Book[];
  newArrivals: Book[];
  avgCatalogRating: number;
  selectedCategory: string;
  wishlist: number[];
  onSelectCategory: (slug: string) => void;
  onNavigate: (view: AppView) => void;
  onOpenAiAdvisor: () => void;
  onAddToCart: (book: Book, quantity?: number) => void;
  onQuickView: (book: Book) => void;
  onToggleWishlist: (bookId: number) => void;
}

export const StoreHomeView: React.FC<StoreHomeViewProps> = ({
  books,
  featuredBook,
  featuredBooks,
  popularBooks,
  newArrivals,
  avgCatalogRating,
  selectedCategory,
  wishlist,
  onSelectCategory,
  onNavigate,
  onOpenAiAdvisor,
  onAddToCart,
  onQuickView,
  onToggleWishlist,
}) => {
  return (
    <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
      {/* Editorial Hero Section with live metrics */}
      <HeroSection
        featuredBook={featuredBook}
        totalBooksCount={books.length}
        avgRating={avgCatalogRating}
        selectedCategory={selectedCategory}
        onSelectCategory={(slug) => {
          onSelectCategory(slug);
          onNavigate('catalog');
        }}
        onExploreBooks={() => onNavigate('catalog')}
        onOpenScanner={() => onNavigate('scanner')}
        onOpenAiAdvisor={onOpenAiAdvisor}
        onAddToCart={onAddToCart}
        onQuickView={onQuickView}
      />

      {/* Real Category Shelf Grid */}
      <CategoryGrid
        books={books}
        selectedCategory={selectedCategory}
        onSelectCategory={(slug) => {
          onSelectCategory(slug);
          onNavigate('catalog');
        }}
      />

      {/* Section 1: Real Featured Books */}
      <section className="py-14 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
          <div>
            <div className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
              <i className="fa-solid fa-sparkles text-amber-500"></i>
              Featured Campus Recommendations
            </div>
            <h2 className="font-serif font-black text-2xl sm:text-3xl text-slate-950">
              Essential Academic &amp; Literary Reads
            </h2>
          </div>

          <button
            onClick={() => onNavigate('catalog')}
            className="inline-flex items-center gap-2 text-xs font-bold text-amber-800 hover:text-amber-950 group cursor-pointer"
          >
            <span>Browse All ({books.length} Books)</span>
            <i className="fa-solid fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {featuredBooks.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              isWishlisted={wishlist.includes(book.id)}
              onAddToCart={onAddToCart}
              onToggleWishlist={onToggleWishlist}
              onQuickView={onQuickView}
            />
          ))}
        </div>
      </section>

      {/* Section 2: Real Popular Books */}
      <section className="py-14 bg-white/70 border-y border-slate-200/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
            <div>
              <div className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                <i className="fa-solid fa-fire text-amber-500"></i>
                Highest Rated by Campus Readers
              </div>
              <h2 className="font-serif font-black text-2xl sm:text-3xl text-slate-950">
                Most Popular Student &amp; Scholar Picks
              </h2>
            </div>

            <button
              onClick={() => onNavigate('catalog')}
              className="inline-flex items-center gap-2 text-xs font-bold text-amber-800 hover:text-amber-950 group cursor-pointer"
            >
              <span>View All Top Rated</span>
              <i className="fa-solid fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {popularBooks.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                isWishlisted={wishlist.includes(book.id)}
                onAddToCart={onAddToCart}
                onToggleWishlist={onToggleWishlist}
                onQuickView={onQuickView}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Section 3: Real New Arrivals */}
      <section className="py-14 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
          <div>
            <div className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
              <i className="fa-solid fa-clock-rotate-left text-amber-500"></i>
              Fresh On Campus Shelves
            </div>
            <h2 className="font-serif font-black text-2xl sm:text-3xl text-slate-950">
              New Arrivals &amp; Recent Editions
            </h2>
          </div>

          <button
            onClick={() => onNavigate('catalog')}
            className="inline-flex items-center gap-2 text-xs font-bold text-amber-800 hover:text-amber-950 group cursor-pointer"
          >
            <span>Explore Full Collection</span>
            <i className="fa-solid fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {newArrivals.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              isWishlisted={wishlist.includes(book.id)}
              onAddToCart={onAddToCart}
              onToggleWishlist={onToggleWishlist}
              onQuickView={onQuickView}
            />
          ))}
        </div>

        {/* Banner: Optical Scanner Promotion */}
        <div className="mt-16 p-8 sm:p-10 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 text-white relative overflow-hidden shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="relative z-10 max-w-xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-semibold mb-3">
              <i className="fa-solid fa-barcode text-amber-400"></i>
              INNOVATION SPOTLIGHT
            </span>
            <h3 className="font-serif font-black text-3xl sm:text-4xl text-white">
              Got a Physical Textbook? <br />
              Scan the cover with BookNest.
            </h3>
            <p className="text-sm text-slate-300 mt-3 font-sans leading-relaxed">
              Our optical machine vision automatically identifies textbooks, compares campus syllabus requirements, and syncs instant savings to your student bag.
            </p>
            <div className="mt-6 flex items-center gap-4">
              <button
                onClick={() => onNavigate('scanner')}
                className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg transition-all flex items-center gap-2 cursor-pointer"
              >
                <i className="fa-solid fa-camera"></i>
                <span>Launch Book Scanner</span>
              </button>
            </div>
          </div>

          {/* Decorative graphic */}
          <div className="relative z-10 w-44 h-44 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center animate-pulse" aria-hidden="true">
            <i className="fa-solid fa-qrcode text-7xl text-amber-400"></i>
          </div>
        </div>
      </section>
    </main>
  );
};
