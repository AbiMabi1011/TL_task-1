const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

// SEED DEMO PRODUCTS
router.post('/seed', async (req, res) => {
  const defaultItems = [
    { name: 'Cold Brew Reserve (16oz)', price: 4.75, stock: 45 },
    { name: 'Caramel Macchiato', price: 5.25, stock: 35 },
    { name: 'Matcha Latte Organic', price: 5.50, stock: 25 },
    { name: 'Artisan Butter Croissant', price: 3.80, stock: 18 },
    { name: 'Dark Chocolate Cookie', price: 2.95, stock: 50 },
    { name: 'Avocado Sourdough Toast', price: 8.50, stock: 12 },
    { name: 'Techloom Ceramic Mug 350ml', price: 16.00, stock: 20 },
    { name: 'Single Origin Whole Bean (250g)', price: 14.50, stock: 15 },
    { name: 'Organic Sparkling Water', price: 2.50, stock: 60 }
  ];

  try {
    for (const item of defaultItems) {
      const existing = await prisma.product.findFirst({ where: { name: item.name } });
      if (!existing) {
        await prisma.product.create({ data: item });
      }
    }
    const all = await prisma.product.findMany({ orderBy: { id: 'asc' } });
    res.json({ message: 'Catalog seeded successfully', products: all });
  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).json({ error: 'Failed to seed products' });
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
