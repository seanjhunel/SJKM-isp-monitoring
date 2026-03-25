const express = require('express');
const router = express.Router();
const db = require('../database');
const mikrotik = require('../mikrotik');

// ─── Auth Middleware ───
function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ─── Login ───
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ? AND password = ?').get(username, password);
  if (user) {
    req.session.admin = { id: user.id, username: user.username, fullName: user.full_name };
    res.json({ success: true, user: req.session.admin });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

router.get('/session', (req, res) => {
  if (req.session && req.session.admin) {
    res.json({ loggedIn: true, user: req.session.admin });
  } else {
    res.json({ loggedIn: false });
  }
});

// ─── Dashboard Stats ───
router.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    const clients = db.prepare('SELECT * FROM clients').all();
    const totalClients = clients.length;
    
    // Get live PPPoE sessions from MikroTik
    const activeSessions = await mikrotik.getActivePPPoE();
    const onlineUsernames = new Set(activeSessions.map(s => s.name));
    
    // Calculate real-time stats
    const onlineSessionsCount = activeSessions.length;
    const offlineClientsCount = totalClients - onlineSessionsCount;
    
    // Revenue and other stats
    const totalRevenue = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'paid'").get().total;
    const pendingApps = db.prepare("SELECT COUNT(*) as count FROM applications WHERE status = 'pending'").get().count;
    const openTickets = db.prepare("SELECT COUNT(*) as count FROM support_tickets WHERE status = 'open'").get().count;

    const traffic = await mikrotik.getTraffic();

    res.json({
      stats: {
        totalClients,
        activeClients: onlineSessionsCount, // Online right now
        offlineClients: Math.max(0, offlineClientsCount), // Registered but not connected
        onlineSessions: onlineSessionsCount,
        totalRevenue,
        pendingApps,
        openTickets
      },
      activeSessions,
      traffic
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Clients (PPPoE Monitoring with Real-time Status) ───
router.get('/clients', requireAdmin, async (req, res) => {
  try {
    const clients = db.prepare('SELECT * FROM clients ORDER BY id DESC').all();
    const activeSessions = await mikrotik.getActivePPPoE();
    const onlineMap = new Map(activeSessions.map(s => [s.name, s]));
    
    // Merge real-time status into client data
    const clientsWithStatus = clients.map(c => {
      const session = onlineMap.get(c.pppoe_user);
      return {
        ...c,
        is_online: !!session,
        uptime: session ? session.uptime : null,
        ip_address: session ? session.address : c.ip_address,
        caller_id: session ? session.callerId : (c.mac_address || '')
      };
    });
    
    res.json(clientsWithStatus);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/clients/:id', requireAdmin, (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (client) res.json(client);
  else res.status(404).json({ error: 'Client not found' });
});

// Toggle route removed as per user request

// ─── Applications ───
router.get('/applications', requireAdmin, (req, res) => {
  const apps = db.prepare('SELECT * FROM applications ORDER BY created_at DESC').all();
  res.json(apps);
});

router.put('/applications/:id', requireAdmin, (req, res) => {
  const { status, admin_notes } = req.body;
  db.prepare('UPDATE applications SET status = ?, admin_notes = ?, reviewed_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(status, admin_notes || '', req.session.admin.fullName, req.params.id);
  res.json({ success: true });
});

// ─── Support Tickets ───
router.get('/tickets', requireAdmin, (req, res) => {
  const tickets = db.prepare('SELECT * FROM support_tickets ORDER BY created_at DESC').all();
  res.json(tickets);
});

router.put('/tickets/:id', requireAdmin, (req, res) => {
  const { status, admin_reply } = req.body;
  db.prepare('UPDATE support_tickets SET status = ?, admin_reply = ?, replied_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(status, admin_reply || '', req.session.admin.fullName, req.params.id);
  res.json({ success: true });
});

// ─── Payments ───
router.get('/payments', requireAdmin, (req, res) => {
  const payments = db.prepare(`
    SELECT p.*, c.full_name, c.account_id, c.plan 
    FROM payments p 
    JOIN clients c ON p.client_id = c.id 
    ORDER BY p.created_at DESC
  `).all();
  res.json(payments);
});

// Create new client
router.post('/clients', requireAdmin, async (req, res) => {
  try {
    const { 
      full_name, email, contact, plan, pppoe_user, pppoe_pass, 
      installation_date, address, monthly_rate, vlan_id, olt_port 
    } = req.body;

    if (!full_name || !pppoe_user || !pppoe_pass) {
      return res.status(400).json({ error: 'Name, PPPoE user and password are required' });
    }

    // 1. Create on MikroTik
    try {
      await mikrotik.addPPPoESecret(pppoe_user, pppoe_pass, plan || 'Basic', full_name);
    } catch (err) {
      console.error('MikroTik sync failed during client creation:', err.message);
      // We continue even if MikroTik fails, as it might be offline
    }

    // 2. Save to Database
    const account_id = 'ACC-' + (1000 + Math.floor(Math.random() * 9000));
    db.prepare(`
      INSERT INTO clients (
        account_id, full_name, address, contact, email, 
        pppoe_user, pppoe_pass, plan, monthly_rate, 
        vlan_id, olt_port, status, ip_address, mac_address, 
        signal_strength, installation_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      account_id, full_name, address || '', contact || '', email || '',
      pppoe_user, pppoe_pass, plan || 'Basic', monthly_rate || 899,
      vlan_id || 100, olt_port || '1/1/1', 'active', '', '', '',
      installation_date || new Date().toISOString().split('T')[0]
    );

    res.status(201).json({ success: true, account_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// Update client
router.put('/clients/:id', requireAdmin, async (req, res) => {
  try {
    const { 
      full_name, email, contact, plan, pppoe_user, pppoe_pass, 
      installation_date, address, monthly_rate 
    } = req.body;
    
    const existing = db.prepare('SELECT pppoe_user FROM clients WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Client not found' });

    // 1. Update on MikroTik
    try {
      await mikrotik.updatePPPoESecret(existing.pppoe_user, {
        name: pppoe_user,
        password: pppoe_pass,
        profile: plan || 'Basic',
        comment: full_name
      });
    } catch (err) {
      console.error('MikroTik sync failed during client update:', err.message);
    }

    // 2. Update in Database
    db.prepare(`
      UPDATE clients SET 
        full_name = ?, email = ?, contact = ?, plan = ?, 
        pppoe_user = ?, pppoe_pass = ?, installation_date = ?, 
        address = ?, monthly_rate = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      full_name, email, contact, plan, pppoe_user, pppoe_pass, 
      installation_date, address, monthly_rate || 899, req.params.id
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// Delete client (local database only - does NOT touch MikroTik)
router.delete('/clients/:id', requireAdmin, async (req, res) => {
  try {
    const existing = db.prepare('SELECT pppoe_user FROM clients WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Client not found' });

    // Only remove from local database - MikroTik PPPoE secrets are NOT touched
    db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

// Push all local secrets to MikroTik
router.post('/push-to-mikrotik', requireAdmin, async (req, res) => {
  try {
    const clients = db.prepare('SELECT pppoe_user, pppoe_pass, plan, full_name FROM clients').all();
    let pushed = 0;
    let skipped = 0;
    let errors = 0;

    for (const c of clients) {
      try {
        const success = await mikrotik.addPPPoESecret(c.pppoe_user, c.pppoe_pass, c.plan, c.full_name);
        if (success === true) pushed++;
        else skipped++;
      } catch (err) {
        errors++;
      }
    }

    res.json({ success: true, pushed, skipped, errors });
  } catch (err) {
    res.status(500).json({ error: 'Push failed' });
  }
});

// ─── MikroTik Sync ───
router.post('/sync-mikrotik', requireAdmin, async (req, res) => {
  try {
    const secrets = await mikrotik.getPPPoESecrets();
    let imported = 0;
    let updated = 0;

    for (const s of secrets) {
      const existing = db.prepare('SELECT id FROM clients WHERE pppoe_user = ?').get(s.name);
      
      if (!existing) {
        // Create new client from secret
        const lastClient = db.prepare('SELECT id FROM clients ORDER BY id DESC LIMIT 1').get();
        const nextId = lastClient ? lastClient.id + 1 : 1001;
        const accId = `ACC-${1000 + nextId}`;
        
        db.prepare(`
          INSERT INTO clients (
            account_id, full_name, address, contact, email, 
            pppoe_user, pppoe_pass, plan, monthly_rate, 
            vlan_id, olt_port, status, ip_address, mac_address, 
            signal_strength, installation_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          accId, s.comment || s.name, '', '', '', 
          s.name, s.password, s.profile, 899,
          100, '1/1/1', 'active', '', '', '',
          new Date().toISOString().split('T')[0]
        );
        imported++;
      } else {
        // Update existing client credentials
        db.prepare('UPDATE clients SET pppoe_pass = ?, plan = ? WHERE id = ?')
          .run(s.password, s.profile, existing.id);
        updated++;
      }
    }

    res.json({ success: true, imported, updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

