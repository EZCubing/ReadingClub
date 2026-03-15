(() => {
  // =============================================================
  // SUPABASE CONFIG — Replace these with your project credentials
  // =============================================================
  const SUPABASE_URL = 'https://jllsrbnryhmxislzorsa.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsbHNyYm5yeWhteGlzbHpvcnNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDI3NDgsImV4cCI6MjA4OTA3ODc0OH0.C-ynMRk15KhIkS5eS3VTc_lMqO1CcAPvNV9lUnq08aY';

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

  // ===== LOGIN & SECURITY =====
  const loginScreen = document.getElementById('loginScreen');
  const dashboard = document.getElementById('dashboard');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const TIMEOUT_MINUTES = 10;
  let inactivityTimer = null;
  let failedAttempts = 0;
  let lockoutUntil = 0;

  function logout() {
    sessionStorage.removeItem('rc_auth');
    sessionStorage.removeItem('rc_auth_time');
    sessionStorage.removeItem('rc_user');
    sessionStorage.removeItem('rc_role');
    location.reload();
  }

  function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      alert('You have been logged out due to inactivity.');
      logout();
    }, TIMEOUT_MINUTES * 60 * 1000);
    sessionStorage.setItem('rc_auth_time', Date.now().toString());
  }

  function isSessionValid() {
    if (sessionStorage.getItem('rc_auth') !== '1') return false;
    const authTime = parseInt(sessionStorage.getItem('rc_auth_time') || '0');
    if (Date.now() - authTime > TIMEOUT_MINUTES * 60 * 1000) {
      sessionStorage.removeItem('rc_auth');
      sessionStorage.removeItem('rc_auth_time');
      sessionStorage.removeItem('rc_user');
      sessionStorage.removeItem('rc_role');
      return false;
    }
    return true;
  }

  function startSecurityListeners() {
    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(event => {
      document.addEventListener(event, resetInactivityTimer);
    });
    resetInactivityTimer();
  }

  function showLoggedInUser() {
    const user = sessionStorage.getItem('rc_user') || '';
    document.getElementById('topbarUser').textContent = user;
  }

  function applyRolePermissions() {
    const role = sessionStorage.getItem('rc_role') || 'teacher';
    if (role !== 'admin') {
      // Hide admin-only tabs
      document.querySelectorAll('.dash-tab').forEach(tab => {
        const t = tab.dataset.tab;
        if (t === 'overview' || t === 'students' || t === 'payments' || t === 'costs') {
          tab.style.display = 'none';
        }
      });
      // Default to Current Students tab
      document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
      const rosterTab = document.querySelector('.dash-tab[data-tab="roster"]');
      if (rosterTab) rosterTab.classList.add('active');
      const rosterPanel = document.getElementById('panel-roster');
      if (rosterPanel) rosterPanel.classList.add('active');
    }
  }

  // Check session on page load
  if (isSessionValid()) {
    loginScreen.style.display = 'none';
    dashboard.style.display = 'block';
    showLoggedInUser();
    applyRolePermissions();
    startSecurityListeners();
    initDashboard();
  } else {
    sessionStorage.removeItem('rc_auth');
    loginScreen.style.display = 'flex';
    dashboard.style.display = 'none';
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Check lockout
    if (Date.now() < lockoutUntil) {
      const mins = Math.ceil((lockoutUntil - Date.now()) / 60000);
      loginError.textContent = `Too many failed attempts. Try again in ${mins} minute(s).`;
      return;
    }

    const username = document.getElementById('loginUsername').value.trim().toLowerCase();
    const pw = document.getElementById('loginPassword').value;
    const hash = await sha256(pw);

    // Verify against Supabase
    const { data, error } = await supabase.rpc('verify_login', { p_username: username, p_password_hash: hash });

    if (error || !data || data.length === 0) {
      failedAttempts++;
      if (failedAttempts >= 5) {
        lockoutUntil = Date.now() + 15 * 60 * 1000;
        loginError.textContent = 'Too many failed attempts. Locked for 15 minutes.';
      } else {
        loginError.textContent = `Incorrect username or password. (${5 - failedAttempts} attempts remaining)`;
      }
      document.getElementById('loginPassword').value = '';
      return;
    }

    // Login success
    const user = data[0];
    failedAttempts = 0;
    sessionStorage.setItem('rc_auth', '1');
    sessionStorage.setItem('rc_auth_time', Date.now().toString());
    sessionStorage.setItem('rc_user', user.display_name);
    sessionStorage.setItem('rc_role', user.role);
    loginScreen.style.display = 'none';
    dashboard.style.display = 'block';
    showLoggedInUser();
    applyRolePermissions();
    startSecurityListeners();
    await addActivity(`${user.display_name} logged in`);
    initDashboard();
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    logout();
  });

  // ===== TABS =====
  document.querySelectorAll('.dash-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
      if (tab.dataset.tab === 'roster') renderRoster();
      if (tab.dataset.tab === 'students') renderStudents();
      if (tab.dataset.tab === 'groups') renderGroups();
      if (tab.dataset.tab === 'payments') renderPayments();
      if (tab.dataset.tab === 'overview') renderOverview();
      if (tab.dataset.tab === 'costs') renderCosts();
    });
  });

  // ===== DASHBOARD INIT =====
  async function initDashboard() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('groupDate').value = today;
    billingMonthInput.value = getCurrentMonth();
    currentScheduleFilter = getScheduleForDate();
    updateDayButtons();
    await refreshAll();
  }

  async function refreshAll() {
    await Promise.all([
      renderStudents(),
      renderRoster(),
      renderGroups(),
      renderPayments(),
      renderOverview(),
      renderHistory(),
      renderCosts(),
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
    document.getElementById('studentDeleteBtn').style.display = 'none';
    statusSelect.value = 'Placed';
    updateFormSections();
    studentModal.style.display = 'flex';
  });

  // Add new student (pipeline)
  document.getElementById('addStudentBtn').addEventListener('click', () => {
    document.getElementById('studentModalTitle').textContent = 'New Student';
    studentForm.reset();
    document.getElementById('studentId').value = '';
    document.getElementById('studentDeleteBtn').style.display = 'none';
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
      empty.textContent = students.length === 0 ? 'No students yet. Click "+ New Student" to get started.' : 'No students in this stage.';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    container.style.display = '';

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
    document.getElementById('studentDeleteBtn').style.display = 'inline-flex';
    updateFormSections();
    studentModal.style.display = 'flex';
  };

  document.getElementById('studentDeleteBtn').addEventListener('click', async () => {
    const id = document.getElementById('studentId').value;
    if (!id) return;
    const students = await getStudents();
    const s = students.find(x => x.id === id);
    if (!s) return;
    if (!confirm(`Are you sure you want to delete ${s.name}? This will remove all their attendance, payment, and missed lesson records. This cannot be undone.`)) return;
    const { error } = await supabase.from('students').delete().eq('id', id);
    if (error) { alert('Error: ' + error.message); return; }
    await addActivity(`Deleted student: ${s.name}`);
    studentModal.style.display = 'none';
    await refreshAll();
  });

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

    // KPIs reflect the filtered set
    document.getElementById('rosterTotal').textContent = filtered.length;
    document.getElementById('rosterMonWed').textContent = filtered.filter(s => s.student_group === 'Mon/Wed').length;
    document.getElementById('rosterTueThu').textContent = filtered.filter(s => s.student_group === 'Tue/Thu').length;

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

  // ===== GROUPS & ATTENDANCE =====
  const groupDateInput = document.getElementById('groupDate');
  const groupTeacherFilter = document.getElementById('groupTeacherFilter');
  let currentScheduleFilter = '';

  groupTeacherFilter.addEventListener('change', () => renderGroups());

  function getScheduleForDate() {
    const date = new Date(groupDateInput.value + 'T12:00:00');
    const day = date.getDay();
    if (day === 1 || day === 3) return 'Mon/Wed';
    if (day === 2 || day === 4) return 'Tue/Thu';
    return '';
  }

  function updateDayButtons() {
    const sched = currentScheduleFilter || getScheduleForDate();
    document.querySelectorAll('.day-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.schedule === sched);
    });
  }

  groupDateInput.addEventListener('change', () => {
    currentScheduleFilter = getScheduleForDate();
    updateDayButtons();
    renderGroups();
  });

  document.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentScheduleFilter = btn.dataset.schedule;
      document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderGroups();
    });
  });

  // Missed lessons helper
  async function getMissedLessons() {
    const { data, error } = await supabase.from('missed_lessons').select('*').eq('completed', false).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching missed lessons:', error); return []; }
    return data || [];
  }

  // Auto-generate groups from student data
  async function renderGroups() {
    const [allStudents, allAtt, missedLessons] = await Promise.all([getStudents(), getAttendance(), getMissedLessons()]);
    const container = document.getElementById('groupCards');
    const empty = document.getElementById('groupsEmpty');
    const date = groupDateInput.value;
    const schedFilter = currentScheduleFilter || getScheduleForDate();

    const placed = allStudents.filter(s => s.status === 'Placed' || !s.status);
    const teacherFilter = groupTeacherFilter.value;

    // Filter students by schedule
    let dayStudents = placed.filter(s => s.student_group === schedFilter);

    // Filter by teacher
    if (teacherFilter) dayStudents = dayStudents.filter(s => s.teacher === teacherFilter);

    // Group students by: teacher + group + time + RM level + lesson
    const groupMap = {};
    dayStudents.forEach(s => {
      const key = `${s.teacher || 'Unassigned'}||${s.student_group || ''}||${s.time_slot || 'No Time'}||${s.level || 'No Level'}||${s.lesson || '0'}`;
      if (!groupMap[key]) groupMap[key] = [];
      groupMap[key].push(s);
    });

    // Sort groups by teacher then time then level
    const groupKeys = Object.keys(groupMap).sort();

    // Day info
    const dayInfo = document.getElementById('dayInfo');
    const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    dayInfo.innerHTML = `<strong>${dateLabel}</strong> — ${schedFilter || 'All'} — ${groupKeys.length} group(s), ${dayStudents.length} student(s)`;

    if (groupKeys.length === 0) {
      container.innerHTML = '';
      empty.textContent = placed.length === 0 ? 'No current students. Add students first.' : 'No students on ' + (schedFilter || 'this schedule') + '.';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    container.style.display = '';

    // Build attendance lookup for this date
    const todayAtt = {};
    allAtt.filter(a => a.date === date).forEach(a => { todayAtt[a.student_id] = a.status; });

    let html = '<div class="pods-grid">';
    groupKeys.forEach(key => {
      const [teacher, group, timeSlot, level, lesson] = key.split('||');
      const students = groupMap[key];
      const groupId = key.replace(/[^a-zA-Z0-9]/g, '_');

      const studentsHtml = students.map(s => {
        const existing = todayAtt[s.id] || null;
        const studentML = missedLessons.filter(ml => ml.student_id === s.id);
        const mlHtml = studentML.map(ml =>
          `<span class="ml-badge">ML Lesson ${ml.lesson} <button class="ml-complete-btn" onclick="completeMissedLesson('${ml.id}')">Complete</button></span>`
        ).join('');
        return `
          <div class="pod-student">
            <div class="pod-student__info">
              <div class="pod-student__name">${esc(s.name)}</div>
              ${mlHtml ? '<div class="pod-student__ml">' + mlHtml + '</div>' : ''}
            </div>
            <div class="att-status">
              <button class="att-btn ${existing === 'P' ? 'selected-P' : ''}" data-group="${groupId}" data-student="${s.id}" data-name="${esc(s.name)}" data-club="${esc(s.club)}" data-status="P" onclick="setGroupAtt(this)">P</button>
              <button class="att-btn ${existing === 'A' ? 'selected-A' : ''}" data-group="${groupId}" data-student="${s.id}" data-name="${esc(s.name)}" data-club="${esc(s.club)}" data-status="A" onclick="setGroupAtt(this)">A</button>
              <button class="att-btn ${existing === 'L' ? 'selected-L' : ''}" data-group="${groupId}" data-student="${s.id}" data-name="${esc(s.name)}" data-club="${esc(s.club)}" data-status="L" onclick="setGroupAtt(this)">L</button>
            </div>
          </div>`;
      }).join('');

      const teacherClass = teacher.includes('Dale') ? 'pod--dale' : teacher.includes('Jennifer') ? 'pod--jennifer' : teacher.includes('Stephanie') ? 'pod--stephanie' : '';

      html += `
        <div class="pod ${teacherClass}">
          <div class="pod__header">
            <div class="pod__teacher">${esc(teacher)}</div>
            <div class="pod__info">RM ${esc(level)} &bull; Lesson ${esc(lesson)} &bull; ${esc(timeSlot)} &bull; ${students.length} student(s)</div>
          </div>
          <div class="pod__students">
            ${studentsHtml}
          </div>
          <div class="pod__footer">
            <button class="save-att-btn" onclick="saveAutoGroupAttendance('${groupId}')">Save Attendance</button>
          </div>
        </div>
      `;
    });
    html += '</div>';

    container.innerHTML = html;
  }

  // Track attendance selections per group
  const groupAttSelections = {};

  window.setGroupAtt = function(btn) {
    const groupId = btn.dataset.group;
    const studentId = btn.dataset.student;
    const status = btn.dataset.status;
    if (!groupAttSelections[groupId]) groupAttSelections[groupId] = {};
    groupAttSelections[groupId][studentId] = { status, name: btn.dataset.name, club: btn.dataset.club };
    btn.parentElement.querySelectorAll('.att-btn').forEach(b => b.className = 'att-btn');
    btn.classList.add('selected-' + status);
  };

  window.saveAutoGroupAttendance = async function(groupId) {
    const date = groupDateInput.value;
    if (!date) return alert('Please select a date.');
    const selections = groupAttSelections[groupId];
    if (!selections || Object.keys(selections).length === 0) return alert('Please mark attendance for at least one student.');

    // Disable the save button to prevent double-clicks
    const saveBtn = document.querySelector(`[onclick="saveAutoGroupAttendance('${groupId}')"]`);
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

    try {
      const records = Object.entries(selections).map(([studentId, info]) => ({
        date, student_id: studentId, student_name: info.name, club: info.club || '', status: info.status,
      }));

      // Delete existing records for these students on this date, then insert
      for (const r of records) {
        await supabase.from('attendance').delete().eq('date', date).eq('student_id', r.student_id);
      }
      const { error } = await supabase.from('attendance').insert(records);
      if (error) { alert('Error saving attendance: ' + error.message); return; }

      // Advance lesson by 1 for ALL students (P, A, and L)
      for (const r of records) {
        const { data: student } = await supabase.from('students').select('lesson').eq('id', r.student_id).single();
        const currentLesson = (student && student.lesson != null) ? student.lesson : 0;
        const newLesson = Math.min(currentLesson + 1, 180);
        await supabase.from('students').update({ lesson: newLesson }).eq('id', r.student_id);
      }

      // Create missed lesson records for absent students (ML flag)
      const absentStudents = records.filter(r => r.status === 'A');
      for (const r of absentStudents) {
        const { data: student } = await supabase.from('students').select('lesson').eq('id', r.student_id).single();
        const missedLesson = (student && student.lesson != null) ? student.lesson - 1 : 0;
        await supabase.from('missed_lessons').insert({
          student_id: r.student_id,
          student_name: r.student_name,
          lesson: missedLesson,
          date: date,
        });
      }

      const mlCount = absentStudents.length;
      await addActivity(`Attendance: ${records.length} student(s) on ${date} — lessons advanced${mlCount > 0 ? ', ' + mlCount + ' ML flagged' : ''}`);
      delete groupAttSelections[groupId];

      // Refresh everything
      await Promise.all([renderGroups(), renderRoster(), renderOverview(), renderHistory()]);
      alert(`Saved! ${records.length} student(s) recorded.${mlCount > 0 ? ' ' + mlCount + ' missed lesson(s) flagged.' : ''}`);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Attendance'; }
    }
  };

  window.completeMissedLesson = async function(id) {
    const { error } = await supabase.from('missed_lessons').update({ completed: true }).eq('id', id);
    if (error) { alert('Error: ' + error.message); return; }
    await addActivity('Missed lesson marked complete');
    await renderGroups();
  };

  // History
  const historyFilter = document.getElementById('historyFilter');
  const historyDateFilter = document.getElementById('historyDateFilter');

  historyFilter.addEventListener('change', () => renderHistory());
  historyDateFilter.addEventListener('change', () => {
    historyFilter.value = 'custom';
    renderHistory();
  });

  function getHistoryDateRange() {
    const filter = historyFilter.value;
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (filter === 'today') {
      return { start: todayStr, end: todayStr };
    }
    if (filter === 'week') {
      const dayOfWeek = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const friday = new Date(monday);
      friday.setDate(monday.getDate() + 4);
      return { start: monday.toISOString().split('T')[0], end: friday.toISOString().split('T')[0] };
    }
    if (filter === 'month') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
    }
    if (filter === 'custom') {
      const d = historyDateFilter.value;
      return d ? { start: d, end: d } : null;
    }
    return null; // all
  }

  async function renderHistory() {
    const allRecords = await getAttendance();
    const body = document.getElementById('historyBody');
    const empty = document.getElementById('historyEmpty');
    const summary = document.getElementById('historySummary');

    // Filter by date range
    const range = getHistoryDateRange();
    let records = allRecords;
    if (range) {
      records = allRecords.filter(r => r.date >= range.start && r.date <= range.end);
    }

    // Summary stats
    const totalPresent = records.filter(r => r.status === 'P').length;
    const totalAbsent = records.filter(r => r.status === 'A').length;
    const totalLate = records.filter(r => r.status === 'L').length;
    const total = records.length;
    const attRate = total > 0 ? Math.round((totalPresent / total) * 100) : 0;

    summary.innerHTML = `
      <div class="history-stat"><div class="history-stat__value">${total}</div><div class="history-stat__label">Total Records</div></div>
      <div class="history-stat"><div class="history-stat__value green">${totalPresent}</div><div class="history-stat__label">Present</div></div>
      <div class="history-stat"><div class="history-stat__value red">${totalAbsent}</div><div class="history-stat__label">Absent</div></div>
      <div class="history-stat"><div class="history-stat__value yellow">${totalLate}</div><div class="history-stat__label">Late</div></div>
      <div class="history-stat"><div class="history-stat__value">${attRate}%</div><div class="history-stat__label">Attendance Rate</div></div>
    `;

    if (records.length === 0) {
      body.innerHTML = '';
      empty.style.display = 'block';
      empty.textContent = allRecords.length === 0 ? 'No attendance records yet.' : 'No records for this date range.';
      return;
    }
    empty.style.display = 'none';

    const statusLabels = { P: 'Present', A: 'Absent', L: 'Late' };
    body.innerHTML = records.slice(0, 200).map(r => `
      <tr>
        <td>${esc(r.date)}</td>
        <td><strong>${esc(r.student_name)}</strong></td>
        <td><span class="att-btn selected-${r.status}" style="cursor:default">${statusLabels[r.status] || r.status}</span></td>
        <td class="actions">
          <button onclick="changeAttStatus('${r.id}', 'P')">P</button>
          <button onclick="changeAttStatus('${r.id}', 'A')">A</button>
          <button onclick="changeAttStatus('${r.id}', 'L')">L</button>
          <button class="del" onclick="deleteAttRecord('${r.id}')">Del</button>
        </td>
      </tr>
    `).join('');
  }

  window.changeAttStatus = async function(id, newStatus) {
    const statusLabels = { P: 'Present', A: 'Absent', L: 'Late' };
    const { error } = await supabase.from('attendance').update({ status: newStatus }).eq('id', id);
    if (error) { alert('Error: ' + error.message); return; }
    await addActivity(`Changed attendance to ${statusLabels[newStatus]}`);
    await Promise.all([renderHistory(), renderGroups(), renderOverview()]);
  };

  window.deleteAttRecord = async function(id) {
    if (!confirm('Delete this attendance record?')) return;
    const { error } = await supabase.from('attendance').delete().eq('id', id);
    if (error) { alert('Error: ' + error.message); return; }
    await addActivity('Deleted an attendance record');
    await renderHistory();
    await renderGroups();
    await renderOverview();
  };

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
      if (selectedPayMethod === 'Free') {
        document.getElementById('pAmount').value = '0';
      }
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
    document.getElementById('payModalTitle').textContent = 'Add Payment';
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

    // Filter payments for this month — match by period OR by payment date
    const monthPayments = allPayments.filter(p => {
      if (p.period === period) return true;
      if (p.date && p.date.startsWith(period)) return true;
      return false;
    });
    const paidStudentIds = new Set(monthPayments.map(p => p.student_id));
    const placedStudents = students.filter(s => s.status === 'Placed' || !s.status);

    // KPIs
    const totalCollected = monthPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const paidCount = paidStudentIds.size;
    const owedCount = placedStudents.filter(s => !paidStudentIds.has(s.id)).length;

    document.getElementById('payKpiCollected').textContent = '$' + totalCollected.toFixed(2);
    document.getElementById('payKpiPaid').textContent = paidCount;
    document.getElementById('payKpiOwed').textContent = owedCount;

    // Billing table
    const body = document.getElementById('billingBody');
    const empty = document.getElementById('billingEmpty');

    if (placedStudents.length === 0) {
      body.innerHTML = '';
      empty.style.display = 'block';
    } else {
      empty.style.display = 'none';

      // Sort: unpaid first, then paid
      const sorted = [...placedStudents].sort((a, b) => {
        const aPaid = paidStudentIds.has(a.id);
        const bPaid = paidStudentIds.has(b.id);
        if (aPaid === bPaid) return a.name.localeCompare(b.name);
        return aPaid ? 1 : -1;
      });

      body.innerHTML = sorted.map(s => {
        const studentPayments = monthPayments.filter(p => p.student_id === s.id);
        const totalPaid = studentPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
        const lastPayment = studentPayments.length > 0 ? studentPayments[0] : null;

        const hasFree = studentPayments.some(p => p.method === 'Free');
        const paymentsDetail = studentPayments.map(p =>
          `<div style="font-size:0.78rem;color:var(--text-light);display:flex;align-items:center;gap:8px;">
            <span>${esc(p.date)} — ${p.method === 'Free' ? 'Free' : '$' + parseFloat(p.amount).toFixed(2)} (${esc(p.method)})</span>
            <button onclick="editPayment('${p.id}', ${parseFloat(p.amount)}, '${esc(p.method)}')" style="background:var(--green-pale);border:1px solid var(--border);color:var(--green-dark);font-size:0.82rem;padding:6px 14px;border-radius:6px;cursor:pointer;font-weight:600;">Edit</button>
            <button onclick="deletePayment('${p.id}')" style="background:#FFEBEE;border:1px solid #FFCDD2;color:#e53935;font-size:0.82rem;padding:6px 14px;border-radius:6px;cursor:pointer;font-weight:600;">Delete</button>
          </div>`
        ).join('');

        return `<tr>
          <td><strong>${esc(s.name)}</strong></td>
          <td>${esc(s.club)}</td>
          <td>${hasFree ? '<span class="billing-status" style="background:#E3F2FD;color:#1565C0;">Free</span>' : totalPaid > 0 ? `<span class="billing-status paid">$${totalPaid.toFixed(2)}</span>` : '<span class="billing-status unpaid">$0.00</span>'}</td>
          <td>${paymentsDetail || '—'}</td>
          <td><button class="mark-paid-btn" onclick="markPaid('${s.id}', '${esc(s.name)}')">Add Payment</button></td>
        </tr>`;
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

  window.editPayment = async function(id, currentAmount, currentMethod) {
    const newAmount = prompt('Enter corrected amount:', currentAmount);
    if (newAmount === null) return;
    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount < 0) { alert('Please enter a valid amount.'); return; }

    const { error } = await supabase.from('payments').update({ amount }).eq('id', id);
    if (error) { alert('Error: ' + error.message); return; }
    await addActivity(`Corrected payment to $${amount.toFixed(2)}`);
    await renderPayments();
    await renderOverview();
  };

  window.deletePayment = async function(id) {
    if (!confirm('Delete this payment record permanently?')) return;
    const { error } = await supabase.from('payments').delete().eq('id', id);
    if (error) { alert('Error deleting: ' + error.message); return; }
    await addActivity('Deleted a payment record');
    await refreshAll();
  };




  // ===== COSTS =====
  const costModal = document.getElementById('costModal');
  const costForm = document.getElementById('costForm');

  async function getCosts() {
    const { data, error } = await supabase.from('costs').select('*').order('created_at', { ascending: false });
    if (error) { console.error('Error fetching costs:', error); return []; }
    return data || [];
  }

  document.getElementById('addCostBtn').addEventListener('click', () => {
    document.getElementById('costModalTitle').textContent = 'Add Cost';
    costForm.reset();
    document.getElementById('costId').value = '';
    document.getElementById('costDate').value = new Date().toISOString().split('T')[0];
    costModal.style.display = 'flex';
  });

  document.getElementById('costModalClose').addEventListener('click', () => costModal.style.display = 'none');
  document.getElementById('costCancelBtn').addEventListener('click', () => costModal.style.display = 'none');
  costModal.addEventListener('click', (e) => { if (e.target === costModal) costModal.style.display = 'none'; });

  costForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('costId').value;
    const cost = {
      description: document.getElementById('costDesc').value,
      category: document.getElementById('costCategory').value,
      amount: parseFloat(document.getElementById('costAmount').value),
      frequency: document.getElementById('costFrequency').value,
      date: document.getElementById('costDate').value,
      notes: document.getElementById('costNotes').value,
    };

    if (id) {
      const { error } = await supabase.from('costs').update(cost).eq('id', id);
      if (error) { alert('Error: ' + error.message); return; }
      await addActivity(`Updated cost: ${cost.description}`);
    } else {
      const { error } = await supabase.from('costs').insert(cost);
      if (error) { alert('Error: ' + error.message); return; }
      await addActivity(`Added cost: ${cost.description} ($${cost.amount} ${cost.frequency})`);
    }
    costModal.style.display = 'none';
    await renderCosts();
  });

  async function renderCosts() {
    const costs = await getCosts();
    const body = document.getElementById('costsBody');
    const empty = document.getElementById('costsEmpty');

    // KPIs
    const monthly = costs.filter(c => c.frequency === 'Monthly').reduce((sum, c) => sum + parseFloat(c.amount), 0);
    const yearly = costs.filter(c => c.frequency === 'Yearly').reduce((sum, c) => sum + parseFloat(c.amount), 0);
    const oneTime = costs.filter(c => c.frequency === 'One-Time').reduce((sum, c) => sum + parseFloat(c.amount), 0);
    const employees = costs.filter(c => c.category === 'Employee' && c.frequency === 'Monthly').reduce((sum, c) => sum + parseFloat(c.amount), 0);

    document.getElementById('costMonthly').textContent = '$' + monthly.toFixed(2);
    document.getElementById('costYearly').textContent = '$' + yearly.toFixed(2);
    document.getElementById('costOneTime').textContent = '$' + oneTime.toFixed(2);
    document.getElementById('costEmployees').textContent = '$' + employees.toFixed(2);

    if (costs.length === 0) {
      body.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    body.innerHTML = costs.map(c => `
      <tr>
        <td><strong>${esc(c.description)}</strong></td>
        <td>${esc(c.category)}</td>
        <td>${esc(c.frequency)}</td>
        <td>$${parseFloat(c.amount).toFixed(2)}</td>
        <td>${esc(c.date)}</td>
        <td>${esc(c.notes)}</td>
        <td class="actions">
          <button onclick="editCost('${c.id}')">Edit</button>
          <button class="del" onclick="deleteCost('${c.id}')">Delete</button>
        </td>
      </tr>
    `).join('');
  }

  window.editCost = async function(id) {
    const costs = await getCosts();
    const c = costs.find(x => x.id === id);
    if (!c) return;
    document.getElementById('costModalTitle').textContent = 'Edit Cost';
    document.getElementById('costId').value = c.id;
    document.getElementById('costDesc').value = c.description || '';
    document.getElementById('costCategory').value = c.category || 'Other';
    document.getElementById('costAmount').value = c.amount || '';
    document.getElementById('costFrequency').value = c.frequency || 'Monthly';
    document.getElementById('costDate').value = c.date || '';
    document.getElementById('costNotes').value = c.notes || '';
    costModal.style.display = 'flex';
  };

  window.deleteCost = async function(id) {
    if (!confirm('Delete this cost?')) return;
    const { error } = await supabase.from('costs').delete().eq('id', id);
    if (error) { alert('Error: ' + error.message); return; }
    await addActivity('Deleted a cost');
    await renderCosts();
  };

  // ===== HELPERS =====
  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }
})();
