window.API = (function () {
  const BASE_URL = "http://159.194.246.91:8090/api";

  const getToken = () => localStorage.getItem("token");
  const setToken = (t) =>
    t ? localStorage.setItem("token", t) : localStorage.removeItem("token");

  function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  async function request(path, { method = "GET", body, auth = true } = {}) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (auth && getToken()) headers["Authorization"] = "Bearer " + getToken();

    const res = await fetch(BASE_URL + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    if (!res.ok) {
      let msg = "Ошибка запроса (" + res.status + ")";
      try {
        const d = await res.json();
        if (d && d.message) msg = d.message;
      } catch (_) {}
      if (res.status === 401 && auth) {
        setToken(null);
        throw new Error("Требуется авторизация");
      }
      throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
  }

  const roleLabel = (role) => (role === "ADMIN" ? "администратор" : "пользователь");

  return {
    async login(login, password) {
      const d = await request("/auth/login", {
        method: "POST",
        auth: false,
        body: { login, password }
      });
      setToken(d.token);
      return {
        login: d.login,
        role: roleLabel(d.role),
        firstName: d.firstName,
        lastName: d.lastName
      };
    },

    async register(login, password, firstName, lastName) {
      await request("/auth/register", {
        method: "POST",
        auth: false,
        body: { login, password, firstName, lastName, role: "PATIENT" }
      });
      return this.login(login, password);
    },

    hasToken() {
      return !!getToken();
    },

    async me() {
      const d = await request("/auth/me");
      return {
        login: d.login,
        role: roleLabel(d.role),
        firstName: d.firstName,
        lastName: d.lastName
      };
    },

    logout() {
      setToken(null);
    },

    getDoctors() {
      return request("/doctors");
    },

    getScheduleByDate(date) {
      return request("/schedule?date=" + toISODate(date));
    },

    getSpecialties() {
      return request("/specialties");
    },

    async getUsers() {
      const users = await request("/users");
      return users.map((u) => ({ ...u, role: roleLabel(u.role) }));
    },

    checkTimesUnique() {
      return request("/doctors/unique-times");
    },

    getEmployees() {
      return request("/employees");
    },

    getAppointments() {
      return request("/appointments");
    },

    bookAppointment(doctorId, date, time) {
      return request("/appointments", {
        method: "POST",
        body: { doctorId, date: toISODate(date), time }
      });
    },

    cancelAppointment(id) {
      return request("/appointments/" + id, { method: "DELETE" });
    },

    getSlots(doctorId, fromDate, days = 14) {
      return request(
        "/doctors/" + doctorId + "/slots?from=" + toISODate(fromDate) + "&days=" + days
      );
    }
  };
})();
