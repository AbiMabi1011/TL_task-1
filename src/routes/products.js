const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

// SEED DEMO PRODUCTS FOR AM_CAFE
router.post('/seed', async (req, res) => {
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

  try {
    if (req.query.force === 'true' || req.body.force === true) {
      await prisma.orderItem.deleteMany();
      await prisma.paymentAttempt.deleteMany();
      await prisma.order.deleteMany();
      await prisma.product.deleteMany();
    }

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
    const all = await prisma.product.findMany({ orderBy: { id: 'asc' } });
    res.json({ message: 'am_cafe authentic Jaffna catalog seeded successfully', count: all.length, products: all });
  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).json({ error: 'Failed to seed am_cafe menu: ' + err.message });
  }
});

// CREATE
router.post('/', async (req, res) => {
  const { name, price, stock } = req.body;
  if (!name || price == null || stock == null) {
    return res.status(400).json({ error: 'name, price, and stock are required' });
  }
  const product = await prisma.product.create({
    data: { name, price: Number(price), stock: Number(stock) },
  });
  res.status(201).json(product);
});

// READ ALL — reflects current, accurate stock for every product
router.get('/', async (req, res) => {
  const products = await prisma.product.findMany({ orderBy: { id: 'asc' } });
  res.json(products);
});

// READ ONE
router.get('/:id', async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { id: Number(req.params.id) },
  });
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

// UPDATE
router.put('/:id', async (req, res) => {
  const { name, price, stock } = req.body;
  try {
    const product = await prisma.product.update({
      where: { id: Number(req.params.id) },
      data: {
        ...(name != null && { name }),
        ...(price != null && { price }),
        ...(stock != null && { stock: Number(stock) }),
      },
    });
    res.json(product);
  } catch (err) {
    res.status(404).json({ error: 'Product not found' });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    await prisma.product.delete({ where: { id: Number(req.params.id) } });
    res.status(204).end();
  } catch (err) {
    res.status(404).json({ error: 'Product not found' });
  }
});

module.exports = router;
