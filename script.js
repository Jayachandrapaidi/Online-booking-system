/* Pro Booking - client-side only (localStorage) */
/* Features:
   - Booking model: id, name, email, phone, serviceId, serviceName, duration, date, time, start, end, status, notes, createdAt
   - Add / Edit / Delete
   - Conflict detection using duration & overlapping time
   - Filters, search, sort
   - Export CSV
*/

(() => {
  'use strict';

  /* ---------- Config: services with durations (minutes) ---------- */
  const SERVICES = [
    { id: 'svc-doctor', name: 'Doctor Consultation', duration: 30 },
    { id: 'svc-salon',  name: 'Salon Haircut',         duration: 45 },
    { id: 'svc-restaurant', name: 'Restaurant Table',   duration: 120 },
    { id: 'svc-yoga',   name: 'Yoga Class',            duration: 60 }
  ];

  /* ---------- Helpers ---------- */
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const lsKey = 'probook_bookings_v1';

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

  function timeToMinutes(t) {
    if (!t) return null;
    const [hh, mm] = t.split(':').map(Number);
    return hh * 60 + mm;
  }
  function minutesToTime(min) {
    const hh = String(Math.floor(min/60)).padStart(2,'0');
    const mm = String(min % 60).padStart(2,'0');
    return `${hh}:${mm}`;
  }

  function isPastDate(dateStr, timeStr) {
    const now = new Date();
    const [y,m,d] = dateStr.split('-').map(Number);
    if (!y) return true;
    const dt = new Date(y, m-1, d);
    if (timeStr) {
      const [hh,mm] = timeStr.split(':').map(Number);
      dt.setHours(hh, mm, 0, 0);
    }
    return dt < now;
  }

  function readBookings() {
    try {
      return JSON.parse(localStorage.getItem(lsKey) || '[]');
    } catch (e) {
      console.error('read error', e);
      return [];
    }
  }

  function writeBookings(list) {
    localStorage.setItem(lsKey, JSON.stringify(list));
  }

  /* ---------- Booking conflict check:
       two bookings overlap when intervals intersect (start < otherEnd && otherStart < end)
       Only check conflicts for SAME service and SAME date.
  */
  function hasConflict(newB, existingList) {
    const ns = timeToMinutes(newB.time);
    const ne = ns + newB.duration;
    return existingList.some(b => {
      if (b.id === newB.id) return false; // skip same booking (when editing)
      if (b.serviceId !== newB.serviceId) return false;
      if (b.date !== newB.date) return false;
      const bs = timeToMinutes(b.time);
      const be = bs + b.duration;
      return (ns < be && bs < ne); // overlap
    });
  }

  /* ---------- DOM refs ---------- */
  const refs = {
    form: $('#bookingForm'),
    id: $('#bookingId'),
    name: $('#name'),
    email: $('#email'),
    phone: $('#phone'),
    service: $('#service'),
    date: $('#date'),
    time: $('#time'),
    notes: $('#notes'),
    cancelEdit: $('#cancelEdit'),
    bookingList: $('#bookingList'),
    count: $('#count'),
    statConfirmed: $('#statConfirmed'),
    statPending: $('#statPending'),
    statCancelled: $('#statCancelled'),
    q: $('#q'),
    filterService: $('#filterService'),
    filterStatus: $('#filterStatus'),
    filterDate: $('#filterDate'),
    sortBy: $('#sortBy'),
    applyFilters: $('#applyFilters'),
    resetFilters: $('#resetFilters'),
    exportCsv: $('#exportCsv'),
    clearAll: $('#clearAll'),
    emptyMsg: $('#emptyMsg')
  };

  /* ---------- Initialize services, filters ---------- */
  function initServices() {
    refs.service.innerHTML = '<option value="">-- Select service --</option>';
    refs.filterService.innerHTML = '<option value="">All services</option>';
    SERVICES.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id; opt.textContent = `${s.name} (${s.duration}m)`;
      refs.service.appendChild(opt);

      const opt2 = opt.cloneNode(true);
      refs.filterService.appendChild(opt2);
    });
  }

  /* ---------- Validate form ---------- */
  function validateForm(data) {
    if (!data.name.trim()) return 'Name is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return 'Enter a valid email';
    if (!/^\+?[0-9\s\-]{7,20}$/.test(data.phone)) return 'Enter a valid phone';
    if (!data.serviceId) return 'Select a service';
    if (!data.date) return 'Choose a date';
    if (!data.time) return 'Choose a time';
    if (isPastDate(data.date, data.time)) return 'Date/time must not be in the past';
    return null;
  }

  /* ---------- Render bookings ---------- */
  function render(list) {
    refs.bookingList.innerHTML = '';
    if (!list.length) {
      refs.emptyMsg.style.display = 'block';
    } else {
      refs.emptyMsg.style.display = 'none';
    }

    let cConfirmed = 0, cPending = 0, cCancelled = 0;
    list.forEach(b => {
      if (b.status === 'Confirmed') cConfirmed++;
      else if (b.status === 'Pending') cPending++;
      else if (b.status === 'Cancelled') cCancelled++;

      const card = document.createElement('div');
      card.className = 'booking';
      card.dataset.id = b.id;
      card.innerHTML = `
        <div class="left">
          <div class="title">${escapeHtml(b.serviceName)}</div>
          <div class="when">${escapeHtml(b.date)} • ${escapeHtml(b.time)} (${b.duration}m)</div>
          <div class="meta">${escapeHtml(b.name)} • ${escapeHtml(b.email)} • ${escapeHtml(b.phone)}</div>
        </div>
        <div class="right">
          <div style="text-align:right;margin-bottom:8px">
            <span class="badge ${b.status.toLowerCase()}">${b.status}</span>
          </div>
          <div class="actions">
            <button title="Edit" class="icon-btn edit" data-id="${b.id}">✏️</button>
            ${b.status !== 'Confirmed' ? `<button title="Confirm" class="icon-btn confirm" data-id="${b.id}">✔️</button>` : ''}
            ${b.status !== 'Cancelled' ? `<button title="Cancel" class="icon-btn cancel" data-id="${b.id}">✖️</button>` : ''}
            <button title="Delete" class="icon-btn delete" data-id="${b.id}">🗑️</button>
          </div>
        </div>
      `;
      refs.bookingList.appendChild(card);
    });

    refs.count.textContent = list.length;
    refs.statConfirmed.textContent = cConfirmed;
    refs.statPending.textContent = cPending;
    refs.statCancelled.textContent = cCancelled;
  }

  /* ---------- Utility: escape HTML ---------- */
  function escapeHtml(s='') {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  /* ---------- CRUD operations ---------- */
  function getAllBookings() { return readBookings(); }

  function saveBooking(data) {
    const list = getAllBookings();
    if (data.id) {
      // edit
      const idx = list.findIndex(x => x.id === data.id);
      if (idx >= 0) {
        list[idx] = data;
      } else list.push(data);
    } else {
      // new
      data.id = uid();
      data.createdAt = new Date().toISOString();
      list.push(data);
    }
    writeBookings(list);
  }

  function deleteBooking(id) {
    let list = getAllBookings().filter(b => b.id !== id);
    writeBookings(list);
    applyAndRender();
  }

  function updateStatus(id, status) {
    const list = getAllBookings();
    const b = list.find(x => x.id === id);
    if (!b) return;
    b.status = status;
    writeBookings(list);
    applyAndRender();
  }

  /* ---------- Form handlers ---------- */
  function fillFormForEdit(b) {
    refs.id.value = b.id;
    refs.name.value = b.name;
    refs.email.value = b.email;
    refs.phone.value = b.phone;
    refs.service.value = b.serviceId;
    refs.date.value = b.date;
    refs.time.value = b.time;
    refs.notes.value = b.notes || '';
    refs.cancelEdit.hidden = false;
    refs.form.querySelector('button[type="submit"]').textContent = 'Update Booking';
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function resetForm() {
    refs.id.value = '';
    refs.form.reset();
    refs.cancelEdit.hidden = true;
    refs.form.querySelector('button[type="submit"]').textContent = 'Save Booking';
  }

  /* ---------- Apply filters & render ---------- */
  function applyAndRender() {
    const list = getAllBookings();

    // filters
    const q = refs.q.value.trim().toLowerCase();
    const fService = refs.filterService.value;
    const fStatus = refs.filterStatus.value;
    const fDate = refs.filterDate.value;
    const sort = refs.sortBy.value;

    let out = list.filter(b => {
      if (q) {
        if (!(`${b.name} ${b.email}`.toLowerCase().includes(q))) return false;
      }
      if (fService && b.serviceId !== fService) return false;
      if (fStatus && b.status !== fStatus) return false;
      if (fDate && b.date !== fDate) return false;
      return true;
    });

    out.sort((a,b) => {
      const ad = a.date + ' ' + a.time;
      const bd = b.date + ' ' + b.time;
      if (sort === 'date-asc') return ad.localeCompare(bd);
      if (sort === 'date-desc') return bd.localeCompare(ad);
      return 0;
    });

    render(out);
  }

  /* ---------- CSV Export ---------- */
  function exportCSV() {
    const list = getAllBookings();
    if (!list.length) {
      alert('No bookings to export.');
      return;
    }
    const headers = ['id','name','email','phone','serviceId','serviceName','duration','date','time','status','notes','createdAt'];
    const rows = list.map(b => headers.map(h => `"${(b[h]||'').toString().replace(/"/g,'""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `bookings_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'_')}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  /* ---------- Event wiring ---------- */
  function attachEvents() {
    // form submit
    refs.form.addEventListener('submit', e => {
      e.preventDefault();
      const serviceId = refs.service.value;
      const serviceDef = SERVICES.find(s => s.id === serviceId);
      const data = {
        id: refs.id.value || null,
        name: refs.name.value.trim(),
        email: refs.email.value.trim(),
        phone: refs.phone.value.trim(),
        serviceId,
        serviceName: serviceDef ? serviceDef.name : '',
        duration: serviceDef ? serviceDef.duration : 30,
        date: refs.date.value,
        time: refs.time.value,
        notes: refs.notes.value.trim(),
        status: 'Pending'
      };

      // validation
      const err = validateForm(data);
      if (err) { alert(err); return; }

      // conflict detection
      if (hasConflict(data, getAllBookings())) {
        const ok = confirm('This booking conflicts with an existing booking for the same service. Save anyway?');
        if (!ok) return;
      }

      // save
      saveBooking(data);
      resetForm();
      applyAndRender();
    });

    refs.cancelEdit.addEventListener('click', () => resetForm());

    // delegate actions in booking list
    refs.bookingList.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.classList.contains('edit')) {
        const b = getAllBookings().find(x => x.id === id);
        if (b) fillFormForEdit(b);
      } else if (btn.classList.contains('delete')) {
        if (confirm('Delete this booking?')) deleteBooking(id);
      } else if (btn.classList.contains('confirm')) {
        updateStatus(id, 'Confirmed');
      } else if (btn.classList.contains('cancel')) {
        updateStatus(id, 'Cancelled');
      }
    });

    // filters
    refs.applyFilters.addEventListener('click', applyAndRender);
    refs.resetFilters.addEventListener('click', () => {
      refs.q.value = ''; refs.filterService.value = ''; refs.filterStatus.value = ''; refs.filterDate.value = ''; refs.sortBy.value = 'date-asc';
      applyAndRender();
    });

    refs.q.addEventListener('input', () => { /* optional live search */ });

    // export & clear
    refs.exportCsv.addEventListener('click', exportCSV);
    refs.clearAll.addEventListener('click', () => {
      if (confirm('Clear all bookings? This cannot be undone.')) {
        writeBookings([]);
        applyAndRender();
      }
    });
  }

  /* ---------- Seed demo data (only if none) ---------- */
  function seedDemo() {
    const list = getAllBookings();
    if (list.length) return;
    const today = new Date();
    const d1 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const d2 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2);

    const seed = [
      { id: uid(), name:'Arjun Rao', email:'arjun@example.com', phone:'+91 90000 12345', serviceId:'svc-doctor', serviceName:'Doctor Consultation', duration:30, date: d1.toISOString().slice(0,10), time:'10:00', status:'Confirmed', notes:'', createdAt: new Date().toISOString() },
      { id: uid(), name:'Sana Mehta', email:'sana@example.com', phone:'+91 98000 54321', serviceId:'svc-salon', serviceName:'Salon Haircut', duration:45, date: d1.toISOString().slice(0,10), time:'11:00', status:'Pending', notes:'', createdAt: new Date().toISOString() },
      { id: uid(), name:'Ravi Kumar', email:'ravi@example.com', phone:'+91 91234 56789', serviceId:'svc-yoga', serviceName:'Yoga Class', duration:60, date: d2.toISOString().slice(0,10), time:'09:00', status:'Pending', notes:'Bring mat', createdAt: new Date().toISOString() },
    ];
    writeBookings(seed);
  }

  /* ---------- Init ---------- */
  function init() {
    initServices();
    attachEvents();
    seedDemo();
    applyAndRender();
  }

  // Start
  init();

})();
