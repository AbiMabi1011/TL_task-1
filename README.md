# am_cafe — Specialty Coffee & Artisan Bakery POS ☕🇱🇰

> **Brand**: am_cafe  
> **Location**: Hospital Road, Jaffna, Sri Lanka 🇱🇰  
> Concurrency-safe, enterprise-grade Point of Sale (POS) system tailored for cafes, specialty roasters, and bakeries. Built with Node.js, Express, Prisma ORM, and MySQL.

---

## 🌟 Key Features

1. **Concurrency-Safe Stock Reservation**:
   - Atomic decrement using Prisma transactions and MySQL row-level locking (`UPDATE ... WHERE stock >= qty`).
   - Strictly prevents overselling under heavy simultaneous traffic (guarantees zero race conditions).

2. **5-Minute Auto-Release Reservation Sweeper**:
   - Orders place reserved stock on hold.
   - Background worker sweeps every 30 seconds to automatically release stock back to shelves if payment is not completed within 5 minutes.

3. **Idempotency Safeguard**:
   - Prevents double charging and duplicate order submissions using unique client `idempotencyKey` headers.

4. **Multi-Tender & Split Payments**:
   - Credit Card gateway simulation (Success, Decline, Timeout).
   - Cash tender with real-time change calculator.
   - Split Tender (part cash + remaining on card).

5. **Manager PIN Security (Role-Based Access)**:
   - Protected actions (Order Refunds, Adding Inventory) require 4-digit Manager PIN verification (Default: `1234`).

6. **Customer Thermal Receipts & Shift Z-Reports**:
   - Printable thermal receipts with Jaffna store details and custom greeting.
   - Shift reconciliation with drawer float and sales totals.
   - One-click CSV sales ledger export.

7. **Interactive 10x Concurrency Duel Simulator**:
   - Built-in test suite in the UI that fires 10 simultaneous asynchronous requests for a single inventory item to visually demonstrate that 1 buyer wins and 9 are safely blocked (`409 Conflict`).

---

## 🚀 Quick Start

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [MySQL](https://www.mysql.com/) (v8.0+)

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/AbiMabi1011/TL_task-1.git
cd TL_task-1

# Install dependencies
npm install
```

### 3. Database Setup
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Configure your MySQL connection string in `.env`:
   ```env
   PORT=4000
   DATABASE_URL="mysql://pos_user:pos_password@localhost:3306/techloom_pos"
   ```
3. Push the Prisma schema to create the tables:
   ```bash
   npx prisma db push
   ```

### 4. Run the Application
```bash
# Start development server
npm run dev
```

Open your browser and navigate to:
```
http://localhost:4000
```

---

## 📂 Project Architecture

```
backend/
├── prisma/
│   └── schema.prisma          # Database schema (Product, Order, OrderItem, PaymentAttempt)
├── public/
│   └── index.html             # Single-Page POS Web Application UI
├── src/
│   ├── jobs/
│   │   └── expireReservations.js  # 30s background stock sweeper
│   ├── routes/
│   │   ├── orders.js          # Concurrency-safe order creation & refund
│   │   ├── payments.js        # Payment gateway simulator
│   │   └── products.js        # Inventory CRUD & catalog seeder
│   └── index.js               # Express application entry point
├── .env.example
├── package.json
└── README.md
```

---

## 🛡️ License
ISC
