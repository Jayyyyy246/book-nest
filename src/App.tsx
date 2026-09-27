import React, { useState, useMemo, useEffect } from 'react';
import { Book, UserSession, CartSummaryData } from './types';
import { INITIAL_BOOKS } from './data/bookCatalog';
import { api, getStoredToken, setStoredToken } from './api';

import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { CategoryGrid } from './components/CategoryGrid';
import { BookCard } from './components/BookCard';
import { SlideOverCart } from './components/SlideOverCart';
import { CheckoutFlowModal } from './components/CheckoutFlowModal';
import { EditorialScannerView } from './components/EditorialScannerView';
import { AdminDashboard } from './components/AdminDashboard';
import { QuickViewModal } from './components/QuickViewModal';
import { OrdersView } from './components/OrdersView';
import { WishlistView } from './components/WishlistView';
import { AuthModal } from './components/AuthModal';

export const CATALOG_CATEGORIES = [
  { slug: 'all', label: 'All Shelves' },
  { slug: 'fiction', label: 'Fiction' },
  { slug: 'non-fiction', label: 'Non-Fiction' },
  { slug: 'science', label: 'Science' },
  { slug: 'technology', label: 'Technology' },
  { slug: 'programming', label: 'Programming' },
  { slug: 'cybersecurity', label: 'Cybersecurity' },
  { slug: 'business', label: 'Business' },
  { slug: 'finance', label: 'Finance' },
  { slug: 'history', label: 'History' },
  { slug: 'biography', label: 'Biography' },
  { slug: 'self-help', label: 'Self-Help' },
  { slug: 'psychology', label: 'Psychology' },
  { slug: 'philosophy', label: 'Philosophy' },
  { slug: 'romance', label: 'Romance' },
  { slug: 'mystery', label: 'Mystery' },
  { slug: 'thriller', label: 'Thriller' },
  { slug: 'fantasy', label: 'Fantasy' },
  { slug: 'education', label: 'Education' },
  { slug: 'other', label: 'Other' },
];

export default function App() {
  // Navigation & View state (persisted across page reloads via hash and localStorage)
  const [activeView, setActiveView] = useState<'store' | 'catalog' | 'scanner' | 'admin' | 'orders' | 'wishlist'>(() => {
    try {
      const hash = window.location.hash.replace(/^#/, '') as any;
      if (['store', 'catalog', 'scanner', 'admin', 'orders', 'wishlist'].includes(hash)) {
        return hash;
      }
      const saved = localStorage.getItem('booknest_active_view') as any;
      if (['store', 'catalog', 'scanner', 'admin', 'orders', 'wishlist'].includes(saved)) {
        return saved;
      }
    } catch {}
    return 'store';
  });

  useEffect(() => {
    try {
      localStorage.setItem('booknest_active_view', activeView);
      window.location.hash = activeView;
    } catch {}
  }, [activeView]);
  
  // Data state
  const [books, setBooks] = useState<Book[]>(INITIAL_BOOKS);
  const [cart, setCart] = useState<Record<number, number>>(() => {
    try {
      const saved = localStorage.getItem('booknest_guest_cart');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [wishlist, setWishlist] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('booknest_guest_wishlist');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>('WELCOME10');
  
  // Modals & Drawers
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [quickViewBook, setQuickViewBook] = useState<Book | null>(null);

  // Filters & Sorting in Catalog
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [maxPrice, setMaxPrice] = useState<number>(1000);
  const [sortBy, setSortBy] = useState<'featured' | 'price-asc' | 'price-desc' | 'rating' | 'discount'>('featured');
  const [stockOnly, setStockOnly] = useState(false);

  // Toast Notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Current User Session (Authentic JWT + SQLite user)
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadUserData = () => {
    api.getCart()
      .then(res => {
        if (res.cart) setCart(res.cart);
      })
      .catch(() => {});

    api.getWishlist()
      .then(res => {
        if (res.wishlist) setWishlist(res.wishlist);
      })
      .catch(() => {});

    api.getOrders()
      .then(res => {
        if (res.orders) setPlacedOrders(res.orders);
      })
      .catch(() => {});
  };

  // Initial Data & Auth bootstrap
  useEffect(() => {
    // 1. Fetch live catalog from database
    api.getBooks()
      .then(res => {
        if (res.books && res.books.length > 0) {
          setBooks(res.books);
        }
      })
      .catch(err => {
        console.warn('Backend catalog query warning:', err);
      });

    // 2. Handle Google OAuth redirect callback or restore active session
    const urlParams = new URLSearchParams(window.location.search);
    const oauthToken = urlParams.get('token');
    const authError = urlParams.get('auth_error');

    if (oauthToken) {
      setStoredToken(oauthToken);
      api.getMe()
        .then(res => {
          setCurrentUser(res.user);
          loadUserData();
          showToast(`Welcome back, ${res.user.name}! Signed in with Google.`, 'success');
        })
        .catch(() => {
          setStoredToken(null);
          setCurrentUser(null);
          showToast('Failed to verify Google session.', 'error');
        })
        .finally(() => {
          window.history.replaceState({}, document.title, window.location.pathname);
        });
    } else if (authError) {
      const errorMsg = authError === 'google_oauth_unconfigured'
        ? 'Google OAuth credentials are not configured in backend .env. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'
        : `Google sign-in error: ${authError.replace(/_/g, ' ')}`;
      showToast(errorMsg, 'error');
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      const token = getStoredToken();
      if (token) {
        api.getMe()
          .then(res => {
            setCurrentUser(res.user);
            loadUserData();
          })
          .catch(() => {
            setStoredToken(null);
            setCurrentUser(null);
          });
      }
    }
  }, []);

  const handleAuthSuccess = async (user: UserSession, _token: string) => {
    setCurrentUser(user);
    showToast(`Welcome back, ${user.name}!`, 'success');
    try {
      if (Object.keys(cart).length > 0) {
        await api.syncCart(cart);
      }
      if (wishlist.length > 0) {
        await api.syncWishlist(wishlist);
      }
    } catch (e) {
      console.warn('Sync error:', e);
    }
    loadUserData();
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {}
    setStoredToken(null);
    setCurrentUser(null);
    setPlacedOrders([]);
    setCart({});
    setWishlist([]);
    localStorage.removeItem('booknest_guest_cart');
    localStorage.removeItem('booknest_guest_wishlist');
    showToast('Signed out of campus account', 'info');
    if (activeView === 'admin' || activeView === 'orders') {
      setActiveView('store');
    }
  };

  // Cart Management
  const addToCart = async (book: Book, quantity = 1) => {
    if (book.stock <= 0) {
      showToast(`"${book.title}" is currently out of stock`, 'error');
      return;
    }
    const currentQty = cart[book.id] || 0;
    const newQty = Math.min(book.stock, currentQty + quantity);
    const newCart = { ...cart, [book.id]: newQty };
    setCart(newCart);
    showToast(`Added "${book.title}" to your cart`, 'success');

    if (currentUser) {
      try {
        await api.addToCart(book.id, quantity);
      } catch (e) {
        console.warn('API cart error:', e);
      }
    } else {
      localStorage.setItem('booknest_guest_cart', JSON.stringify(newCart));
    }
  };

  const updateCartQty = async (bookId: number, qty: number) => {
    const book = books.find(b => b.id === bookId);
    if (!book) return;

    if (qty <= 0) {
      removeCartItem(bookId, book.title);
      return;
    }

    if (qty > book.stock) {
      showToast(`Only ${book.stock} units available in campus stock`, 'error');
      return;
    }

    const newCart = { ...cart, [bookId]: qty };
    setCart(newCart);

    if (currentUser) {
      try {
        await api.updateCartQty(bookId, qty);
      } catch (e) {
        console.warn('API cart error:', e);
      }
    } else {
      localStorage.setItem('booknest_guest_cart', JSON.stringify(newCart));
    }
  };

  const removeCartItem = async (bookId: number, title?: string) => {
    const newCart = { ...cart };
    delete newCart[bookId];
    setCart(newCart);

    if (title) {
      showToast(`Removed "${title}" from your cart`, 'info');
    }

    if (currentUser) {
      try {
        await api.removeFromCart(bookId);
      } catch (e) {
        console.warn('API cart error:', e);
      }
    } else {
      localStorage.setItem('booknest_guest_cart', JSON.stringify(newCart));
    }
  };

  const clearCart = async () => {
    setCart({});
    if (currentUser) {
      try {
        await api.clearCart();
      } catch (e) {}
    } else {
      localStorage.removeItem('booknest_guest_cart');
    }
  };

  // Wishlist Management
  const toggleWishlist = async (bookId: number, title?: string) => {
    const book = books.find(b => b.id === bookId);
    const exists = wishlist.includes(bookId);
    const newWishlist = exists 
      ? wishlist.filter(id => id !== bookId) 
      : [...wishlist, bookId];
    
    setWishlist(newWishlist);
    showToast(
      exists 
        ? `Removed "${title || book?.title || 'Book'}" from Wishlist` 
        : `Saved "${title || book?.title || 'Book'}" to Wishlist`, 
      exists ? 'info' : 'success'
    );

    if (currentUser) {
      try {
        await api.toggleWishlist(bookId);
      } catch (e) {
        console.warn('API wishlist error:', e);
      }
    } else {
      localStorage.setItem('booknest_guest_wishlist', JSON.stringify(newWishlist));
    }
  };

  const moveWishlistToCart = (book: Book) => {
    if (book && book.stock > 0) {
      addToCart(book, 1);
      toggleWishlist(book.id, book.title);
    }
  };

  const addAllWishlistToCart = () => {
    let addedCount = 0;
    wishlist.forEach(id => {
      const b = books.find(item => item.id === id);
      if (b && b.stock > 0) {
        addToCart(b, 1);
        addedCount++;
      }
    });
    if (addedCount > 0) {
      showToast(`Added ${addedCount} wishlist titles to cart`, 'success');
      setIsCartOpen(true);
    }
  };

  // Cart Calculations & Free Delivery Progress
  const cartSummaryData: CartSummaryData = useMemo(() => {
    let subtotal = 0;
    let originalTotal = 0;
    let itemCount = 0;

    Object.entries(cart).forEach(([bookIdStr, qty]) => {
      if (qty <= 0) return;
      const b = books.find(item => item.id === parseInt(bookIdStr, 10));
      if (b) {
        const finalPrice = Math.round(b.price * (1 - b.discount / 100));
        subtotal += finalPrice * qty;
        originalTotal += b.price * qty;
        itemCount += qty;
      }
    });

    const freeDeliveryThreshold = 499;
    const isFreeDelivery = subtotal >= freeDeliveryThreshold || subtotal === 0;
    const deliveryFee = isFreeDelivery || subtotal === 0 ? 0 : 49;
    const amountNeededForFreeDelivery = Math.max(0, freeDeliveryThreshold - subtotal);
    const freeDeliveryProgress = Math.min(100, Math.round((subtotal / freeDeliveryThreshold) * 100));

    let couponDiscount = 0;
    if (appliedCoupon === 'WELCOME10') {
      couponDiscount = Math.round(subtotal * 0.10);
    } else if (appliedCoupon === 'BOOKNEST50' && subtotal >= 499) {
      couponDiscount = 50;
    } else if (appliedCoupon === 'READMORE') {
      couponDiscount = Math.round(subtotal * 0.15);
    }

    const gstAmount = Math.round(subtotal * 0.05); // 5% academic book GST
    const grandTotal = Math.max(0, subtotal - couponDiscount + deliveryFee);
    const totalSavings = (originalTotal - subtotal) + couponDiscount;

    return {
      subtotal,
      originalTotal,
      itemCount,
      deliveryFee,
      isFreeDelivery,
      amountNeededForFreeDelivery,
      freeDeliveryThreshold,
      freeDeliveryProgress,
      couponCode: appliedCoupon,
      couponDiscount,
      gstAmount,
      grandTotal,
      totalSavings,
    };
  }, [cart, books, appliedCoupon]);

  // Admin Catalog CRUD Handlers
  const handleUpdateBookStock = async (bookId: number, newStock: number) => {
    try {
      await api.updateStock(bookId, newStock);
      setBooks(prev => prev.map(b => b.id === bookId ? { ...b, stock: newStock } : b));
      showToast('Warehouse stock levels updated successfully', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update stock', 'error');
    }
  };

  const handleAddBook = async (newBookData: Omit<Book, 'id'>) => {
    try {
      const res = await api.addBook(newBookData);
      setBooks(prev => [res.book, ...prev]);
      showToast(`Added "${res.book.title}" to catalog`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to add book', 'error');
    }
  };

  const handleUpdateBook = async (updated: Book) => {
    try {
      const res = await api.updateBook(updated.id, updated);
      setBooks(prev => prev.map(b => b.id === updated.id ? res.book : b));
      showToast(`Updated "${res.book.title}" successfully`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update book', 'error');
    }
  };

  const handleDeleteBook = async (bookId: number) => {
    try {
      const book = books.find(b => b.id === bookId);
      await api.deleteBook(bookId);
      setBooks(prev => prev.filter(b => b.id !== bookId));
      showToast(`Deleted "${book?.title || 'Book'}" from catalog`, 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete book', 'error');
    }
  };

  // Filtered Catalog Books
  const filteredCatalogBooks = useMemo(() => {
    return books
      .filter(b => {
        if (selectedCategory !== 'all') {
          const sel = selectedCategory.toLowerCase();
          const slug = (b.categorySlug || 'other').toLowerCase();
          const cat = (b.category || 'Other').toLowerCase();
          const matches = slug === sel || cat === sel || cat.includes(sel) || sel.includes(slug);
          if (!matches) return false;
        }
        if (catalogSearch.trim()) {
          const q = catalogSearch.toLowerCase();
          const matchTitle = b.title.toLowerCase().includes(q);
          const matchAuthor = b.author.toLowerCase().includes(q);
          const matchIsbn = b.isbn.includes(q);
          const matchCat = b.category.toLowerCase().includes(q);
          if (!matchTitle && !matchAuthor && !matchIsbn && !matchCat) return false;
        }
        const finalPrice = Math.round(b.price * (1 - b.discount / 100));
        if (finalPrice > maxPrice) return false;
        if (stockOnly && b.stock <= 0) return false;
        return true;
      })
      .sort((a, b) => {
        const priceA = Math.round(a.price * (1 - a.discount / 100));
        const priceB = Math.round(b.price * (1 - b.discount / 100));
        if (sortBy === 'price-asc') return priceA - priceB;
        if (sortBy === 'price-desc') return priceB - priceA;
        if (sortBy === 'rating') return b.rating - a.rating;
        if (sortBy === 'discount') return b.discount - a.discount;
        return b.id - a.id;
      });
  }, [books, selectedCategory, catalogSearch, maxPrice, stockOnly, sortBy]);

  // Orders state
  const [placedOrders, setPlacedOrders] = useState<any[]>([]);

  const handleOrderSuccess = (orderId: number, _details: any) => {
    loadUserData();
    api.getBooks().then(res => setBooks(res.books)).catch(() => {});
    clearCart();
    setActiveView('orders');
    showToast(`Order #BN-${orderId} placed successfully!`, 'success');
  };

  const featuredBook = books.find(b => b.featured) || books[0] || INITIAL_BOOKS[0];

  // Dynamic Home Sections
  const featuredBooks = useMemo(() => {
    const list = books.filter(b => b.featured);
    return list.length >= 4 ? list.slice(0, 4) : books.slice(0, 4);
  }, [books]);

  const popularBooks = useMemo(() => {
    return [...books]
      .sort((a, b) => b.rating - a.rating || (b.reviewCount || b.reviews_count || 0) - (a.reviewCount || a.reviews_count || 0))
      .slice(0, 4);
  }, [books]);

  const newArrivals = useMemo(() => {
    return [...books]
      .sort((a, b) => (b.year || 2024) - (a.year || 2024) || b.id - a.id)
      .slice(0, 4);
  }, [books]);

  const avgCatalogRating = useMemo(() => {
    if (books.length === 0) return 4.8;
    return books.reduce((acc, b) => acc + b.rating, 0) / books.length;
  }, [books]);

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-slate-900 font-sans selection:bg-amber-200 selection:text-slate-950 flex flex-col">
      
      {/* Global Sticky Navigation */}
      <Navbar
        books={books}
        activeView={activeView}
        cartCount={cartSummaryData.itemCount}
        wishlistCount={wishlist.length}
        currentUser={currentUser}
        onNavigate={(view) => {
          setActiveView(view);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenCart={() => setIsCartOpen(true)}
        onSelectBook={(book) => setQuickViewBook(book)}
        onOpenAuth={() => setIsAuthOpen(true)}
        onLogout={handleLogout}
      />

      {/* ================= VIEW: HOME STOREFRONT ================= */}
      {activeView === 'store' && (
        <main className="flex-1">
          {/* Editorial Hero Section with live metrics */}
          <HeroSection
            featuredBook={featuredBook}
            totalBooksCount={books.length}
            avgRating={avgCatalogRating}
            selectedCategory={selectedCategory}
            onSelectCategory={(slug) => {
              setSelectedCategory(slug);
              setActiveView('catalog');
            }}
            onExploreBooks={() => setActiveView('catalog')}
            onOpenScanner={() => setActiveView('scanner')}
            onAddToCart={addToCart}
            onQuickView={(book) => setQuickViewBook(book)}
          />

          {/* Real Category Shelf Grid */}
          <CategoryGrid
            books={books}
            selectedCategory={selectedCategory}
            onSelectCategory={(slug) => {
              setSelectedCategory(slug);
              setActiveView('catalog');
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
                onClick={() => setActiveView('catalog')}
                className="inline-flex items-center gap-2 text-xs font-bold text-amber-800 hover:text-amber-950 group"
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
                  onAddToCart={addToCart}
                  onToggleWishlist={toggleWishlist}
                  onQuickView={(b) => setQuickViewBook(b)}
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
                  onClick={() => {
                    setSortBy('rating');
                    setActiveView('catalog');
                  }}
                  className="inline-flex items-center gap-2 text-xs font-bold text-amber-800 hover:text-amber-950 group"
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
                    onAddToCart={addToCart}
                    onToggleWishlist={toggleWishlist}
                    onQuickView={(b) => setQuickViewBook(b)}
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
                onClick={() => setActiveView('catalog')}
                className="inline-flex items-center gap-2 text-xs font-bold text-amber-800 hover:text-amber-950 group"
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
                  onAddToCart={addToCart}
                  onToggleWishlist={toggleWishlist}
                  onQuickView={(b) => setQuickViewBook(b)}
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
                    onClick={() => setActiveView('scanner')}
                    className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg transition-all flex items-center gap-2"
                  >
                    <i className="fa-solid fa-camera"></i>
                    <span>Launch Book Scanner</span>
                  </button>
                </div>
              </div>

              {/* Decorative graphic */}
              <div className="relative z-10 w-44 h-44 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center animate-pulse">
                <i className="fa-solid fa-qrcode text-7xl text-amber-400"></i>
              </div>
            </div>
          </section>
        </main>
      )}

      {/* ================= VIEW: BOOK CATALOG ================= */}
      {activeView === 'catalog' && (
        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
          
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
              <span className="text-xs text-slate-500 font-medium">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="py-2 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 shadow-2xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
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
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Keyword Filter
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    placeholder="Search by title, author, ISBN..."
                    className="w-full py-2 pl-8 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                  <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-2.5 text-slate-400 text-xs"></i>
                </div>
              </div>

              {/* Category Filter */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Shelf Discipline
                </label>
                <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                  {CATALOG_CATEGORIES.map((cat) => (
                    <button
                      key={cat.slug}
                      onClick={() => setSelectedCategory(cat.slug)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors flex items-center justify-between ${
                        selectedCategory === cat.slug
                          ? 'bg-amber-100 text-amber-950 font-bold'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <span>{cat.label}</span>
                      {selectedCategory === cat.slug && (
                        <i className="fa-solid fa-check text-xs text-amber-600"></i>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Range Slider */}
              <div>
                <div className="flex justify-between items-center text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  <span>Max Price</span>
                  <span className="font-mono text-amber-700 font-bold">₹{maxPrice}</span>
                </div>
                <input
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
                  onClick={() => {
                    setSelectedCategory('all');
                    setCatalogSearch('');
                    setMaxPrice(1000);
                    setStockOnly(false);
                  }}
                  className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
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
                      onAddToCart={addToCart}
                      onToggleWishlist={toggleWishlist}
                      onQuickView={(b) => setQuickViewBook(b)}
                    />
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 shadow-sm">
                  <i className="fa-regular fa-folder-open text-4xl text-slate-300 mb-3"></i>
                  <h3 className="font-serif font-bold text-xl text-slate-900 mb-1">
                    Nothing matched that search.
                  </h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mb-6">
                    Try broadening your price range, searching a different keyword, or resetting the category shelf.
                  </p>
                  <button
                    onClick={() => {
                      setSelectedCategory('all');
                      setCatalogSearch('');
                      setMaxPrice(1000);
                      setStockOnly(false);
                    }}
                    className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-amber-600 text-white font-semibold text-xs"
                  >
                    Clear Filter Parameters
                  </button>
                </div>
              )}
            </div>

          </div>

        </main>
      )}

      {/* ================= VIEW: OPTICAL SCANNER ================= */}
      {activeView === 'scanner' && (
        <main className="flex-1">
          <EditorialScannerView
            books={books}
            onAddToCart={addToCart}
            onQuickView={(b) => setQuickViewBook(b)}
            onToggleWishlist={toggleWishlist}
          />
        </main>
      )}

      {/* ================= VIEW: ADMIN DASHBOARD ================= */}
      {activeView === 'admin' && (
        <main className="flex-1">
          {currentUser?.role === 'admin' ? (
            <AdminDashboard
              books={books}
              onUpdateBookStock={handleUpdateBookStock}
              onAddBook={handleAddBook}
              onDeleteBook={handleDeleteBook}
              onUpdateBook={handleUpdateBook}
            />
          ) : (
            <div className="max-w-md mx-auto my-16 p-8 bg-white rounded-3xl border border-slate-200 shadow-xl text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto text-2xl">
                <i className="fa-solid fa-shield-halved"></i>
              </div>
              <h2 className="font-serif font-bold text-2xl text-slate-900">Administrator Access Required</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                You must be authenticated with verified administrative credentials (admin@booknest.com) to access the warehouse control tower.
              </p>
              <button
                onClick={() => setIsAuthOpen(true)}
                className="w-full py-3 rounded-xl bg-slate-900 hover:bg-amber-600 text-amber-50 hover:text-slate-950 font-bold text-xs shadow-md transition-colors"
              >
                Sign In as Administrator
              </button>
            </div>
          )}
        </main>
      )}

      {/* ================= VIEW: ORDERS & TRACKING ================= */}
      {activeView === 'orders' && (
        <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-10 w-full">
          {currentUser ? (
            <OrdersView
              orders={placedOrders}
              onNavigateToCatalog={() => setActiveView('catalog')}
              onOrderAgain={(book) => {
                addToCart(book, 1);
                setIsCartOpen(true);
              }}
            />
          ) : (
            <div className="max-w-md mx-auto my-16 p-8 bg-white rounded-3xl border border-slate-200 shadow-xl text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto text-2xl">
                <i className="fa-solid fa-box-open"></i>
              </div>
              <h2 className="font-serif font-bold text-2xl text-slate-900">Sign In to View Orders</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Your order invoices and delivery dispatch tracking are linked to your campus account.
              </p>
              <button
                onClick={() => setIsAuthOpen(true)}
                className="w-full py-3 rounded-xl bg-slate-900 hover:bg-amber-600 text-amber-50 hover:text-slate-950 font-bold text-xs shadow-md transition-colors"
              >
                Sign In / Register
              </button>
            </div>
          )}
        </main>
      )}

      {/* ================= VIEW: WISHLIST ================= */}
      {activeView === 'wishlist' && (
        <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-10 w-full">
          <WishlistView
            wishlist={wishlist}
            books={books}
            onMoveToCart={moveWishlistToCart}
            onRemoveFromWishlist={(id, title) => toggleWishlist(id, title)}
            onAddAllToCart={addAllWishlistToCart}
            onNavigateToCatalog={() => setActiveView('catalog')}
            onOpenBookDetail={(b) => setQuickViewBook(b)}
          />
        </main>
      )}

      {/* ================= GLOBAL SLIDE-OVER SHOPPING CART ================= */}
      <SlideOverCart
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        books={books}
        summary={cartSummaryData}
        appliedCoupon={appliedCoupon}
        onUpdateQty={updateCartQty}
        onRemoveItem={removeCartItem}
        onSaveForLater={(book) => {
          toggleWishlist(book.id, book.title);
          removeCartItem(book.id, book.title);
          showToast(`Saved "${book.title}" to reading list`, 'success');
        }}
        onApplyCoupon={(code) => {
          setAppliedCoupon(code);
          showToast(`Coupon "${code}" applied successfully!`, 'success');
        }}
        onRemoveCoupon={() => {
          setAppliedCoupon(null);
          showToast('Coupon removed', 'info');
        }}
        onProceedToCheckout={() => {
          setIsCartOpen(false);
          setIsCheckoutOpen(true);
        }}
        onNavigateToCatalog={() => {
          setIsCartOpen(false);
          setActiveView('catalog');
        }}
        onOpenBookDetail={(b) => {
          setIsCartOpen(false);
          setQuickViewBook(b);
        }}
      />

      {/* ================= 3-STEP CHECKOUT & TAX INVOICE MODAL ================= */}
      <CheckoutFlowModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        cart={cart}
        books={books}
        summary={cartSummaryData}
        onOrderSuccess={handleOrderSuccess}
        currentUser={currentUser}
        onOpenAuth={() => setIsAuthOpen(true)}
      />

      {/* ================= AUTHENTICATION MODAL ================= */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />

      {/* ================= QUICK VIEW BOOK MODAL ================= */}
      <QuickViewModal
        book={quickViewBook}
        onClose={() => setQuickViewBook(null)}
        isWishlisted={quickViewBook ? wishlist.includes(quickViewBook.id) : false}
        onToggleWishlist={toggleWishlist}
        onAddToCart={addToCart}
        currentUser={currentUser}
        onOpenAuth={() => setIsAuthOpen(true)}
        allBooks={books}
        onSelectBook={(b) => setQuickViewBook(b)}
      />

      {/* ================= TOAST NOTIFICATION ================= */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl border text-xs font-semibold animate-in slide-in-from-bottom-3 duration-200 ${
          toast.type === 'error'
            ? 'bg-rose-950 text-white border-rose-800'
            : toast.type === 'info'
            ? 'bg-slate-900 text-amber-200 border-slate-700'
            : 'bg-slate-950 text-white border-slate-800'
        }`}>
          <i className={`fa-solid ${
            toast.type === 'error' ? 'fa-circle-xmark text-rose-400' :
            toast.type === 'info' ? 'fa-circle-info text-amber-400' :
            'fa-circle-check text-emerald-400'
          } text-sm`}></i>
          <span>{toast.message}</span>
        </div>
      )}

      {/* ================= EDITORIAL FOOTER ================= */}
      <footer className="mt-auto bg-slate-950 text-slate-400 border-t border-slate-800/80 pt-16 pb-12 font-sans text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 pb-12 border-b border-slate-800">
            
            {/* Col 1: Brand */}
            <div className="md:col-span-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
                  <i className="fa-solid fa-book-bookmark"></i>
                </div>
                <span className="font-serif font-black text-2xl text-white tracking-tight">
                  BookNest
                </span>
              </div>
              <p className="text-slate-400 leading-relaxed font-sans max-w-sm">
                Elevating campus literature and academic studies. 
                Full-stack bookstore with optical machine vision, automated inventory tracking, and student fulfillment.
              </p>
              <div className="text-[11px] text-amber-400 font-mono">
                Academic Capstone · University Edition 2026
              </div>
            </div>

            {/* Col 2: Navigation */}
            <div className="md:col-span-3 space-y-3">
              <h4 className="font-serif font-bold text-sm text-white uppercase tracking-wider">
                Storefront Subsystems
              </h4>
              <ul className="space-y-2">
                <li><button onClick={() => setActiveView('store')} className="hover:text-amber-300">Home Storefront</button></li>
                <li><button onClick={() => setActiveView('catalog')} className="hover:text-amber-300">Textbook Catalog</button></li>
                <li><button onClick={() => setActiveView('scanner')} className="hover:text-amber-300">Optical Book Scanner</button></li>
                <li><button onClick={() => setActiveView('orders')} className="hover:text-amber-300">Student Orders &amp; Invoices</button></li>
                <li><button onClick={() => setActiveView('admin')} className="hover:text-amber-300">Control Tower Dashboard</button></li>
              </ul>
            </div>

            {/* Col 3: Academic Credits */}
            <div className="md:col-span-5 space-y-3">
              <h4 className="font-serif font-bold text-sm text-white uppercase tracking-wider">
                Architecture &amp; Security Compliance
              </h4>
              <p className="text-slate-400 leading-relaxed text-xs">
                Built with 100% Prepared Statements, Centralized XSS Escaping, Cryptographic CSRF Tokens, and OWASP Top 10 Hardening.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <span className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-[10px] font-mono text-emerald-400">
                  OWASP Score: 100/100
                </span>
                <span className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-[10px] font-mono text-amber-400">
                  BCrypt Cost: 12
                </span>
                <span className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-[10px] font-mono text-cyan-400">
                  BarcodeDetector API Ready
                </span>
              </div>
            </div>

          </div>

          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
            <div>
              © 2026 BookNest. All rights reserved. Crafted with care for campus scholars.
            </div>
            <div className="flex items-center gap-4">
              <span>Hostel Rapid Delivery: &lt; 30 Mins</span>
              <span>·</span>
              <span>Helpline: +91 98765 43210</span>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
