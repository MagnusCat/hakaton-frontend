window.API = (function () {
  const BASE_URL = "/api";

  const clone = (data) => JSON.parse(JSON.stringify(data));

  const delay = (data, ms) =>
    new Promise((resolve) => setTimeout(() => resolve(clone(data)), ms || 120));

  function validateUniqueTimes(doctors) {
    const seen = new Map();
    for (const doctor of doctors) {
      if (seen.has(doctor.time)) return { ok: false, time: doctor.time };
      seen.set(doctor.time, doctor.id);
    }
    return { ok: true };
  }

  return {
    async login(login, password) {
      const user = window.DB.users.find(
        (u) => u.login === login && u.password === password
      );
      if (!user) throw new Error("Неверный логин или пароль");
      return delay({ login: user.login, role: user.role });
    },

    async getDoctors() {
      return delay(window.DB.doctors);
    },

    async getScheduleByDate(date) {
      const jsDay = date.getDay();
      const list = window.DB.doctors
        .filter((d) => d.days.includes(jsDay))
        .sort((a, b) => a.time.localeCompare(b.time));
      return delay(list);
    },

    async getSpecialties() {
      return delay(window.DB.specialties);
    },

    async getUsers() {
      return delay(window.DB.users);
    },

    async checkTimesUnique() {
      return validateUniqueTimes(window.DB.doctors);
    }
  };
})();
