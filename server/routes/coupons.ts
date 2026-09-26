import { Router } from 'express';
import { db } from '../db/database.js';

const router = Router();

// Validate and calculate coupon discount
router.post('/validate', (req, res) => {
  const { code, subtotal } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Coupon code is required.' });
  }

  const coupon = db.prepare('SELECT * FROM coupons WHERE UPPER(code) = ? AND is_active = 1').get(code.trim().toUpperCase()) as any;
  if (!coupon) {
    return res.status(404).json({ error: 'Invalid or expired coupon code. Try WELCOME10, BOOKNEST50, or READMORE' });
  }

  const currentSubtotal = Number(subtotal) || 0;
  if (currentSubtotal < coupon.min_order_amount) {
    return res.status(400).json({
      error: `Coupon "${coupon.code}" requires a minimum cart subtotal of ₹${coupon.min_order_amount}. Current subtotal: ₹${currentSubtotal}.`
    });
  }

  let discount = 0;
  if (coupon.discount_type === 'percent') {
    discount = Math.round(currentSubtotal * (coupon.discount_value / 100));
  } else {
    discount = Math.min(currentSubtotal, coupon.discount_value);
  }

  res.json({
    valid: true,
    code: coupon.code,
    discountType: coupon.discount_type,
    discountValue: coupon.discount_value,
    calculatedDiscount: discount,
    message: `Coupon "${coupon.code}" applied! You saved ₹${discount}.`
  });
});

export default router;
