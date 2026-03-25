const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data', 'isp_db.json');

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

// ─── Data Persistence ───
let store = {
  admin_users: [],
  clients: [],
  payments: [],
  applications: [],
  support_tickets: []
};

function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2));
  } catch (err) {
    console.error('❌ Database save error:', err);
  }
}

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      store = JSON.parse(data);
      console.log('📦 Database loaded from disk.');
    }
  } catch (err) {
    console.error('❌ Database load error, using empty store.', err);
  }
}

loadDb();

// ─── Mock Database Functions ───
const db = {
  prepare: (sql) => {
    return {
      get: (...args) => {
        if (sql.includes('SELECT COUNT(*) as c FROM admin_users')) {
          return { c: store.admin_users.length };
        }
        if (sql.includes('SELECT * FROM admin_users WHERE username = ?')) {
          return store.admin_users.find(u => u.username === args[0]);
        }
        if (sql.includes('FROM clients WHERE id = ?')) {
          const id = parseInt(args[0]);
          return store.clients.find(c => c.id === id);
        }
        if (sql.includes('SELECT * FROM clients WHERE account_id = ?')) {
          return store.clients.find(c => c.account_id === args[0] || c.id === args[0] || c.id == args[0]);
        }
        if (sql.includes('FROM clients WHERE pppoe_user = ? AND pppoe_pass = ?')) {
          return store.clients.find(c => c.pppoe_user === args[0] && String(c.pppoe_pass) === String(args[1]));
        }
        if (sql.includes('FROM clients WHERE pppoe_user = ?')) {
          return store.clients.find(c => c.pppoe_user === args[0]);
        }
        if (sql.includes('SELECT id FROM clients ORDER BY id DESC LIMIT 1')) {
          return store.clients.length > 0 ? store.clients[store.clients.length - 1] : null;
        }
        if (sql.includes('SELECT * FROM payments WHERE client_id = ?')) {
          return store.payments.find(p => p.client_id === args[0]);
        }
        if (sql.includes('SELECT COUNT(*) as count FROM clients')) {
          const status = sql.match(/status = '([^']+)'/);
          if (status) return { count: store.clients.filter(c => c.status === status[1]).length };
          return { count: store.clients.length };
        }
        if (sql.includes('SELECT COALESCE(SUM(amount), 0) as total FROM payments')) {
          return { total: store.payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0) };
        }
        if (sql.includes('SELECT COUNT(*) as count FROM applications WHERE status = \'pending\'')) {
          return { count: store.applications.filter(a => a.status === 'pending').length };
        }
        if (sql.includes('SELECT COUNT(*) as count FROM support_tickets WHERE status = \'open\'')) {
          return { count: store.support_tickets.filter(t => t.status === 'open').length };
        }
        return null;
      },
      all: (...args) => {
        if (sql.includes('FROM clients')) return [...store.clients].reverse();
        if (sql.includes('FROM applications')) return [...store.applications].reverse();
        if (sql.includes('FROM support_tickets')) return [...store.support_tickets].reverse();
        if (sql.includes('FROM payments')) {
          if (sql.includes('WHERE client_id')) {
            return store.payments.filter(p => p.client_id === args[0] || p.client_id == args[0]);
          }
          // Admin payments view with joins
          return store.payments.map(p => {
             const c = store.clients.find(cl => cl.id === p.client_id);
             return { ...p, full_name: c ? c.full_name : 'Unknown', account_id: c ? c.account_id : '?', plan: c ? c.plan : '?' };
          }).reverse();
        }
        return [];
      },
      run: (...args) => {
        let result = { changes: 1, lastInsertRowid: 1 };
        
        if (sql.includes('INSERT INTO admin_users')) {
          store.admin_users.push({ id: store.admin_users.length + 1, username: args[0], password: args[1], full_name: args[2] });
          result.lastInsertRowid = store.admin_users.length;
        } else if (sql.includes('INSERT INTO clients')) {
          const client = {
            id: store.clients.length + 1,
            account_id: args[0], full_name: args[1], address: args[2] || '', contact: args[3] || '',
            email: args[4] || '', pppoe_user: args[5], pppoe_pass: args[6], plan: args[7],
            monthly_rate: args[8] || 899, vlan_id: args[9] || 100, olt_port: args[10] || '1/1/1', status: args[11] || 'active',
            ip_address: args[12] || '', mac_address: args[13] || '', signal_strength: args[14] || '',
            installation_date: args[15] || new Date().toISOString().split('T')[0],
            created_at: new Date().toISOString()
          };
          store.clients.push(client);
          result.lastInsertRowid = client.id;
        } else if (sql.includes('INSERT INTO payments')) {
          store.payments.push({ id: store.payments.length + 1, client_id: args[0], amount: args[1], payment_date: args[2], due_date: args[3], method: args[4], status: args[5], created_at: new Date().toISOString() });
          result.lastInsertRowid = store.payments.length;
        } else if (sql.includes('INSERT INTO applications')) {
          const app = { 
            id: store.applications.length + 1, 
            full_name: args[0], 
            address: args[1], 
            contact: args[2], 
            email: args[3], 
            desired_plan: args[4], 
            message: args[5], 
            status: args[6] || 'pending', 
            created_at: new Date().toISOString() 
          };
          store.applications.push(app);
          result.lastInsertRowid = app.id;
        } else if (sql.includes('INSERT INTO support_tickets')) {
          // Both admin and customer pass 7 args now
          const ticket = {
            id: store.support_tickets.length + 1,
            client_id: args[0],
            account_id: args[1],
            full_name: args[2],
            contact: args[3],
            subject: args[4],
            message: args[5],
            priority: args[6] || 'normal',
            status: 'open',
            created_at: new Date().toISOString()
          };
          store.support_tickets.push(ticket);
          result.lastInsertRowid = ticket.id;
        } else if (sql.includes('UPDATE clients SET pppoe_pass = ?')) {
          const c = store.clients.find(c => c.id === args[2]);
          if(c) { c.pppoe_pass = args[0]; c.plan = args[1]; }
        } else if (sql.includes('UPDATE clients SET status')) {
          const c = store.clients.find(c => c.id === args[1]);
          if(c) c.status = args[0];
        } else if (sql.includes('UPDATE clients SET full_name = ?')) {
          // UPDATE clients SET full_name = ?, email = ?, contact = ?, plan = ?, 
          // pppoe_user = ?, pppoe_pass = ?, installation_date = ?, 
          // address = ?, monthly_rate = ?, updated_at = CURRENT_TIMESTAMP
          // WHERE id = ?
          const id = parseInt(args[args.length - 1]);
          const c = store.clients.find(c => c.id === id);
          if (c) {
            c.full_name = args[0];
            c.email = args[1];
            c.contact = args[2];
            c.plan = args[3];
            c.pppoe_user = args[4];
            c.pppoe_pass = args[5];
            c.installation_date = args[6];
            c.address = args[7];
            c.monthly_rate = args[8];
            c.updated_at = new Date().toISOString();
          }
        } else if (sql.includes('DELETE FROM clients WHERE id = ?')) {
          const id = parseInt(args[0]);
          store.clients = store.clients.filter(c => c.id !== id);
        } else if (sql.includes('UPDATE applications SET status')) {
          const id = parseInt(args[3]);
          const a = store.applications.find(c => c.id === id);
          if(a){ a.status = args[0]; a.admin_notes = args[1]; a.reviewed_by = args[2]; a.updated_at = new Date().toISOString(); }
        } else if (sql.includes('UPDATE support_tickets SET status')) {
          const id = parseInt(args[3]);
          const t = store.support_tickets.find(c => c.id === id);
          if(t) { t.status = args[0]; t.admin_reply = args[1]; t.replied_by = args[2]; t.updated_at = new Date().toISOString(); }
        }
        
        saveDb();
        return result;
      }
    };
  },
  exec: () => { /* No-op */ }
};

// ─── Seed Demo Data ───
function seedData() {
  if (store.admin_users.length > 0) return; // Already seeded

  console.log('🌱 Seeding demo data into persistent store...');

  // Admin user
  db.prepare('INSERT INTO admin_users (username, password, full_name) VALUES (?, ?, ?)').run('admin', 'admin123', 'System Administrator');

  // Demo clients
  const plans = [
    { name: 'UP TO 15Mbps', rate: 1 },
    { name: 'Standard 25Mbps', rate: 1299 },
    { name: 'Premium 50Mbps', rate: 1899 },
    { name: 'Ultra 100Mbps', rate: 2499 },
    { name: 'Business 200Mbps', rate: 3999 }
    { name: 'UP TO15Mbps', rate: 899 },
    { name: 'UP TO25Mbps', rate: 1000 },
    { name: 'UP TO30Mbps', rate: 1500 },
    { name: 'UP TO50Mbps', rate: 2000 },
    
  ];

  const clients = [
    { name: 'Juan Dela Cruz', addr: 'Brgy. San Jose, Cabanatuan City', contact: '09171234567', email: 'juan@email.com' },
    { name: 'Maria Santos', addr: 'Brgy. Sumacab Este, Cabanatuan City', contact: '09181234567', email: 'maria@email.com' },
    { name: 'Pedro Reyes', addr: 'Brgy. Aduas Norte, Cabanatuan City', contact: '09191234567', email: 'pedro@email.com' },
    { name: 'Ana Garcia', addr: 'Brgy. Bakero, Cabanatuan City', contact: '09201234567', email: 'ana@email.com' },
    { name: 'Jose Rizal Jr.', addr: 'Brgy. Pagas, Cabanatuan City', contact: '09211234567', email: 'jose@email.com' },
    { name: 'Carmen Aquino', addr: 'Brgy. Imelda, Cabanatuan City', contact: '09221234567', email: 'carmen@email.com' },
    { name: 'Roberto Luna', addr: 'Brgy. Valle Cruz, Cabanatuan City', contact: '09231234567', email: 'roberto@email.com' },
    { name: 'Sophia Lim', addr: 'Brgy. Dicarma, Cabanatuan City', contact: '09241234567', email: 'sophia@email.com' },
    { name: 'Miguel Torres', addr: 'Brgy. Sangitan East, Cabanatuan City', contact: '09251234567', email: 'miguel@email.com' },
    { name: 'Grace Mendoza', addr: 'Brgy. Hermogenes, Cabanatuan City', contact: '09261234567', email: 'grace@email.com' },
    { name: 'Antonio Bautista', addr: 'Brgy. Zulueta, Cabanatuan City', contact: '09271234567', email: 'antonio@email.com' },
    { name: 'Lisa Fernandez', addr: 'Brgy. Kapitan Pepe, Cabanatuan City', contact: '09281234567', email: 'lisa@email.com' }
  ];

  const insertClient = db.prepare('INSERT INTO clients');
  const insertPayment = db.prepare('INSERT INTO payments');
  const statuses = ['active', 'active', 'active', 'active', 'active', 'active', 'active', 'active', 'offline', 'active', 'disabled', 'active'];

  clients.forEach((c, i) => {
    const plan = plans[i % plans.length];
    const vlan = 100 + (i % 4);
    const port = `gpon-olt_1/1/${(i % 8) + 1}`;
    const ip = `10.10.${vlan - 100}.${10 + i}`;
    const mac = `AA:BB:CC:DD:${String(i).padStart(2, '0')}:${String(i + 10).padStart(2, '0')}`;
    const signal = `${-(20 + Math.floor(Math.random() * 8)).toFixed(1)} dBm`;
    const accId = `ACC-${1001 + i}`;
    const pppoeUser = `jkl_${c.name.split(' ')[0].toLowerCase()}${1001 + i}`;

    insertClient.run(accId, c.name, c.addr, c.contact, c.email, pppoeUser, 'pass123', plan.name, plan.rate, vlan, port, statuses[i], ip, mac, signal);

    for (let m = 0; m < 3; m++) {
      const month = new Date();
      month.setMonth(month.getMonth() - m);
      const due = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-01`;
      const paid = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 5) + 1).padStart(2, '0')}`;
      const payStatus = m === 0 && i >= 10 ? 'overdue' : 'paid';
      insertPayment.run(i + 1, plan.rate, payStatus === 'paid' ? paid : null, due, 'cash', payStatus);
    }
  });

  // Demo applications
  const insertApp = db.prepare('INSERT INTO applications');
  insertApp.run('Carlo Dizon', 'Brgy. Mabini, Cabanatuan City', '09301234567', 'carlo@email.com', 'Standard 25Mbps', 'Hi, I want internet for my home office.', 'pending');
  insertApp.run('Jenny Ramos', 'Brgy. San Isidro, Cabanatuan City', '09311234567', 'jenny@email.com', 'Premium 50Mbps', 'Need fast internet for online classes.', 'pending');
  insertApp.run('Mark Villanueva', 'Brgy. Pamaldan, Cabanatuan City', '09321234567', 'mark@email.com', 'Basic 10Mbps', 'Budget plan for household use.', 'approved');

  // Demo tickets
  const insertTicket = db.prepare('INSERT INTO support_tickets');
  insertTicket.run('ACC-1001', 'Juan Dela Cruz', '09171234567', 'Slow Internet Speed', 'My internet has been very slow since yesterday. Please check.', 'high', 'open');
  insertTicket.run('ACC-1003', 'Pedro Reyes', '09191234567', 'Intermittent Connection', 'Connection keeps dropping every 30 minutes.', 'normal', 'open');
  insertTicket.run('ACC-1005', 'Jose Rizal Jr.', '09211234567', 'Request for Plan Upgrade', 'I would like to upgrade my plan to Premium 50Mbps.', 'low', 'closed');

  console.log('✅ Demo data seeded successfully!');
}

seedData();

module.exports = db;
