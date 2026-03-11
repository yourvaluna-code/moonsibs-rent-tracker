const beds = [
  '6-A1','6-A2','6-A3','6-A4','6-B1','6-B2','6-B3','6-B4',
  '7-A1','7-A2','7-A3','7-A4','7-B1','7-B2','7-B3','7-B4'
];

const state = {
  tenants: [],
  rentRecords: [],
  utilities: [],
  cashflow: []
};

const els = {};

function loadState() {
  const raw = localStorage.getItem('bedspaceData');
  if (raw) {
    const data = JSON.parse(raw);
    ['tenants','rentRecords','utilities','cashflow'].forEach(k => {
      state[k] = data[k] || [];
    });
  }
}

function saveState() {
  localStorage.setItem('bedspaceData', JSON.stringify(state));
}

function uuid() { return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2); }

function monthKey(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; }

function formatCurrency(n=0) { return `₱${Number(n).toLocaleString('en-PH', {maximumFractionDigits:2})}`; }

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
    upcomingList: document.getElementById('upcomingList')
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
      rent: Number(form.get('rent')) || 3000,
      status: form.get('status')
    };
    const existing = state.tenants.find(t => t.id === id);
    if (existing) {
      Object.assign(existing, payload);
    } else {
      state.tenants.push(payload);
    }
    saveState();
    closeModal();
    ensureRentRecordsForMonth(els.rentMonth.value || monthKey(new Date()));
    renderAll();
  });

  els.rentMonth.addEventListener('change', () => {
    ensureRentRecordsForMonth(els.rentMonth.value);
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
  ensureRentRecordsForMonth(els.rentMonth.value || monthKey(new Date()));
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
  els.tenantForm.querySelector('[name=rent]').value = tenant?.rent || 3000;
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

function renderTenants() {
  els.tenantTable.innerHTML = '';
  const currentMonth = els.rentMonth.value || monthKey(new Date());
  state.tenants.forEach(t => {
    const tr = document.createElement('tr');
    const rentStatus = getTenantRentStatus(t.id, currentMonth);
    tr.innerHTML = `
      <td>${t.name}</td>
      <td>${t.bed}</td>
      <td>${t.unit}</td>
      <td>${t.moveIn || ''}</td>
      <td>${formatCurrency(t.rent)}</td>
      <td><span class="badge ${rentStatus.className}">${rentStatus.label}</span></td>
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
      state.rentRecords = state.rentRecords.filter(r => r.tenantId !== id);
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

function ensureRentRecordsForMonth(month) {
  const targetMonth = month || monthKey(new Date());
  state.tenants.filter(t => t.status === 'active').forEach(t => {
    const exists = state.rentRecords.some(r => r.tenantId === t.id && r.month === targetMonth);
    if (!exists) {
      state.rentRecords.push({
        id: uuid(),
        tenantId: t.id,
        month: targetMonth,
        amount: t.rent,
        paid: false,
        paymentDate: null,
        balance: t.rent
      });
    }
  });
  saveState();
}

function renderRent() {
  const m = els.rentMonth.value || monthKey(new Date());
  const records = state.rentRecords.filter(r => r.month === m);
  els.rentTable.innerHTML = '';
  records.forEach(r => {
    const tenant = state.tenants.find(t => t.id === r.tenantId);
    const statusClass = r.paid ? 'paid' : isOverdueRecord(r) ? 'unpaid' : 'pending';
    const statusLabel = r.paid ? 'Paid' : isOverdueRecord(r) ? 'Overdue' : 'Pending';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${tenant?.name || '—'}</td>
      <td>${r.month}</td>
      <td>${formatCurrency(r.amount)}</td>
      <td><span class="badge ${statusClass}">${statusLabel}</span></td>
      <td>${r.paymentDate || '—'}</td>
      <td class="${r.paid ? '' : 'unpaid'}">${r.paid ? '₱0' : formatCurrency(r.balance)}</td>
      <td>${r.paid ? '' : `<button class="primary" data-pay="${r.id}">Mark Paid</button>`}</td>
    `;
    els.rentTable.appendChild(tr);
  });

  els.rentTable.querySelectorAll('[data-pay]').forEach(btn => {
    btn.addEventListener('click', () => markRentPaid(btn.dataset.pay));
  });
}

function isOverdueRecord(record) {
  if (record.paid) return false;
  const due = dueDateForMonth(record.month);
  const today = new Date();
  return today > due;
}

function markRentPaid(id) {
  const rec = state.rentRecords.find(r => r.id === id);
  if (!rec) return;
  rec.paid = true;
  rec.paymentDate = new Date().toISOString().slice(0,10);
  rec.balance = 0;
  const tenant = state.tenants.find(t => t.id === rec.tenantId);
  state.cashflow.push({
    id: uuid(),
    date: rec.paymentDate,
    description: `Rent - ${tenant?.name || ''} (${rec.month})`,
    income: rec.amount,
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
  const currentMonth = els.rentMonth.value || monthKey(new Date());
  const rentCurrent = state.rentRecords.filter(r => r.month === currentMonth);
  const rentCollected = rentCurrent.filter(r => r.paid).reduce((s,c)=>s+c.amount,0);
  const totalRent = activeTenants.reduce((s,c)=>s+(Number(c.rent)||0),0);
  const pendingRent = Math.max(totalRent - rentCollected, 0);
  const utilityCurrent = state.utilities.filter(u => u.month === currentMonth).reduce((s,c)=>s+c.total,0);
  const net = rentCollected - utilityCurrent;

  els.dashboard.totalRent.textContent = formatCurrency(totalRent);
  els.dashboard.occupied.textContent = occupied;
  els.dashboard.vacant.textContent = vacant;
  els.dashboard.rentCollected.textContent = formatCurrency(rentCollected);
  els.dashboard.rentPending.textContent = formatCurrency(pendingRent);
  els.dashboard.utilityTotal.textContent = formatCurrency(utilityCurrent);
  els.dashboard.netProfit.textContent = formatCurrency(net);

  renderUpcomingDue();
}

function dueDateForMonth(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

function nextDueDate(baseDate=new Date()) {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const today = baseDate;
  if (today <= firstOfMonth) return firstOfMonth;
  return new Date(year, month + 1, 1);
}

function renderUpcomingDue() {
  const today = new Date();
  const dueDate = nextDueDate(today);
  const targetMonth = monthKey(dueDate);
  ensureRentRecordsForMonth(targetMonth);
  const list = state.rentRecords.filter(r => r.month === targetMonth && !r.paid);
  const upcoming = list.filter(r => {
    const diff = (dueDate - today)/(1000*60*60*24);
    return diff >= 0 && diff <=5;
  });
  els.dashboard.upcomingPill.textContent = `Upcoming dues: ${upcoming.length}`;
  els.upcomingList.innerHTML = '';
  upcoming.forEach(r => {
    const tenant = state.tenants.find(t => t.id === r.tenantId);
    const li = document.createElement('li');
    li.className = 'chip';
    li.textContent = `${tenant?.name || '—'} - due ${dueDate.toISOString().slice(0,10)}`;
    els.upcomingList.appendChild(li);
  });
}

function getTenantRentStatus(tenantId, month) {
  const record = state.rentRecords.find(r => r.tenantId === tenantId && r.month === month);
  if (record?.paid) return { label: 'Paid', className: 'paid' };
  const due = dueDateForMonth(month);
  const today = new Date();
  if (today > due) return { label: 'Overdue', className: 'unpaid' };
  return { label: 'Pending', className: 'pending' };
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
      saveState();
      location.reload();
    } catch (err) {
      alert('Import failed: invalid JSON');
    }
  };
  reader.readAsText(file);
}

window.addEventListener('DOMContentLoaded', init);
