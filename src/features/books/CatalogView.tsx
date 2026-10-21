import React from 'react';
import { Book } from '../../types';
import { CATALOG_CATEGORIES } from '../../data/categories';
import { BookCard } from '../../components/BookCard';

interface CatalogViewProps {
  filteredCatalogBooks: Book[];
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  catalogSearch: string;
  setCatalogSearch: (search: string) => void;
  maxPrice: number;
  setMaxPrice: (price: number) => void;
  sortBy: 'featured' | 'price-asc' | 'price-desc' | 'rating' | 'discount';
  setSortBy: (sortBy: 'featured' | 'price-asc' | 'price-desc' | 'rating' | 'discount') => void;
  stockOnly: boolean;
  setStockOnly: (stockOnly: boolean) => void;
  wishlist: number[];
  onAddToCart: (book: Book, quantity?: number) => void;
  onToggleWishlist: (bookId: number) => void;
  onQuickView: (book: Book) => void;
}

export const CatalogView: React.FC<CatalogViewProps> = ({
  filteredCatalogBooks,
  selectedCategory,
  setSelectedCategory,
  catalogSearch,
  setCatalogSearch,
  maxPrice,
  setMaxPrice,
  sortBy,
  setSortBy,
  stockOnly,
  setStockOnly,
  wishlist,
  onAddToCart,
  onToggleWishlist,
  onQuickView,
}) => {
  const handleResetFilters = () => {
    setSelectedCategory('all');
    setCatalogSearch('');
    setMaxPrice(1000);
    setStockOnly(false);
  };

  return (
    <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full focus:outline-none">
      
      {/* Catalog Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-200">
        <div>
          <div className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-1">
            CAMPUS DISCOVERY ARCHIVE
          </div>
          <h1 className="font-serif font-black text-3xl sm:text-4xl text-slate-950">
            Book Catalog ({filteredCatalogBooks.length} Titles)
          </h1>
        </div>

        {/* Quick Sort Dropdown */}
        <div className="flex items-center gap-3">
          <label htmlFor="catalog-sort" className="text-xs text-slate-500 font-medium">Sort by:</label>
          <select
            id="catalog-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="py-2 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 shadow-2xs focus:ring-2 focus:ring-amber-500 focus:outline-none cursor-pointer"
          >
            <option value="featured">Featured Reads</option>
            <option value="rating">Highest Rated (★ 5.0 - 4.0)</option>
            <option value="discount">Biggest Campus Discounts</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Filter Sidebar */}
        <aside className="lg:col-span-3 bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm space-y-6">
          
          {/* Keyword Search */}
          <div>
            <label htmlFor="catalog-search-input" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Keyword Filter
            </label>
            <div className="relative">
              <input
                id="catalog-search-input"
                type="text"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Search by title, author, ISBN..."
                className="w-full py-2 pl-8 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
              <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-2.5 text-slate-400 text-xs" aria-hidden="true"></i>
            </div>
          </div>

          {/* Category Filter */}
          <div>
            <div className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Shelf Discipline
            </div>
            <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
              {CATALOG_CATEGORIES.map((cat) => (
                <button
                  key={cat.slug}
                  onClick={() => setSelectedCategory(cat.slug)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${
                    selectedCategory === cat.slug
                      ? 'bg-amber-100 text-amber-950 font-bold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span>{cat.label}</span>
                  {selectedCategory === cat.slug && (
                    <i className="fa-solid fa-check text-xs text-amber-600" aria-hidden="true"></i>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Price Range Slider */}
          <div>
            <div className="flex justify-between items-center text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              <label htmlFor="catalog-price-slider">Max Price</label>
              <span className="font-mono text-amber-700 font-bold">₹{maxPrice}</span>
            </div>
            <input
              id="catalog-price-slider"
              type="range"
              min="200"
              max="1000"
              step="50"
              value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>₹200</span>
              <span>₹1,000</span>
            </div>
          </div>

          {/* In Stock Only Toggle */}
          <div className="pt-2 border-t border-slate-100">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={stockOnly}
                onChange={(e) => setStockOnly(e.target.checked)}
                className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 cursor-pointer"
              />
              <span className="text-xs font-medium text-slate-700">
                In Stock on Campus Only
              </span>
            </label>
          </div>

          {/* Reset Filters */}
          {(selectedCategory !== 'all' || catalogSearch || maxPrice < 1000 || stockOnly) && (
            <button
              onClick={handleResetFilters}
              className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
            >
              Reset All Filters
            </button>
          )}

        </aside>

        {/* Catalog Grid View */}
        <div className="lg:col-span-9">
          {filteredCatalogBooks.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCatalogBooks.map((book) => (
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
          ) : (
            <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 shadow-sm">
              <i className="fa-regular fa-folder-open text-4xl text-slate-300 mb-3" aria-hidden="true"></i>
              <h3 className="font-serif font-bold text-xl text-slate-900 mb-1">
                Nothing matched that search.
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mb-6">
                Try broadening your price range, searching a different keyword, or resetting the category shelf.
              </p>
              <button
                onClick={handleResetFilters}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-amber-600 text-white font-semibold text-xs cursor-pointer"
              >
                Clear Filter Parameters
              </button>
            </div>
          )}
        </div>

      </div>

    </main>
  );
};
