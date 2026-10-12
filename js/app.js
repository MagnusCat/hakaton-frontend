(function () {
  const MONTHS = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
  ];

  const state = {
    user: null,
    view: "calendar",
    calendarDate: new Date(),
    selectedDate: new Date(),
    booking: { doctorId: null, date: null, time: null }
  };

  const $ = (sel) => document.querySelector(sel);

  const loginView = $("#login-view");
  const mainView = $("#main-view");
  const nav = $("#nav");
  const view = $("#view");

  let renderSeq = 0;

  let toastTimer = null;
  function toast(message, type = "info") {
    const el = $("#toast");
    el.textContent = message;
    el.className = "toast toast-" + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.className = "toast hidden";
    }, 3500);
  }

  function setBusy(btn, busy, busyText) {
    if (!btn) return;
    if (busy) {
      btn.dataset.original = btn.textContent;
      btn.textContent = busyText;
      btn.disabled = true;
    } else {
      btn.textContent = btn.dataset.original || btn.textContent;
      btn.disabled = false;
    }
  }

  const esc = (str) =>
    String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));

  const formatDate = (d) =>
    d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const NAV_ITEMS = [
    { id: "calendar", label: "Календарь", adminOnly: false },
    { id: "appointments", label: "Записи", adminOnly: false },
    { id: "employees", label: "Сотрудники", adminOnly: false },
    { id: "specialties", label: "Специальности", adminOnly: false },
    { id: "users", label: "Пользователи", adminOnly: true }
  ];

  function showAuth(which) {
    $("#auth-login").classList.toggle("hidden", which !== "login");
    $("#auth-register").classList.toggle("hidden", which !== "register");
  }

  function showLogin() {
    loginView.classList.remove("hidden");
    mainView.classList.add("hidden");
    showAuth("login");
    const input = $("#login-input");
    if (input) input.focus();
  }

  function showMain() {
    loginView.classList.add("hidden");
    mainView.classList.remove("hidden");
    const name = [state.user.firstName, state.user.lastName].filter(Boolean).join(" ");
    $("#current-user").textContent = name
      ? `${name} (${state.user.role})`
      : `${state.user.login} (${state.user.role})`;
    renderNav();
    renderView();
  }

  function renderNav() {
    nav.innerHTML = NAV_ITEMS
      .filter((item) => !item.adminOnly || state.user.role === "администратор")
      .map(
        (item) =>
          `<button class="nav-btn${state.view === item.id ? " active" : ""}" data-view="${item.id}">${item.label}</button>`
      )
      .join("");
  }

  async function renderView() {
    const renderers = {
      calendar: renderCalendar,
      appointments: renderAppointments,
      employees: renderEmployees,
      specialties: renderSpecialties,
      users: renderUsers
    };
    const renderer = renderers[state.view] || renderCalendar;
    const seq = ++renderSeq;
    view.innerHTML = '<div class="loader">Загрузка…</div>';
    let html;
    try {
      html = await renderer();
    } catch (err) {
      if (seq !== renderSeq) return;
      if (err.message === "Требуется авторизация") {
        API.logout();
        state.user = null;
        showLogin();
        return;
      }
      view.innerHTML = `<section class="panel"><div class="empty-note">${esc(err.message)}</div></section>`;
      return;
    }
    if (seq !== renderSeq) return;
    view.innerHTML = html;
    bindViewEvents();
  }

  function bindViewEvents() {
    if (state.view === "calendar") {
      view.querySelectorAll("[data-day]").forEach((el) =>
        el.addEventListener("click", () => {
          const y = Number(el.dataset.year);
          const m = Number(el.dataset.month);
          const d = Number(el.dataset.day);
          state.selectedDate = new Date(y, m, d);
          renderView();
        })
      );
      $("#prev-month").addEventListener("click", () => {
        const d = state.calendarDate;
        state.calendarDate = new Date(d.getFullYear(), d.getMonth() - 1, 1);
        renderView();
      });
      $("#next-month").addEventListener("click", () => {
        const d = state.calendarDate;
        state.calendarDate = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        renderView();
      });
      $("#today-btn").addEventListener("click", () => {
        state.calendarDate = new Date();
        state.selectedDate = new Date();
        renderView();
      });
    }
    if (state.view === "appointments") bindAppointmentsEvents();
  }

  async function renderCalendar() {
    const doctors = await API.getDoctors();
    const cursor = state.calendarDate;
    const year = cursor.getFullYear();
    const month = cursor.getMonth();

    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const dayMeta = (day) => {
      const date = new Date(year, month, day);
      const jsDay = date.getDay();
      const list = doctors
        .filter((doc) => doc.days.includes(jsDay))
        .sort((a, b) => a.time.localeCompare(b.time));
      return { date, list };
    };

    let cells = "";
    for (let i = 0; i < firstWeekday; i++) cells += '<div class="cal-cell empty"></div>';
    for (let day = 1; day <= daysInMonth; day++) {
      const { date, list } = dayMeta(day);
      const classes = ["cal-cell"];
      if (sameDay(date, new Date())) classes.push("today");
      if (sameDay(date, state.selectedDate)) classes.push("selected");
      if (date.getDay() === 0 || date.getDay() === 6) classes.push("weekend");
      cells += `
        <div class="${classes.join(" ")}" data-day="${day}" data-month="${month}" data-year="${year}">
          <span class="cal-day-num">${day}</span>
          ${list.length ? `<span class="cal-badge">${list.length}</span>` : ""}
        </div>`;
    }

    const selected = state.selectedDate;
    const schedule = (await API.getScheduleByDate(selected))
      .sort((a, b) => a.time.localeCompare(b.time));

    const scheduleHtml = schedule.length
      ? schedule
          .map(
            (doc) => `
          <div class="schedule-row">
            <span class="schedule-time">${esc(doc.time)}</span>
            <span class="schedule-fio">${esc(doc.fio)}</span>
            <span class="schedule-spec">${esc(doc.specialty)}</span>
          </div>`
          )
          .join("")
      : '<div class="empty-note">В этот день приёмов нет</div>';

    return `
      <section class="panel">
        <div class="panel-head">
          <h2>Расписание врачей</h2>
          <div class="cal-controls">
            <button id="prev-month" class="btn btn-ghost">←</button>
            <span class="cal-title">${MONTHS[month]} ${year}</span>
            <button id="next-month" class="btn btn-ghost">→</button>
            <button id="today-btn" class="btn btn-outline">Сегодня</button>
          </div>
        </div>
        <div class="cal-grid cal-head">
          ${["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
            .map((d) => `<div class="cal-head-cell">${d}</div>`)
            .join("")}
        </div>
        <div class="cal-grid">${cells}</div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Приёмы на ${formatDate(selected)}</h2>
        </div>
        <div class="schedule-list">${scheduleHtml}</div>
      </section>`;
  }

  function toISODateLocal(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  const APPT_STATUS = {
    CONFIRMED: { label: "Подтверждена", cls: "admin" },
    CANCELLED: { label: "Отменена", cls: "user" },
    PENDING: { label: "Ожидает", cls: "warn" }
  };

  function statusBadge(status) {
    const s = APPT_STATUS[status] || { label: status, cls: "user" };
    return `<span class="role role-${s.cls}">${esc(s.label)}</span>`;
  }

  async function renderAppointments() {
    const [appointments, doctors] = await Promise.all([
      API.getAppointments(),
      API.getDoctors()
    ]);

    const today = toISODateLocal(new Date());
    const doctorOptions = doctors
      .map((d) => `<option value="${d.id}">${esc(d.fio)} — ${esc(d.specialty)}</option>`)
      .join("");

    const rows = appointments
      .slice()
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .map(
        (a) => `
        <tr>
          <td>${esc(a.date)}</td>
          <td class="cell-time">${esc(a.time)}</td>
          <td>${esc(a.doctorName || "")}</td>
          <td>${esc(a.specialty || "")}</td>
          <td>${statusBadge(a.status)}</td>
          <td>${
            a.status === "CANCELLED"
              ? ""
              : `<button class="btn btn-outline btn-sm" data-cancel="${a.id}">Отменить</button>`
          }</td>
        </tr>`
      )
      .join("");

    return `
      <section class="panel">
        <div class="panel-head"><h2>Новая запись</h2></div>
        <div class="booking">
          <div class="booking-field">
            <label for="book-doctor">Врач</label>
            <select id="book-doctor">
              <option value="">— выберите врача —</option>
              ${doctorOptions}
            </select>
          </div>
          <div class="booking-field">
            <label for="book-date">Дата</label>
            <input id="book-date" type="date" value="${today}" min="${today}" />
          </div>
          <div class="booking-field booking-slots">
            <label>Свободное время</label>
            <div id="book-slots" class="slots"><span class="muted">Выберите врача и дату</span></div>
          </div>
          <button id="book-submit" class="btn btn-primary" disabled>Записаться</button>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>${state.user.role === "администратор" ? "Все записи" : "Мои записи"}</h2>
        </div>
        ${
          appointments.length
            ? `<table class="table">
                 <thead>
                   <tr>
                     <th>Дата</th><th>Время</th><th>Врач</th>
                     <th>Специальность</th><th>Статус</th><th></th>
                   </tr>
                 </thead>
                 <tbody>${rows}</tbody>
               </table>`
            : '<div class="empty-note">Записей пока нет</div>'
        }
      </section>`;
  }

  function bindAppointmentsEvents() {
    const doctorSel = $("#book-doctor");
    const dateInput = $("#book-date");
    const submit = $("#book-submit");
    const slotsBox = $("#book-slots");

    async function refreshSlots() {
      const doctorId = doctorSel.value;
      const date = dateInput.value;
      state.booking.time = null;
      submit.disabled = true;
      if (!doctorId || !date) {
        slotsBox.innerHTML = '<span class="muted">Выберите врача и дату</span>';
        return;
      }
      slotsBox.innerHTML = '<span class="muted">Загрузка…</span>';
      try {
        const slots = await API.getSlots(
          Number(doctorId),
          new Date(date + "T00:00:00"),
          1
        );
        const day = slots.filter((s) => s.date === date);
        if (!day.length) {
          slotsBox.innerHTML = '<span class="muted">На эту дату приёма нет</span>';
          return;
        }
        slotsBox.innerHTML = day
          .map(
            (s) =>
              `<button type="button" class="slot${s.available ? "" : " slot-busy"}" data-time="${esc(s.time)}"${
                s.available ? "" : " disabled"
              }>${esc(s.time)}</button>`
          )
          .join("");
        slotsBox.querySelectorAll(".slot:not(.slot-busy)").forEach((b) =>
          b.addEventListener("click", () => {
            slotsBox.querySelectorAll(".slot").forEach((x) => x.classList.remove("active"));
            b.classList.add("active");
            state.booking.time = b.dataset.time;
            submit.disabled = false;
          })
        );
      } catch (err) {
        slotsBox.innerHTML = `<span class="muted">${esc(err.message)}</span>`;
      }
    }

    doctorSel.addEventListener("change", refreshSlots);
    dateInput.addEventListener("change", refreshSlots);
    if (doctorSel.value) refreshSlots();

    submit.addEventListener("click", async () => {
      if (!state.booking.time) return;
      setBusy(submit, true, "Запись…");
      try {
        await API.bookAppointment(
          Number(doctorSel.value),
          new Date(dateInput.value + "T00:00:00"),
          state.booking.time
        );
        toast("Вы успешно записаны", "ok");
        renderView();
      } catch (err) {
        toast(err.message, "error");
        setBusy(submit, false);
      }
    });

    view.querySelectorAll("[data-cancel]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!window.confirm("Отменить эту запись?")) return;
        setBusy(btn, true, "…");
        try {
          await API.cancelAppointment(Number(btn.dataset.cancel));
          toast("Запись отменена", "ok");
          renderView();
        } catch (err) {
          toast(err.message, "error");
          setBusy(btn, false);
        }
      })
    );
  }

  async function renderEmployees() {
    const [doctors, unique, employees] = await Promise.all([
      API.getDoctors(),
      API.checkTimesUnique(),
      API.getEmployees().catch(() => [])
    ]);
    const nextByDoctor = new Map(employees.map((e) => [e.id, e.nextAppointment]));
    const badge = unique.ok
      ? '<span class="badge badge-ok">Время приёма уникально</span>'
      : `<span class="badge badge-warn">Конфликт времени: ${esc(unique.time)}</span>`;

    const rows = doctors
      .map(
        (doc) => `
        <tr>
          <td>${esc(doc.fio)}</td>
          <td>${esc(doc.specialty)}</td>
          <td class="cell-time">${esc(doc.time)}</td>
          <td>${nextByDoctor.get(doc.id) ? esc(nextByDoctor.get(doc.id)) : '<span class="muted">—</span>'}</td>
        </tr>`
      )
      .join("");

    return `
      <section class="panel">
        <div class="panel-head">
          <h2>Сотрудники</h2>
          ${badge}
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Специальность врача</th>
              <th>Время приёма</th>
              <th>Ближайший приём</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
  }

  async function renderSpecialties() {
    const specialties = await API.getSpecialties();
    const cards = specialties
      .map(
        (spec) => `
        <div class="spec-card">
          <div class="spec-title">${esc(spec.name)}</div>
          <ul class="spec-list">
            ${spec.diseases.map((d) => `<li>${esc(d)}</li>`).join("")}
          </ul>
        </div>`
      )
      .join("");

    return `
      <section class="panel">
        <div class="panel-head"><h2>Специальности и заболевания</h2></div>
        <div class="spec-grid">${cards}</div>
      </section>`;
  }

  async function renderUsers() {
    if (state.user.role !== "администратор") {
      return `
        <section class="panel">
          <div class="panel-head"><h2>Пользователи системы</h2></div>
          <div class="empty-note">Раздел доступен только администратору</div>
        </section>`;
    }

    const users = await API.getUsers();
    const rows = users
      .map(
        (u) => `
        <tr>
          <td>${esc(u.login)}</td>
          <td class="cell-pass">${esc(u.password)}</td>
          <td><span class="role role-${u.role === "администратор" ? "admin" : "user"}">${esc(u.role)}</span></td>
        </tr>`
      )
      .join("");

    return `
      <section class="panel">
        <div class="panel-head"><h2>Пользователи системы</h2></div>
        <table class="table">
          <thead>
            <tr>
              <th>Логин</th>
              <th>Пароль</th>
              <th>Роль</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
  }

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const login = $("#login-input").value.trim();
    const password = $("#password-input").value;
    const error = $("#login-error");
    error.classList.add("hidden");
    const btn = e.target.querySelector('button[type="submit"]');
    setBusy(btn, true, "Вход…");
    try {
      state.user = await API.login(login, password);
      state.view = "calendar";
      $("#login-form").reset();
      showMain();
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove("hidden");
    } finally {
      setBusy(btn, false);
    }
  });

  $("#show-register").addEventListener("click", () => {
    $("#register-error").classList.add("hidden");
    showAuth("register");
    $("#reg-first-name").focus();
  });

  $("#show-login").addEventListener("click", () => {
    $("#login-error").classList.add("hidden");
    showAuth("login");
    $("#login-input").focus();
  });

  $("#register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const firstName = $("#reg-first-name").value.trim();
    const lastName = $("#reg-last-name").value.trim();
    const login = $("#reg-login").value.trim();
    const password = $("#reg-password").value;
    const error = $("#register-error");
    error.classList.add("hidden");

    if (login.length < 3) {
      error.textContent = "Логин должен содержать минимум 3 символа";
      error.classList.remove("hidden");
      return;
    }
    if (password.length < 4) {
      error.textContent = "Пароль должен содержать минимум 4 символа";
      error.classList.remove("hidden");
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    setBusy(btn, true, "Регистрация…");
    try {
      state.user = await API.register(login, password, firstName, lastName);
      state.view = "calendar";
      $("#register-form").reset();
      toast("Регистрация прошла успешно. Добро пожаловать!", "ok");
      showMain();
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove("hidden");
    } finally {
      setBusy(btn, false);
    }
  });

  $("#logout-btn").addEventListener("click", () => {
    API.logout();
    state.user = null;
    showLogin();
  });

  nav.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view]");
    if (!btn) return;
    state.view = btn.dataset.view;
    renderNav();
    renderView();
  });

  async function restoreSession() {
    if (!API.hasToken()) return showLogin();
    try {
      state.user = await API.me();
      state.view = "calendar";
      showMain();
    } catch (_) {
      showLogin();
    }
  }

  restoreSession();
})();
