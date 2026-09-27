export interface Book {
  id: number;
  title: string;
  author: string;
  category: string;
  categorySlug: string;
  price: number;
  discount: number;
  rating: number;
  stock: number;
  coverImage: string;
  isbn: string;
  publisher: string;
  pages: number;
  year: number;
  language: string;
  description: string;
  reviewCount?: number;
  reviews_count?: number;
  featured?: boolean;
  isLocalCatalog?: boolean;
}

export interface UserSession {
  id: number;
  name: string;
  email: string;
  role: 'user' | 'admin';
  phone?: string;
  joinedDate?: string;
}

export interface CartItemData {
  book: Book;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  originalPrice: number;
  savings: number;
}

export interface CartSummaryData {
  subtotal: number;
  originalTotal: number;
  itemCount: number;
  deliveryFee: number;
  isFreeDelivery: boolean;
  amountNeededForFreeDelivery: number;
  freeDeliveryThreshold: number;
  freeDeliveryProgress: number;
  couponCode: string | null;
  couponDiscount: number;
  gstAmount: number;
  grandTotal: number;
  totalSavings: number;
}

export interface BookReview {
  id: number;
  bookId: number;
  userName: string;
  rating: number;
  title?: string;
  comment: string;
  isVerified: boolean;
  date: string;
}

export interface BundleOffer {
  currentBook: Book;
  companionBook: Book;
  originalTotal: number;
  bundlePrice: number;
  savings: number;
  discountPercent: number;
}

