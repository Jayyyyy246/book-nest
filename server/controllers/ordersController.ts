import { Response } from 'express';
import { db } from '../database/index.js';
import { AuthRequest } from '../middleware/auth.js';

export const ordersController = {
  // GET /api/orders
  getOrders: (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;

    const orders = db.prepare(`
      SELECT 
        o.id,
        o.order_number as orderNumber,
        o.status,
        o.payment_method as paymentMethod,
        o.payment_status as paymentStatus,
        o.subtotal,
        o.discount_amount as discountAmount,
        o.delivery_fee as deliveryFee,
        o.gst_amount as gstAmount,
        o.grand_total as total,
        o.full_name as fullName,
        o.phone,
        o.hostel_block as hostelBlock,
        o.room_no as roomNo,
        o.delivery_notes as deliveryNotes,
        o.created_at as date
      FROM orders o
      WHERE o.user_id = ?
      ORDER BY o.created_at DESC
    `).all(userId) as any[];

    const getItemStmt = db.prepare(`
      SELECT 
        oi.quantity,
        oi.unit_price as price,
        b.id,
        b.title,
        a.name as author,
        c.name as category,
        b.cover_image as coverImage,
        b.isbn
      FROM order_items oi
      JOIN books b ON oi.book_id = b.id
      JOIN authors a ON b.author_id = a.id
      JOIN categories c ON b.category_id = c.id
      WHERE oi.order_id = ?
    `);

    const enrichedOrders = orders.map(order => {
      const rawItems = getItemStmt.all(order.id) as any[];
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        date: new Date(order.date).toLocaleDateString('en-IN', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        total: order.total,
        status: order.status,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        address: {
          name: order.fullName,
          phone: order.phone,
          address: `${order.roomNo}, ${order.hostelBlock}`,
          hostelBlock: order.hostelBlock,
          roomNo: order.roomNo,
          notes: order.deliveryNotes
        },
        items: rawItems.map(i => ({
          book: {
            id: i.id,
            title: i.title,
            author: i.author,
            category: i.category,
            coverImage: i.coverImage,
            isbn: i.isbn
          },
          quantity: i.quantity,
          price: i.price
        }))
      };
    });

    res.json({ orders: enrichedOrders });
  },

  // GET /api/orders/:id
  getOrderById: (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    const { id } = req.params;
    const isAdmin = req.user?.role === 'admin';

    const orderQuery = isAdmin
      ? 'SELECT * FROM orders WHERE id = ? OR order_number = ?'
      : 'SELECT * FROM orders WHERE (id = ? OR order_number = ?) AND user_id = ?';

    const params = isAdmin ? [id, id] : [id, id, userId];
    const order = db.prepare(orderQuery).get(...params) as any;

    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const items = db.prepare(`
      SELECT 
        oi.quantity,
        oi.unit_price as price,
        oi.line_total as lineTotal,
        b.id,
        b.title,
        a.name as author,
        c.name as category,
        b.cover_image as coverImage,
        b.isbn
      FROM order_items oi
      JOIN books b ON oi.book_id = b.id
      JOIN authors a ON b.author_id = a.id
      JOIN categories c ON b.category_id = c.id
      WHERE oi.order_id = ?
    `).all(order.id) as any[];

    res.json({
      order: {
        id: order.id,
        orderNumber: order.order_number,
        date: new Date(order.created_at).toLocaleDateString('en-IN', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        status: order.status,
        paymentMethod: order.payment_method,
        paymentStatus: order.payment_status,
        subtotal: order.subtotal,
        discountAmount: order.discount_amount,
        deliveryFee: order.delivery_fee,
        gstAmount: order.gst_amount,
        grandTotal: order.grand_total,
        address: {
          name: order.full_name,
          phone: order.phone,
          address: `${order.room_no}, ${order.hostel_block}`,
          hostelBlock: order.hostel_block,
          roomNo: order.room_no,
          notes: order.delivery_notes
        },
        items: items.map(i => ({
          book: {
            id: i.id,
            title: i.title,
            author: i.author,
            category: i.category,
            coverImage: i.coverImage,
            isbn: i.isbn
          },
          quantity: i.quantity,
          unitPrice: i.price,
          lineTotal: i.lineTotal
        }))
      }
    });
  },

  // POST /api/orders
  createOrder: (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    const {
      address,
      paymentMethod = 'UPI',
      items,
      summary
    } = req.body;

    if (!address || !address.fullName || !address.hostelBlock || !address.roomNo || !address.phone) {
      return res.status(400).json({ error: 'Complete campus delivery address is required.' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one book.' });
    }

    const orderNumber = `BN-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

    // Atomic transaction: Check stock -> Decrement stock -> Insert order & items -> Clear cart
    const placeOrderTx = db.transaction(() => {
      // 1. Validate stock for every item
      for (const item of items) {
        const bookId = item.bookId || item.book?.id;
        const book = db.prepare('SELECT id, title, stock, price, discount FROM books WHERE id = ?').get(bookId) as any;
        if (!book) {
          throw new Error(`Book ID ${bookId} does not exist in catalog.`);
        }
        if (book.stock < item.quantity) {
          throw new Error(`Insufficient stock for "${book.title}". Available: ${book.stock}, Requested: ${item.quantity}`);
        }
      }

      // 2. Decrement stock & assemble line items
      const lineItemsToInsert: any[] = [];
      for (const item of items) {
        const bookId = item.bookId || item.book?.id;
        const qty = item.quantity;
        db.prepare('UPDATE books SET stock = stock - ? WHERE id = ?').run(qty, bookId);

        const book = db.prepare('SELECT id, title, price, discount FROM books WHERE id = ?').get(bookId) as any;
        const unitPrice = Math.round(book.price * (1 - book.discount / 100));
        const lineTotal = unitPrice * qty;
        lineItemsToInsert.push({ bookId, quantity: qty, unitPrice, lineTotal });
      }

      // 3. Insert order
      const grandTotal = summary?.grandTotal || lineItemsToInsert.reduce((sum, i) => sum + i.lineTotal, 0);
      const subtotal = summary?.subtotal || grandTotal;
      const discountAmount = summary?.couponDiscount || 0;
      const deliveryFee = summary?.deliveryFee || 0;
      const gstAmount = summary?.gstAmount || 0;

      const orderInsertResult = db.prepare(`
        INSERT INTO orders (
          user_id, order_number, status, payment_method, payment_status,
          subtotal, discount_amount, delivery_fee, gst_amount, grand_total,
          full_name, phone, hostel_block, room_no, delivery_notes
        ) VALUES (?, ?, 'Confirmed', ?, 'DEMO PAID', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        orderNumber,
        paymentMethod.toUpperCase(),
        subtotal,
        discountAmount,
        deliveryFee,
        gstAmount,
        grandTotal,
        address.fullName,
        address.phone,
        address.hostelBlock,
        address.roomNo,
        address.deliveryNotes || ''
      );

      const newOrderId = Number(orderInsertResult.lastInsertRowid);

      // 4. Insert order items
      const insertItemStmt = db.prepare(`
        INSERT INTO order_items (order_id, book_id, quantity, unit_price, line_total)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const lineItem of lineItemsToInsert) {
        insertItemStmt.run(newOrderId, lineItem.bookId, lineItem.quantity, lineItem.unitPrice, lineItem.lineTotal);
      }

      // 5. Save address for user
      db.prepare(`
        INSERT INTO addresses (user_id, full_name, phone, hostel_block, room_no, is_default)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(userId, address.fullName, address.phone, address.hostelBlock, address.roomNo);

      // 6. Clear user cart
      db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);

      return newOrderId;
    });

    try {
      const orderId = placeOrderTx();

      const createdOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
      const orderItems = db.prepare(`
        SELECT oi.*, b.title, b.isbn, b.cover_image as coverImage, b.price as originalPrice
        FROM order_items oi
        JOIN books b ON oi.book_id = b.id
        WHERE oi.order_id = ?
      `).all(orderId);

      res.status(201).json({
        success: true,
        message: 'Order confirmed and inventory updated successfully.',
        order: {
          id: createdOrder.id,
          orderNumber: createdOrder.order_number,
          date: new Date().toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }),
          total: createdOrder.grand_total,
          summary: {
            subtotal: createdOrder.subtotal,
            couponCode: createdOrder.coupon_code,
            couponDiscount: createdOrder.discount_amount,
            deliveryFee: createdOrder.delivery_fee,
            grandTotal: createdOrder.grand_total
          },
          status: createdOrder.status,
          paymentMethod: createdOrder.payment_method,
          paymentStatus: createdOrder.payment_status,
          address: {
            name: createdOrder.full_name,
            phone: createdOrder.phone,
            address: `${createdOrder.room_no}, ${createdOrder.hostel_block}`,
            hostelBlock: createdOrder.hostel_block,
            roomNo: createdOrder.room_no,
            notes: createdOrder.delivery_notes
          },
          items: orderItems.map((i: any) => ({
            book: {
              id: i.book_id,
              title: i.title,
              isbn: i.isbn,
              coverImage: i.coverImage,
              price: i.originalPrice
            },
            quantity: i.quantity,
            unitPrice: i.unit_price,
            lineTotal: i.line_total
          }))
        }
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to process order.' });
    }
  },

  // GET /api/admin/orders
  getAdminOrders: (req: AuthRequest, res: Response) => {
    const orders = db.prepare(`
      SELECT 
        o.id,
        o.order_number as orderNumber,
        o.user_id as userId,
        u.name as customerName,
        u.email as customerEmail,
        o.full_name as recipientName,
        o.hostel_block as hostelBlock,
        o.room_no as roomNo,
        o.phone,
        o.grand_total as total,
        o.status,
        o.payment_method as payment,
        o.payment_status as paymentStatus,
        o.created_at as date,
        (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as itemsCount
      FROM orders o
      JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC
    `).all() as any[];

    const formattedOrders = orders.map(o => ({
      id: o.id,
      customerName: o.recipientName || o.customerName,
      room: `${o.hostelBlock}, ${o.roomNo}`,
      total: o.total,
      status: o.status,
      date: new Date(o.date).toLocaleDateString('en-IN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      itemsCount: o.itemsCount,
      payment: o.payment
    }));

    res.json({ orders: formattedOrders });
  },

  // PUT /api/admin/orders/:id/status
  updateOrderStatus: (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const result = db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    res.json({ success: true, message: `Order #${id} status updated to ${status}.`, orderId: Number(id), status });
  }
};
