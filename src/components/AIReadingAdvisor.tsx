import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Book, UserSession } from '../types';
import { api, ApiError } from '../api';

export interface AIReadingAdvisorProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserSession | null;
  allBooks: Book[];
  wishlist: number[];
  onToggleWishlist: (bookId: number, title?: string) => void;
  onAddToCart: (book: Book, quantity?: number) => void;
  onQuickView: (book: Book) => void;
  onOpenAuth: () => void;
}

export const EXAMPLE_PROMPTS = [
  'Recommend beginner-friendly Python books.',
  'I want to learn cloud computing.',
  'Recommend books for understanding machine learning.',
  'Suggest advanced distributed systems textbooks.',
];

export const AIReadingAdvisor: React.FC<AIReadingAdvisorProps> = ({
  isOpen,
  onClose,
  currentUser,
  allBooks,
  wishlist,
  onToggleWishlist,
  onAddToCart,
  onQuickView,
  onOpenAuth,
}) => {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [recommendationText, setRecommendationText] = useState<string | null>(null);
  const [suggestedBooks, setSuggestedBooks] = useState<Book[]>([]);
  const [isAiGenerated, setIsAiGenerated] = useState<boolean | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [addedBookIds, setAddedBookIds] = useState<Record<number, boolean>>({});

  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Store opener element when opening and restore focus when closing
  useEffect(() => {
    if (isOpen) {
      openerRef.current = document.activeElement as HTMLElement | null;
      // Focus the textarea after render
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else if (openerRef.current) {
      openerRef.current.focus();
    }
  }, [isOpen]);

  // Handle Escape key and Tab focus trapping
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Focus trapping inside modal
      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const focusable = Array.from(focusableElements).filter(
          el => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
        );

        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Hydrate partial book records returned from backend with complete catalog information
  const hydrateBooks = useCallback((rawSuggested: any[]): Book[] => {
    if (!Array.isArray(rawSuggested)) return [];
    return rawSuggested.map((item: any) => {
      const match = allBooks.find(b => b.id === item.id);
      if (match) {
        return match;
      }
      return {
        id: item.id,
        title: item.title || 'Unknown Title',
        author: item.author || 'Academic Faculty',
        category: item.category || 'General',
        categorySlug: item.category?.toLowerCase() || 'general',
        price: item.price || 499,
        discount: item.discount ?? 0,
        rating: item.rating ?? 5.0,
        stock: item.stock ?? 10,
        coverImage: item.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80',
        isbn: item.isbn || '000-0000000000',
        publisher: item.publisher || 'Campus Academic Press',
        pages: item.pages || 350,
        year: item.year || 2024,
        language: item.language || 'English',
        description: item.description || 'Recommended campus textbook.',
      };
    });
  }, [allBooks]);

  const executeRecommendation = async (promptQuery: string) => {
    const clean = promptQuery.trim();
    if (!clean) {
      setErrorMessage('Please enter what you would like to read or learn about.');
      setErrorStatus(400);
      return;
    }

    if (clean.length < 2) {
      setErrorMessage('Prompt must be at least 2 characters long.');
      setErrorStatus(400);
      return;
    }

    if (clean.length > 500) {
      setErrorMessage('Prompt exceeds maximum allowed length of 500 characters.');
      setErrorStatus(400);
      return;
    }

    if (!currentUser) {
      setErrorMessage('Sign in required: Please authenticate with your campus account to receive AI reading recommendations.');
      setErrorStatus(401);
      return;
    }

    if (isLoading) return; // Prevent duplicate concurrent submissions

    setIsLoading(true);
    setErrorMessage(null);
    setErrorStatus(null);

    try {
      const response = await api.getAiRecommendations(clean);
      setHasSearched(true);
      setRecommendationText(response.recommendation);
      setIsAiGenerated(response.isAiGenerated);
      const hydrated = hydrateBooks(response.suggestedBooks || []);
      setSuggestedBooks(hydrated);
    } catch (err: any) {
      setHasSearched(true);
      if (err instanceof ApiError) {
        setErrorStatus(err.status);
        if (err.status === 401) {
          setErrorMessage('Your session has expired or authentication is required. Please sign in to consult the advisor.');
        } else if (err.status === 429) {
          setErrorMessage('AI request limit reached. Please wait a moment before sending another inquiry.');
        } else {
          setErrorMessage(err.message || 'AI recommendation service is temporarily unavailable. Please try again shortly.');
        }
      } else {
        setErrorStatus(500);
        setErrorMessage(err.message || 'Unable to communicate with the recommendation advisor. Please check your connection.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeRecommendation(query);
  };

  const handleSelectExample = (example: string) => {
    setQuery(example);
    setErrorMessage(null);
    setErrorStatus(null);
    executeRecommendation(example);
  };

  const handleAddToCartClick = (e: React.MouseEvent, book: Book) => {
    e.stopPropagation();
    onAddToCart(book, 1);
    setAddedBookIds(prev => ({ ...prev, [book.id]: true }));
    setTimeout(() => {
      setAddedBookIds(prev => ({ ...prev, [book.id]: false }));
    }, 1500);
  };

  const handleWishlistClick = (e: React.MouseEvent, book: Book) => {
    e.stopPropagation();
    onToggleWishlist(book.id, book.title);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-advisor-heading"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
    >
      {/* Backdrop Dismiss Target */}
      <div
        className="fixed inset-0 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Main Modal Dialog Box */}
      <div
        ref={modalRef}
        data-testid="ai-reading-advisor-modal"
        className="relative w-full max-w-3xl bg-white rounded-3xl border border-amber-900/10 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col z-10 animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none"
      >
        {/* Header Bar */}
        <div className="bg-[#FAF8F5] px-6 py-5 border-b border-slate-200/80 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-800 text-[11px] font-bold border border-amber-500/30 uppercase tracking-widest">
                <i className="fa-solid fa-sparkles text-amber-600"></i>
                AI Reading Advisor
              </span>
              {isAiGenerated !== null && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-[10px] font-mono border border-emerald-200">
                  <i className="fa-solid fa-check text-[9px]"></i>
                  {isAiGenerated ? 'Gemini AI Verified' : 'Campus Editorial Fallback'}
                </span>
              )}
            </div>
            <h2 id="ai-advisor-heading" className="font-serif font-black text-2xl text-slate-900">
              Campus Syllabus &amp; Literary Guide
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-sans">
              Describe what coursework, topic, or genre you wish to master. Recommendations are matched against live campus inventory.
            </p>
          </div>

          <button
            type="button"
            data-testid="ai-advisor-close-btn"
            onClick={onClose}
            aria-label="Close AI Reading Advisor"
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 shrink-0"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        {/* Modal Scrollable Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Unauthenticated Alert Prompt */}
          {!currentUser && (
            <div
              data-testid="ai-advisor-auth-alert"
              className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 text-sm">
                  <i className="fa-solid fa-user-lock"></i>
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">Campus Student Authentication Required</h4>
                  <p className="text-slate-600 mt-0.5">
                    Sign in with your verified campus credentials to generate tailored AI reading lists backed by warehouse stock.
                  </p>
                </div>
              </div>

              <button
                type="button"
                data-testid="ai-advisor-signin-btn"
                onClick={() => {
                  onClose();
                  onOpenAuth();
                }}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-amber-600 text-amber-50 hover:text-slate-950 font-bold text-xs shadow-sm transition-colors shrink-0"
              >
                Sign In / Register
              </button>
            </div>
          )}

          {/* Prompt Submission Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label
                htmlFor="ai-advisor-prompt-input"
                className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5"
              >
                What would you like to explore?
              </label>

              <div className="relative">
                <textarea
                  id="ai-advisor-prompt-input"
                  ref={inputRef}
                  data-testid="ai-advisor-prompt-input"
                  rows={3}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  disabled={isLoading}
                  maxLength={500}
                  placeholder="e.g. Recommend beginner-friendly Python books, or suggest advanced distributed systems textbooks..."
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200/90 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all disabled:opacity-60 resize-none"
                />

                <div className="absolute right-3 bottom-3 text-[11px] font-mono text-slate-400">
                  {query.length}/500
                </div>
              </div>
            </div>

            {/* Quick Suggested Example Prompts */}
            <div>
              <span className="text-[11px] font-semibold text-slate-500 block mb-1.5">
                Suggested prompts for campus scholars:
              </span>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    data-testid="ai-advisor-example-pill"
                    onClick={() => handleSelectExample(prompt)}
                    disabled={isLoading}
                    className="text-left text-xs px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-amber-100 hover:text-amber-950 text-slate-700 border border-slate-200/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50"
                  >
                    <i className="fa-regular fa-lightbulb text-[10px] text-amber-600 mr-1.5"></i>
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions Bar */}
            <div className="flex items-center justify-between pt-2">
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setErrorMessage(null);
                  }}
                  disabled={isLoading}
                  className="text-xs text-slate-500 hover:text-slate-800 underline focus:outline-none"
                >
                  Clear Prompt
                </button>
              )}

              <button
                type="submit"
                data-testid="ai-advisor-submit-btn"
                disabled={isLoading || !query.trim()}
                className="ml-auto px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-amber-600 text-white hover:text-slate-950 font-bold text-xs shadow-md transition-all flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <i className="fa-solid fa-circle-notch fa-spin text-xs"></i>
                    <span>Consulting Advisor...</span>
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-sparkles text-amber-400"></i>
                    <span>Get AI Recommendations</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Loading Shimmer State */}
          {isLoading && (
            <div
              data-testid="ai-advisor-loading-indicator"
              role="status"
              aria-live="polite"
              className="p-8 text-center bg-slate-50/70 rounded-2xl border border-slate-200/80 space-y-3"
            >
              <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-600 flex items-center justify-center mx-auto text-xl animate-pulse">
                <i className="fa-solid fa-brain"></i>
              </div>
              <h4 className="font-serif font-bold text-base text-slate-900">
                Reasoning Through Campus Catalog...
              </h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Analyzing campus course requirements, book descriptions, and peer review rankings.
              </p>
              <div className="flex justify-center gap-1.5 pt-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-bounce"></span>
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-bounce [animation-delay:0.2s]"></span>
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-bounce [animation-delay:0.4s]"></span>
              </div>
            </div>
          )}

          {/* Error & Retry State */}
          {errorMessage && !isLoading && (
            <div
              data-testid="ai-advisor-error-box"
              role="alert"
              className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-rose-900"
            >
              <div className="flex items-start gap-2.5">
                <i className="fa-solid fa-triangle-exclamation text-rose-600 text-sm mt-0.5"></i>
                <div>
                  <strong className="block font-semibold">Recommendation Advisory Notice</strong>
                  <span className="text-rose-800">{errorMessage}</span>
                </div>
              </div>

              {errorStatus === 401 ? (
                <button
                  type="button"
                  data-testid="ai-advisor-error-login-btn"
                  onClick={() => {
                    onClose();
                    onOpenAuth();
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-rose-600 text-white font-bold text-xs hover:bg-rose-700 transition-colors shrink-0"
                >
                  Sign In
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="ai-advisor-retry-btn"
                  onClick={() => executeRecommendation(query)}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-900 text-white font-bold text-xs hover:bg-amber-600 transition-colors shrink-0"
                >
                  <i className="fa-solid fa-rotate-right mr-1.5"></i>
                  Retry
                </button>
              )}
            </div>
          )}

          {/* Results View */}
          {!isLoading && hasSearched && !errorMessage && (
            <div data-testid="ai-advisor-results-view" className="space-y-6 pt-2">
              {/* AI Narrative Explanation Callout */}
              {recommendationText && (
                <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-50/60 to-transparent border-l-4 border-amber-500 text-slate-800 text-xs sm:text-sm leading-relaxed shadow-2xs">
                  <div className="flex items-center gap-2 mb-1.5 text-amber-800 font-bold text-xs uppercase tracking-wider">
                    <i className="fa-solid fa-quote-left text-amber-600"></i>
                    <span>Advisor Evaluation</span>
                  </div>
                  <p className="font-serif text-slate-900 text-sm sm:text-base italic">
                    "{recommendationText}"
                  </p>
                </div>
              )}

              {/* Recommended Books Shelf */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-serif font-bold text-base text-slate-900 flex items-center gap-2">
                    <i className="fa-solid fa-books text-amber-600"></i>
                    <span>Recommended Campus Titles ({suggestedBooks.length})</span>
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    In Stock &amp; Ready for Delivery
                  </span>
                </div>

                {suggestedBooks.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {suggestedBooks.map((book) => {
                      const finalPrice = Math.round(book.price * (1 - (book.discount || 0) / 100));
                      const isWishlisted = wishlist.includes(book.id);
                      const isAdded = !!addedBookIds[book.id];

                      return (
                        <div
                          key={book.id}
                          data-testid="recommended-book-card"
                          onClick={() => onQuickView(book)}
                          className="group relative bg-[#FAF8F5]/80 hover:bg-white rounded-2xl border border-slate-200/90 hover:border-amber-400/80 p-3.5 shadow-2xs hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col justify-between"
                        >
                          {/* Top Row: Category Pill & Wishlist Toggle */}
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-[10px] font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md truncate max-w-[130px]">
                              {book.category}
                            </span>

                            <button
                              type="button"
                              data-testid="recommended-wishlist-btn"
                              onClick={(e) => handleWishlistClick(e, book)}
                              aria-label={isWishlisted ? `Remove ${book.title} from wishlist` : `Save ${book.title} to wishlist`}
                              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                                isWishlisted
                                  ? 'bg-rose-50 text-rose-600 border border-rose-200'
                                  : 'bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-500 border border-slate-200'
                              }`}
                            >
                              <i className={`${isWishlisted ? 'fa-solid text-rose-500' : 'fa-regular'} fa-heart text-xs`}></i>
                            </button>
                          </div>

                          {/* Center: Image & Details */}
                          <div className="flex gap-3 items-start my-1">
                            <img
                              src={book.coverImage}
                              alt={book.title}
                              className="w-14 h-20 object-cover rounded-md shadow-xs shrink-0 book-spine group-hover:scale-102 transition-transform"
                            />
                            <div className="min-w-0 flex-1">
                              <h4 className="font-serif font-bold text-xs text-slate-900 group-hover:text-amber-800 line-clamp-2 leading-snug">
                                {book.title}
                              </h4>
                              <p className="text-[11px] text-slate-500 truncate mt-0.5">by {book.author}</p>
                              
                              <div className="flex items-center gap-1.5 mt-2">
                                <span className="text-amber-500 text-[11px] font-bold flex items-center gap-0.5">
                                  <i className="fa-solid fa-star text-[9px]"></i>
                                  {book.rating.toFixed(1)}
                                </span>
                                <span className="text-slate-300">·</span>
                                <span className="font-mono font-bold text-xs text-slate-900">
                                  ₹{finalPrice}
                                </span>
                                {book.discount > 0 && (
                                  <span className="text-[10px] text-slate-400 line-through">
                                    ₹{book.price}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Bottom Row Action Buttons */}
                          <div className="pt-2.5 mt-2 border-t border-slate-200/60 flex items-center gap-2">
                            <button
                              type="button"
                              data-testid="recommended-quickview-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                onQuickView(book);
                              }}
                              className="flex-1 py-1.5 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] transition-colors flex items-center justify-center gap-1"
                            >
                              <i className="fa-regular fa-eye text-[10px]"></i>
                              <span>Quick View</span>
                            </button>

                            <button
                              type="button"
                              data-testid="recommended-add-cart-btn"
                              onClick={(e) => handleAddToCartClick(e, book)}
                              disabled={book.stock <= 0}
                              className={`py-1.5 px-3 rounded-xl font-bold text-[11px] transition-all flex items-center justify-center gap-1 shadow-2xs ${
                                isAdded
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-900 hover:bg-amber-600 text-amber-50 hover:text-slate-950'
                              }`}
                            >
                              <i className={`fa-solid ${isAdded ? 'fa-check' : 'fa-bag-shopping'} text-[10px]`}></i>
                              <span>{isAdded ? 'Added' : 'Add'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Empty Recommendations State */
                  <div
                    data-testid="ai-advisor-empty-results"
                    className="p-8 text-center bg-slate-50/60 rounded-2xl border border-slate-200/80 space-y-2"
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center mx-auto text-base">
                      <i className="fa-solid fa-box-open"></i>
                    </div>
                    <h4 className="font-serif font-bold text-sm text-slate-800">
                      No Exact Matches in Current Campus Stock
                    </h4>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      Our warehouse does not currently stock direct titles for this specific prompt. Try broadening your query or select one of our curated discipline categories.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Initial State Helper Guide */}
          {!hasSearched && !isLoading && !errorMessage && (
            <div className="p-6 rounded-2xl bg-slate-50/60 border border-slate-200/70 text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto text-base">
                <i className="fa-solid fa-compass"></i>
              </div>
              <h4 className="font-serif font-bold text-sm text-slate-900">
                How the Campus Advisor Works
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                Our AI analyzes course syllabi, student reading velocity, and warehouse availability. Ask questions like <span className="font-semibold text-slate-700">"What should I read after Clean Code?"</span> or <span className="font-semibold text-slate-700">"Best foundations for linear algebra"</span>.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#FAF8F5] px-6 py-3.5 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <i className="fa-solid fa-graduation-cap text-amber-600"></i>
            <span>BookNest Academic Advisory Intelligence</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-200/80 hover:bg-slate-300 text-slate-700 font-semibold transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
