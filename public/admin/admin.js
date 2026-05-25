// Auth
const token = localStorage.getItem('sobha_admin_token');
if (!token) window.location.href = 'login.html';
const authHeader = { 'Authorization': 'Basic ' + token, 'Content-Type': 'application/json' };

let allLeads = [];

// Init
document.addEventListener('DOMContentLoaded', () => { loadLeads(); loadSMTP(); });

// Tabs
// Tabs
function switchTab(tab, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  const target = document.querySelector(`.tab-content#tab-${tab}`);
  if (target) target.classList.add('active');
  if (el) el.classList.add('active');
}

// Load Leads
async function loadLeads() {
  try {
    const res = await fetch('/api/admin/leads', { headers: authHeader });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();
    allLeads = data.leads || [];
    renderLeads(allLeads);
    updateStats(allLeads);
  } catch (e) { console.error(e); }
}

function renderLeads(leads) {
  const tbody = document.getElementById('leadsBody');
  const noData = document.getElementById('noData');
  if (!leads.length) { tbody.innerHTML = ''; noData.style.display = 'block'; return; }
  noData.style.display = 'none';
  tbody.innerHTML = leads.map((l, i) => `<tr>
    <td><input type="checkbox" class="lead-checkbox" value="${l.id}" onclick="updateSelection(event)"></td>
    <td>${leads.length - i}</td>
    <td style="color:var(--text);font-weight:500;">${esc(l.name)}</td>
    <td>${esc(l.phone)}</td>
    <td>${esc(l.email) || '<span style="color:var(--muted)">—</span>'}</td>
    <td>${esc(l.device)}</td>
    <td>${esc(l.browser)}</td>
    <td>${esc(l.city)}</td>
    <td>${esc(l.country)}</td>
    <td>${esc(l.ip) || '<span style="color:var(--muted)">—</span>'}</td>
    <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(l.referrer)}">${esc(l.referrer) || 'Direct'}</td>
    <td style="white-space:nowrap;">${formatDate(l.created_at)}</td>
    <td>${l.is_vpn ? '<span class="badge badge-vpn">VPN</span>' : '<span class="badge badge-safe">Clean</span>'}</td>
    <td><button class="del-btn" onclick="deleteLead(${l.id})" title="Delete">🗑</button></td>
  </tr>`).join('');
  updateSelection();
}

function toggleSelectAll(el) {
  document.querySelectorAll('.lead-checkbox').forEach(cb => cb.checked = el.checked);
  updateSelection();
}

function updateSelection(e) {
  if (e && e.stopPropagation) e.stopPropagation();
  const cbs = document.querySelectorAll('.lead-checkbox:checked');
  const bulkBtn = document.getElementById('bulkDeleteBtn');
  if (bulkBtn) bulkBtn.style.display = cbs.length > 0 ? 'inline-block' : 'none';
  const allCb = document.getElementById('selectAll');
  const totalCbs = document.querySelectorAll('.lead-checkbox').length;
  if (allCb) allCb.checked = cbs.length === totalCbs && totalCbs > 0;
}

async function deleteSelectedLeads() {
  const ids = Array.from(document.querySelectorAll('.lead-checkbox:checked')).map(cb => parseInt(cb.value));
  if (ids.length === 0) return;
  if (!confirm(`Delete ${ids.length} selected leads?`)) return;
  try {
    const res = await fetch('/api/admin/leads/bulk-delete', {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({ ids })
    });
    const data = await res.json();
    if (data.success) loadLeads();
    else alert(data.message || 'Error deleting leads');
  } catch (e) { alert('Connection error'); }
}

function updateStats(leads) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const weekAgo = new Date(now - 7 * 86400000);
  document.getElementById('totalLeads').textContent = leads.length;
  document.getElementById('todayLeads').textContent = leads.filter(l => l.created_at?.startsWith(today)).length;
  document.getElementById('weekLeads').textContent = leads.filter(l => new Date(l.created_at) >= weekAgo).length;
  document.getElementById('vpnBlocked').textContent = leads.filter(l => l.is_vpn).length;
}

function searchLeads(q) {
  const f = q.toLowerCase();
  renderLeads(f ? allLeads.filter(l => (l.name + l.phone + l.email + l.city + l.country).toLowerCase().includes(f)) : allLeads);
}

async function deleteLead(id) {
  if (!confirm('Delete this lead?')) return;
  await fetch(`/api/admin/leads/${id}`, { method: 'DELETE', headers: authHeader });
  loadLeads();
}

// SMTP
async function loadSMTP() {
  try {
    const res = await fetch('/api/admin/smtp', { headers: authHeader });
    const data = await res.json();
    if (data.smtp) {
      document.getElementById('smtpHost').value = data.smtp.host || '';
      document.getElementById('smtpPort').value = data.smtp.port || '587';
      document.getElementById('smtpSecure').value = data.smtp.secure || 'false';
      document.getElementById('smtpUser').value = data.smtp.user || '';
      document.getElementById('smtpFrom').value = data.smtp.from || '';
      document.getElementById('smtpTo').value = data.smtp.to || '';
    }
  } catch (e) {}
}

async function saveSMTP() {
  const body = {
    host: document.getElementById('smtpHost').value,
    port: document.getElementById('smtpPort').value,
    secure: document.getElementById('smtpSecure').value,
    user: document.getElementById('smtpUser').value,
    pass: document.getElementById('smtpPass').value,
    from: document.getElementById('smtpFrom').value,
    to: document.getElementById('smtpTo').value
  };
  const res = await fetch('/api/admin/smtp', { method: 'POST', headers: authHeader, body: JSON.stringify(body) });
  const data = await res.json();
  showSMTPMsg(data.message || 'Saved!', data.success);
}

async function testSMTP() {
  showSMTPMsg('Sending test email...', true);
  const res = await fetch('/api/admin/smtp/test', { method: 'POST', headers: authHeader });
  const data = await res.json();
  showSMTPMsg(data.message, data.success);
}

function showSMTPMsg(msg, ok) {
  const el = document.getElementById('smtpMsg');
  el.textContent = msg;
  el.style.color = ok ? 'var(--success)' : 'var(--danger)';
}

// Export
function exportCSV() {
  window.open('/api/admin/leads/export?auth=' + token, '_blank');
  // Fallback: use fetch with auth header
  fetch('/api/admin/leads/export', { headers: authHeader })
    .then(r => r.blob())
    .then(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'leads.csv'; a.click(); });
}

function logout() { localStorage.removeItem('sobha_admin_token'); window.location.href = 'login.html'; }
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function formatDate(d) { if (!d) return '—'; const dt = new Date(d); return dt.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) + ' ' + dt.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }); }
