const { PrismaClient } = require('@prisma/client');

// Single shared instance across the app (recommended by Prisma docs
// to avoid exhausting DB connections in dev with hot-reload).
const prisma = new PrismaClient();

module.exports = prisma;
