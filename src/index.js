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
app.listen(PORT, async () => {
  console.log(`POS backend listening on port ${PORT}`);
  startExpirySweeper();

  // Ensure default catalog is seeded into MySQL
  try {
    const prisma = require('./lib/prisma');
    const count = await prisma.product.count();
    console.log(`Current products in MySQL: ${count}`);
    if (count < 50) {
      console.log('Seeding authentic Jaffna catalog into MySQL...');
      const defaultItems = [
        // ☕ Hot Beverages
        { name: '[HOT-01] Jaffna Sukku Malli Coffee (Dry Ginger & Coriander)', price: 120.00, stock: 100 },
        { name: '[HOT-02] Classic Jaffna Milk Tea', price: 100.00, stock: 250 },
        { name: '[HOT-03] Plain Tea (Kahata)', price: 60.00, stock: 200 },
        { name: '[HOT-04] Palm Jaggery Tea (Karuppatti Tea)', price: 140.00, stock: 120 },
        { name: '[HOT-05] Masala Chai', price: 180.00, stock: 80 },
        { name: '[HOT-06] Fresh Cow Milk with Jaggery', price: 220.00, stock: 60 },
        { name: '[HOT-07] Hot Chocolate', price: 550.00, stock: 40 },
        { name: '[HOT-08] Filter Coffee (South Indian Style)', price: 150.00, stock: 90 },
        { name: '[HOT-09] Cappuccino', price: 620.00, stock: 50 },
        { name: '[HOT-10] Café Latte', price: 650.00, stock: 50 },

        // 🧊 Cold Beverages
        { name: '[COLD-01] Jaffna Nelli Crush Drink (Gooseberry)', price: 180.00, stock: 75 },
        { name: '[COLD-02] Rose Milk with Sabja Seeds', price: 220.00, stock: 60 },
        { name: '[COLD-03] Fresh Karthacolomban Mango Juice', price: 380.00, stock: 45 },
        { name: '[COLD-04] Fresh Papaya Juice', price: 280.00, stock: 50 },
        { name: '[COLD-05] Fresh Lime & Mint Cooler', price: 220.00, stock: 60 },
        { name: '[COLD-06] Sweet Lassi', price: 320.00, stock: 40 },
        { name: '[COLD-07] Salted Mint Buttermilk (Moru)', price: 160.00, stock: 55 },
        { name: '[COLD-08] Iced Coffee (Sri Lankan Café Style)', price: 300.00, stock: 80 },
        { name: '[COLD-09] Faluda (with Ice Cream & Jelly)', price: 450.00, stock: 50 },
        { name: '[COLD-10] Bottled Mineral Water (500ml)', price: 100.00, stock: 150 },

        // 🥟 Savory Snacks
        { name: '[SNK-01] Jaffna Fish Roll', price: 140.00, stock: 70 },
        { name: '[SNK-02] Spicy Chicken Roll', price: 160.00, stock: 60 },
        { name: '[SNK-03] Crispy Vegetable Roll', price: 100.00, stock: 80 },
        { name: '[SNK-04] Ulundu Vadai (with Coconut Chutney)', price: 80.00, stock: 120 },
        { name: '[SNK-05] Masala / Paruppu Vadai', price: 70.00, stock: 140 },
        { name: '[SNK-06] Vazhaipoo Vadai (Banana Blossom Vadai)', price: 90.00, stock: 60 },
        { name: '[SNK-07] Mutton Samosa', price: 180.00, stock: 50 },
        { name: '[SNK-08] Vegetable Samosa', price: 80.00, stock: 90 },
        { name: '[SNK-09] Spicy Egg Roti Pocket', price: 180.00, stock: 45 },
        { name: '[SNK-10] Seeni Sambol Bun', price: 100.00, stock: 60 },
        { name: '[SNK-11] Chicken Curry Bun', price: 150.00, stock: 55 },
        { name: '[SNK-12] Creamy Chicken Puff Pastry', price: 220.00, stock: 40 },

        // 🍨 Desserts & Sweets
        { name: '[SWT-01] Jaffna Rio Special Sundae Cup', price: 450.00, stock: 50 },
        { name: '[SWT-02] Vanilla Scoop (with Jelly & Cashew)', price: 250.00, stock: 80 },
        { name: '[SWT-03] Chocolate Brownie', price: 480.00, stock: 35 },
        { name: '[SWT-04] Jaffna Paal Payasam (Cup)', price: 220.00, stock: 40 },
        { name: '[SWT-05] Susiyam (Sweet Lentil & Jaggery Fritter)', price: 90.00, stock: 60 },
        { name: '[SWT-06] Sweet Moddakam (Coconut & Jaggery)', price: 110.00, stock: 50 },
        { name: '[SWT-07] Jaffna Halwa (Per Slice)', price: 120.00, stock: 70 },
        { name: '[SWT-08] Paal Cova (Milk Peda)', price: 150.00, stock: 65 },
        { name: '[SWT-09] Jam Swiss Roll Slice', price: 120.00, stock: 50 },
        { name: '[SWT-10] Ribbon Butter Cake Slice', price: 140.00, stock: 45 },
        { name: '[SWT-11] Curd & Kithul Treacle Pot', price: 280.00, stock: 30 },
        { name: '[SWT-12] Rava Laddu (2 pcs)', price: 160.00, stock: 55 },
        { name: '[SWT-13] Gulab Jamun (2 pcs)', price: 220.00, stock: 40 },

        // 🥪 Light Bites / Meals
        { name: '[LCH-01] Egg Roti with Gravy', price: 250.00, stock: 40 },
        { name: '[LCH-02] Veg Kotthu (Cup/Small)', price: 550.00, stock: 35 },
        { name: '[LCH-03] Chicken Kotthu (Cup/Small)', price: 750.00, stock: 35 },
        { name: '[LCH-04] Cheese & Tomato Toast', price: 450.00, stock: 30 },
        { name: '[LCH-05] Spicy Tuna Sandwich', price: 520.00, stock: 25 },
        { name: '[LCH-06] Roast Paan with Jaffna Fish Curry Dip', price: 480.00, stock: 30 },

        // 🛍️ Packed Retail Items
        { name: '[RET-01] Traditional Spicy Murukku Packet (200g)', price: 280.00, stock: 40 },
        { name: '[RET-02] Jaffna Special Mixture Packet (250g)', price: 380.00, stock: 50 },
        { name: '[RET-03] Sweet Sesame Balls (Ellu Urundai - 5 pcs)', price: 250.00, stock: 45 },
        { name: '[RET-04] Pure Palm Jaggery Block (Karuppatti 500g)', price: 650.00, stock: 25 }
      ];

      for (const item of defaultItems) {
        const existing = await prisma.product.findFirst({ where: { name: item.name } });
        if (!existing) {
          await prisma.product.create({ data: item });
        } else {
          await prisma.product.update({
            where: { id: existing.id },
            data: { price: item.price, stock: item.stock }
          });
        }
      }
      console.log('✅ 55 Authentic Jaffna Products verified/seeded successfully!');
    }
  } catch (err) {
    console.error('Database connection / seeding check error:', err.message);
  }
});

// Export handler for Cloudflare Workers / module runtimes
module.exports = app;
module.exports.default = {
  fetch(request, env, ctx) {
    return app(request, env, ctx);
  }
};


