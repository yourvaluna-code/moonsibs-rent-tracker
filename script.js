const beds = [
  '6-A1','6-A2','6-A3','6-A4','6-B1','6-B2','6-B3','6-B4',
  '7-A1','7-A2','7-A3','7-A4','7-B1','7-B2','7-B3','7-B4'
];

const state = {
  tenants: [],
  rentRecords: [], // kept for backward compatibility
  utilities: [],
  cashflow: []
};

const els = {};
const GRACE_DAYS = 3;
const DEFAULT_RENT = 3000;

function loadState() {
  const raw = localStorage.getItem('bedspaceData');
  if (raw) {
    const data = JSON.parse(raw);
    ['tenants','rentRecords','utilities','cashflow'].forEach(k => {
      state[k] = data[k] || [];
    });
    migrateTenants();
  }
}

function migrateTenants() {
  state.tenants = state.tenants.map(t => {
    const clone = {...t};
    clone.rentAmount = Number(clone.rentAmount || clone.rent || DEFAULT_RENT);
    clone.moveIn = clone.moveIn || clone.moveInDate || new Date().toISOString().slice(0,10);
    clone.moveInDate = clone.moveIn; // keep alias
    clone.paymentHistory = clone.paymentHistory || [];
    if (!clone.paidUntil) {
      clone.paidUntil = firstCycleEnd(clone.moveIn);
    }
    if (!clone.lastPaymentDate) clone.lastPaymentDate = null;
    return clone;
  });
}

function saveState() {
  localStorage.setItem('bedspaceData', JSON.stringify(state));
}

function uuid() { return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2); }

function monthKey(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; }

function formatCurrency(n=0) { return `₱${Number(n).toLocaleString('en-PH', {maximumFractionDigits:2})}`; }
function formatDate(d) { return d ? new Date(d).toISOString().slice(0,10) : '—'; }

function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d;
}

function cycleEnd(startDateStr) {
  // end is start + 1 month - 1 day
  const start = new Date(startDateStr);
  const end = addMonths(startDateStr, 1);
  end.setDate(end.getDate() - 1);
  return end;
}

function firstCycleEnd(moveIn) {
  return formatDate(cycleEnd(moveIn));
}

function init() {
  cacheElements();
  loadState();
  setupNav();
  setupForms();
  els.rentMonth.value = monthKey(new Date());
  renderAll();
  setupDataManagement();
}

function cacheElements() {
  els.navButtons = document.querySelectorAll('.nav-btn');
  els.panels = document.querySelectorAll('.panel');
  els.tenantTable = document.getElementById('tenantTable');
  els.bedGrid = document.getElementById('bedGrid');
  els.rentTable = document.getElementById('rentTable');
  els.rentMonth = document.getElementById('rentMonth');
  els.utilityForm = document.getElementById('utilityForm');
  els.utilityTable = document.getElementById('utilityTable');
  els.cashflowTable = document.getElementById('cashflowTable');
  els.cashIncome = document.getElementById('cashIncome');
  els.cashExpense = document.getElementById('cashExpense');
  els.cashNet = document.getElementById('cashNet');
  els.modal = document.getElementById('modal');
  els.modalTitle = document.getElementById('modalTitle');
  els.closeModal = document.getElementById('closeModal');
  els.addTenantBtn = document.getElementById('addTenantBtn');
  els.tenantForm = document.getElementById('tenantForm');
  els.dashboard = {
    totalRent: document.getElementById('totalRent'),
    occupied: document.getElementById('occupiedBeds'),
    vacant: document.getElementById('vacantBeds'),
    rentCollected: document.getElementById('rentCollected'),
    rentPending: document.getElementById('rentPending'),
    utilityTotal: document.getElementById('utilityTotal'),
    netProfit: document.getElementById('netProfit'),
    upcomingPill: document.getElementById('upcoming'),
    upcomingList: document.getElementById('upcomingList'),
    overdueCount: document.getElementById('overdueTenants')
  };
  els.calcShare = document.getElementById('calcShare');
  els.shareContainer = document.getElementById('shareContainer');
  els.upcomingList = document.getElementById('upcomingList');
  els.backupBtn = document.getElementById('backupBtn');
  els.importInput = document.getElementById('importInput');
}

function setupNav() {
  els.navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      els.panels.forEach(p => p.classList.remove('active'));
      document.getElementById(btn.dataset.target).classList.add('active');
    });
  });
}

function setupForms() {
  els.addTenantBtn.addEventListener('click', () => openTenantModal());
  els.closeModal.addEventListener('click', closeModal);
  els.modal.addEventListener('click', (e) => { if (e.target === els.modal) closeModal(); });

  els.tenantForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = new FormData(els.tenantForm);
    const id = form.get('id') || uuid();
    const payload = {
      id,
      name: form.get('name'),
      unit: form.get('unit'),
      bed: form.get('bed'),
      moveIn: form.get('moveIn'),
      moveInDate: form.get('moveIn'),
      rentAmount: Number(form.get('rent')) || DEFAULT_RENT,
      status: form.get('status'),
    };
    const existing = state.tenants.find(t => t.id === id);
    if (existing) {
      Object.assign(existing, payload);
    } else {
      payload.paidUntil = firstCycleEnd(payload.moveIn);
      payload.lastPaymentDate = null;
      payload.paymentHistory = [];
      state.tenants.push(payload);
    }
    saveState();
    closeModal();
    renderAll();
  });

  els.rentMonth.addEventListener('change', () => {
    renderRent();
    renderDashboard();
    renderTenants();
  });

  els.calcShare.addEventListener('click', buildShareInputs);
  els.utilityForm.addEventListener('submit', handleUtilitySubmit);
}

function setupDataManagement() {
  if (els.backupBtn) {
    els.backupBtn.addEventListener('click', backupData);
  }
  if (els.importInput) {
    els.importInput.addEventListener('change', handleImportFile);
  }
}

function renderAll() {
  renderTenants();
  renderBeds();
  renderRent();
  renderUtilities();
  renderCashflow();
  renderDashboard();
}

function openTenantModal(tenant) {
  els.modal.classList.remove('hidden');
  els.modalTitle.textContent = tenant ? 'Edit Tenant' : 'Add Tenant';
  els.tenantForm.reset();
  els.tenantForm.querySelector('[name=id]').value = tenant?.id || '';
  els.tenantForm.querySelector('[name=name]').value = tenant?.name || '';
  els.tenantForm.querySelector('[name=moveIn]').value = tenant?.moveIn || '';
  els.tenantForm.querySelector('[name=rent]').value = tenant?.rentAmount || DEFAULT_RENT;
  els.tenantForm.querySelector('[name=status]').value = tenant?.status || 'active';
  populateUnitSelect(tenant?.unit);
  populateBedSelect(tenant?.bed, tenant?.id);
  if (tenant?.unit) els.tenantForm.querySelector('[name=unit]').value = tenant.unit;
  if (tenant?.bed) els.tenantForm.querySelector('[name=bed]').value = tenant.bed;
}

function closeModal() { els.modal.classList.add('hidden'); }

function populateUnitSelect(selected) {
  const unitSelect = els.tenantForm.querySelector('[name=unit]');
  unitSelect.innerHTML = '';
  ['6','7'].forEach(u => {
    const opt = document.createElement('option');
    opt.value = u; opt.textContent = `Unit ${u}`;
    if (selected === u) opt.selected = true;
    unitSelect.appendChild(opt);
  });
}

function populateBedSelect(selectedBed, tenantId) {
  const bedSelect = els.tenantForm.querySelector('[name=bed]');
  bedSelect.innerHTML = '';
  const occupiedBeds = state.tenants.filter(t => t.status === 'active' && t.id !== tenantId).map(t => t.bed);
  beds.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b; opt.textContent = b;
    const isOccupied = occupiedBeds.includes(b);
    opt.disabled = isOccupied && selectedBed !== b;
    if (selectedBed === b) opt.selected = true;
    bedSelect.appendChild(opt);
  });
}

function tenantStatus(tenant) {
  const today = new Date();
  const paidUntil = new Date(tenant.paidUntil);
  if (today <= paidUntil) return { label: 'Paid', className: 'paid' };
  const grace = new Date(paidUntil);
  grace.setDate(grace.getDate() + GRACE_DAYS);
  if (today <= grace) return { label: 'Due', className: 'pending' };
  return { label: 'Overdue', className: 'unpaid' };
}

function nextDueDate(tenant) {
  const next = new Date(tenant.paidUntil);
  next.setDate(next.getDate() + 1);
  return formatDate(next);
}

function renderTenants() {
  els.tenantTable.innerHTML = '';
  state.tenants.forEach(t => {
    const status = tenantStatus(t);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.name}</td>
      <td>${t.bed}</td>
      <td>${t.unit}</td>
      <td>${formatDate(t.moveIn)}</td>
      <td>${formatCurrency(t.rentAmount)}</td>
      <td>${formatDate(t.paidUntil)}</td>
      <td>${nextDueDate(t)}</td>
      <td><span class="badge ${status.className}">${status.label}</span></td>
      <td><span class="status-pill status-${t.status}">${t.status === 'active' ? 'Active' : 'Moved out'}</span></td>
      <td class="actions">
        <button class="secondary" data-edit="${t.id}">Edit</button>
        <button class="secondary" data-remove="${t.id}">Remove</button>
      </td>`;
    els.tenantTable.appendChild(tr);
  });

  els.tenantTable.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tenant = state.tenants.find(t => t.id === btn.dataset.edit);
      openTenantModal(tenant);
    });
  });
  els.tenantTable.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.remove;
      state.tenants = state.tenants.filter(t => t.id !== id);
      saveState();
      renderAll();
    });
  });
}

function renderBeds() {
  els.bedGrid.innerHTML = '';
  beds.forEach(b => {
    const occupant = state.tenants.find(t => t.bed === b && t.status === 'active');
    const card = document.createElement('div');
    card.className = 'bed';
    card.innerHTML = `
      <div class="tag ${occupant ? 'occupied' : 'vacant'}">${occupant ? 'Occupied' : 'Vacant'}</div>
      <strong>${b}</strong>
      <small>Unit ${b.split('-')[0]}</small>
      <small>${occupant ? occupant.name : '—'}</small>
    `;
    els.bedGrid.appendChild(card);
  });
}

function renderRent() {
  els.rentTable.innerHTML = '';
  state.tenants.forEach(t => {
    const status = tenantStatus(t);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.name}</td>
      <td>${formatDate(t.moveIn)}</td>
      <td>${formatDate(t.paidUntil)}</td>
      <td>${nextDueDate(t)}</td>
      <td><span class="badge ${status.className}">${status.label}</span></td>
      <td>${formatCurrency(t.rentAmount)}</td>
      <td>${t.lastPaymentDate ? formatDate(t.lastPaymentDate) : '—'}</td>
      <td>${status.label === 'Paid' ? '' : `<button class="primary" data-pay="${t.id}">Mark Paid</button>`}</td>
    `;
    els.rentTable.appendChild(tr);
  });

  els.rentTable.querySelectorAll('[data-pay]').forEach(btn => {
    btn.addEventListener('click', () => markRentPaid(btn.dataset.pay));
  });
}

function markRentPaid(tenantId) {
  const tenant = state.tenants.find(t => t.id === tenantId);
  if (!tenant) return;
  const start = tenant.paidUntil ? new Date(tenant.paidUntil) : new Date(tenant.moveIn);
  const newStart = new Date(start);
  newStart.setDate(newStart.getDate() + 1);
  const newEnd = cycleEnd(formatDate(newStart));
  tenant.paidUntil = formatDate(newEnd);
  tenant.lastPaymentDate = formatDate(new Date());
  tenant.paymentHistory = tenant.paymentHistory || [];
  tenant.paymentHistory.push({ date: tenant.lastPaymentDate, amount: tenant.rentAmount, coversUntil: tenant.paidUntil });

  state.cashflow.push({
    id: uuid(),
    date: tenant.lastPaymentDate,
    description: `Rent - ${tenant.name}`,
    income: tenant.rentAmount,
    expense: 0
  });

  saveState();
  renderRent();
  renderCashflow();
  renderDashboard();
  renderTenants();
}

function buildShareInputs() {
  const form = new FormData(els.utilityForm);
  const total = (Number(form.get('electricity'))||0) + (Number(form.get('water'))||0);
  const activeTenants = state.tenants.filter(t => t.status === 'active');
  const baseShare = activeTenants.length ? (total / activeTenants.length) : 0;
  els.shareContainer.innerHTML = '';
  activeTenants.forEach(t => {
    const div = document.createElement('div');
    div.className = 'share-item';
    div.innerHTML = `
      <div style="font-weight:600;">${t.name}</div>
      <label style="color:var(--muted);">Share (₱)<input type="number" step="0.01" name="share-${t.id}" value="${baseShare.toFixed(2)}"></label>
    `;
    els.shareContainer.appendChild(div);
  });
}

function handleUtilitySubmit(e) {
  e.preventDefault();
  const form = new FormData(els.utilityForm);
  const month = form.get('month');
  const electricity = Number(form.get('electricity')) || 0;
  const water = Number(form.get('water')) || 0;
  const total = electricity + water;
  const shares = state.tenants.filter(t => t.status === 'active').map(t => ({
    tenantId: t.id,
    amount: Number(form.get(`share-${t.id}`)) || 0
  }));

  state.utilities.push({ id: uuid(), month, electricity, water, total, shares });
  state.cashflow.push({ id: uuid(), date: new Date().toISOString().slice(0,10), description: `Utilities ${month}`, income: 0, expense: total });
  saveState();
  renderUtilities();
  renderCashflow();
  renderDashboard();
  els.utilityForm.reset();
  els.shareContainer.innerHTML = '';
}

function renderUtilities() {
  els.utilityTable.innerHTML = '';
  state.utilities.slice().reverse().forEach(u => {
    const avg = u.shares && u.shares.length ? u.shares.reduce((s,c)=>s+c.amount,0)/u.shares.length : 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.month}</td>
      <td>${formatCurrency(u.electricity)}</td>
      <td>${formatCurrency(u.water)}</td>
      <td>${formatCurrency(u.total)}</td>
      <td>${formatCurrency(avg)}</td>
    `;
    els.utilityTable.appendChild(tr);
  });
}

function renderCashflow() {
  els.cashflowTable.innerHTML = '';
  state.cashflow.slice().reverse().forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.date}</td>
      <td>${item.description}</td>
      <td>${item.income ? formatCurrency(item.income) : ''}</td>
      <td>${item.expense ? formatCurrency(item.expense) : ''}</td>
    `;
    els.cashflowTable.appendChild(tr);
  });
  const income = state.cashflow.reduce((s,c)=>s+(c.income||0),0);
  const expense = state.cashflow.reduce((s,c)=>s+(c.expense||0),0);
  els.cashIncome.textContent = formatCurrency(income);
  els.cashExpense.textContent = formatCurrency(expense);
  els.cashNet.textContent = formatCurrency(income - expense);
}

function renderDashboard() {
  const activeTenants = state.tenants.filter(t => t.status === 'active');
  const occupied = activeTenants.length;
  const vacant = beds.length - occupied;
  const currentMonth = monthKey(new Date());
  const rentCollected = state.cashflow
    .filter(c => c.income && (c.date || '').startsWith(currentMonth))
    .reduce((s,c)=>s+c.income,0);
  const totalRent = activeTenants.reduce((s,c)=>s+(Number(c.rentAmount)||0),0);
  const pendingRent = activeTenants
    .filter(t => tenantStatus(t).label !== 'Paid')
    .reduce((s,c)=>s+(Number(c.rentAmount)||0),0);
  const utilityCurrent = state.utilities.filter(u => (u.month||'').startsWith(currentMonth)).reduce((s,c)=>s+c.total,0);
  const net = rentCollected - utilityCurrent;
  const overdueCount = activeTenants.filter(t => tenantStatus(t).label === 'Overdue').length;

  els.dashboard.totalRent.textContent = formatCurrency(totalRent);
  els.dashboard.occupied.textContent = occupied;
  els.dashboard.vacant.textContent = vacant;
  els.dashboard.rentCollected.textContent = formatCurrency(rentCollected);
  els.dashboard.rentPending.textContent = formatCurrency(pendingRent);
  els.dashboard.utilityTotal.textContent = formatCurrency(utilityCurrent);
  els.dashboard.netProfit.textContent = formatCurrency(net);
  if (els.dashboard.overdueCount) els.dashboard.overdueCount.textContent = overdueCount;

  renderUpcomingDue();
}

function renderUpcomingDue() {
  const today = new Date();
  const upcoming = state.tenants.filter(t => {
    const status = tenantStatus(t);
    if (status.label === 'Paid') return false;
    const dueDate = new Date(t.paidUntil);
    const diff = (dueDate - today)/(1000*60*60*24);
    return diff >= 0 && diff <= 5;
  });
  els.dashboard.upcomingPill.textContent = `Upcoming dues: ${upcoming.length}`;
  els.upcomingList.innerHTML = '';
  upcoming.forEach(t => {
    const li = document.createElement('li');
    li.className = 'chip';
    li.textContent = `${t.name} - due ${formatDate(nextDueDate(t))}`;
    els.upcomingList.appendChild(li);
  });
}

function backupData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rent-tracker-backup.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!confirm('Importing will overwrite existing data. Continue?')) { e.target.value=''; return; }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      ['tenants','rentRecords','utilities','cashflow'].forEach(k => {
        state[k] = data[k] || [];
      });
      migrateTenants();
      saveState();
      location.reload();
    } catch (err) {
      alert('Import failed: invalid JSON');
    }
  };
  reader.readAsText(file);
}

window.addEventListener('DOMContentLoaded', init);
