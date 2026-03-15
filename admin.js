(() => {
  // =============================================================
  // SUPABASE CONFIG — Replace these with your project credentials
  // =============================================================
  const SUPABASE_URL = 'https://jllsrbnryhmxislzorsa.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsbHNyYm5yeWhteGlzbHpvcnNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDI3NDgsImV4cCI6MjA4OTA3ODc0OH0.C-ynMRk15KhIkS5eS3VTc_lMqO1CcAPvNV9lUnq08aY';

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ===== ADMIN PASSWORD =====
  const ADMIN_HASH = '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8'; // "password"

  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ===== SUPABASE DATA HELPERS =====
  async function getStudents() {
    const { data, error } = await supabase.from('students').select('*').order('name');
    if (error) { console.error('Error fetching students:', error); return []; }
    return data || [];
  }

  async function getAttendance() {
    const { data, error } = await supabase.from('attendance').select('*').order('date', { ascending: false });
    if (error) { console.error('Error fetching attendance:', error); return []; }
    return data || [];
  }

  async function getPayments() {
    const { data, error } = await supabase.from('payments').select('*').order('date', { ascending: false });
    if (error) { console.error('Error fetching payments:', error); return []; }
    return data || [];
  }

  async function getActivity() {
    const { data, error } = await supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(30);
    if (error) { console.error('Error fetching activity:', error); return []; }
    return data || [];
  }

  async function addActivity(text) {
    await supabase.from('activity_log').insert({ text });
  }

  // ===== LOGIN =====
  const loginScreen = document.getElementById('loginScreen');
  const dashboard = document.getElementById('dashboard');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');

  if (sessionStorage.getItem('rc_auth') === '1') {
    loginScreen.style.display = 'none';
    dashboard.style.display = 'block';
    initDashboard();
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = document.getElementById('loginPassword').value;
    const hash = await sha256(pw);
    if (hash === ADMIN_HASH) {
      sessionStorage.setItem('rc_auth', '1');
      loginScreen.style.display = 'none';
      dashboard.style.display = 'block';
      initDashboard();
    } else {
      loginError.textContent = 'Incorrect password. Try again.';
      document.getElementById('loginPassword').value = '';
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem('rc_auth');
    location.reload();
  });

  // ===== TABS =====
  document.querySelectorAll('.dash-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    });
  });

  // ===== DASHBOARD INIT =====
  async function initDashboard() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('attendanceDate').value = today;
    billingMonthInput.value = getCurrentMonth();
    await refreshAll();
  }

  async function refreshAll() {
    await Promise.all([
      renderStudents(),
      renderRoster(),
      renderAttendance(),
      renderPayments(),
      renderOverview(),
      renderHistory(),
      renderCohorts(),
    ]);
  }

  // ===== OVERVIEW =====
  async function renderOverview() {
    const [students, payments, attendance, activity] = await Promise.all([
      getStudents(), getPayments(), getAttendance(), getActivity()
    ]);

    const placedStudents = students.filter(s => s.status === 'Placed');
    const pipelineStudents = students.filter(s => s.status !== 'Placed');
    document.getElementById('kpiMembers').textContent = placedStudents.length;
    document.getElementById('kpiPipeline').textContent = pipelineStudents.length;

    const totalAtt = attendance.length;
    const present = attendance.filter(a => a.status === 'P').length;
    document.getElementById('kpiAttendance').textContent = totalAtt ? Math.round((present / totalAtt) * 100) + '%' : '0%';

    document.getElementById('kpiPaid').textContent = payments.length;

    const paidStudentIds = new Set(payments.map(p => p.student_id));
    const unpaid = students.filter(s => !paidStudentIds.has(s.id)).length;
    document.getElementById('kpiUnpaid').textContent = unpaid;

    // Activity log
    const logEl = document.getElementById('activityLog');
    if (activity.length === 0) {
      logEl.innerHTML = '<p class="empty-state">No activity yet. Start by adding students.</p>';
    } else {
      logEl.innerHTML = activity.map(a => {
        const d = new Date(a.created_at);
        const timeStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `<div class="activity-item"><span class="activity-item__time">${timeStr}</span><span>${esc(a.text)}</span></div>`;
      }).join('');
    }
  }

  // ===== STUDENTS =====
  // ===== STUDENTS PIPELINE =====
  const studentModal = document.getElementById('studentModal');
  const studentForm = document.getElementById('studentForm');
  const statusSelect = document.getElementById('sStatus');
  let currentPipelineFilter = 'all';

  const STAGES = ['Survey Submitted', 'Contacted', 'Assessment Scheduled', 'Assessed', 'Placed'];
  const NEXT_STAGE = { 'Survey Submitted': 'Contacted', 'Contacted': 'Assessment Scheduled', 'Assessment Scheduled': 'Assessed', 'Assessed': 'Placed' };
  const STAGE_CLASS = { 'Survey Submitted': 'survey', 'Contacted': 'contacted', 'Assessment Scheduled': 'scheduled', 'Assessed': 'assessed', 'Placed': 'placed' };
  const STAGE_STG = { 'Survey Submitted': 'stg-survey', 'Contacted': 'stg-contacted', 'Assessment Scheduled': 'stg-scheduled', 'Assessed': 'stg-assessed', 'Placed': 'stg-placed' };

  // Show/hide form sections based on stage
  function updateFormSections() {
    const stage = statusSelect.value;
    const stageIdx = STAGES.indexOf(stage);
    const assessSection = document.getElementById('assessmentSection');
    const placeSection = document.getElementById('placementSection');
    assessSection.classList.toggle('hidden', stageIdx < 2);
    placeSection.classList.toggle('hidden', stageIdx < 4);
  }

  statusSelect.addEventListener('change', updateFormSections);

  // Pipeline filter buttons
  document.querySelectorAll('.pipeline__stage').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pipeline__stage').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPipelineFilter = btn.dataset.stage;
      renderStudents();
    });
  });

  // Add current student (skip pipeline)
  document.getElementById('addCurrentStudentBtn').addEventListener('click', () => {
    document.getElementById('studentModalTitle').textContent = 'Add Current Student';
    studentForm.reset();
    document.getElementById('studentId').value = '';
    statusSelect.value = 'Placed';
    updateFormSections();
    studentModal.style.display = 'flex';
  });

  // Add new student (pipeline)
  document.getElementById('addStudentBtn').addEventListener('click', () => {
    document.getElementById('studentModalTitle').textContent = 'New Student';
    studentForm.reset();
    document.getElementById('studentId').value = '';
    statusSelect.value = 'Survey Submitted';
    updateFormSections();
    studentModal.style.display = 'flex';
  });

  document.getElementById('studentModalClose').addEventListener('click', () => studentModal.style.display = 'none');
  document.getElementById('studentCancelBtn').addEventListener('click', () => studentModal.style.display = 'none');
  studentModal.addEventListener('click', (e) => { if (e.target === studentModal) studentModal.style.display = 'none'; });

  studentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('studentId').value;
    const student = {
      name: document.getElementById('sName').value,
      grade: document.getElementById('sGrade').value,
      status: document.getElementById('sStatus').value,
      parent: document.getElementById('sParent').value,
      phone: document.getElementById('sPhone').value,
      email: document.getElementById('sEmail').value,
      club: document.getElementById('sClub').value,
      assessment_date: document.getElementById('sAssessmentDate').value || null,
      assessment_notes: document.getElementById('sAssessmentNotes').value,
      teacher: document.getElementById('sTeacher').value || null,
      student_group: document.getElementById('sGroup').value || null,
      time_slot: document.getElementById('sTime').value || null,
      level: document.getElementById('sLevel').value || null,
      lesson: parseInt(document.getElementById('sLesson').value) || null,
      notes: document.getElementById('sNotes').value,
    };

    if (id) {
      const { error } = await supabase.from('students').update(student).eq('id', id);
      if (error) { alert('Error updating student: ' + error.message); return; }
      await addActivity(`Updated ${student.name} → ${student.status}`);
    } else {
      const { error } = await supabase.from('students').insert(student);
      if (error) { alert('Error adding student: ' + error.message); return; }
      await addActivity(`New student: ${student.name} (${student.status})`);
    }

    studentModal.style.display = 'none';
    await refreshAll();
  });

  async function renderStudents() {
    const students = await getStudents();
    const container = document.getElementById('studentCards');
    const empty = document.getElementById('studentsEmpty');

    // Update new badge on Students tab
    const newCount = students.filter(s => s.status === 'Survey Submitted').length;
    const newBadge = document.getElementById('newBadge');
    if (newCount > 0) {
      newBadge.textContent = newCount + ' NEW';
      newBadge.style.display = 'inline-block';
    } else {
      newBadge.style.display = 'none';
    }

    // Update pipeline counts
    document.getElementById('countAll').textContent = students.length;
    STAGES.forEach(stage => {
      const count = students.filter(s => s.status === stage).length;
      const countId = 'count' + { 'Survey Submitted': 'Survey', 'Contacted': 'Contacted', 'Assessment Scheduled': 'Scheduled', 'Assessed': 'Assessed', 'Placed': 'Placed' }[stage];
      const el = document.getElementById(countId);
      if (el) el.textContent = count;
    });

    // Filter
    const filtered = currentPipelineFilter === 'all' ? students : students.filter(s => s.status === currentPipelineFilter);

    if (filtered.length === 0) {
      container.innerHTML = '';
      empty.style.display = 'block';
      empty.textContent = students.length === 0 ? 'No students yet. Click "+ New Student" to get started.' : 'No students in this stage.';
      return;
    }
    empty.style.display = 'none';

    container.innerHTML = filtered.map(s => {
      const stage = s.status || 'Survey Submitted';
      const stageClass = STAGE_CLASS[stage] || 'survey';
      const stageStg = STAGE_STG[stage] || 'stg-survey';
      const nextStage = NEXT_STAGE[stage];

      let detailsHtml = `
        <span class="student-card__detail"><strong>Grade:</strong> ${esc(s.grade) || '—'}</span>
        <span class="student-card__detail"><strong>Club:</strong> ${esc(s.club) || '—'}</span>
        <span class="student-card__detail"><strong>Parent:</strong> ${esc(s.parent) || '—'}</span>
        <span class="student-card__detail"><strong>Phone:</strong> ${esc(s.phone) || '—'}</span>
      `;

      let placementHtml = '';
      if (stage === 'Placed') {
        placementHtml = `<div class="student-card__placement">
          <span><strong>Teacher:</strong> ${esc(s.teacher)}</span>
          <span><strong>Group:</strong> ${esc(s.student_group)}</span>
          <span><strong>Time:</strong> ${esc(s.time_slot)}</span>
          <span><strong>RM Level:</strong> ${s.level ? 'RM ' + esc(s.level) : '—'}</span>
          <span><strong>Lesson:</strong> ${s.lesson || '—'}</span>
        </div>`;
      }

      let assessHtml = '';
      if (s.assessment_date) {
        assessHtml = `<div class="student-card__detail" style="width:100%;margin-top:4px;"><strong>Assessment:</strong> ${esc(s.assessment_date)} ${s.assessment_notes ? '— ' + esc(s.assessment_notes) : ''}</div>`;
      }

      const advanceBtn = nextStage ? `<button class="advance" onclick="advanceStudent('${s.id}', '${nextStage}')">Move to ${nextStage} &rarr;</button>` : '';

      return `
        <div class="student-card stage-${stageClass}">
          <div class="student-card__header">
            <div class="student-card__name">${esc(s.name)}</div>
            <span class="student-card__stage ${stageStg}">${stage}</span>
          </div>
          <div class="student-card__details">
            ${detailsHtml}
            ${assessHtml}
          </div>
          ${placementHtml}
          <div class="student-card__actions">
            ${advanceBtn}
            <button onclick="editStudent('${s.id}')">Edit</button>
            <button class="del" onclick="deleteStudent('${s.id}')">Delete</button>
          </div>
        </div>
      `;
    }).join('');
  }

  window.advanceStudent = async function(id, nextStage) {
    const { error } = await supabase.from('students').update({ status: nextStage }).eq('id', id);
    if (error) { alert('Error: ' + error.message); return; }
    const students = await getStudents();
    const s = students.find(x => x.id === id);
    await addActivity(`${s ? s.name : 'Student'} → ${nextStage}`);
    // If moving to Placed, open the edit modal so they can fill in placement details
    if (nextStage === 'Placed' && s) {
      await refreshAll();
      editStudent(id);
      return;
    }
    await refreshAll();
  };

  window.editStudent = async function(id) {
    const students = await getStudents();
    const s = students.find(x => x.id === id);
    if (!s) return;
    document.getElementById('studentModalTitle').textContent = 'Edit Student';
    document.getElementById('studentId').value = s.id;
    document.getElementById('sStatus').value = s.status || 'Survey Submitted';
    document.getElementById('sName').value = s.name || '';
    document.getElementById('sGrade').value = s.grade || '';
    document.getElementById('sParent').value = s.parent || '';
    document.getElementById('sPhone').value = s.phone || '';
    document.getElementById('sEmail').value = s.email || '';
    document.getElementById('sClub').value = s.club || 'Reading';
    document.getElementById('sAssessmentDate').value = s.assessment_date || '';
    document.getElementById('sAssessmentNotes').value = s.assessment_notes || '';
    document.getElementById('sTeacher').value = s.teacher || '';
    document.getElementById('sGroup').value = s.student_group || '';
    document.getElementById('sTime').value = s.time_slot || '';
    document.getElementById('sLevel').value = s.level || '';
    document.getElementById('sLesson').value = s.lesson || '';
    document.getElementById('sNotes').value = s.notes || '';
    updateFormSections();
    studentModal.style.display = 'flex';
  };

  window.deleteStudent = async function(id) {
    const students = await getStudents();
    const s = students.find(x => x.id === id);
    if (!s || !confirm(`Delete ${s.name}? This will also remove their attendance and payment records.`)) return;
    const { error } = await supabase.from('students').delete().eq('id', id);
    if (error) { alert('Error deleting: ' + error.message); return; }
    await addActivity(`Deleted student: ${s.name}`);
    await refreshAll();
  };

  // ===== CURRENT STUDENTS (ROSTER) =====
  const rosterFilterTeacher = document.getElementById('rosterFilterTeacher');
  const rosterFilterGroup = document.getElementById('rosterFilterGroup');
  const rosterFilterTime = document.getElementById('rosterFilterTime');

  rosterFilterTeacher.addEventListener('change', () => renderRoster());
  rosterFilterGroup.addEventListener('change', () => renderRoster());
  rosterFilterTime.addEventListener('change', () => renderRoster());

  async function renderRoster() {
    const allStudents = await getStudents();
    const placed = allStudents.filter(s => s.status === 'Placed' || !s.status);

    // Apply filters
    const teacherFilter = rosterFilterTeacher.value;
    const groupFilter = rosterFilterGroup.value;
    const timeFilter = rosterFilterTime.value;

    let filtered = placed;
    if (teacherFilter) filtered = filtered.filter(s => s.teacher === teacherFilter);
    if (groupFilter) filtered = filtered.filter(s => s.student_group === groupFilter);
    if (timeFilter) filtered = filtered.filter(s => s.time_slot === timeFilter);

    // KPIs
    document.getElementById('rosterTotal').textContent = placed.length;
    document.getElementById('rosterMonWed').textContent = placed.filter(s => s.student_group === 'Mon/Wed').length;
    document.getElementById('rosterTueThu').textContent = placed.filter(s => s.student_group === 'Tue/Thu').length;

    const body = document.getElementById('rosterBody');
    const empty = document.getElementById('rosterEmpty');

    if (filtered.length === 0) {
      body.innerHTML = '';
      empty.style.display = 'block';
      empty.textContent = placed.length === 0 ? 'No current students yet. Students appear here once they are placed through the pipeline.' : 'No students match the selected filters.';
      document.getElementById('rosterTable').style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    document.getElementById('rosterTable').style.display = '';

    // Sort by teacher, then group, then name
    filtered.sort((a, b) => {
      if (a.teacher !== b.teacher) return (a.teacher || '').localeCompare(b.teacher || '');
      if (a.student_group !== b.student_group) return (a.student_group || '').localeCompare(b.student_group || '');
      return a.name.localeCompare(b.name);
    });

    body.innerHTML = filtered.map(s => `
      <tr>
        <td><strong>${esc(s.name)}</strong></td>
        <td>${esc(s.grade)}</td>
        <td>${esc(s.teacher)}</td>
        <td>${esc(s.student_group)}</td>
        <td>${esc(s.time_slot)}</td>
        <td>${esc(s.club)}</td>
        <td>${s.level ? 'RM ' + esc(s.level) : '—'}</td>
        <td>${s.lesson || '—'}</td>
        <td>${esc(s.parent)}</td>
        <td>${esc(s.phone)}</td>
        <td class="actions">
          <button onclick="editStudent('${s.id}')">Edit</button>
        </td>
      </tr>
    `).join('');
  }

  // ===== ATTENDANCE =====
  async function renderAttendance() {
    const students = await getStudents();
    const clubFilter = document.getElementById('attendanceClub').value;
    const filtered = clubFilter ? students.filter(s => s.club && s.club.includes(clubFilter)) : students;
    const body = document.getElementById('attendanceBody');
    const empty = document.getElementById('attendanceEmpty');

    if (filtered.length === 0) {
      body.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    body.innerHTML = filtered.map(s => `
      <tr>
        <td><strong>${esc(s.name)}</strong></td>
        <td>${esc(s.club)}</td>
        <td>
          <div class="att-status">
            <button class="att-btn" data-student="${s.id}" data-name="${esc(s.name)}" data-club="${esc(s.club)}" data-status="P" onclick="setAtt(this)">Present</button>
            <button class="att-btn" data-student="${s.id}" data-name="${esc(s.name)}" data-club="${esc(s.club)}" data-status="A" onclick="setAtt(this)">Absent</button>
            <button class="att-btn" data-student="${s.id}" data-name="${esc(s.name)}" data-club="${esc(s.club)}" data-status="L" onclick="setAtt(this)">Late</button>
            <button class="att-btn" data-student="${s.id}" data-name="${esc(s.name)}" data-club="${esc(s.club)}" data-status="E" onclick="setAtt(this)">Excused</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  document.getElementById('attendanceClub').addEventListener('change', () => renderAttendance());

  const attSelections = {};

  window.setAtt = function(btn) {
    const studentId = btn.dataset.student;
    const status = btn.dataset.status;
    attSelections[studentId] = {
      status,
      name: btn.dataset.name,
      club: btn.dataset.club
    };
    btn.parentElement.querySelectorAll('.att-btn').forEach(b => b.className = 'att-btn');
    btn.classList.add('selected-' + status);
  };

  document.getElementById('saveAttendanceBtn').addEventListener('click', async () => {
    const date = document.getElementById('attendanceDate').value;
    if (!date) return alert('Please select a date.');

    const entries = Object.entries(attSelections);
    if (entries.length === 0) return alert('Please mark attendance for at least one student.');

    const records = entries.map(([studentId, info]) => ({
      date,
      student_id: studentId,
      student_name: info.name,
      club: info.club,
      status: info.status,
    }));

    // Upsert: delete existing records for this date/students, then insert
    for (const r of records) {
      await supabase.from('attendance').delete().eq('date', date).eq('student_id', r.student_id);
    }

    const { error } = await supabase.from('attendance').insert(records);
    if (error) { alert('Error saving attendance: ' + error.message); return; }

    await addActivity(`Recorded attendance for ${records.length} student(s) on ${date}`);
    Object.keys(attSelections).forEach(k => delete attSelections[k]);
    await refreshAll();
    alert(`Attendance saved for ${records.length} student(s).`);
  });

  async function renderHistory() {
    const records = await getAttendance();
    const body = document.getElementById('historyBody');
    const empty = document.getElementById('historyEmpty');

    if (records.length === 0) {
      body.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    const statusLabels = { P: 'Present', A: 'Absent', L: 'Late', E: 'Excused' };
    body.innerHTML = records.slice(0, 100).map(r => `
      <tr>
        <td>${esc(r.date)}</td>
        <td>${esc(r.student_name)}</td>
        <td>${esc(r.club)}</td>
        <td><span class="att-btn selected-${r.status}" style="cursor:default">${statusLabels[r.status] || r.status}</span></td>
      </tr>
    `).join('');
  }

  // ===== PAYMENTS =====
  const paymentModal = document.getElementById('paymentModal');
  const paymentForm = document.getElementById('paymentForm');
  const billingMonthInput = document.getElementById('billingMonth');
  let selectedPayMethod = '';

  // Set billing month to current month
  function getCurrentMonth() {
    return new Date().toISOString().slice(0, 7);
  }

  // Month navigation
  document.getElementById('prevMonthBtn').addEventListener('click', () => {
    const d = new Date(billingMonthInput.value + '-01');
    d.setMonth(d.getMonth() - 1);
    billingMonthInput.value = d.toISOString().slice(0, 7);
    renderPayments();
  });

  document.getElementById('nextMonthBtn').addEventListener('click', () => {
    const d = new Date(billingMonthInput.value + '-01');
    d.setMonth(d.getMonth() + 1);
    billingMonthInput.value = d.toISOString().slice(0, 7);
    renderPayments();
  });

  billingMonthInput.addEventListener('change', () => renderPayments());

  // Payment method buttons
  document.querySelectorAll('.pay-method-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedPayMethod = btn.dataset.method;
      document.getElementById('pMethod').value = selectedPayMethod;
    });
  });

  // Open mark-paid modal for a specific student
  window.markPaid = function(studentId, studentName) {
    paymentForm.reset();
    selectedPayMethod = '';
    document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('pStudentId').value = studentId;
    document.getElementById('pStudentName').value = studentName;
    document.getElementById('payStudentDisplay').textContent = studentName;
    document.getElementById('payModalTitle').textContent = 'Mark Payment';
    document.getElementById('pDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('pMethod').value = '';
    paymentModal.style.display = 'flex';
  };

  document.getElementById('paymentModalClose').addEventListener('click', () => paymentModal.style.display = 'none');
  document.getElementById('paymentCancelBtn').addEventListener('click', () => paymentModal.style.display = 'none');
  paymentModal.addEventListener('click', (e) => { if (e.target === paymentModal) paymentModal.style.display = 'none'; });

  paymentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const studentId = document.getElementById('pStudentId').value;
    const studentName = document.getElementById('pStudentName').value;
    const amount = parseFloat(document.getElementById('pAmount').value);
    const method = document.getElementById('pMethod').value;
    const period = billingMonthInput.value;

    if (!method) { alert('Please select a payment method.'); return; }

    const monthLabel = new Date(period + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' });

    const payment = {
      student_id: studentId,
      student_name: studentName,
      amount,
      date: document.getElementById('pDate').value,
      method,
      period,
      notes: document.getElementById('pNotes').value,
    };

    const { error } = await supabase.from('payments').insert(payment);
    if (error) { alert('Error recording payment: ' + error.message); return; }

    await addActivity(`Payment: $${amount.toFixed(2)} from ${studentName} via ${method} for ${monthLabel}`);
    paymentModal.style.display = 'none';
    await refreshAll();
  });

  async function renderPayments() {
    const period = billingMonthInput.value;
    const [students, allPayments] = await Promise.all([getStudents(), getPayments()]);

    // Filter payments for this month
    const monthPayments = allPayments.filter(p => p.period === period);
    const paidStudentIds = new Set(monthPayments.map(p => p.student_id));

    // KPIs
    const totalCollected = monthPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const paidCount = paidStudentIds.size;
    const owedCount = students.length - paidCount;

    document.getElementById('payKpiCollected').textContent = '$' + totalCollected.toFixed(2);
    document.getElementById('payKpiPaid').textContent = paidCount;
    document.getElementById('payKpiOwed').textContent = owedCount;

    // Billing table
    const body = document.getElementById('billingBody');
    const empty = document.getElementById('billingEmpty');

    if (students.length === 0) {
      body.innerHTML = '';
      empty.style.display = 'block';
    } else {
      empty.style.display = 'none';

      // Sort: unpaid first, then paid
      const sorted = [...students].sort((a, b) => {
        const aPaid = paidStudentIds.has(a.id);
        const bPaid = paidStudentIds.has(b.id);
        if (aPaid === bPaid) return a.name.localeCompare(b.name);
        return aPaid ? 1 : -1;
      });

      body.innerHTML = sorted.map(s => {
        const payment = monthPayments.find(p => p.student_id === s.id);
        const isPaid = !!payment;

        if (isPaid) {
          return `<tr>
            <td><strong>${esc(s.name)}</strong></td>
            <td>${esc(s.club)}</td>
            <td><span class="billing-status paid">Paid</span></td>
            <td>${esc(payment.date)}</td>
            <td>$${parseFloat(payment.amount).toFixed(2)}</td>
            <td>${esc(payment.method)}</td>
            <td><button class="undo-btn" onclick="undoPayment('${payment.id}')">Undo</button></td>
          </tr>`;
        } else {
          return `<tr>
            <td><strong>${esc(s.name)}</strong></td>
            <td>${esc(s.club)}</td>
            <td><span class="billing-status unpaid">Unpaid</span></td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td><button class="mark-paid-btn" onclick="markPaid('${s.id}', '${esc(s.name)}')">Mark Paid</button></td>
          </tr>`;
        }
      }).join('');
    }

    // Full payment history (all months)
    const histBody = document.getElementById('payHistoryBody');
    const histEmpty = document.getElementById('payHistoryEmpty');

    if (allPayments.length === 0) {
      histBody.innerHTML = '';
      histEmpty.style.display = 'block';
    } else {
      histEmpty.style.display = 'none';
      histBody.innerHTML = allPayments.slice(0, 200).map(p => {
        const monthLabel = p.period ? new Date(p.period + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' }) : '';
        return `<tr>
          <td>${esc(p.date)}</td>
          <td><strong>${esc(p.student_name)}</strong></td>
          <td>$${parseFloat(p.amount).toFixed(2)}</td>
          <td>${esc(p.method)}</td>
          <td>${monthLabel}</td>
          <td>${esc(p.notes)}</td>
          <td class="actions"><button class="del" onclick="deletePayment('${p.id}')">Delete</button></td>
        </tr>`;
      }).join('');
    }
  }

  window.undoPayment = async function(id) {
    if (!confirm('Undo this payment? The student will show as unpaid.')) return;
    const { error } = await supabase.from('payments').delete().eq('id', id);
    if (error) { alert('Error: ' + error.message); return; }
    await addActivity('Undid a payment');
    await refreshAll();
  };

  window.deletePayment = async function(id) {
    if (!confirm('Delete this payment record permanently?')) return;
    const { error } = await supabase.from('payments').delete().eq('id', id);
    if (error) { alert('Error deleting: ' + error.message); return; }
    await addActivity('Deleted a payment record');
    await refreshAll();
  };

  // ===== VOICE COMMANDS =====
  const micBtn = document.getElementById('micBtn');
  const micStatus = document.getElementById('micStatus');
  const voiceBar = document.getElementById('voiceBar');
  const voiceText = document.getElementById('voiceText');
  const voiceClose = document.getElementById('voiceClose');

  let recognition = null;
  let isListening = false;

  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      isListening = true;
      micBtn.classList.add('listening');
      micStatus.textContent = 'Listening...';
      voiceBar.style.display = 'block';
      voiceText.textContent = 'Listening... speak your command.';
    };

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      voiceText.textContent = transcript;
      if (event.results[event.resultIndex].isFinal) {
        processVoiceCommand(transcript.trim());
      }
    };

    recognition.onend = () => {
      isListening = false;
      micBtn.classList.remove('listening');
      micStatus.textContent = '';
    };

    recognition.onerror = (e) => {
      isListening = false;
      micBtn.classList.remove('listening');
      micStatus.textContent = '';
      if (e.error !== 'aborted') {
        voiceText.textContent = 'Error: ' + e.error + '. Try again.';
      }
    };

    micBtn.addEventListener('click', () => {
      if (isListening) recognition.stop();
      else recognition.start();
    });
  } else {
    micBtn.style.display = 'none';
  }

  voiceClose.addEventListener('click', () => {
    voiceBar.style.display = 'none';
    if (isListening) recognition.stop();
  });

  async function processVoiceCommand(cmd) {
    const lower = cmd.toLowerCase();
    const students = await getStudents();

    // Mark attendance: "mark [name] present/absent/late/excused"
    const attMatch = lower.match(/mark\s+(.+?)\s+(present|absent|late|excused)/);
    if (attMatch) {
      const nameQuery = attMatch[1];
      const statusMap = { present: 'P', absent: 'A', late: 'L', excused: 'E' };
      const status = statusMap[attMatch[2]];
      const student = findStudent(nameQuery, students);
      if (student) {
        const date = document.getElementById('attendanceDate').value || new Date().toISOString().split('T')[0];
        await supabase.from('attendance').delete().eq('date', date).eq('student_id', student.id);
        await supabase.from('attendance').insert({
          date, student_id: student.id, student_name: student.name, club: student.club, status
        });
        await addActivity(`Voice: Marked ${student.name} as ${attMatch[2]} on ${date}`);
        voiceText.textContent = `Marked ${student.name} as ${attMatch[2]}.`;
        await refreshAll();
      } else {
        voiceText.textContent = `Could not find a student matching "${nameQuery}".`;
      }
      return;
    }

    // Add student: "add student [name]"
    const addMatch = lower.match(/add\s+student\s+(.+)/);
    if (addMatch) {
      const name = cmd.slice(cmd.toLowerCase().indexOf('student') + 8).trim();
      await supabase.from('students').insert({ name, club: 'Reading', notes: 'Added via voice' });
      await addActivity(`Voice: Added student ${name}`);
      voiceText.textContent = `Added student: ${name}. Edit their details in the Students tab.`;
      await refreshAll();
      return;
    }

    // Record payment: "payment [name] [amount]"
    const payMatch = lower.match(/payment\s+(.+?)\s+(\$?\d+(?:\.\d{2})?)/);
    if (payMatch) {
      const nameQuery = payMatch[1];
      const amount = parseFloat(payMatch[2].replace('$', ''));
      const student = findStudent(nameQuery, students);
      if (student) {
        const today = new Date().toISOString().split('T')[0];
        await supabase.from('payments').insert({
          student_id: student.id, student_name: student.name, amount, date: today, method: 'Voice Entry', notes: 'Recorded via voice'
        });
        await addActivity(`Voice: Payment of $${amount.toFixed(2)} from ${student.name}`);
        voiceText.textContent = `Recorded $${amount.toFixed(2)} payment for ${student.name}.`;
        await refreshAll();
      } else {
        voiceText.textContent = `Could not find a student matching "${nameQuery}".`;
      }
      return;
    }

    voiceText.textContent = `Command not recognized: "${cmd}". Try: "mark [name] present", "add student [name]", or "payment [name] [amount]".`;
  }

  function findStudent(query, students) {
    const q = query.toLowerCase().trim();
    return students.find(s => s.name.toLowerCase() === q) ||
           students.find(s => s.name.toLowerCase().includes(q)) ||
           students.find(s => s.name.toLowerCase().split(' ').some(part => part.startsWith(q)));
  }

  // ===== COHORTS =====
  const cohortModal = document.getElementById('cohortModal');
  const cohortForm = document.getElementById('cohortForm');
  const assignModal = document.getElementById('assignModal');
  let currentAssignCohortId = null;
  let currentAssignMax = 10;

  async function getCohorts() {
    const { data, error } = await supabase.from('cohorts').select('*').order('month', { ascending: false });
    if (error) { console.error('Error fetching cohorts:', error); return []; }
    return data || [];
  }

  async function getCohortStudents(cohortId) {
    const { data, error } = await supabase.from('cohort_students').select('*, students(name)').eq('cohort_id', cohortId);
    if (error) { console.error('Error fetching cohort students:', error); return []; }
    return data || [];
  }

  document.getElementById('addCohortBtn').addEventListener('click', () => {
    document.getElementById('cohortModalTitle').textContent = 'New Cohort';
    cohortForm.reset();
    document.getElementById('cohortId').value = '';
    document.getElementById('cMaxStudents').value = '10';
    const now = new Date();
    document.getElementById('cMonth').value = now.toISOString().slice(0, 7);
    cohortModal.style.display = 'flex';
  });

  document.getElementById('cohortModalClose').addEventListener('click', () => cohortModal.style.display = 'none');
  document.getElementById('cohortCancelBtn').addEventListener('click', () => cohortModal.style.display = 'none');
  cohortModal.addEventListener('click', (e) => { if (e.target === cohortModal) cohortModal.style.display = 'none'; });

  cohortForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('cohortId').value;
    const cohort = {
      name: document.getElementById('cName').value,
      teacher: document.getElementById('cTeacher').value,
      club: document.getElementById('cClub').value,
      month: document.getElementById('cMonth').value,
      max_students: parseInt(document.getElementById('cMaxStudents').value) || 10,
      schedule: document.getElementById('cSchedule').value,
      time_slot: document.getElementById('cTimeSlot').value,
      status: document.getElementById('cStatus').value,
      notes: document.getElementById('cNotes').value,
    };

    if (id) {
      const { error } = await supabase.from('cohorts').update(cohort).eq('id', id);
      if (error) { alert('Error updating cohort: ' + error.message); return; }
      await addActivity(`Updated cohort: ${cohort.name} (Teacher: ${cohort.teacher})`);
    } else {
      const { error } = await supabase.from('cohorts').insert(cohort);
      if (error) { alert('Error creating cohort: ' + error.message); return; }
      await addActivity(`Created cohort: ${cohort.name} (Teacher: ${cohort.teacher})`);
    }

    cohortModal.style.display = 'none';
    await refreshAll();
  });

  async function renderCohorts() {
    const cohorts = await getCohorts();
    const listEl = document.getElementById('cohortList');
    const empty = document.getElementById('cohortsEmpty');

    if (cohorts.length === 0) {
      listEl.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    let html = '';
    for (const c of cohorts) {
      const cs = await getCohortStudents(c.id);
      const maxStudents = c.max_students || 10;
      const isFull = cs.length >= maxStudents;
      const spotsLeft = maxStudents - cs.length;

      const studentTags = cs.map(s => {
        const name = s.students ? s.students.name : 'Unknown';
        return `<span class="cohort-student-tag">${esc(name)}</span>`;
      }).join('');

      const monthLabel = c.month ? new Date(c.month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' }) : '';

      html += `
        <div class="cohort-card status-${c.status}">
          <div class="cohort-card__header">
            <div class="cohort-card__title">${esc(c.name)}</div>
            <span class="cohort-card__badge badge-${c.status}">${c.status}</span>
          </div>
          <div class="cohort-card__teacher">Teacher: ${esc(c.teacher || 'Not assigned')}</div>
          <div class="cohort-card__meta">
            <span>${esc(c.club)}</span>
            <span>${monthLabel}</span>
            <span>${esc(c.schedule || 'Mon-Thu')}</span>
            <span>${esc(c.time_slot || '')}</span>
          </div>
          <div style="margin-bottom:12px;">
            <span class="cohort-card__spots ${isFull ? 'full' : ''}">${cs.length} / ${maxStudents} students${isFull ? ' — FULL' : ` — ${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left`}</span>
          </div>
          ${c.notes ? `<div class="cohort-card__notes">${esc(c.notes)}</div>` : ''}
          <div class="cohort-card__students">
            <h4>Students</h4>
            <div class="cohort-student-list">
              ${studentTags || '<span style="color:var(--text-light);font-size:0.82rem;">No students assigned yet.</span>'}
            </div>
          </div>
          <div class="cohort-card__actions">
            <button onclick="assignStudents('${c.id}', ${maxStudents})">Assign Students</button>
            <button onclick="editCohort('${c.id}')">Edit</button>
            <button class="del" onclick="deleteCohort('${c.id}')">Delete</button>
          </div>
        </div>
      `;
    }

    listEl.innerHTML = html;
  }

  window.editCohort = async function(id) {
    const cohorts = await getCohorts();
    const c = cohorts.find(x => x.id === id);
    if (!c) return;
    document.getElementById('cohortModalTitle').textContent = 'Edit Cohort';
    document.getElementById('cohortId').value = c.id;
    document.getElementById('cName').value = c.name || '';
    document.getElementById('cTeacher').value = c.teacher || '';
    document.getElementById('cClub').value = c.club || 'Reading';
    document.getElementById('cMonth').value = c.month || '';
    document.getElementById('cMaxStudents').value = c.max_students || 10;
    document.getElementById('cSchedule').value = c.schedule || 'Mon-Thu';
    document.getElementById('cTimeSlot').value = c.time_slot || 'Session 1 (Morning)';
    document.getElementById('cStatus').value = c.status || 'Active';
    document.getElementById('cNotes').value = c.notes || '';
    cohortModal.style.display = 'flex';
  };

  window.deleteCohort = async function(id) {
    if (!confirm('Delete this cohort and all its student assignments?')) return;
    const { error } = await supabase.from('cohorts').delete().eq('id', id);
    if (error) { alert('Error deleting: ' + error.message); return; }
    await addActivity('Deleted a cohort');
    await refreshAll();
  };

  window.assignStudents = async function(cohortId, maxStudents) {
    currentAssignCohortId = cohortId;
    currentAssignMax = maxStudents || 10;
    const cohorts = await getCohorts();
    const cohort = cohorts.find(c => c.id === cohortId);
    document.getElementById('assignModalTitle').textContent = `Assign Students to ${cohort ? cohort.name : 'Cohort'}`;

    const students = await getStudents();
    const assigned = await getCohortStudents(cohortId);
    const assignedIds = new Set(assigned.map(a => a.student_id));

    const listEl = document.getElementById('assignStudentList');
    listEl.innerHTML = students.map(s => `
      <label class="assign-item">
        <input type="checkbox" value="${s.id}" ${assignedIds.has(s.id) ? 'checked' : ''} onchange="updateAssignCounter()" />
        <span><strong>${esc(s.name)}</strong> &mdash; ${esc(s.club)} ${s.grade ? '(Grade ' + esc(s.grade) + ')' : ''}</span>
      </label>
    `).join('');

    if (students.length === 0) {
      listEl.innerHTML = '<p class="empty-state">No students to assign. Add students first.</p>';
    }

    updateAssignCounter();
    assignModal.style.display = 'flex';
  };

  window.updateAssignCounter = function() {
    const checkboxes = document.querySelectorAll('#assignStudentList input[type="checkbox"]');
    const checked = Array.from(checkboxes).filter(cb => cb.checked).length;
    const counter = document.getElementById('assignCounter');
    counter.textContent = `${checked} / ${currentAssignMax} spots filled`;
    counter.classList.toggle('full', checked >= currentAssignMax);

    // Disable unchecked boxes when at max
    checkboxes.forEach(cb => {
      if (!cb.checked && checked >= currentAssignMax) {
        cb.disabled = true;
        cb.closest('.assign-item').style.opacity = '0.4';
      } else {
        cb.disabled = false;
        cb.closest('.assign-item').style.opacity = '1';
      }
    });
  };

  document.getElementById('assignModalClose').addEventListener('click', () => assignModal.style.display = 'none');
  document.getElementById('assignCancelBtn').addEventListener('click', () => assignModal.style.display = 'none');
  assignModal.addEventListener('click', (e) => { if (e.target === assignModal) assignModal.style.display = 'none'; });

  document.getElementById('assignSaveBtn').addEventListener('click', async () => {
    if (!currentAssignCohortId) return;

    const checkboxes = document.querySelectorAll('#assignStudentList input[type="checkbox"]');
    const selectedIds = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);

    if (selectedIds.length > currentAssignMax) {
      alert(`This cohort has a maximum of ${currentAssignMax} students. Please uncheck some.`);
      return;
    }

    // Remove all existing assignments for this cohort
    await supabase.from('cohort_students').delete().eq('cohort_id', currentAssignCohortId);

    // Insert new assignments
    if (selectedIds.length > 0) {
      const rows = selectedIds.map(sid => ({ cohort_id: currentAssignCohortId, student_id: sid }));
      const { error } = await supabase.from('cohort_students').insert(rows);
      if (error) { alert('Error assigning students: ' + error.message); return; }
    }

    await addActivity(`Updated cohort assignments (${selectedIds.length} / ${currentAssignMax} students)`);
    assignModal.style.display = 'none';
    await refreshAll();
  });

  // ===== HELPERS =====
  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }
})();
