const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

const RESERVATION_MINUTES = 5;

// POST /orders  — "enter checkout": creates an order and reserves stock
// atomically for every line item. Body: { idempotencyKey, items: [{ productId, quantity }] }
router.post('/', async (req, res) => {
  const { idempotencyKey, items } = req.body;

  if (!idempotencyKey) {
    return res.status(400).json({ error: 'idempotencyKey is required to prevent duplicate submissions' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items must be a non-empty array' });
  }

  // Duplicate cart/order submission guard — same idempotency key returns the
  // existing order instead of creating a second one.
  const existing = await prisma.order.findUnique({ where: { idempotencyKey } });
  if (existing) {
    return res.status(200).json(existing);
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      let total = 0;
      const orderItemsData = [];

      for (const { productId, quantity } of items) {
        if (!quantity || quantity <= 0) {
          throw new Error(`Invalid quantity for product ${productId}`);
        }

        // Atomic, conditional decrement: only succeeds if stock is still
        // sufficient at the moment this row is locked. Under concurrent
        // requests, MySQL/InnoDB row locking serializes these updates so
        // two buyers can never both "win" the last unit.
        const result = await tx.product.updateMany({
          where: { id: productId, stock: { gte: quantity } },
          data: { stock: { decrement: quantity } },
        });

        if (result.count === 0) {
          throw new Error(`INSUFFICIENT_STOCK:${productId}`);
        }

        const product = await tx.product.findUnique({ where: { id: productId } });
        const lineTotal = Number(product.price) * quantity;
        total += lineTotal;
        orderItemsData.push({ productId, quantity, priceAtOrder: product.price });
      }

      return tx.order.create({
        data: {
          status: 'RESERVED',
          totalAmount: total,
          reservationExpiresAt: new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000),
          idempotencyKey,
          items: { create: orderItemsData },
        },
        include: { items: true },
      });
    });

    res.status(201).json(order);
  } catch (err) {
    if (err.message?.startsWith('INSUFFICIENT_STOCK')) {
      const productId = err.message.split(':')[1];
      return res.status(409).json({ error: `Insufficient stock for product ${productId}` });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// GET /orders/:id
router.get('/:id', async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: Number(req.params.id) },
    include: { items: { include: { product: true } }, paymentAttempts: true },
  });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

// GET /orders
router.get('/', async (req, res) => {
  const orders = await prisma.order.findMany({
    include: { items: true },
    orderBy: { id: 'desc' },
  });
  res.json(orders);
});

// POST /orders/:id/cancel — restores stock for a still-active order
router.post('/:id/cancel', async (req, res) => {
  const orderId = Number(req.params.id);

  try {
    const order = await prisma.$transaction(async (tx) => {
      const existingOrder = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!existingOrder) throw new Error('NOT_FOUND');

      if (!['PENDING', 'RESERVED'].includes(existingOrder.status)) {
        throw new Error(`INVALID_TRANSITION:${existingOrder.status}`);
      }

      // Restore stock for each reserved line item.
      for (const item of existingOrder.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }

      return tx.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED', reservationExpiresAt: null },
      });
    });

    res.json(order);
  } catch (err) {
    if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'Order not found' });
    if (err.message?.startsWith('INVALID_TRANSITION')) {
      return res.status(409).json({ error: `Cannot cancel an order in status ${err.message.split(':')[1]}` });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

// POST /orders/:id/refund — refunds a PAID order and restores stock back to inventory
router.post('/:id/refund', async (req, res) => {
  const orderId = Number(req.params.id);
  const { reason } = req.body || {};

  try {
    const order = await prisma.$transaction(async (tx) => {
      const existingOrder = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!existingOrder) throw new Error('NOT_FOUND');

      if (existingOrder.status !== 'PAID') {
        throw new Error(`INVALID_TRANSITION:${existingOrder.status}`);
      }

      // Restore stock for all products in this order
      for (const item of existingOrder.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }

      // Update status to CANCELLED (or refunded)
      return tx.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED', reservationExpiresAt: null },
        include: { items: true }
      });
    });

    res.json({ message: 'Order refunded and stock restored to inventory', order, reason });
  } catch (err) {
    if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'Order not found' });
    if (err.message?.startsWith('INVALID_TRANSITION')) {
      return res.status(409).json({ error: `Only PAID orders can be refunded (current status: ${err.message.split(':')[1]})` });
    }
    console.error('Refund error:', err);
    res.status(500).json({ error: 'Failed to process refund' });
  }
});

module.exports = router;
