/* ═══════════════════════════════════════════
   ISP MONITOR — ADMIN PORTAL JAVASCRIPT
   Dashboard, Charts, Real-time Updates
   ═══════════════════════════════════════════ */

// ─── Auth Check ───
(async () => {
  try {
    const res = await fetch('/api/admin/session');
    const data = await res.json();
    if (!data.loggedIn && !window.location.pathname.includes('login')) {
      window.location.href = 'login.html';
      return;
    }
    if (data.loggedIn && document.getElementById('adminName')) {
      document.getElementById('adminName').textContent = data.user.fullName;
      const avatar = document.getElementById('adminName').closest('.admin-info')?.querySelector('.admin-avatar');
      if (avatar) avatar.textContent = data.user.fullName.charAt(0);
    }
  } catch (e) {
    if (!window.location.pathname.includes('login')) {
      window.location.href = 'login.html';
    }
  }
})();

// ─── Sidebar Toggle (Mobile) ───
const menuToggle = document.getElementById('menuToggle');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebarOverlay');

if (menuToggle) {
  menuToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
  });
}

if (overlay) {
  overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  });
}

// ─── Logout ───
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = 'login.html';
  });
}

// ─── Common Utilities ───
function formatBps(bps) {
  if (bps >= 1e9) return (bps / 1e9).toFixed(1) + ' Gbps';
  if (bps >= 1e6) return (bps / 1e6).toFixed(1) + ' Mbps';
  if (bps >= 1e3) return (bps / 1e3).toFixed(1) + ' Kbps';
  return bps + ' bps';
}

function formatCurrency(val) {
  return '₱' + Number(val).toLocaleString('en-PH', { minimumFractionDigits: 0 });
}

function updateBadge(id, count) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = count;
    el.style.display = count > 0 ? 'inline-flex' : 'none';
  }
}

// ─── Dashboard Logic ───
async function loadDashboard() {
  const isDashboard = document.getElementById('totalClients'); // Use a generic dashboard element
  if (!isDashboard) return;

  try {
    const res = await fetch('/api/admin/dashboard');
    if (res.status === 401) return window.location.href = 'login.html';
    const data = await res.json();

    // Update stats
    if (document.getElementById('totalClients')) document.getElementById('totalClients').textContent = data.stats.totalClients;
    if (document.getElementById('onlineClients')) document.getElementById('onlineClients').textContent = data.stats.activeClients;
    if (document.getElementById('offlineClients')) document.getElementById('offlineClients').textContent = data.stats.offlineClients;
    if (document.getElementById('totalRevenue')) document.getElementById('totalRevenue').textContent = formatCurrency(data.stats.totalRevenue);

    // Update badges
    updateBadge('navAppBadge', data.stats.pendingApps);
    updateBadge('navTicketBadge', data.stats.openTickets);

    // Update sessions table
    renderSessions(data.activeSessions);

    // Update timestamp
    const lastUpdate = document.getElementById('lastUpdate');
    if (lastUpdate) lastUpdate.textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (err) {
    console.error('Dashboard error:', err);
  }
}

function renderSessions(sessions) {
  const tbody = document.getElementById('sessionsTbody');
  if (!tbody) return;
  if (!sessions || !sessions.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">No active sessions</td></tr>';
    return;
  }
  tbody.innerHTML = sessions.map(s => `
    <tr>
      <td><strong>${s.name}</strong></td>
      <td>${s.address}</td>
      <td>${s.uptime}</td>
      <td><span class="bw-value bw-rx">↓ ${formatBps(s.rxBps)}</span></td>
      <td><span class="bw-value bw-tx">↑ ${formatBps(s.txBps)}</span></td>
      <td><code style="font-size:0.75rem;color:var(--text-muted)">${s.callerId}</code></td>
    </tr>
  `).join('');
}

// ─── Client Management ───
async function loadClientsTable() {
  const tbody = document.getElementById('clientsTbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/clients');
    const clients = await res.json();

    tbody.innerHTML = clients.map(c => `
      <tr>
        <td>
          <div style="font-weight:600">${c.full_name}</div>
        </td>
        <td><code style="font-size:0.85rem">${c.pppoe_user}</code></td>
        <td>${c.plan}</td>
        <td>${c.email || '-'}</td>
        <td>${c.contact || '-'}</td>
        <td><span class="status-pill active">Active</span></td>
        <td>${new Date(c.installation_date || c.created_at).toLocaleDateString()}</td>
        <td>
          <div style="display:flex;gap:0.5rem">
            <button class="btn-icon" onclick="editClient(${c.id})" title="Edit" style="background:none;border:none;cursor:pointer;color:var(--text-dim)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon" onclick="deleteClient(${c.id})" title="Delete" style="background:none;border:none;cursor:pointer;color:#ef4444">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7">Failed to load clients</td></tr>';
  }
}

window.editClient = async (id) => {
  try {
    const res = await fetch(`/api/admin/clients/${id}`);
    const client = await res.json();
    
    document.getElementById('modalTitle').textContent = 'Edit Client';
    document.getElementById('saveClientBtn').textContent = 'Update Client';
    document.getElementById('client_id').value = id;
    
    const form = document.getElementById('addClientForm');
    form.full_name.value = client.full_name;
    form.email.value = client.email || '';
    form.contact.value = client.contact || '';
    form.plan.value = client.plan;
    form.installation_date.value = client.installation_date || '';
    form.pppoe_user.value = client.pppoe_user;
    form.pppoe_pass.value = client.pppoe_pass;
    form.address.value = client.address || '';
    
    document.getElementById('addClientModal').classList.add('active');
  } catch (err) {
    alert('Failed to load client data');
  }
};

window.deleteClient = async (id) => {
  if (!confirm('Are you sure you want to delete this client? This will also attempt to remove the PPPoE secret from the MikroTik.')) return;
  
  try {
    const res = await fetch(`/api/admin/clients/${id}`, { method: 'DELETE' });
    if (res.ok) {
      loadClientsTable();
    } else {
      const data = await res.json();
      alert('Error: ' + data.error);
    }
  } catch (err) {
    alert('Failed to delete client');
  }
};

// ─── Initialize Page ───
const activeNavItem = document.querySelector('.nav-item.active');
const pageName = activeNavItem ? activeNavItem.getAttribute('data-page') : '';

if (pageName === 'dashboard') {
  loadDashboard();
  setInterval(loadDashboard, 5000);
  
  const ctxSearch = document.getElementById('sessionSearch');
  if (ctxSearch) {
    ctxSearch.addEventListener('input', () => {
      const q = ctxSearch.value.toLowerCase();
      document.querySelectorAll('#sessionsTbody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }
}

if (pageName === 'clients') {
  loadClientsTable();
  
  const addClientBtn = document.getElementById('addClientBtn');
  const addClientModal = document.getElementById('addClientModal');
  const addClientForm = document.getElementById('addClientForm');

  if (addClientBtn) {
    addClientBtn.onclick = () => {
      document.getElementById('modalTitle').textContent = 'Add New Client';
      document.getElementById('saveClientBtn').textContent = 'Create Client';
      document.getElementById('client_id').value = '';
      addClientForm.reset();
      const dateInp = document.getElementById('installDateInput');
      if (dateInp) dateInp.value = new Date().toISOString().split('T')[0];
      addClientModal.classList.add('active');
    };
  }

  document.querySelectorAll('.close-modal-btn').forEach(btn => {
    btn.onclick = () => addClientModal.classList.remove('active');
  });

  if (addClientForm) {
    addClientForm.onsubmit = async (e) => {
      e.preventDefault();
      const clientId = document.getElementById('client_id').value;
      const isEdit = !!clientId;
      const saveBtn = document.getElementById('saveClientBtn');
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<div class="spinner" style="width:14px;height:14px"></div> ${isEdit ? 'Updating...' : 'Saving...'}`;

      const formData = new FormData(addClientForm);
      const data = Object.fromEntries(formData.entries());

      try {
        const url = isEdit ? `/api/admin/clients/${clientId}` : '/api/admin/clients';
        const method = isEdit ? 'PUT' : 'POST';
        
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        const result = await res.json();
        if (res.ok) {
          alert(isEdit ? 'Client updated successfully!' : 'Client created successfully! Account ID: ' + result.account_id);
          addClientModal.classList.remove('active');
          addClientForm.reset();
          loadClientsTable();
        } else {
          alert('Error: ' + result.error);
        }
      } catch (err) {
        alert('Failed to process request');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = isEdit ? 'Update Client' : 'Create Client';
      }
    };
  }

  const clientSearch = document.getElementById('clientSearch');
  if (clientSearch) {
    clientSearch.addEventListener('input', () => {
      const q = clientSearch.value.toLowerCase();
      document.querySelectorAll('#clientsTbody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }
}

// ─── Global Features (Sync) ───
const syncBtn = document.getElementById('syncBtn');
if (syncBtn) {
  syncBtn.addEventListener('click', async () => {
    if (syncBtn.classList.contains('syncing')) return;
    
    syncBtn.classList.add('syncing');
    const originalContent = syncBtn.innerHTML;
    syncBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;margin-right:6px;"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 12c0-4.4 3.6-8 8-8 3.3 0 6.2 2 7.4 4.9M22 12c0 4.4-3.6 8-8 8-3.3 0-6.2-2-7.4-4.9"/></svg>
      Syncing...
    `;

    try {
      const res = await fetch('/api/admin/sync-mikrotik', { method: 'POST' });
      const data = await res.json();
      
      if (data.success) {
        alert(`Sync Complete!\nImported: ${data.imported}\nUpdated: ${data.updated}`);
        if (pageName === 'dashboard') loadDashboard();
        if (pageName === 'clients') loadClientsTable();
      } else {
        alert('Sync Failed: ' + data.error);
      }
    } catch (err) {
      alert('Sync Error: ' + err.message);
    } finally {
      syncBtn.classList.remove('syncing');
      syncBtn.innerHTML = originalContent;
    }
  });
}

const pushBtn = document.getElementById('pushToMikroTikBtn');
if (pushBtn) {
  pushBtn.onclick = async () => {
    if (!confirm('This will ensure all local clients exist on the MikroTik router. Proceed?')) return;
    
    const originalText = pushBtn.innerHTML;
    pushBtn.disabled = true;
    pushBtn.innerHTML = '<div class="spinner" style="width:14px;height:14px"></div> Pushing...';

    try {
      const res = await fetch('/api/admin/push-to-mikrotik', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(`Push Complete!\nPushed: ${data.pushed}\nSkipped (Existing): ${data.skipped}\nErrors: ${data.errors}`);
      } else {
        alert('Push Failed: ' + data.error);
      }
    } catch (err) {
      alert('Push Error: Could not connect to server.');
    } finally {
      pushBtn.disabled = false;
      pushBtn.innerHTML = originalText;
    }
  };
}

// ─── Nav Badges (Global) ───
async function updateNavBadges() {
  try {
    const res = await fetch('/api/admin/dashboard');
    if (res.status === 401) return;
    const data = await res.json();
    updateBadge('navAppBadge', data.stats.pendingApps);
    updateBadge('navTicketBadge', data.stats.openTickets);
  } catch (e) {}
}

if (pageName !== 'dashboard') {
  updateNavBadges();
}
