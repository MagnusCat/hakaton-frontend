(function () {
  const MONTHS = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
  ];

  const state = {
    user: null,
    view: "calendar",
    calendarDate: new Date(),
    selectedDate: new Date()
  };

  const $ = (sel) => document.querySelector(sel);

  const loginView = $("#login-view");
  const mainView = $("#main-view");
  const nav = $("#nav");
  const view = $("#view");

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
    { id: "employees", label: "Сотрудники", adminOnly: false },
    { id: "specialties", label: "Специальности", adminOnly: false },
    { id: "users", label: "Пользователи", adminOnly: true }
  ];

  function showLogin() {
    loginView.classList.remove("hidden");
    mainView.classList.add("hidden");
  }

  function showMain() {
    loginView.classList.add("hidden");
    mainView.classList.remove("hidden");
    $("#current-user").textContent = `${state.user.login} (${state.user.role})`;
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
      employees: renderEmployees,
      specialties: renderSpecialties,
      users: renderUsers
    };
    const renderer = renderers[state.view] || renderCalendar;
    view.innerHTML = '<div class="loader">Загрузка…</div>';
    view.innerHTML = await renderer();
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
        state.calendarDate.setMonth(state.calendarDate.getMonth() - 1);
        renderView();
      });
      $("#next-month").addEventListener("click", () => {
        state.calendarDate.setMonth(state.calendarDate.getMonth() + 1);
        renderView();
      });
      $("#today-btn").addEventListener("click", () => {
        state.calendarDate = new Date();
        state.selectedDate = new Date();
        renderView();
      });
    }
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

  async function renderEmployees() {
    const doctors = await API.getDoctors();
    const unique = await API.checkTimesUnique();
    const badge = unique.ok
      ? '<span class="badge badge-ok">Время приёма</span>'
      : `<span class="badge badge-warn">Конфликт времени: ${esc(unique.time)}</span>`;

    const rows = doctors
      .map(
        (doc) => `
        <tr>
          <td>${esc(doc.fio)}</td>
          <td>${esc(doc.specialty)}</td>
          <td class="cell-time">${esc(doc.time)}</td>
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
    try {
      state.user = await API.login(login, password);
      state.view = "calendar";
      $("#login-form").reset();
      showMain();
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove("hidden");
    }
  });

  $("#logout-btn").addEventListener("click", () => {
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

  showLogin();
})();
