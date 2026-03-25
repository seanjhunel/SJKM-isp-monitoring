const express = require('express');
const router = express.Router();
const db = require('../database');

// ─── Apply for Internet ───
router.post('/apply', (req, res) => {
  try {
    const { full_name, address, contact, email, desired_plan, message } = req.body;
    if (!full_name || !address || !contact) {
      return res.status(400).json({ error: 'Name, address, and contact are required' });
    }
    const result = db.prepare(
      'INSERT INTO applications (full_name, address, contact, email, desired_plan, message, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(full_name, address, contact, email || '', desired_plan || 'Basic 10Mbps', message || '', 'pending');
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Submit Support Ticket ───
router.post('/support', (req, res) => {
  try {
    const { account_id, full_name, contact, subject, message, priority } = req.body;
    if (!full_name || !subject || !message) {
      return res.status(400).json({ error: 'Name, subject, and message are required' });
    }
    // If account_id provided, find client
    let clientId = null;
    if (account_id) {
      const client = db.prepare('SELECT id FROM clients WHERE account_id = ?').get(account_id);
      if (client) clientId = client.id;
    }
    const result = db.prepare(
      'INSERT INTO support_tickets (client_id, account_id, full_name, contact, subject, message, priority) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(clientId, account_id || '', full_name, contact || '', subject, message, priority || 'normal');
    res.json({ success: true, ticketId: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Customer Login (PPPoE credentials) ───
router.post('/login', (req, res) => {
  const { pppoe_user, pppoe_pass } = req.body;
  const client = db.prepare('SELECT * FROM clients WHERE pppoe_user = ? AND pppoe_pass = ?').get(pppoe_user, pppoe_pass);
  if (client) {
    req.session.customer = { id: client.id, accountId: client.account_id, name: client.full_name, pppoeUser: client.pppoe_user };
    res.json({ success: true, customer: { id: client.id, accountId: client.account_id, name: client.full_name, pppoeUser: client.pppoe_user } });
  } else {
    res.status(401).json({ error: 'Invalid PPPoE Username or Password' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// ─── View SOA ───
router.get('/soa/:accountId', (req, res) => {
  try {
    const client = db.prepare('SELECT * FROM clients WHERE account_id = ?').get(req.params.accountId);
    if (!client) return res.status(404).json({ error: 'Account not found' });

    const payments = db.prepare(`
      SELECT * FROM payments WHERE client_id = ? ORDER BY due_date DESC
    `).all(client.id);

    // Calculate next payment
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextDue = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;

    res.json({
      client: {
        accountId: client.account_id,
        name: client.full_name,
        plan: client.plan,
        monthlyRate: client.monthly_rate,
        status: client.status,
        pppoeUser: client.pppoe_user,
        address: client.address,
        contact: client.contact
      },
      payments,
      nextDue
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Track Application ───
router.get('/application/track/:id', (req, res) => {
  const app = db.prepare('SELECT id, full_name, desired_plan, status, admin_notes, created_at, updated_at FROM applications WHERE id = ?').get(req.params.id);
  if (app) res.json(app);
  else res.status(404).json({ error: 'Application not found' });
});

// ─── Track Ticket ───
router.get('/ticket/track/:id', (req, res) => {
  const ticket = db.prepare('SELECT id, full_name, subject, status, admin_reply, created_at, updated_at FROM support_tickets WHERE id = ?').get(req.params.id);
  if (ticket) res.json(ticket);
  else res.status(404).json({ error: 'Ticket not found' });
});

module.exports = router;
