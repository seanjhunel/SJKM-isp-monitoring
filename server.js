const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const db = require('./database');
const mikrotik = require('./mikrotik');
const adminRoutes = require('./routes/admin');
const customerRoutes = require('./routes/customer');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'isp-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Static files
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));
app.use('/customer', express.static(path.join(__dirname, 'public', 'customer')));
app.use('/shared', express.static(path.join(__dirname, 'public', 'shared')));

// API Routes
app.use('/api/admin', adminRoutes);
app.use('/api/customer', customerRoutes);

// Root redirect
app.get('/', (req, res) => {
  res.redirect('/customer/');
});

// ─── Start ───
async function start() {
  // Start the web server immediately
  app.listen(PORT, () => {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║           ISP MONITORING SYSTEM                 ║');
    console.log('║══════════════════════════════════════════════════║');
    console.log(`║  🔧 Admin Portal:    http://localhost:${PORT}/admin/    ║`);
    console.log(`║  🌐 Customer Portal: http://localhost:${PORT}/customer/ ║`);
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
  });

  // Try connecting to MikroTik in the background
  try {
    await mikrotik.connect();
  } catch (err) {
    console.warn('⚠️  MikroTik currently unreachable. Retrying later... (Admin/Customer portals are still running!)');
  }
}

start().catch(err => {
  console.error('❌ CRITICAL: Server failed to start:', err);
  process.exit(1);
});
