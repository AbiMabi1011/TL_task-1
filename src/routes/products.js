const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

// SEED DEMO PRODUCTS FOR AM_CAFE
router.post('/seed', async (req, res) => {
  const defaultItems = [
    // Coffee & Specialty Brews
    { name: 'AM Espresso Double Shot', price: 3.50, stock: 60 },
    { name: 'AM Signature Cold Brew (16oz)', price: 4.80, stock: 45 },
    { name: 'Spanish Vanilla Latte', price: 5.25, stock: 40 },
    { name: 'Caramel Cloud Macchiato', price: 5.40, stock: 35 },
    { name: 'Kyoto Drip Iced Coffee', price: 5.00, stock: 30 },
    { name: 'Ceylon Spiced Chai Latte', price: 4.60, stock: 40 },
    { name: 'Organic Ceremonial Matcha Latte', price: 5.50, stock: 25 },
    // Fresh Bakery & Pastries
    { name: 'Flaky Golden Croissant', price: 3.75, stock: 25 },
    { name: 'Almond Frangipane Croissant', price: 4.50, stock: 18 },
    { name: 'Blueberry Cream Cheese Muffin', price: 3.95, stock: 30 },
    { name: 'Double Fudge Belgian Cookie', price: 2.95, stock: 50 },
    // Cafe Breakfast & Mains
    { name: 'Avocado Poached Egg Toast', price: 8.50, stock: 15 },
    { name: 'Smoked Salmon Brioche Bagel', price: 9.80, stock: 12 },
    { name: 'Truffle Mushroom Panini', price: 8.90, stock: 16 },
    // Cafe Merchandise & Beans
    { name: 'AM Cafe Ceramic Mug 350ml', price: 16.00, stock: 20 },
    { name: 'AM Jaffna Roast Whole Bean (250g)', price: 15.00, stock: 20 },
    { name: 'San Pellegrino Sparkling (500ml)', price: 2.75, stock: 50 }
  ];

  try {
    for (const item of defaultItems) {
      const existing = await prisma.product.findFirst({ where: { name: item.name } });
      if (!existing) {
        await prisma.product.create({ data: item });
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
