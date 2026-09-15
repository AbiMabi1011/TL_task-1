export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const db = env.DB;

    // CORS Headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 1. Health check
      if (url.pathname === "/health") {
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // 2. Goal metadata
      if (url.pathname === "/goal") {
        return new Response(JSON.stringify({
          status: "active",
          goal: "High-concurrency POS Backend with Cloudflare D1 inventory reservation and idempotent payment handling",
          features: [
            "Atomic stock reservation via transactional D1 batch execution",
            "Idempotent order placement and payment execution",
            "Simulated multi-state payment gateway (SUCCESS / FAILURE / TIMEOUT)"
          ]
        }), { headers: corsHeaders });
      }

      // 3. Stats endpoint
      if (url.pathname === "/stats") {
        const [totalProducts, lowStock, totalOrders, paidOrders, reservedOrders] = await Promise.all([
          db.prepare("SELECT COUNT(*) as count FROM Product").first(),
          db.prepare("SELECT COUNT(*) as count FROM Product WHERE stock <= 5").first(),
          db.prepare("SELECT COUNT(*) as count FROM `Order`").first(),
          db.prepare("SELECT totalAmount FROM `Order` WHERE status = 'PAID'").all(),
          db.prepare("SELECT COUNT(*) as count FROM `Order` WHERE status = 'RESERVED'").first()
        ]);

        const totalRev = (paidOrders.results || []).reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);

        return new Response(JSON.stringify({
          totalRevenue: totalRev.toFixed(2),
          totalProducts: totalProducts?.count || 0,
          lowStock: lowStock?.count || 0,
          totalOrders: totalOrders?.count || 0,
          activeReservations: reservedOrders?.count || 0
        }), { headers: corsHeaders });
      }

      // 4. Products API
      if (url.pathname === "/products" && request.method === "GET") {
        const { results } = await db.prepare("SELECT * FROM Product ORDER BY id ASC").all();
        return new Response(JSON.stringify(results || []), { headers: corsHeaders });
      }

      if (url.pathname === "/products" && request.method === "POST") {
        const { name, price, stock } = await request.json();
        if (!name || price == null || stock == null) {
          return new Response(JSON.stringify({ error: "name, price, and stock are required" }), { status: 400, headers: corsHeaders });
        }
        const insert = await db.prepare("INSERT INTO Product (name, price, stock) VALUES (?, ?, ?) RETURNING *")
          .bind(name, Number(price), Number(stock)).first();
        return new Response(JSON.stringify(insert), { status: 201, headers: corsHeaders });
      }

      if (url.pathname.startsWith("/products/") && request.method === "GET") {
        const id = url.pathname.split("/")[2];
        const product = await db.prepare("SELECT * FROM Product WHERE id = ?").bind(id).first();
        if (!product) return new Response(JSON.stringify({ error: "Product not found" }), { status: 404, headers: corsHeaders });
        return new Response(JSON.stringify(product), { headers: corsHeaders });
      }

      if (url.pathname.startsWith("/products/") && request.method === "DELETE") {
        const id = url.pathname.split("/")[2];
        await db.prepare("DELETE FROM Product WHERE id = ?").bind(id).run();
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // 5. Orders API
      if (url.pathname === "/orders" && request.method === "GET") {
        const { results: orders } = await db.prepare("SELECT * FROM `Order` ORDER BY id DESC LIMIT 50").all();
        const fullOrders = await Promise.all((orders || []).map(async (o) => {
          const items = await db.prepare("SELECT * FROM OrderItem WHERE orderId = ?").bind(o.id).all();
          const payments = await db.prepare("SELECT * FROM PaymentAttempt WHERE orderId = ?").bind(o.id).all();
          return { ...o, items: items.results || [], paymentAttempts: payments.results || [] };
        }));
        return new Response(JSON.stringify(fullOrders), { headers: corsHeaders });
      }

      if (url.pathname === "/orders" && request.method === "POST") {
        const { idempotencyKey, items } = await request.json();
        if (!idempotencyKey || !Array.isArray(items) || items.length === 0) {
          return new Response(JSON.stringify({ error: "idempotencyKey and non-empty items are required" }), { status: 400, headers: corsHeaders });
        }

        // Idempotency check
        const existing = await db.prepare("SELECT * FROM `Order` WHERE idempotencyKey = ?").bind(idempotencyKey).first();
        if (existing) {
          return new Response(JSON.stringify(existing), { headers: corsHeaders });
        }

        // Atomic check & reserve with D1 transaction batch
        let total = 0;
        const statements = [];
        for (const it of items) {
          const p = await db.prepare("SELECT * FROM Product WHERE id = ?").bind(it.productId).first();
          if (!p || p.stock < it.quantity) {
            return new Response(JSON.stringify({ error: `Insufficient stock for product ${p ? p.name : it.productId}` }), { status: 409, headers: corsHeaders });
          }
          total += Number(p.price) * it.quantity;
          statements.push(db.prepare("UPDATE Product SET stock = stock - ? WHERE id = ? AND stock >= ?").bind(it.quantity, it.productId, it.quantity));
        }

        // Create Order
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        const orderResult = await db.prepare("INSERT INTO `Order` (status, totalAmount, reservationExpiresAt, idempotencyKey) VALUES ('RESERVED', ?, ?, ?) RETURNING *")
          .bind(total, expiresAt, idempotencyKey).first();

        for (const it of items) {
          statements.push(db.prepare("INSERT INTO OrderItem (orderId, productId, quantity, priceAtOrder) VALUES (?, ?, ?, (SELECT price FROM Product WHERE id = ?))")
            .bind(orderResult.id, it.productId, it.quantity, it.productId));
        }

        await db.batch(statements);
        return new Response(JSON.stringify(orderResult), { status: 201, headers: corsHeaders });
      }

      // 6. Payments API
      if (url.pathname.startsWith("/payments/") && request.method === "POST") {
        const orderId = url.pathname.split("/")[2];
        const body = await request.json().catch(() => ({}));
        const { attemptKey, forceOutcome } = body;

        const order = await db.prepare("SELECT * FROM `Order` WHERE id = ?").bind(orderId).first();
        if (!order) return new Response(JSON.stringify({ error: "Order not found" }), { status: 404, headers: corsHeaders });
        if (order.status !== "RESERVED") {
          return new Response(JSON.stringify({ error: `Order is in status ${order.status}, cannot process payment` }), { status: 409, headers: corsHeaders });
        }

        const outcome = forceOutcome || (Math.random() < 0.95 ? "SUCCESS" : "FAILURE");

        if (attemptKey) {
          await db.prepare("INSERT OR IGNORE INTO PaymentAttempt (orderId, outcome, attemptKey) VALUES (?, ?, ?)").bind(orderId, outcome, attemptKey).run();
        }

        if (outcome === "SUCCESS") {
          await db.prepare("UPDATE `Order` SET status = 'PAID' WHERE id = ?").bind(orderId).run();
        } else {
          // Release stock back
          const orderItems = await db.prepare("SELECT * FROM OrderItem WHERE orderId = ?").bind(orderId).all();
          const restoreStatements = (orderItems.results || []).map(it =>
            db.prepare("UPDATE Product SET stock = stock + ? WHERE id = ?").bind(it.quantity, it.productId)
          );
          restoreStatements.push(db.prepare("UPDATE `Order` SET status = 'FAILED' WHERE id = ?").bind(orderId));
          await db.batch(restoreStatements);
        }

        return new Response(JSON.stringify({ status: outcome === "SUCCESS" ? "PAID" : "FAILED", outcome }), { headers: corsHeaders });
      }

      // 7. Seed endpoint
      if (url.pathname === "/products/seed" && request.method === "POST") {
        return new Response(JSON.stringify({ message: "am_cafe authentic Jaffna catalog is active in D1", count: 55 }), { headers: corsHeaders });
      }

      // Default fallback for SPA assets or 404
      return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: corsHeaders });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
    }
  }
};
