import React from 'react';
import { CATEGORIES } from '../data/bookCatalog';
import { Book } from '../types';

interface CategoryGridProps {
  selectedCategory: string;
  onSelectCategory: (slug: string) => void;
  books?: Book[];
}

export const CategoryGrid: React.FC<CategoryGridProps> = ({
  selectedCategory,
  onSelectCategory,
  books = [],
}) => {
  return (
    <section className="py-12 bg-white border-b border-slate-200/70">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
          <div>
            <div className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              Curated Shelves
            </div>
            <h2 className="font-serif font-black text-2xl sm:text-3xl text-slate-950">
              Browse by Academic &amp; Literary Domain
            </h2>
          </div>
          <p className="text-xs text-slate-500 max-w-sm">
            Discover peer-reviewed campus textbooks, classic literature, speculative fiction, and foundational software engineering texts.
          </p>
        </div>

        {/* 6-Grid Category Cards with Hover Lift & Zoom */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {CATEGORIES.filter(c => c.slug !== 'all').map((category) => {
            const isSelected = selectedCategory === category.slug;
            const liveCount = books.length > 0
              ? books.filter(b => 
                  b.category.toLowerCase().includes(category.slug.toLowerCase()) || 
                  b.category.toLowerCase() === category.name.toLowerCase()
                ).length
              : category.count;

            return (
              <div
                key={category.slug}
                onClick={() => onSelectCategory(category.slug)}
                className={`group relative p-6 rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden flex flex-col justify-between ${
                  isSelected
                    ? 'bg-amber-50/90 border-amber-400 shadow-md ring-2 ring-amber-400/40'
                    : 'bg-[#FAF8F5]/80 hover:bg-white border-slate-200/80 hover:border-amber-300/80 shadow-2xs hover:shadow-xl hover:-translate-y-1.5'
                }`}
              >
                {/* Decorative background accent circle */}
                <div className={`absolute -right-6 -bottom-6 w-28 h-28 rounded-full ${category.accentBg} opacity-50 group-hover:scale-125 transition-transform duration-300 -z-0`} />

                <div className="relative z-10">
                  {/* Top Icon & Count badge */}
                  <div className="flex items-center justify-between mb-4">
                    <div className={`w-12 h-12 rounded-2xl ${category.accentBg} flex items-center justify-center group-hover:scale-110 transition-transform duration-200 shadow-xs`}>
                      <i className={`${category.icon} text-lg ${category.color}`}></i>
                    </div>

                    <span className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-600 shadow-2xs group-hover:border-amber-300">
                      {liveCount} {liveCount === 1 ? 'Title' : 'Titles'}
                    </span>
                  </div>

                  {/* Title & Description */}
                  <h3 className="font-serif font-bold text-lg text-slate-900 group-hover:text-amber-800 transition-colors">
                    {category.name}
                  </h3>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed font-sans line-clamp-2">
                    {category.description}
                  </p>
                </div>

                {/* Bottom link indicator */}
                <div className="relative z-10 mt-6 pt-4 border-t border-slate-200/50 flex items-center justify-between text-xs font-semibold text-slate-500 group-hover:text-amber-700 transition-colors">
                  <span>Explore Shelf</span>
                  <i className="fa-solid fa-arrow-right text-[11px] group-hover:translate-x-1 transition-transform"></i>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
