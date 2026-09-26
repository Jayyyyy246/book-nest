import React, { useState } from 'react';
import { Book } from '../types';
import { api } from '../api';

interface OrderItem {
  id: number;
  customerName: string;
  room: string;
  total: number;
  status: 'Confirmed' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';
  date: string;
  itemsCount: number;
  payment: string;
}

interface AdminDashboardProps {
  books: Book[];
  onUpdateBookStock: (bookId: number, newStock: number) => void;
  onAddBook: (newBook: Omit<Book, 'id'>) => void;
  onDeleteBook: (bookId: number) => void;
  onUpdateBook: (updated: Book) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  books,
  onUpdateBookStock,
  onAddBook,
  onDeleteBook,
  onUpdateBook,
}) => {
  const [adminTheme, setAdminTheme] = useState<'dark' | 'light'>('light');
  const [activeAdminTab, setActiveAdminTab] = useState<'overview' | 'catalog' | 'orders' | 'inventory'>('overview');
  const [searchTableQuery, setSearchTableQuery] = useState('');
  const [isAddBookModalOpen, setIsAddBookModalOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);

  // Live order dispatch pipeline
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [metrics, setMetrics] = useState<{
    totalRevenue: number;
    totalOrders: number;
    totalBooks: number;
    totalStockUnits: number;
    lowStockCount: number;
  }>({
    totalRevenue: 0,
    totalOrders: 0,
    totalBooks: books.length,
    totalStockUnits: books.reduce((acc, b) => acc + b.stock, 0),
    lowStockCount: books.filter(b => b.stock <= 10).length
  });

  const loadAdminData = () => {
    // 1. Fetch live metrics
    api.getAdminMetrics()
      .then(res => setMetrics(res.metrics))
      .catch(() => {});

    // 2. Fetch live orders
    api.getAdminOrders()
      .then(res => {
        if (res.orders && res.orders.length > 0) {
          setOrders(res.orders);
        }
      })
      .catch(() => {});
  };

  React.useEffect(() => {
    loadAdminData();
  }, []);

  // Form state for adding/editing book
  const [formTitle, setFormTitle] = useState('');
  const [formAuthor, setFormAuthor] = useState('');
  const [formCategory, setFormCategory] = useState('Computer Science');
  const [formPrice, setFormPrice] = useState(599);
  const [formStock, setFormStock] = useState(25);
  const [formIsbn, setFormIsbn] = useState('9780132350884');
  const [formCover, setFormCover] = useState('https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80');

  // KPI calculations
  const totalRevenue = metrics.totalRevenue;
  const totalBooksInCatalog = books.length;
  const lowStockBooks = books.filter(b => b.stock <= 10);
  const totalStockUnits = books.reduce((acc, b) => acc + b.stock, 0);

  // Filtered books for table
  const filteredBooks = books.filter(b => 
    b.title.toLowerCase().includes(searchTableQuery.toLowerCase()) ||
    b.author.toLowerCase().includes(searchTableQuery.toLowerCase()) ||
    b.category.toLowerCase().includes(searchTableQuery.toLowerCase()) ||
    b.isbn.includes(searchTableQuery)
  );

  const handleStatusChange = async (orderId: number, newStatus: OrderItem['status']) => {
    setOrders(orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    try {
      await api.updateAdminOrderStatus(orderId, newStatus);
      loadAdminData();
    } catch (e) {
      console.warn('Failed to update status on server:', e);
    }
  };

  const openEditModal = (book: Book) => {
    setEditingBook(book);
    setFormTitle(book.title);
    setFormAuthor(book.author);
    setFormCategory(book.category);
    setFormPrice(book.price);
    setFormStock(book.stock);
    setFormIsbn(book.isbn);
    setFormCover(book.coverImage);
    setIsAddBookModalOpen(true);
  };

  const handleSaveBook = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingBook) {
      onUpdateBook({
        ...editingBook,
        title: formTitle,
        author: formAuthor,
        category: formCategory,
        price: formPrice,
        stock: formStock,
        isbn: formIsbn,
        coverImage: formCover,
      });
    } else {
      onAddBook({
        title: formTitle,
        author: formAuthor,
        category: formCategory,
        categorySlug: formCategory.toLowerCase().replace(/\s+/g, '-'),
        price: formPrice,
        discount: 10,
        rating: 4.8,
        stock: formStock,
        isbn: formIsbn,
        publisher: 'Campus Academic Press',
        pages: 350,
        year: 2024,
        language: 'English',
        coverImage: formCover,
        description: 'Comprehensive campus edition curated for academic excellence.',
      });
    }
    setIsAddBookModalOpen(false);
    setEditingBook(null);
  };

  const isDark = adminTheme === 'dark';

  return (
    <div className={`min-h-screen transition-colors duration-200 ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-[#FAF8F5] text-slate-900'}`}>
      
      {/* Admin Top Navigation Bar */}
      <div className={`border-b px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-20 z-30 backdrop-blur-md ${
        isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white/90 border-slate-200/80 shadow-2xs'
      }`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold shadow-sm">
            <i className="fa-solid fa-chart-pie"></i>
          </div>
          <div>
            <h1 className="font-serif font-black text-xl leading-none">
              BookNest Control Tower
            </h1>
            <p className="text-[11px] text-slate-500 font-sans mt-0.5">
              Campus Inventory, Fulfillment Pipeline &amp; Catalog Management
            </p>
          </div>
        </div>

        {/* Actions: Theme Toggle & Add Book */}
        <div className="flex items-center gap-3">
          {/* Dark / Light Toggle */}
          <button
            onClick={() => setAdminTheme(isDark ? 'light' : 'dark')}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              isDark 
                ? 'bg-slate-800 border-slate-700 text-amber-300 hover:bg-slate-700' 
                : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <i className={`fa-solid ${isDark ? 'fa-sun text-amber-400' : 'fa-moon text-slate-600'}`}></i>
            <span>{isDark ? 'Light Theme' : 'Dark Theme'}</span>
          </button>

          <button
            onClick={() => {
              setEditingBook(null);
              setFormTitle('');
              setFormAuthor('');
              setFormPrice(499);
              setFormStock(20);
              setFormIsbn('9780' + Math.floor(100000000 + Math.random() * 900000000));
              setIsAddBookModalOpen(true);
            }}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
          >
            <i className="fa-solid fa-plus"></i>
            <span>Add New Book</span>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 mb-8 border-b border-slate-200/80 pb-3">
          {[
            { id: 'overview', label: 'Executive Overview', icon: 'fa-solid fa-gauge-high' },
            { id: 'catalog', label: `Catalog CRUD (${books.length})`, icon: 'fa-solid fa-book-bookmark' },
            { id: 'orders', label: `Fulfillment Pipeline (${orders.length})`, icon: 'fa-solid fa-truck-ramp-box' },
            { id: 'inventory', label: `Inventory & Stock Alerts (${lowStockBooks.length})`, icon: 'fa-solid fa-boxes-stacked' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveAdminTab(tab.id as any)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeAdminTab === tab.id
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : isDark
                  ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <i className={tab.icon}></i>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ================= TAB 1: EXECUTIVE OVERVIEW ================= */}
        {activeAdminTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            
            {/* 4 KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                {
                  label: 'Gross Campus Revenue',
                  value: `₹${totalRevenue.toLocaleString()}`,
                  trend: `${orders.length} Orders`,
                  trendUp: true,
                  sub: 'Live SQLite ledger',
                  icon: 'fa-solid fa-indian-rupee-sign',
                  color: 'text-amber-500',
                  bg: isDark ? 'bg-amber-950/40 border-amber-800/40' : 'bg-amber-50/70 border-amber-200/80'
                },
                {
                  label: 'Active Dispatches',
                  value: orders.filter(o => o.status !== 'Delivered' && o.status !== 'Cancelled').length.toString(),
                  trend: `${orders.filter(o => o.status === 'Confirmed' || o.status === 'Processing').length} In Flight`,
                  trendUp: true,
                  sub: 'Campus Couriers',
                  icon: 'fa-solid fa-box-open',
                  color: 'text-blue-500',
                  bg: isDark ? 'bg-blue-950/40 border-blue-800/40' : 'bg-blue-50/70 border-blue-200/80'
                },
                {
                  label: 'Catalog Inventory',
                  value: totalStockUnits.toString(),
                  trend: `${totalBooksInCatalog} Titles`,
                  trendUp: true,
                  sub: 'Live Warehouse Stock',
                  icon: 'fa-solid fa-book-open',
                  color: 'text-purple-500',
                  bg: isDark ? 'bg-purple-950/40 border-purple-800/40' : 'bg-purple-50/70 border-purple-200/80'
                },
                {
                  label: 'Low Stock Alerts',
                  value: lowStockBooks.length.toString(),
                  trend: lowStockBooks.length > 0 ? 'Requires Restock' : 'Healthy Inventory',
                  trendUp: lowStockBooks.length === 0,
                  sub: 'Stock ≤ 10 units',
                  icon: 'fa-solid fa-triangle-exclamation',
                  color: 'text-rose-500',
                  bg: isDark ? 'bg-rose-950/40 border-rose-800/40' : 'bg-rose-50/70 border-rose-200/80'
                },
              ].map((kpi, idx) => (
                <div
                  key={idx}
                  className={`p-6 rounded-3xl border transition-all duration-200 ${kpi.bg} shadow-xs`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {kpi.label}
                    </span>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${kpi.color} bg-white/80 dark:bg-slate-800 shadow-2xs`}>
                      <i className={`${kpi.icon} text-sm`}></i>
                    </div>
                  </div>
                  <div className="font-serif font-black text-3xl mb-1">
                    {kpi.value}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`font-semibold ${kpi.trendUp ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {kpi.trend}
                    </span>
                    <span className="text-slate-400">· {kpi.sub}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Dynamic Real Analytics Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Real Order & Sales Volume Chart */}
              <div className={`lg:col-span-8 p-6 sm:p-8 rounded-3xl border shadow-sm ${
                isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="font-serif font-bold text-lg">Sales Velocity &amp; Revenue Activity</h3>
                    <p className="text-xs text-slate-500">Real transaction volume derived from campus orders</p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
                    Live Database Records
                  </span>
                </div>

                {/* SVG / CSS Bar Chart using real order data */}
                {orders.length > 0 ? (
                  <div className="space-y-4">
                    <div className="h-64 flex items-end gap-3 sm:gap-6 pt-6 pb-2 border-b border-slate-200/60">
                      {orders.slice(0, 6).reverse().map((order) => {
                        const maxOrder = Math.max(...orders.slice(0, 6).map(o => o.total || 1), 1000);
                        const pct = Math.min(100, Math.max(15, Math.round(((order.total || 0) / maxOrder) * 100)));
                        return (
                          <div key={order.id} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                            <span className="text-[10px] font-mono text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                              ₹{order.total}
                            </span>
                            <div
                              className="w-full bg-gradient-to-t from-amber-600 to-amber-400 rounded-t-xl transition-all duration-300 group-hover:from-amber-500 group-hover:to-amber-300 shadow-xs"
                              style={{ height: `${pct}%` }}
                            />
                            <span className="text-[11px] font-bold text-slate-600 truncate max-w-[60px]">
                              #{order.id}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                      <span>Recent Orders Timeline</span>
                      <span>Order Total (₹)</span>
                    </div>
                  </div>
                ) : (
                  <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-slate-400">
                    <i className="fa-solid fa-chart-simple text-3xl mb-2 text-slate-300"></i>
                    <p className="text-xs">No orders recorded in database yet.</p>
                    <p className="text-[11px] text-slate-400 mt-1">When students complete checkout, real sales trends will display here.</p>
                  </div>
                )}
              </div>

              {/* Real Genre Distribution Breakdown */}
              <div className={`lg:col-span-4 p-6 sm:p-8 rounded-3xl border shadow-sm ${
                isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}>
                <h3 className="font-serif font-bold text-lg mb-1">Catalog by Category</h3>
                <p className="text-xs text-slate-500 mb-6">Real database title distribution</p>

                <div className="space-y-4">
                  {(() => {
                    const map: Record<string, number> = {};
                    books.forEach(b => { map[b.category] = (map[b.category] || 0) + 1; });
                    const colors = ['bg-indigo-500', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500', 'bg-purple-500', 'bg-sky-500'];
                    return Object.entries(map).map(([genre, count], idx) => {
                      const pct = Math.round((count / (books.length || 1)) * 100);
                      return (
                        <div key={genre} className="space-y-1">
                          <div className="flex justify-between text-xs font-semibold">
                            <span>{genre}</span>
                            <span className="font-mono text-slate-500">{count} titles ({pct}%)</span>
                          </div>
                          <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div className={`h-full ${colors[idx % colors.length]} rounded-full`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* ================= TAB 2: CATALOG CRUD TABLE ================= */}
        {activeAdminTab === 'catalog' && (
          <div className={`rounded-3xl border shadow-sm p-6 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
          }`}>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="font-serif font-bold text-lg">Catalog Records</h3>
                <p className="text-xs text-slate-500">Live synchronization with customer storefront</p>
              </div>

              {/* Table search filter */}
              <div className="relative w-full sm:w-72">
                <input
                  type="text"
                  value={searchTableQuery}
                  onChange={(e) => setSearchTableQuery(e.target.value)}
                  placeholder="Filter books, authors, ISBN..."
                  className={`w-full py-2 pl-9 pr-3 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                    isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'
                  }`}
                />
                <i className="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-slate-400 text-xs"></i>
              </div>
            </div>

            {/* Data Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className={`border-b ${isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
                    <th className="py-3 px-3 font-semibold">Book &amp; Author</th>
                    <th className="py-3 px-3 font-semibold">Category</th>
                    <th className="py-3 px-3 font-semibold">ISBN</th>
                    <th className="py-3 px-3 font-semibold">Price</th>
                    <th className="py-3 px-3 font-semibold">Stock</th>
                    <th className="py-3 px-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredBooks.map((book) => (
                    <tr key={book.id} className="hover:bg-amber-50/40 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-3">
                          <img src={book.coverImage} alt={book.title} className="w-9 h-13 object-cover rounded shadow-2xs" />
                          <div>
                            <div className="font-serif font-bold text-sm line-clamp-1">{book.title}</div>
                            <div className="text-slate-500 text-[11px]">{book.author}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 font-medium text-[11px]">
                          {book.category}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                        {book.isbn}
                      </td>
                      <td className="py-3 px-3 font-bold font-serif">
                        ₹{book.price}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${book.stock <= 10 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {book.stock}
                          </span>
                          <button
                            onClick={() => onUpdateBookStock(book.id, book.stock + 10)}
                            className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-[10px] font-bold transition-colors"
                            title="Quick restock +10"
                          >
                            +10
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(book)}
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300"
                            title="Edit Record"
                          >
                            <i className="fa-solid fa-pen-to-square text-xs"></i>
                          </button>
                          <button
                            onClick={() => onDeleteBook(book.id)}
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600"
                            title="Delete Book"
                          >
                            <i className="fa-regular fa-trash-can text-xs"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================= TAB 3: ORDERS PIPELINE ================= */}
        {activeAdminTab === 'orders' && (
          <div className={`rounded-3xl border shadow-sm p-6 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
          }`}>
            <h3 className="font-serif font-bold text-lg mb-1">Campus Order Dispatch</h3>
            <p className="text-xs text-slate-500 mb-6">Manage live status transitions and campus delivery dispatches</p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className={`border-b ${isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
                    <th className="py-3 px-3 font-semibold">Order ID</th>
                    <th className="py-3 px-3 font-semibold">Student &amp; Hostel</th>
                    <th className="py-3 px-3 font-semibold">Time</th>
                    <th className="py-3 px-3 font-semibold">Total</th>
                    <th className="py-3 px-3 font-semibold">Status Pipeline</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td className="py-3 px-3 font-mono font-bold text-slate-900 dark:text-amber-300">
                        #BN-{o.id}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900 dark:text-white">{o.customerName}</div>
                        <div className="text-slate-500 text-[11px]">{o.room}</div>
                      </td>
                      <td className="py-3 px-3 text-slate-500">
                        {o.date}
                      </td>
                      <td className="py-3 px-3 font-bold font-serif">
                        ₹{o.total} <span className="text-[10px] text-slate-400 font-normal">({o.payment})</span>
                      </td>
                      <td className="py-3 px-3">
                        <select
                          value={o.status}
                          onChange={(e) => handleStatusChange(o.id, e.target.value as any)}
                          className={`py-1 px-2.5 rounded-xl text-xs font-bold border focus:outline-none ${
                            o.status === 'Delivered'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : o.status === 'Shipped'
                              ? 'bg-blue-50 text-blue-800 border-blue-300'
                              : o.status === 'Processing'
                              ? 'bg-amber-50 text-amber-900 border-amber-300'
                              : 'bg-slate-100 text-slate-800 border-slate-300'
                          }`}
                        >
                          <option value="Confirmed">Confirmed</option>
                          <option value="Processing">Processing</option>
                          <option value="Shipped">Shipped</option>
                          <option value="Delivered">Delivered</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================= TAB 4: INVENTORY ALERTS ================= */}
        {activeAdminTab === 'inventory' && (
          <div className={`rounded-3xl border shadow-sm p-6 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
          }`}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-serif font-bold text-lg flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
                  <span>Warehouse Inventory &amp; Restock Alerts</span>
                </h3>
                <p className="text-xs text-slate-500">Books requiring campus stock replenishment</p>
              </div>

              <span className="px-3 py-1 rounded-full bg-rose-100 text-rose-800 text-xs font-bold">
                {lowStockBooks.length} Critical Items
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {lowStockBooks.map((book) => (
                <div
                  key={book.id}
                  className="p-4 rounded-2xl border border-rose-200 bg-rose-50/40 dark:bg-rose-950/20 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <img src={book.coverImage} alt={book.title} className="w-10 h-14 object-cover rounded shadow-2xs" />
                    <div>
                      <h4 className="font-serif font-bold text-xs line-clamp-1">{book.title}</h4>
                      <p className="text-[11px] text-rose-700 font-bold mt-0.5">Only {book.stock} units remaining</p>
                    </div>
                  </div>

                  <button
                    onClick={() => onUpdateBookStock(book.id, book.stock + 20)}
                    className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-amber-600 text-amber-50 hover:text-slate-950 font-bold text-xs whitespace-nowrap shadow-xs transition-colors"
                  >
                    +20 Units
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Add / Edit Book Modal */}
      {isAddBookModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-lg rounded-3xl border p-6 sm:p-8 shadow-2xl ${
            isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200/80">
              <h3 className="font-serif font-black text-xl">
                {editingBook ? 'Edit Book Record' : 'Add New Book to Catalog'}
              </h3>
              <button
                onClick={() => setIsAddBookModalOpen(false)}
                className="w-8 h-8 rounded-full border flex items-center justify-center text-slate-500 hover:text-slate-800"
              >
                <i className="fa-solid fa-xmark text-xs"></i>
              </button>
            </div>

            <form onSubmit={handleSaveBook} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1">Book Title</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Author Name</label>
                <input
                  type="text"
                  required
                  value={formAuthor}
                  onChange={(e) => setFormAuthor(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Category</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  >
                    <option value="Computer Science">Computer Science</option>
                    <option value="Fiction">Fiction</option>
                    <option value="Science Fiction">Science Fiction</option>
                    <option value="Business">Business</option>
                    <option value="Self Help">Self Help</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1">Price (₹)</label>
                  <input
                    type="number"
                    required
                    value={formPrice}
                    onChange={(e) => setFormPrice(Number(e.target.value))}
                    className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Initial Stock</label>
                  <input
                    type="number"
                    required
                    value={formStock}
                    onChange={(e) => setFormStock(Number(e.target.value))}
                    className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1">ISBN-13</label>
                  <input
                    type="text"
                    required
                    value={formIsbn}
                    onChange={(e) => setFormIsbn(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Cover Image URL</label>
                <input
                  type="url"
                  required
                  value={formCover}
                  onChange={(e) => setFormCover(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="pt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddBookModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold"
                >
                  {editingBook ? 'Save Changes' : 'Create Book'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
