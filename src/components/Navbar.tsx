import React, { useState, useRef, useEffect } from 'react';
import { Book, UserSession } from '../types';

interface NavbarProps {
  books: Book[];
  activeView: 'store' | 'catalog' | 'scanner' | 'admin' | 'orders' | 'wishlist';
  cartCount: number;
  wishlistCount: number;
  currentUser: UserSession | null;
  onNavigate: (view: 'store' | 'catalog' | 'scanner' | 'admin' | 'orders' | 'wishlist') => void;
  onOpenCart: () => void;
  onSelectBook: (book: Book) => void;
  onToggleUserRole?: () => void;
  onOpenAuth: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  books,
  activeView,
  cartCount,
  wishlistCount,
  currentUser,
  onNavigate,
  onOpenCart,
  onSelectBook,
  onToggleUserRole,
  onOpenAuth,
  onLogout,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Recent searches persisted in localStorage
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('booknest_recent_searches');
      return saved ? JSON.parse(saved) : ['Atomic Habits', 'Clean Code', 'Computer Science'];
    } catch {
      return ['Atomic Habits', 'Clean Code'];
    }
  });

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const mobileSearchContainerRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  // 250ms Search Debounce
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideDesktop = searchContainerRef.current && searchContainerRef.current.contains(target);
      const insideMobile = mobileSearchContainerRef.current && mobileSearchContainerRef.current.contains(target);
      if (!insideDesktop && !insideMobile) {
        setIsSearchFocused(false);
      }
      if (accountRef.current && !accountRef.current.contains(target)) {
        setIsAccountOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const saveRecentSearch = (term: string) => {
    if (!term || term.trim().length < 2) return;
    const clean = term.trim();
    setRecentSearches(prev => {
      const updated = [clean, ...prev.filter(t => t.toLowerCase() !== clean.toLowerCase())].slice(0, 5);
      try {
        localStorage.setItem('booknest_recent_searches', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const clearRecentSearches = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRecentSearches([]);
    try {
      localStorage.removeItem('booknest_recent_searches');
    } catch {}
  };

  // Filtered books for autocomplete based on debouncedQuery
  const searchResults = debouncedQuery.length >= 2 
    ? books.filter(b => 
        b.title.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
        b.author.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
        b.isbn.includes(debouncedQuery) ||
        b.category.toLowerCase().includes(debouncedQuery.toLowerCase())
      ).slice(0, 6)
    : [];

  const handleSearchResultClick = (book: Book) => {
    saveRecentSearch(book.title);
    onSelectBook(book);
    setSearchQuery('');
    setIsSearchFocused(false);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim().length > 0) {
      saveRecentSearch(searchQuery.trim());
      setIsSearchFocused(false);
      onNavigate('catalog');
    }
  };

  const renderSearchDropdown = () => (
    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-200/90 shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150">
      {debouncedQuery.length >= 2 ? (
        <div>
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span>MATCHING BOOKS ({searchResults.length})</span>
            <span className="font-mono text-[10px]">Instant Lookup</span>
          </div>

          {searchResults.length > 0 ? (
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {searchResults.map((book) => {
                const finalPrice = Math.round(book.price * (1 - book.discount / 100));
                return (
                  <div
                    key={book.id}
                    onClick={() => handleSearchResultClick(book)}
                    className="p-3 hover:bg-amber-50/60 cursor-pointer transition-colors flex items-center gap-3.5 group"
                  >
                    <img
                      src={book.coverImage}
                      alt={book.title}
                      className="w-10 h-14 object-cover rounded-md shadow-sm shrink-0 book-spine"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-serif font-bold text-slate-900 truncate group-hover:text-amber-800">
                        {book.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 truncate">
                        {book.author} · <span className="text-amber-700 font-medium">{book.category}</span>
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-semibold text-xs text-slate-900">₹{finalPrice}</span>
                        {book.discount > 0 && (
                          <span className="text-[10px] text-slate-400 line-through">₹{book.price}</span>
                        )}
                        <span className="text-[10px] text-amber-500 font-bold ml-auto flex items-center gap-1">
                          <i className="fa-solid fa-star text-[9px]"></i>
                          {book.rating}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-center text-slate-500">
              <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
                <i className="fa-solid fa-magnifying-glass text-lg"></i>
              </div>
              <h4 className="font-serif font-bold text-sm text-slate-900 mb-1">
                Nothing matched that search.
              </h4>
              <p className="text-xs text-slate-500 max-w-xs mx-auto mb-4">
                Try searching for a book title, author, topic, or ISBN number.
              </p>
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Suggested Categories
              </div>
              <div className="flex flex-wrap justify-center gap-1.5">
                {['Computer Science', 'Literature', 'Psychology', 'Business'].map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setSearchQuery(cat);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-900 text-xs transition-colors"
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {recentSearches.length > 0 && (
            <div>
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                <span>Recent Searches</span>
                <button
                  type="button"
                  onClick={clearRecentSearches}
                  className="text-[10px] text-slate-400 hover:text-rose-600"
                >
                  Clear
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recentSearches.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => setSearchQuery(term)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-900 text-xs transition-colors flex items-center gap-1.5"
                  >
                    <i className="fa-solid fa-clock-rotate-left text-[9px] text-slate-400"></i>
                    <span>{term}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Popular Searches
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['Clean Code', 'Atomic Habits', 'Frank Herbert', 'Computer Science', 'Business'].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSearchQuery(tag)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-900 text-xs transition-colors flex items-center gap-1"
                >
                  <i className="fa-solid fa-magnifying-glass text-[9px] text-slate-400"></i>
                  <span>{tag}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-white/85 border-b border-amber-900/10 shadow-xs transition-all duration-200">
      
      {/* Top micro-bar for campus notice & quick switch */}
      <div className="bg-slate-900 text-amber-100 text-[11px] px-4 py-1.5 flex items-center justify-between font-sans">
        <div className="flex items-center gap-2 max-w-7xl mx-auto w-full justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
              <i className="fa-solid fa-graduation-cap text-xs"></i>
              <span>Campus Book Distribution</span>
            </span>
            <span className="hidden md:inline text-slate-500">|</span>
            <span className="hidden md:inline text-slate-300">
              Free hostel delivery on orders over ₹499 • Use code <span className="text-amber-400 font-bold">WELCOME10</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            {currentUser ? (
              <>
                <span className="hidden sm:inline text-slate-400">Current Role:</span>
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-slate-800 text-amber-300 font-medium text-[11px] border border-slate-700"
                  title="Authenticated account role"
                >
                  <i className={`fa-solid ${currentUser.role === 'admin' ? 'fa-shield-halved text-emerald-400' : 'fa-user-graduate text-amber-300'} text-[10px]`}></i>
                  <span className="capitalize">{currentUser.role === 'admin' ? 'Administrator' : 'Student'}</span>
                  <span className="text-[10px] text-emerald-400 ml-0.5">● Verified</span>
                </div>
              </>
            ) : (
              <button
                onClick={onOpenAuth}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] transition-colors"
              >
                <i className="fa-regular fa-user text-[10px]"></i>
                <span>Sign In / Register</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Navigation Row */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
        
        {/* Brand Logo & Editorial Tagline */}
        <div 
          onClick={() => onNavigate('store')}
          className="flex items-center gap-3.5 cursor-pointer group select-none shrink-0"
        >
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-600 via-amber-500 to-amber-400 flex items-center justify-center text-slate-950 shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform duration-200">
            <i className="fa-solid fa-book-bookmark text-xl text-slate-950"></i>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-serif font-black text-2xl tracking-tight text-slate-900 group-hover:text-amber-600 transition-colors">
                BookNest
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            </div>
            <p className="text-[11px] font-sans text-slate-500 tracking-wide font-normal hidden sm:block">
              Find your next great read
            </p>
          </div>
        </div>

        {/* Dynamic Search Bar with Autocomplete Dropdown (Desktop & Tablet) */}
        <div ref={searchContainerRef} className="relative flex-1 max-w-lg hidden md:block">
          <form onSubmit={handleSearchSubmit} className="relative">
            <div className={`relative flex items-center rounded-2xl transition-all duration-200 ${
              isSearchFocused 
                ? 'ring-2 ring-amber-500/40 bg-white shadow-md border-transparent' 
                : 'bg-amber-50/50 hover:bg-white border border-slate-200/80 shadow-2xs'
            }`}>
              <span className="pl-4 text-slate-400">
                <i className="fa-solid fa-magnifying-glass text-sm"></i>
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setIsSearchFocused(false);
                }}
                placeholder="Search by title, author, ISBN, or category..."
                className="w-full py-2.5 pl-3 pr-10 bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setDebouncedQuery('');
                  }}
                  className="absolute right-3 p-1 text-slate-400 hover:text-slate-600"
                >
                  <i className="fa-solid fa-xmark text-xs"></i>
                </button>
              )}
            </div>
          </form>

          {/* Autocomplete Dropdown Results */}
          {isSearchFocused && renderSearchDropdown()}
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-1">
          <button
            onClick={() => onNavigate('store')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeView === 'store'
                ? 'bg-amber-50 text-amber-900 font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
            }`}
          >
            Storefront
          </button>

          <button
            onClick={() => onNavigate('catalog')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeView === 'catalog'
                ? 'bg-amber-50 text-amber-900 font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
            }`}
          >
            Catalog
          </button>

          <button
            data-testid="desktop-nav-scanner-btn"
            onClick={() => onNavigate('scanner')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeView === 'scanner'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-700 hover:text-amber-800 hover:bg-amber-50/70'
            }`}
          >
            <i className="fa-solid fa-camera text-xs text-amber-600"></i>
            <span>Scan Cover</span>
          </button>

          <button
            onClick={() => onNavigate('admin')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeView === 'admin'
                ? 'bg-slate-900 text-amber-300 font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
            }`}
          >
            <i className="fa-solid fa-chart-pie text-xs text-slate-400"></i>
            <span>Admin</span>
          </button>
        </nav>

        {/* Action Buttons: Wishlist, Cart Drawer, Account */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          
          {/* Wishlist Button - Desktop & Tablet */}
          <button
            onClick={() => onNavigate('wishlist')}
            title="Wishlist"
            className={`relative w-9 h-9 sm:w-10 sm:h-10 rounded-2xl hidden sm:flex items-center justify-center transition-all ${
              activeView === 'wishlist'
                ? 'bg-rose-50 text-rose-600 border border-rose-200 shadow-sm'
                : 'bg-white hover:bg-rose-50/60 text-slate-600 hover:text-rose-600 border border-slate-200/80'
            }`}
          >
            <i className="fa-regular fa-heart text-sm sm:text-base"></i>
            {wishlistCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                {wishlistCount}
              </span>
            )}
          </button>

          {/* Slide-over Cart Trigger */}
          <button
            onClick={onOpenCart}
            title="Shopping Cart"
            className="relative px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-2xl bg-slate-900 hover:bg-amber-600 text-amber-100 hover:text-slate-950 font-semibold text-xs flex items-center gap-1.5 sm:gap-2 shadow-sm transition-all duration-200 active:scale-95 group shrink-0"
          >
            <i className="fa-solid fa-bag-shopping text-sm text-amber-400 group-hover:text-slate-950 transition-colors"></i>
            <span className="hidden sm:inline">Cart</span>
            <span className="px-1.5 py-0.5 rounded-md bg-amber-500 text-slate-950 font-bold text-[11px]">
              {cartCount}
            </span>
          </button>

          {/* Account Dropdown */}
          <div ref={accountRef} className="relative shrink-0">
            <button
              data-testid="account-menu-btn"
              onClick={() => setIsAccountOpen(!isAccountOpen)}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-amber-100/70 border border-amber-300/50 flex items-center justify-center text-amber-900 hover:bg-amber-200/80 transition-colors"
            >
              <i className="fa-regular fa-user text-xs sm:text-sm"></i>
            </button>

            {isAccountOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl border border-slate-200 shadow-2xl p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                {currentUser ? (
                  <>
                    <div className="p-3 bg-amber-50/70 rounded-xl mb-2">
                      <div className="font-serif font-bold text-slate-900 text-sm">
                        {currentUser.name}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {currentUser.email}
                      </div>
                      <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-200/70 text-amber-900 text-[10px] font-bold uppercase">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                        {currentUser.role} Account
                      </div>
                    </div>

                    <div className="space-y-1">
                      <button
                        onClick={() => {
                          onNavigate('orders');
                          setIsAccountOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2 font-medium"
                      >
                        <i className="fa-solid fa-box text-slate-400"></i>
                        <span>Order History &amp; Invoices</span>
                      </button>

                      <button
                        onClick={() => {
                          onNavigate('wishlist');
                          setIsAccountOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2 font-medium"
                      >
                        <i className="fa-regular fa-heart text-slate-400"></i>
                        <span>My Wishlist ({wishlistCount})</span>
                      </button>

                      {currentUser.role === 'admin' && (
                        <button
                          onClick={() => {
                            onNavigate('admin');
                            setIsAccountOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2 font-medium"
                        >
                          <i className="fa-solid fa-chart-line text-slate-400"></i>
                          <span>Administrator Console</span>
                        </button>
                      )}

                      <div className="pt-2 border-t border-slate-100 space-y-1">
                        {currentUser.role !== 'admin' && (
                          <button
                            onClick={() => {
                              setIsAccountOpen(false);
                              onOpenAuth();
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl text-xs text-amber-800 bg-amber-50 hover:bg-amber-100/80 flex items-center justify-between font-semibold"
                          >
                            <span>Sign In with Admin Account</span>
                            <i className="fa-solid fa-shield-halved text-xs"></i>
                          </button>
                        )}

                        <button
                          data-testid="sign-out-btn"
                          onClick={() => {
                            onLogout();
                            setIsAccountOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl text-xs text-rose-700 hover:bg-rose-50 flex items-center gap-2 font-semibold"
                        >
                          <i className="fa-solid fa-arrow-right-from-bracket text-xs text-rose-500"></i>
                          <span>Sign Out</span>
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-3 text-center space-y-3">
                    <p className="text-xs text-slate-600">
                      Sign in to view your orders, sync your cart, and save titles.
                    </p>
                    <button
                      onClick={() => {
                        onOpenAuth();
                        setIsAccountOpen(false);
                      }}
                      className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-amber-600 text-amber-50 hover:text-slate-950 font-bold text-xs shadow-sm transition-colors"
                    >
                      Sign In / Register
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mobile Menu Toggle Button */}
          <button
            data-testid="mobile-menu-toggle"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle mobile menu"
            className="lg:hidden w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-700 shrink-0 relative z-10"
          >
            <i className={`fa-solid ${isMobileMenuOpen ? 'fa-xmark' : 'fa-bars'} text-sm`}></i>
          </button>
        </div>
      </div>

      {/* Mobile Search Row (Always accessible on Mobile screens) */}
      <div ref={mobileSearchContainerRef} className="md:hidden px-4 pb-3 pt-1 border-t border-slate-100 relative">
        <form onSubmit={handleSearchSubmit} className="relative">
          <div className={`relative flex items-center rounded-xl transition-all duration-200 ${
            isSearchFocused 
              ? 'ring-2 ring-amber-500/40 bg-white shadow-md border-transparent' 
              : 'bg-amber-50/50 hover:bg-white border border-slate-200/80 shadow-2xs'
          }`}>
            <span className="pl-3 text-slate-400">
              <i className="fa-solid fa-magnifying-glass text-xs"></i>
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setIsSearchFocused(false);
              }}
              placeholder="Search by title, author, ISBN, or category..."
              className="w-full py-2 pl-2.5 pr-8 bg-transparent text-xs text-slate-900 placeholder-slate-400 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setDebouncedQuery('');
                }}
                className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600"
              >
                <i className="fa-solid fa-xmark text-xs"></i>
              </button>
            )}
          </div>
        </form>
        {isSearchFocused && renderSearchDropdown()}
      </div>

      {/* Mobile Menu Drawer */}
      {isMobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-200/80 bg-white/95 px-4 pt-3 pb-6 space-y-2 animate-in slide-in-from-top-2 duration-200">
          <button
            onClick={() => {
              onNavigate('store');
              setIsMobileMenuOpen(false);
            }}
            className="w-full text-left px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-800 hover:bg-amber-50"
          >
            Home Storefront
          </button>

          <button
            onClick={() => {
              onNavigate('catalog');
              setIsMobileMenuOpen(false);
            }}
            className="w-full text-left px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-800 hover:bg-amber-50"
          >
            All Books Catalog
          </button>

          <button
            data-testid="mobile-nav-scanner-btn"
            onClick={() => {
              onNavigate('scanner');
              setIsMobileMenuOpen(false);
            }}
            className="w-full text-left px-4 py-2.5 rounded-xl text-sm font-semibold text-amber-800 bg-amber-50 flex items-center gap-2"
          >
            <i className="fa-solid fa-camera text-amber-600"></i>
            <span>Scan Book Cover</span>
          </button>

          <button
            onClick={() => {
              onNavigate('wishlist');
              setIsMobileMenuOpen(false);
            }}
            className="w-full text-left px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-800 hover:bg-amber-50 flex items-center justify-between"
          >
            <span>My Wishlist</span>
            {wishlistCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-xs font-bold">
                {wishlistCount}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              onOpenCart();
              setIsMobileMenuOpen(false);
            }}
            className="w-full text-left px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-800 hover:bg-amber-50 flex items-center justify-between"
          >
            <span>Shopping Cart</span>
            {cartCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-xs font-bold">
                {cartCount}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              onNavigate('orders');
              setIsMobileMenuOpen(false);
            }}
            className="w-full text-left px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-800 hover:bg-amber-50"
          >
            My Orders &amp; Invoices
          </button>

          {currentUser?.role === 'admin' && (
            <button
              onClick={() => {
                onNavigate('admin');
                setIsMobileMenuOpen(false);
              }}
              className="w-full text-left px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-800 hover:bg-slate-100"
            >
              Control Tower Admin
            </button>
          )}

          <div className="pt-2 border-t border-slate-100">
            {currentUser ? (
              <button
                onClick={() => {
                  onLogout();
                  setIsMobileMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2.5 rounded-xl text-sm font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2"
              >
                <i className="fa-solid fa-arrow-right-from-bracket"></i>
                <span>Sign Out ({currentUser.name})</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  onOpenAuth();
                  setIsMobileMenuOpen(false);
                }}
                className="w-full py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm text-center"
              >
                Sign In / Register
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
