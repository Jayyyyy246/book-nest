import React from 'react';
import { Book } from '../types';
import { CATEGORIES } from '../data/bookCatalog';

interface HeroSectionProps {
  featuredBook: Book;
  totalBooksCount?: number;
  avgRating?: number;
  selectedCategory: string;
  onSelectCategory: (slug: string) => void;
  onExploreBooks: () => void;
  onOpenScanner: () => void;
  onAddToCart: (book: Book) => void;
  onQuickView: (book: Book) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  featuredBook,
  totalBooksCount = 18,
  avgRating = 4.8,
  selectedCategory,
  onSelectCategory,
  onExploreBooks,
  onOpenScanner,
  onAddToCart,
  onQuickView,
}) => {
  const featuredFinalPrice = Math.round(featuredBook.price * (1 - featuredBook.discount / 100));

  return (
    <section className="relative overflow-hidden pt-8 pb-12 sm:pt-12 sm:pb-16 bg-gradient-to-b from-[#FAF8F5] via-[#FFFDF9] to-[#FAF8F5] border-b border-amber-900/5">
      
      {/* Subtle warm decorative background blobs */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-amber-200/20 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-10 left-10 w-80 h-80 bg-orange-100/30 rounded-full blur-3xl pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Main Hero Split Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Hero Column: Typography & CTAs */}
          <div className="lg:col-span-7 flex flex-col justify-center">
            
            {/* Editorial Kicker */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100/80 border border-amber-200/80 text-amber-900 text-xs font-semibold w-fit mb-6 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              <span className="tracking-wide">CURATED CAMPUS BOOKSTORE &amp; STUDY HUB</span>
            </div>

            {/* Editorial Headline */}
            <h1 className="font-serif font-black text-4xl sm:text-5xl lg:text-6xl text-slate-950 tracking-tight leading-[1.08] mb-6">
              Stories that <span className="italic font-normal text-amber-700">stay</span> with you. <br />
              Knowledge that moves you.
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg text-slate-600 font-sans max-w-xl leading-relaxed mb-8">
              Explore handpicked academic textbooks, timeless literature, and software engineering classics. 
              Featuring real-time optical cover recognition, instant hostel delivery, and verified campus reviews.
            </p>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center gap-3.5 mb-10">
              <button
                onClick={onExploreBooks}
                className="px-6 py-3.5 rounded-2xl bg-slate-900 hover:bg-amber-600 text-amber-100 hover:text-slate-950 font-bold text-sm shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2.5 group"
              >
                <span>Explore Books</span>
                <i className="fa-solid fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
              </button>

              <button
                onClick={onOpenScanner}
                className="px-5 py-3.5 rounded-2xl bg-white hover:bg-amber-50 text-slate-800 hover:text-amber-900 font-semibold text-sm border border-slate-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2.5"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
                <i className="fa-solid fa-camera text-amber-600"></i>
                <span>Scan a Book Cover</span>
              </button>
            </div>

            {/* Trust Proof Metrics */}
            <div className="pt-6 border-t border-slate-200/70 grid grid-cols-3 gap-6 max-w-md">
              <div>
                <div className="font-serif font-black text-2xl text-slate-900">{totalBooksCount}</div>
                <div className="text-xs text-slate-500 font-sans">Curated Books</div>
              </div>
              <div>
                <div className="font-serif font-black text-2xl text-slate-900">{avgRating.toFixed(1)} ★</div>
                <div className="text-xs text-slate-500 font-sans">Verified Reviews</div>
              </div>
              <div>
                <div className="font-serif font-black text-2xl text-slate-900">&lt; 30m</div>
                <div className="text-xs text-slate-500 font-sans">Campus Dispatch</div>
              </div>
            </div>

          </div>

          {/* Right Hero Column: Editorial Spotlight Book */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <div className="relative w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-xl shadow-slate-200/50 hover:shadow-2xl transition-all duration-300">
              
              {/* Card Header */}
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                <span className="text-[11px] font-bold text-amber-800 uppercase tracking-widest flex items-center gap-1.5">
                  <i className="fa-solid fa-crown text-amber-500"></i>
                  Book of the Month
                </span>
                <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  {featuredBook.discount}% OFF
                </span>
              </div>

              {/* Book Presentation with 3D Spine and Ambient Shadow */}
              <div className="flex gap-6 items-center">
                
                {/* 3D Book Cover */}
                <div 
                  onClick={() => onQuickView(featuredBook)}
                  className="w-36 h-52 shrink-0 rounded-r-lg rounded-l-xs overflow-hidden book-shadow-3d book-spine border border-slate-900/10 cursor-pointer hover:scale-105 transition-transform duration-300 relative group"
                >
                  <img
                    src={featuredBook.coverImage}
                    alt={featuredBook.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-slate-900/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="w-8 h-8 rounded-full bg-white text-slate-900 flex items-center justify-center shadow-lg">
                      <i className="fa-regular fa-eye text-xs text-amber-700"></i>
                    </span>
                  </div>
                </div>

                {/* Book Details */}
                <div className="flex-1 flex flex-col justify-center">
                  <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                    {featuredBook.category}
                  </span>
                  
                  <h3 
                    onClick={() => onQuickView(featuredBook)}
                    className="font-serif font-bold text-lg text-slate-900 hover:text-amber-700 cursor-pointer transition-colors line-clamp-2 mt-1"
                  >
                    {featuredBook.title}
                  </h3>

                  <p className="text-xs text-slate-500 mt-1">
                    by <span className="text-slate-800 font-medium">{featuredBook.author}</span>
                  </p>

                  <div className="flex items-center gap-1.5 text-xs text-amber-500 mt-2">
                    <i className="fa-solid fa-star text-xs"></i>
                    <span className="font-bold text-slate-900">{featuredBook.rating}</span>
                    <span className="text-slate-400 font-normal">({featuredBook.pages} pp)</span>
                  </div>

                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="font-serif font-black text-2xl text-slate-900">
                      ₹{featuredFinalPrice}
                    </span>
                    {featuredBook.discount > 0 && (
                      <span className="text-xs text-slate-400 line-through">
                        ₹{featuredBook.price}
                      </span>
                    )}
                  </div>
                </div>

              </div>

              {/* Editorial Quote Excerpt */}
              <div className="mt-6 p-4 rounded-2xl bg-amber-50/70 border border-amber-200/50 text-xs text-slate-700 italic font-serif leading-relaxed">
                &ldquo;Tiny changes lead to remarkable results. Master the compounding power of small habits.&rdquo;
              </div>

              {/* 1-Click Buy Action */}
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => onAddToCart(featuredBook)}
                  className="flex-1 py-3 rounded-xl bg-slate-900 hover:bg-amber-600 text-amber-50 hover:text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all duration-200"
                >
                  <i className="fa-solid fa-bag-shopping"></i>
                  <span>Add to Cart</span>
                </button>

                <button
                  onClick={() => onQuickView(featuredBook)}
                  className="px-4 py-3 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors"
                  title="View Full Book Details"
                >
                  Details
                </button>
              </div>

            </div>
          </div>

        </div>

        {/* Interactive Category Pill Slider */}
        <div className="mt-14 pt-8 border-t border-slate-200/80">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              Explore Disciplines &amp; Categories
            </span>
            <span className="text-xs text-slate-400 hidden sm:inline">
              Click any discipline to filter catalog
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat.slug;
              return (
                <button
                  key={cat.slug}
                  onClick={() => onSelectCategory(cat.slug)}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-semibold transition-all duration-200 whitespace-nowrap flex items-center gap-2 shrink-0 border ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-md font-bold'
                      : 'bg-white hover:bg-amber-50/80 text-slate-700 border-slate-200/80 hover:border-amber-300'
                  }`}
                >
                  <i className={`${cat.icon} text-xs ${isActive ? 'text-slate-950' : cat.color}`}></i>
                  <span>{cat.name}</span>
                  <span className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                    isActive ? 'bg-slate-950 text-amber-300' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </section>
  );
};
