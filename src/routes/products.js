const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

// SEED DEMO PRODUCTS FOR AM_CAFE
router.post('/seed', async (req, res) => {
  const defaultItems = [
    // ☕ Classic Espresso & Hot Brews
    { name: 'AM Espresso Double Shot', price: 3.50, stock: 65 },
    { name: 'Caffè Americano (12oz)', price: 3.80, stock: 55 },
    { name: 'Flat White (Velvet Microfoam)', price: 4.80, stock: 45 },
    { name: 'Classic Cappuccino with Cocoa Dust', price: 4.75, stock: 40 },
    { name: 'Spanish Vanilla Latte', price: 5.25, stock: 40 },
    { name: 'Caramel Cloud Macchiato', price: 5.40, stock: 35 },
    { name: 'Belgian Dark Mocha', price: 5.60, stock: 30 },
    { name: 'Cortado (1:1 Ratio)', price: 4.20, stock: 28 },

    // 🧊 Cold Brews & Refreshers
    { name: 'AM Signature Cold Brew (16oz)', price: 4.80, stock: 50 },
    { name: 'Vanilla Sweet Cream Cold Brew', price: 5.50, stock: 35 },
    { name: 'Kyoto Drip Slow Cold Brew', price: 5.20, stock: 25 },
    { name: 'Iced Brown Sugar Oat Latte', price: 5.75, stock: 40 },
    { name: 'Ceylon Spiced Chai Latte', price: 4.60, stock: 40 },
    { name: 'Organic Ceremonial Matcha Latte', price: 5.50, stock: 30 },
    { name: 'Yuzu Lemonade Sparkling Cooler', price: 4.50, stock: 35 },
    { name: 'San Pellegrino Sparkling (500ml)', price: 2.75, stock: 50 },

    // 🥐 Fresh Artisan Bakery & Pastries
    { name: 'Flaky French Butter Croissant', price: 3.75, stock: 30 },
    { name: 'Almond Frangipane Croissant', price: 4.50, stock: 20 },
    { name: 'Pain au Chocolat (Dark Cocoa)', price: 4.25, stock: 25 },
    { name: 'Blueberry Cream Cheese Muffin', price: 3.95, stock: 30 },
    { name: 'Double Fudge Belgian Cookie', price: 2.95, stock: 45 },
    { name: 'Cinnamon Swirl Brioche Roll', price: 4.10, stock: 22 },
    { name: 'Carrot Walnut Cake with Cream Frosting', price: 4.80, stock: 18 },
    { name: 'Pistachio Glazed Danish', price: 4.65, stock: 15 },

    // 🥪 Cafe Brunch & Toasts
    { name: 'Avocado Poached Egg Sourdough Toast', price: 8.50, stock: 18 },
    { name: 'Smoked Salmon Brioche Bagel', price: 9.80, stock: 14 },
    { name: 'Truffle Mushroom Melt Panini', price: 8.90, stock: 16 },
    { name: 'Crispy Bacon & Cheddar Brioche Bun', price: 7.95, stock: 20 },
    { name: 'Mediterranean Halloumi Pesto Toast', price: 8.25, stock: 15 },

    // ✨ Coffee Beans & Cafe Merch
    { name: 'AM Jaffna Roast Whole Bean (250g)', price: 15.00, stock: 25 },
    { name: 'Ethiopian Yirgacheffe Single Origin (250g)', price: 16.50, stock: 20 },
    { name: 'AM Cafe Matte Black Ceramic Mug (350ml)', price: 16.00, stock: 20 },
    { name: 'Barista Vacuum Insulated Tumbler (500ml)', price: 22.00, stock: 15 }
  ];

  try {
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
    res.json({ message: 'am_cafe menu seeded successfully', products: all });
  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).json({ error: 'Failed to seed am_cafe menu' });
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
