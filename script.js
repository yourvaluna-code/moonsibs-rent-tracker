const BED_SPACES = [
  '6-A1','6-A2','6-A3','6-A4','6-B1','6-B2','6-B3','6-B4',
  '7-A1','7-A2','7-A3','7-A4','7-B1','7-B2','7-B3','7-B4'
];
const DEFAULT_RENT = 3000;
const DEFAULT_SETTINGS = {
  wifiCost: 750,
  wifiDivisor6: 4,
  wifiDivisor7: 4,
  landlordRent6: 10000,
  landlordRent7: 10000,
  utilityBase: 1000
};

const state = {
  tenants: [],
  payments: [],
  expenses: [],
  utilities: [],
  repairs: [],
  ledger: [],
  settings: { ...DEFAULT_SETTINGS }
};

const els = {};
let monthFilter = today().slice(0,7);

function loadState() {
  const raw = localStorage.getItem('bedspaceData');
  if (raw) {
    const data = JSON.parse(raw);
    ['tenants','payments','expenses','utilities','repairs','ledger','settings'].forEach(k => {
      if (data[k]) state[k] = data[k];
    });
  }
  migrateSettings();
  migrateTenants();
}

function migrateSettings() { state.settings = { ...DEFAULT_SETTINGS, ...(state.settings||{}) }; }

function normalizeBed(b) {
  if (!b) return '';
  const cleaned = b.replace(/\s+/g,'').replace(/_/g,'-').toUpperCase();
  // Accept forms: 6A1, 6A-1, 6-A-1, 6-A1, U6-B1, 6B1
  const match = cleaned.match(/(?:U)?([67])[-]?([AB])[-]?([1-4])/);
  if (match) return `${match[1]}-${match[2]}${match[3]}`;
  return cleaned;
}

function migrateTenants() {
  state.tenants = (state.tenants||[]).map(t => {
    const clone = { ...t };
    clone.id = clone.id || uuid();
    clone.name = clone.name || clone.tenantName || '';
    clone.bedSpace = normalizeBed(clone.bedSpace || clone.bed || '');
    clone.unit = clone.unit || (clone.bedSpace.startsWith('7') ? '7' : '6');
    clone.moveInDate = clone.moveInDate || clone.moveIn || today();
    clone.moveOutDate = clone.moveOutDate || null;
    clone.rentAmount = Number(clone.rentAmount || clone.rent || DEFAULT_RENT);
    clone.status = clone.status || 'active';
    clone.paidUntil = clone.paidUntil ? formatDate(clone.paidUntil) : clone.moveInDate; // last fully covered end-date
    clone.lastPaymentDate = clone.lastPaymentDate || null;
    clone.paymentHistory = clone.paymentHistory || [];
    clone.partialBalance = Number(clone.partialBalance || 0); // amount applied to current cycle but not yet complete
    return clone;
  });
}

function isActive(tenant) {
  if (tenant.status !== 'active') return false;
  if (tenant.moveOutDate && new Date(tenant.moveOutDate) <= new Date()) return false;
  return true;
}

function saveState() { localStorage.setItem('bedspaceData', JSON.stringify(state)); }

function uuid() { return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2); }
function today() { return new Date().toISOString().slice(0,10); }
function formatCurrency(n=0) { return `₱${Number(n).toLocaleString('en-PH',{maximumFractionDigits:2})}`; }
function formatDate(d) { return d ? new Date(d).toISOString().slice(0,10) : '—'; }
function addMonths(dateStr, months) { const d = new Date(dateStr); d.setMonth(d.getMonth()+months); return d.toISOString().slice(0,10); }

function nextDueDate(tenant) {
  const base = tenant.paidUntil || tenant.moveInDate;
  return addMonths(base,1);
}

function tenantStatus(tenant) {
  const now = new Date();
  const paidUntil = new Date(tenant.paidUntil);
  const due = new Date(nextDueDate(tenant));
  if ((tenant.partialBalance||0) > 0) return { label:'Partial', className:'partial' };
  if (now <= paidUntil) return { label:'Paid', className:'paid' };
  if (now < due) return { label:'Upcoming', className:'pending' };
  return { label:'Overdue', className:'unpaid' };
}

function init() {
  cacheEls();
  loadState();
  setupNav();
  bindForms();
  renderAll();
}

function cacheEls() {
  els.panels = document.querySelectorAll('.panel');
  els.navBtns = document.querySelectorAll('.nav-btn');
  els.tenantTable = document.getElementById('tenantTable');
  els.bedGrid = document.getElementById('bedGrid');
  els.rentTable = document.getElementById('rentTable');
  els.paymentHistory = document.getElementById('paymentHistory');
  els.ledgerTable = document.getElementById('ledgerTable');
  els.expenseForm = document.getElementById('expenseForm');
  els.backupBtn = document.getElementById('backupBtn');
  els.importInput = document.getElementById('importInput');
  els.paymentModal = document.getElementById('paymentModal');
  els.paymentForm = document.getElementById('paymentForm');
  els.recordPaymentBtn = document.getElementById('recordPaymentBtn');
  els.tenantModal = document.getElementById('tenantModal');
  els.tenantForm = document.getElementById('tenantForm');
  els.addTenantBtn = document.getElementById('addTenantBtn');
  els.tenantModalTitle = document.getElementById('tenantModalTitle');
  els.clearHistoryBtn = document.getElementById('clearHistoryBtn');
  els.repairForm = document.getElementById('repairForm');
  els.repairTable = document.getElementById('repairTable');
  els.dashboard = {
    totalRent: document.getElementById('totalRent'),
    rentCollected: document.getElementById('rentCollected'),
    rentPending: document.getElementById('rentPending'),
    overdue: document.getElementById('overdueTenants'),
    occupied: document.getElementById('occupiedBeds'),
    vacant: document.getElementById('vacantBeds'),
    cashBalance: document.getElementById('cashBalance'),
    netProfit: document.getElementById('netProfit'),
    upcomingCount: document.getElementById('upcomingCount'),
    upcomingList: document.getElementById('upcomingList'),
    overdueList: document.getElementById('overdueList'),
    occ6: document.getElementById('occ6'),
    occ7: document.getElementById('occ7'),
    occTotal: document.getElementById('occTotal')
  };
  els.profit = {
    net: document.getElementById('profitNet'),
    angel: document.getElementById('profitAngel'),
    brother: document.getElementById('profitBrother'),
    angelProfit: document.getElementById('angelProfit'),
    broProfit: document.getElementById('broProfit'),
    angelWithdrawals: document.getElementById('angelWithdrawals'),
    broWithdrawals: document.getElementById('broWithdrawals'),
    angelBalance: document.getElementById('angelBalance'),
    broBalance: document.getElementById('broBalance')
  };
  els.monthFilterDash = document.getElementById('monthFilterDash');
  els.monthFilterProfit = document.getElementById('monthFilterProfit');
}

function setupNav() {
  els.navBtns.forEach(btn => btn.addEventListener('click', () => {
    els.panels.forEach(p => p.classList.remove('active'));
    document.getElementById(btn.dataset.target).classList.add('active');
  }));
}

function bindForms() {
  els.addTenantBtn.addEventListener('click', () => openTenantModal());
  document.querySelectorAll('.close').forEach(c => c.addEventListener('click', () => closeModal(c.dataset.close)));
  els.tenantForm.addEventListener('submit', handleTenantSubmit);
  els.recordPaymentBtn.addEventListener('click', openPaymentModal);
  els.paymentForm.addEventListener('submit', handlePaymentSubmit);
  els.expenseForm.addEventListener('submit', handleExpenseSubmit);
  els.backupBtn.addEventListener('click', exportBackup);
  els.importInput.addEventListener('change', importBackup);
  if (els.repairForm) els.repairForm.addEventListener('submit', handleRepairSubmit);
  if (els.clearHistoryBtn) els.clearHistoryBtn.addEventListener('click', () => {
    const id = els.tenantForm.id.value;
    if (!id) return;
    if (!confirm('Clear payment history for this tenant?')) return;
    clearPaymentHistory(id);
  });
  if (els.monthFilterDash) {
    els.monthFilterDash.value = monthFilter;
    els.monthFilterDash.addEventListener('change', e => { monthFilter = e.target.value || today().slice(0,7); renderAll(); });
  }
  if (els.monthFilterProfit) {
    els.monthFilterProfit.value = monthFilter;
    els.monthFilterProfit.addEventListener('change', e => { monthFilter = e.target.value || today().slice(0,7); renderAll(); });
  }
}

function openTenantModal(tenant) {
  populateUnitSelect();
  populateBedSelect(tenant?.bedSpace);
  els.tenantForm.reset();
  if (tenant) {
    els.tenantModalTitle.textContent = 'Edit Tenant';
    els.tenantForm.id.value = tenant.id;
    els.tenantForm.name.value = tenant.name;
    els.tenantForm.unit.value = tenant.unit;
    els.tenantForm.bedSpace.value = tenant.bedSpace;
    els.tenantForm.moveInDate.value = tenant.moveInDate;
    els.tenantForm.moveOutDate.value = tenant.moveOutDate || '';
    els.tenantForm.rentAmount.value = tenant.rentAmount;
    els.tenantForm.status.value = tenant.status;
  } else {
    els.tenantModalTitle.textContent = 'Add Tenant';
    els.tenantForm.id.value = '';
    els.tenantForm.moveInDate.value = today();
  }
  els.tenantModal.classList.remove('hidden');
}

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function populateUnitSelect() {
  const sel = els.tenantForm.unit;
  sel.innerHTML = '<option value="6">Unit 6</option><option value="7">Unit 7</option>';
}

function populateBedSelect(selected) {
  const sel = els.tenantForm.bedSpace;
  sel.innerHTML = '';
  BED_SPACES.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b; opt.textContent = b;
    const isOcc = state.tenants.some(t => isActive(t) && t.bedSpace===b && t.id !== els.tenantForm.id.value);
    opt.disabled = isOcc && selected !== b;
    if (selected === b) opt.selected = true;
    sel.appendChild(opt);
  });
}

function handleTenantSubmit(e) {
  e.preventDefault();
  const f = new FormData(els.tenantForm);
  const id = f.get('id') || uuid();
  const existing = state.tenants.find(t => t.id === id);
  const payload = {
    id,
    name: f.get('name'),
    unit: f.get('unit'),
    bedSpace: normalizeBed(f.get('bedSpace')),
    moveInDate: f.get('moveInDate'),
    moveOutDate: f.get('moveOutDate') || null,
    rentAmount: Number(f.get('rentAmount')) || DEFAULT_RENT,
    status: f.get('status')
  };
  if (existing) {
    Object.assign(existing, payload);
  } else {
    payload.paidUntil = payload.moveInDate;
    payload.lastPaymentDate = null;
    payload.paymentHistory = [];
    payload.partialBalance = 0;
    state.tenants.push(payload);
  }
  saveState();
  closeModal('tenantModal');
  renderAll();
}

function openPaymentModal() {
  const sel = els.paymentForm.tenantId;
  sel.innerHTML = '';
  state.tenants.filter(t=>isActive(t)).forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id; opt.textContent = `${t.name} (${t.bedSpace})`;
    sel.appendChild(opt);
  });
  els.paymentForm.amount.value = DEFAULT_RENT;
  els.paymentForm.paymentDate.value = today();
  els.paymentModal.classList.remove('hidden');
}

function handlePaymentSubmit(e) {
  e.preventDefault();
  const f = new FormData(els.paymentForm);
  const tenant = state.tenants.find(t => t.id === f.get('tenantId'));
  if (!tenant) return;
  const amount = Number(f.get('amount')) || tenant.rentAmount;
  const payDate = f.get('paymentDate') || today();
  const method = f.get('method');
  const collectedBy = f.get('collectedBy');
  const notes = f.get('notes');

  let remaining = amount + (tenant.partialBalance || 0);
  let currentDue = nextDueDate(tenant);
  const historyEntries = [];

  while (remaining >= tenant.rentAmount) {
    remaining -= tenant.rentAmount;
    tenant.paidUntil = currentDue;
    historyEntries.push({ dueDate: currentDue, paymentDate: payDate, amount: tenant.rentAmount, status:'Paid', remaining:0 });
    currentDue = addMonths(currentDue,1);
  }
  if (remaining > 0) {
    historyEntries.push({ dueDate: currentDue, paymentDate: payDate, amount: remaining, status:'Partial', remaining: tenant.rentAmount - remaining });
  }
  tenant.partialBalance = remaining;
  tenant.lastPaymentDate = payDate;
  tenant.paymentHistory = [...(tenant.paymentHistory||[]), ...historyEntries];

  const paymentRecord = {
    id: uuid(), tenantId: tenant.id, amount, paymentDate: payDate, method, collectedBy, notes,
    coversUntil: tenant.paidUntil, partialCarry: tenant.partialBalance
  };
  state.payments.push(paymentRecord);

  state.ledger.push({
    id: uuid(), date: payDate, type:'Income', category:'Rent Payment', description:`Rent - ${tenant.name}`, amount, unit: tenant.unit
  });

  saveState();
  closeModal('paymentModal');
  renderAll();
}

function clearPaymentHistory(tenantId) {
  const tenant = state.tenants.find(t=>t.id===tenantId);
  if (!tenant) return;
  tenant.paymentHistory = [];
  tenant.paidUntil = tenant.moveInDate;
  tenant.partialBalance = 0;
  tenant.lastPaymentDate = null;
  state.payments = state.payments.filter(p=>p.tenantId !== tenantId);
  state.ledger = state.ledger.filter(l=>!(l.category==='Rent Payment' && (l.description||'').includes(tenant.name)));
  saveState();
  renderAll();
}

function resetTenantCycle(tenantId) {
  clearPaymentHistory(tenantId);
}

function handleExpenseSubmit(e) {
  e.preventDefault();
  const f = new FormData(els.expenseForm);
  const date = f.get('date');
  const category = f.get('category');
  const amount = Number(f.get('amount')) || 0;
  const desc = f.get('description');
  const unit = f.get('unit') || '';
  state.expenses.push({ id: uuid(), date, category, amount, description: desc, unit });
  state.ledger.push({ id: uuid(), date, type:'Expense', category, description: desc, amount: -amount, unit });
  saveState();
  els.expenseForm.reset();
  renderAll();
}

function handleRepairSubmit(e) {
  e.preventDefault();
  const f = new FormData(els.repairForm);
  const date = f.get('date');
  const unit = f.get('unit');
  const desc = f.get('description');
  const cost = Number(f.get('cost')) || 0;
  state.repairs.push({ id: uuid(), date, unit, description: desc, cost });
  state.expenses.push({ id: uuid(), date, category:'Repairs', amount: cost, description: desc, unit });
  state.ledger.push({ id: uuid(), date, type:'Expense', category:'Repairs', description: desc, amount: -cost, unit });
  saveState();
  els.repairForm.reset();
  renderAll();
}

function renderRepairs() {
  if (!els.repairTable) return;
  els.repairTable.innerHTML='';
  state.repairs.slice().reverse().forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.date}</td><td>${r.unit}</td><td>${r.description}</td><td>${formatCurrency(r.cost)}</td>`;
    els.repairTable.appendChild(tr);
  });
}

function renderTenants() {
  els.tenantTable.innerHTML='';
  state.tenants.forEach(t => {
    const status = tenantStatus(t);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.name}</td>
      <td>${t.bedSpace}</td>
      <td>${t.unit}</td>
      <td>${formatDate(t.moveInDate)}</td>
      <td>${t.moveOutDate ? formatDate(t.moveOutDate) : '—'}</td>
      <td>${formatCurrency(t.rentAmount)}</td>
      <td>${formatDate(t.paidUntil)}</td>
      <td>${nextDueDate(t)}</td>
      <td><span class="badge ${status.className}">${status.label}</span></td>
      <td class="actions">
        <button class="secondary" data-reset="${t.id}">Reset Cycle</button>
        <button class="secondary" data-edit="${t.id}">Edit</button>
        <button class="secondary" data-remove="${t.id}">Remove</button>
      </td>
    `;
    els.tenantTable.appendChild(tr);
  });
  els.tenantTable.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => openTenantModal(state.tenants.find(t=>t.id===btn.dataset.edit))));
  els.tenantTable.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', () => { state.tenants = state.tenants.filter(t=>t.id!==btn.dataset.remove); saveState(); renderAll(); }));
  els.tenantTable.querySelectorAll('[data-reset]').forEach(btn => btn.addEventListener('click', () => { if(confirm('Reset rent cycle and clear payment history?')) resetTenantCycle(btn.dataset.reset); }));
}

function renderBeds() {
  els.bedGrid.innerHTML='';
  BED_SPACES.forEach(b => {
    const occ = state.tenants.find(t=>t.bedSpace===b && isActive(t));
    const div = document.createElement('div');
    div.className='bed';
    div.innerHTML = `<div class="tag ${occ?'occupied':'vacant'}">${occ?'Occupied':'Vacant'}</div><strong>${b}</strong><small>Unit ${b.startsWith('7')?'7':'6'}</small><small>${occ?occ.name:'—'}</small>`;
    els.bedGrid.appendChild(div);
  });
}

function renderRent() {
  els.rentTable.innerHTML='';
  els.paymentHistory.innerHTML='';
  state.tenants.filter(isActive).forEach(t => {
    const status = tenantStatus(t);
    const due = nextDueDate(t);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.name}</td>
      <td>${formatDate(t.paidUntil)}</td>
      <td>${due}</td>
      <td>${formatDate(t.lastPaymentDate)}</td>
      <td><span class="badge ${status.className}">${status.label}</span></td>
      <td>${formatCurrency(t.rentAmount)}</td>
      <td>
        ${status.label === 'Paid' && t.partialBalance===0 ? '' : `<button class="primary" data-pay="${t.id}">Record</button>`}
        <button class="secondary" data-reset="${t.id}">Reset</button>
      </td>
    `;
    els.rentTable.appendChild(tr);

    const card = document.createElement('div');
    card.className='list-card';
    card.innerHTML = `<strong>${t.name}</strong>`;
    const ul = document.createElement('ul');
    ul.className='chip-list';
    (t.paymentHistory||[]).slice().reverse().forEach(p => {
      const li = document.createElement('li'); li.className='chip';
      const color = p.status==='Paid' ? 'paid' : (p.status==='Partial' ? 'partial' : 'pending');
      const meta = [p.collectedBy, p.method].filter(Boolean).join(' • ');
      li.innerHTML = `<span class="badge ${color}">${p.status}</span> ${p.dueDate} • ${formatCurrency(p.amount)} • bal ${p.remaining ?? 0}${meta ? ' • '+meta : ''}`;
      ul.appendChild(li);
    });
    card.appendChild(ul);
    els.paymentHistory.appendChild(card);
  });
  els.rentTable.querySelectorAll('[data-pay]').forEach(btn => btn.addEventListener('click', () => { openPaymentModal(); els.paymentForm.tenantId.value = btn.dataset.pay; }));
  els.rentTable.querySelectorAll('[data-reset]').forEach(btn => btn.addEventListener('click', () => { if(confirm('Reset rent cycle and clear payment history?')) resetTenantCycle(btn.dataset.reset); }));
}

function renderLedger() {
  const rows = state.ledger.slice().sort((a,b)=> a.date.localeCompare(b.date));
  let bal = 0;
  els.ledgerTable.innerHTML='';
  rows.forEach(r => {
    bal += Number(r.amount)||0;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.date}</td><td>${r.type||''}</td><td>${r.category||''}</td><td>${r.description||''}</td><td>${formatCurrency(r.amount)}</td><td>${r.unit||''}</td><td>${formatCurrency(bal)}</td>`;
    els.ledgerTable.appendChild(tr);
  });
  state._cashBalance = bal;
}

function renderDashboard() {
  const active = state.tenants.filter(t=>isActive(t));
  const occupied = active.length;
  const vacant = BED_SPACES.length - occupied;
  const totalRent = active.reduce((s,t)=>s+(t.rentAmount||DEFAULT_RENT),0);
  const month = monthFilter || today().slice(0,7);
  const collected = state.ledger.filter(l=>l.type==='Income' && l.category==='Rent Payment' && l.date.startsWith(month)).reduce((s,c)=>s+c.amount,0);
  const pending = active.filter(t=>tenantStatus(t).label!=='Paid' || (t.partialBalance||0)>0)
    .reduce((s,t)=>s+((t.rentAmount||DEFAULT_RENT) - (t.partialBalance||0)),0);
  const overdueTenants = active.filter(t=>tenantStatus(t).label==='Overdue');

  els.dashboard.totalRent.textContent = formatCurrency(totalRent);
  els.dashboard.rentCollected.textContent = formatCurrency(collected);
  els.dashboard.rentPending.textContent = formatCurrency(pending);
  els.dashboard.overdue.textContent = overdueTenants.length;
  els.dashboard.occupied.textContent = occupied;
  els.dashboard.vacant.textContent = vacant;
  els.dashboard.cashBalance.textContent = formatCurrency(state._cashBalance||0);

  const upcoming = active.filter(t => {
    const due = new Date(nextDueDate(t));
    const diff = (due - new Date())/(1000*60*60*24);
    return diff >=0 && diff <=7;
  });
  els.dashboard.upcomingCount.textContent = `Upcoming (7d): ${upcoming.length}`;
  els.dashboard.upcomingList.innerHTML='';
  upcoming.forEach(t => {
    const li = document.createElement('li');
    const due = new Date(nextDueDate(t));
    const diff = Math.floor((due - new Date())/(1000*60*60*24));
    const color = diff === 0 ? 'red' : diff <=3 ? 'yellow' : 'green';
    li.className=`chip ${color}`;
    li.innerHTML = `${t.name} — Due ${nextDueDate(t)} (${formatCurrency(t.rentAmount - (t.partialBalance||0))})`;
    els.dashboard.upcomingList.appendChild(li);
  });
  els.dashboard.overdueList.innerHTML='';
  overdueTenants.forEach(t => { const li=document.createElement('li'); li.className='chip'; li.innerHTML = `<span class="badge unpaid">Overdue</span> ${nextDueDate(t)} — ${t.name}`; els.dashboard.overdueList.appendChild(li); });

  els.dashboard.occ6.textContent = `${active.filter(t=>t.unit==='6').length}/8`;
  els.dashboard.occ7.textContent = `${active.filter(t=>t.unit==='7').length}/8`;
  els.dashboard.occTotal.textContent = `${occupied}/16`;

  renderProfit();
}

function renderProfit() {
  const month = monthFilter || today().slice(0,7);
  const incomeRent = state.ledger.filter(l=>l.type==='Income' && l.date.startsWith(month)).reduce((s,c)=>s+c.amount,0);
  const landlordRent = (state.settings.landlordRent6 + state.settings.landlordRent7);
  const utilityBase = state.settings.utilityBase * 2;
  const repairs = state.expenses.filter(e=>e.category==='Repairs' && e.date.startsWith(month)).reduce((s,c)=>s+c.amount,0);
  const misc = state.expenses.filter(e=>e.category==='Miscellaneous' && e.date.startsWith(month)).reduce((s,c)=>s+c.amount,0);
  const net = incomeRent - landlordRent - utilityBase - repairs - misc;
  els.profit.net.textContent = formatCurrency(net);
  els.dashboard.netProfit.textContent = formatCurrency(net);
  const share = net/2;
  els.profit.angel.textContent = formatCurrency(share);
  els.profit.brother.textContent = formatCurrency(share);

  const withdrawalsAngel = state.ledger.filter(l=>l.category==='Withdrawal-Angel').reduce((s,c)=>s + Math.abs(c.amount||0),0);
  const withdrawalsBro = state.ledger.filter(l=>l.category==='Withdrawal-Brother').reduce((s,c)=>s + Math.abs(c.amount||0),0);
  els.profit.angelWithdrawals.textContent = formatCurrency(withdrawalsAngel);
  els.profit.broWithdrawals.textContent = formatCurrency(withdrawalsBro);
  const profitToDate = state.ledger.reduce((s,l)=>s+(l.amount||0),0);
  els.profit.angelProfit.textContent = formatCurrency(profitToDate/2);
  els.profit.broProfit.textContent = formatCurrency(profitToDate/2);
  els.profit.angelBalance.textContent = formatCurrency(54000 + profitToDate/2 - withdrawalsAngel);
  els.profit.broBalance.textContent = formatCurrency(54000 + profitToDate/2 - withdrawalsBro);
}

function renderUtilities() { /* placeholder for future UI */ }

function renderAll() {
  renderLedger();
  renderTenants();
  renderBeds();
  renderRent();
  renderUtilities();
  renderDashboard();
  renderRepairs();
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='bedspace-backup.json'; a.click(); URL.revokeObjectURL(url);
}

function importBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!confirm('Importing will overwrite existing data. Continue?')) { e.target.value=''; return; }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      ['tenants','payments','expenses','utilities','repairs','ledger','settings'].forEach(k => { state[k] = data[k] || state[k]; });
      migrateSettings();
      migrateTenants();
      saveState();
      renderAll();
    } catch(err) { alert('Import failed: invalid JSON'); }
  };
  reader.readAsText(file);
}

window.addEventListener('DOMContentLoaded', init);
