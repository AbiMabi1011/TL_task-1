const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

// Simulates a real payment gateway's three possible outcomes.
// Pass `forceOutcome` in the body for demo/testing purposes; otherwise random.
function simulateGateway(forceOutcome) {
  if (forceOutcome) return forceOutcome;
  const r = Math.random();
  if (r < 0.7) return 'SUCCESS';
  if (r < 0.9) return 'FAILURE';
  return 'TIMEOUT';
}

// POST /payments/:orderId  — body: { attemptKey, forceOutcome? }
router.post('/:orderId', async (req, res) => {
  const orderId = Number(req.params.orderId);
  const { attemptKey, forceOutcome } = req.body;

  if (!attemptKey) {
    return res.status(400).json({ error: 'attemptKey is required to prevent duplicate payment attempts' });
  }

  // Duplicate payment submission guard: an attemptKey can only be used once.
  const existingAttempt = await prisma.paymentAttempt.findUnique({ where: { attemptKey } });
  if (existingAttempt) {
    return res.status(200).json({ message: 'Attempt already processed', attempt: existingAttempt });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
      if (!order) throw new Error('NOT_FOUND');

      // Reject payment on an order that's not awaiting payment — this is
      // what blocks duplicate/late payment attempts on an already-resolved order.
      if (order.status !== 'RESERVED') {
        throw new Error(`INVALID_STATE:${order.status}`);
      }

      // A reservation that's already expired shouldn't be payable.
      if (order.reservationExpiresAt && order.reservationExpiresAt < new Date()) {
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }
        await tx.order.update({ where: { id: orderId }, data: { status: 'EXPIRED' } });
        throw new Error('RESERVATION_EXPIRED');
      }

      const outcome = simulateGateway(forceOutcome);
      await tx.paymentAttempt.create({ data: { orderId, outcome, attemptKey } });

      if (outcome === 'SUCCESS') {
        const updated = await tx.order.update({
          where: { id: orderId },
          data: { status: 'PAID', reservationExpiresAt: null },
        });
        return { outcome, order: updated };
      }

      if (outcome === 'FAILURE') {
        // Release reserved stock back to available inventory.
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }
        const updated = await tx.order.update({
          where: { id: orderId },
          data: { status: 'FAILED', reservationExpiresAt: null },
        });
        return { outcome, order: updated };
      }

      // TIMEOUT — treat like an immediate reservation expiry: release stock.
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: 'EXPIRED', reservationExpiresAt: null },
      });
      return { outcome, order: updated };
    });

    res.json(result);
  } catch (err) {
    if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'Order not found' });
    if (err.message === 'RESERVATION_EXPIRED') {
      return res.status(409).json({ error: 'Reservation already expired; stock has been released' });
    }
    if (err.message?.startsWith('INVALID_STATE')) {
      return res.status(409).json({ error: `Order is not awaiting payment (status: ${err.message.split(':')[1]})` });
    }
    console.error(err);
    res.status(500).json({ error: 'Payment processing failed' });
  }
});

module.exports = router;
