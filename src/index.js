require('dotenv').config();
const express = require('express');
const cors = require('cors');

const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payments');
const { startExpirySweeper } = require('./jobs/expireReservations');

const app = express();
app.use(cors());
app.use(express.json());

const path = require('path');

app.use(express.static(path.join(__dirname, '../public')));

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/api', (req, res) => {
  res.json({
    name: 'am_cafe POS API',
    status: 'running',
    endpoints: {
      health: 'GET /health',
      goal: 'GET /goal',
      products: 'GET /products, POST /products, GET /products/:id, PUT /products/:id, DELETE /products/:id',
      orders: 'GET /orders, POST /orders, GET /orders/:id, POST /orders/:id/cancel',
      payments: 'POST /payments/:orderId'
    }
  });
});

app.get('/goal', (req, res) => {
  res.json({
    status: 'active',
    goal: 'High-concurrency POS Backend with atomic inventory reservation and idempotent payment handling',
    features: [
      'Atomic stock reservation via row-locking in Prisma transactions',
      'Idempotent order placement and payment execution',
      'Self-healing background sweeper for expired reservations (30s interval)',
      'Simulated multi-state payment gateway (SUCCESS / FAILURE / TIMEOUT)'
    ]
  });
});

app.get('/stats', async (req, res) => {
  try {
    const prisma = require('./lib/prisma');
    const [totalProducts, lowStock, totalOrders, paidOrders, reservedOrders] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { stock: { lte: 5 } } }),
      prisma.order.count(),
      prisma.order.findMany({ where: { status: 'PAID' }, select: { totalAmount: true } }),
      prisma.order.count({ where: { status: 'RESERVED' } })
    ]);

    const totalRevenue = paidOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);

    res.json({
      totalRevenue: totalRevenue.toFixed(2),
      totalProducts,
      lowStock,
      totalOrders,
      activeReservations: reservedOrders
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to calculate stats' });
  }
});

app.get('/reports/z-report', async (req, res) => {
  try {
    const prisma = require('./lib/prisma');
    const [orders, products] = await Promise.all([
      prisma.order.findMany({ include: { items: true, paymentAttempts: true }, orderBy: { id: 'desc' } }),
      prisma.product.findMany()
    ]);

    const paidOrders = orders.filter(o => o.status === 'PAID');
    const grossSales = paidOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
    const taxEstimated = grossSales * 0.08 / 1.08;
    const netSales = grossSales - taxEstimated;

    res.json({
      timestamp: new Date().toISOString(),
      registerId: 'REG-01',
      totalOrders: orders.length,
      paidCount: paidOrders.length,
      grossSales: grossSales.toFixed(2),
      netSales: netSales.toFixed(2),
      taxCollected: taxEstimated.toFixed(2),
      totalProductsInStock: products.reduce((sum, p) => sum + p.stock, 0)
    });
  } catch (err) {
    console.error('Z-Report error:', err);
    res.status(500).json({ error: 'Failed to generate Z-Report' });
  }
});

app.get('/reports/csv', async (req, res) => {
  try {
    const prisma = require('./lib/prisma');
    const orders = await prisma.order.findMany({
      include: { items: true },
      orderBy: { id: 'desc' }
    });

    let csv = 'Order_ID,Status,Total_Amount,Created_At,Items_Count,Idempotency_Key\n';
    orders.forEach(o => {
      csv += `${o.id},${o.status},${o.totalAmount},${o.createdAt.toISOString()},${o.items.length},"${o.idempotencyKey || ''}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="orders_report.csv"');
    res.send(csv);
  } catch (err) {
    console.error('CSV Export error:', err);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

app.use('/products', productRoutes);
app.use('/orders', orderRoutes);
app.use('/payments', paymentRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`POS backend listening on port ${PORT}`);
  startExpirySweeper();
});
