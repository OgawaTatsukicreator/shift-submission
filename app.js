const SCRIPT_URL = "";
const DEADLINE_DAY = 15;
const DEFAULT_START = "11:00";
const DEFAULT_END = "20:00";

const form = document.querySelector("#shiftForm");
const calendarGrid = document.querySelector("#calendarGrid");
const dayTemplate = document.querySelector("#dayTemplate");
const message = document.querySelector("#message");
const connectionStatus = document.querySelector("#connectionStatus");
const monthTitle = document.querySelector("#monthTitle");
const monthRange = document.querySelector("#monthRange");
const monthInput = form.elements.month;
const toastModal = document.querySelector("#toastModal");
const toastTitle = document.querySelector("#toastTitle");
const toastText = document.querySelector("#toastText");
const timeModal = document.querySelector("#timeModal");
const modalStart = document.querySelector("#modalStart");
const modalEnd = document.querySelector("#modalEnd");
let activeTimeCard = null;

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
const storageKey = "monthly-shift-form-draft";

function getDefaultMonth() {
  const today = new Date();
  const target = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return toMonthValue(target);
}

function toMonthValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonth(value) {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function daysInMonth(value) {
  const date = parseMonth(value);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function setMessage(text, type = "") {
  message.textContent = text;
  message.className = `message ${type}`.trim();
}

function showToast(title, text) {
  toastTitle.textContent = title;
  toastText.textContent = text;
  toastModal.classList.add("is-open");
  window.setTimeout(() => {
    toastModal.classList.remove("is-open");
  }, 1800);
}

function buildHourOptions(select, firstLabel) {
  select.innerHTML = `<option value="">${firstLabel}</option>`;
  for (let hour = 6; hour <= 24; hour++) {
    const option = document.createElement("option");
    option.value = `${String(hour).padStart(2, "0")}:00`;
    option.textContent = `${hour}時`;
    select.append(option);
  }
}

function openTimeModal(card) {
  activeTimeCard = card;
  modalStart.value = card.querySelector('[name="start"]').value || DEFAULT_START;
  modalEnd.value = card.querySelector('[name="end"]').value || DEFAULT_END;
  timeModal.classList.add("is-open");
}

function closeTimeModal() {
  timeModal.classList.remove("is-open");
  activeTimeCard = null;
}

function updateConnectionStatus() {
  if (SCRIPT_URL) {
    connectionStatus.textContent = "接続済み";
    connectionStatus.style.color = "#047857";
    return;
  }

  connectionStatus.textContent = "未接続";
}

function updateMonthHeader() {
  const month = parseMonth(monthInput.value);
  const year = month.getFullYear();
  const monthNumber = month.getMonth() + 1;
  const lastDay = daysInMonth(monthInput.value);
  monthTitle.textContent = `${year}/${String(monthNumber).padStart(2, "0")}/01〜${String(monthNumber).padStart(2, "0")}/${lastDay}`;
  monthRange.textContent = `締切：${monthNumber}月${DEADLINE_DAY}日`;
}

function renderCalendar(existing = {}) {
  calendarGrid.innerHTML = "";
  const monthValue = monthInput.value;
  const date = parseMonth(monthValue);
  const year = date.getFullYear();
  const month = date.getMonth();
  const totalDays = daysInMonth(monthValue);

  for (let day = 1; day <= totalDays; day++) {
    const current = new Date(year, month, day);
    const dateValue = `${monthValue}-${String(day).padStart(2, "0")}`;
    const saved = existing[dateValue] || {};
    const card = dayTemplate.content.firstElementChild.cloneNode(true);
    const weekday = current.getDay();

    card.dataset.date = dateValue;
    if (weekday === 0) card.classList.add("sunday");
    if (weekday === 6) card.classList.add("saturday");

    card.querySelector(".date-badge small").textContent = `${month + 1}/`;
    card.querySelector(".date-badge strong").textContent = day;
    card.querySelector(".date-badge span").textContent = `(${weekdays[weekday]})`;

    card.querySelector('[name="type"]').value = saved.type || "未申請";
    card.querySelector('[name="start"]').value = saved.start || "";
    card.querySelector('[name="end"]').value = saved.end || "";
    refreshDayState(card);

    card.querySelectorAll("select, input").forEach((input) => {
      input.addEventListener("input", () => {
        if (input.name === "type") handleTypeChange(card);
        refreshDayState(card);
        saveDraft();
      });
    });

    calendarGrid.append(card);
  }

  updateMonthHeader();
}

function refreshDayState(card) {
  const type = card.querySelector('[name="type"]').value;
  const start = card.querySelector('[name="start"]').value;
  const end = card.querySelector('[name="end"]').value;
  const label = card.querySelector(".selected-time");
  card.classList.toggle("off", type === "公休" || type === "有給" || type === "未申請");
  card.classList.toggle("holiday", type === "公休" || type === "有給");
  label.textContent = type === "勤務" || type === "PT" ? `${formatHour(start)}-${formatHour(end)}` : "";
}

function handleTypeChange(card) {
  const type = card.querySelector('[name="type"]').value;
  const start = card.querySelector('[name="start"]');
  const end = card.querySelector('[name="end"]');
  if (type === "勤務" || type === "PT") {
    if (!start.value) start.value = DEFAULT_START;
    if (!end.value) end.value = DEFAULT_END;
    openTimeModal(card);
    return;
  }
  start.value = "";
  end.value = "";
}

function formatHour(value) {
  if (!value) return "";
  return String(Number(value.split(":")[0]));
}

function collectPayload() {
  const formData = new FormData(form);
  const shifts = [...calendarGrid.querySelectorAll(".day-card")].map((card) => ({
    date: card.dataset.date,
    day: Number(card.dataset.date.slice(-2)),
    weekday: card.querySelector(".date-badge span").textContent.replace(/[()]/g, ""),
    type: card.querySelector('[name="type"]').value,
    start: card.querySelector('[name="start"]').value,
    end: card.querySelector('[name="end"]').value,
  }));

  return {
    name: formData.get("name").trim(),
    contact: formData.get("contact"),
    store: formData.get("contact"),
    month: formData.get("month"),
    deadlineDay: DEADLINE_DAY,
    notes: formData.get("notes").trim(),
    shifts,
    submittedAt: new Date().toISOString(),
  };
}

function groupShiftsByDate(shifts = []) {
  return Object.fromEntries(shifts.map((shift) => [shift.date, shift]));
}

function saveDraft() {
  localStorage.setItem(storageKey, JSON.stringify(collectPayload()));
}

function restoreDraft() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) {
    renderCalendar();
    return;
  }

  const data = JSON.parse(saved);
  form.elements.name.value = data.name || "";
  form.elements.contact.value = data.store || data.contact || "";
  form.elements.notes.value = data.notes || "";
  monthInput.value = data.month || monthInput.value || getDefaultMonth();
  renderCalendar(groupShiftsByDate(data.shifts));
}

async function submitPayload(payload) {
  SCRIPT_URL = 'https://docs.google.com/spreadsheets/d/1dY0Mp5xuXJ5KMMv5XJfyhH0L6ocNswGFHC_8SG5rnIY/edit?usp=sharingS';
  if (!SCRIPT_URL) {
    throw new Error("app.js の SCRIPT_URL に Apps Script のウェブアプリURLを設定してください。");
  }

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!result.ok) throw new Error(result.error || "送信に失敗しました。");
    return result;
  } catch (error) {
    if (!/Failed to fetch|CORS|Load failed|NetworkError/i.test(error.message)) {
      throw error;
    }

    await fetch(SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });

    return { ok: true, opaque: true };
  }
}

function moveMonth(amount) {
  const current = parseMonth(monthInput.value);
  current.setMonth(current.getMonth() + amount);
  monthInput.value = toMonthValue(current);
  renderCalendar(groupShiftsByDate(collectPayload().shifts));
  saveDraft();
}

function fillAll(mode) {
  calendarGrid.querySelectorAll(".day-card").forEach((card) => {
    const type = card.querySelector('[name="type"]');
    const start = card.querySelector('[name="start"]');
    const end = card.querySelector('[name="end"]');

    if (mode === "work") {
      type.value = "勤務";
      start.value = DEFAULT_START;
      end.value = DEFAULT_END;
    }

    if (mode === "holiday") {
      type.value = "公休";
      start.value = "";
      end.value = "";
    }

    if (mode === "clear") {
      type.value = "未申請";
      start.value = "";
      end.value = "";
    }

    refreshDayState(card);
  });

  saveDraft();
}

document.querySelector("#prevMonth").addEventListener("click", () => moveMonth(-1));
document.querySelector("#nextMonth").addEventListener("click", () => moveMonth(1));
document.querySelector("#loadMine").addEventListener("click", restoreDraft);

document.querySelectorAll(".tools button").forEach((button) => {
  button.addEventListener("click", () => fillAll(button.dataset.fill));
});

document.querySelector("#cancelTime").addEventListener("click", () => {
  if (activeTimeCard) refreshDayState(activeTimeCard);
  closeTimeModal();
});

document.querySelector("#applyTime").addEventListener("click", () => {
  if (!activeTimeCard) return;
  activeTimeCard.querySelector('[name="start"]').value = modalStart.value;
  activeTimeCard.querySelector('[name="end"]').value = modalEnd.value;
  refreshDayState(activeTimeCard);
  saveDraft();
  closeTimeModal();
});

monthInput.addEventListener("input", () => {
  renderCalendar(groupShiftsByDate(collectPayload().shifts));
  saveDraft();
});

form.addEventListener("input", saveDraft);

form.addEventListener("reset", () => {
  setTimeout(() => {
    localStorage.removeItem(storageKey);
    monthInput.value = getDefaultMonth();
    renderCalendar();
    setMessage("入力内容をクリアしました。");
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = collectPayload();
  const requested = payload.shifts.filter((shift) => shift.type !== "未申請");

  if (!payload.name || !payload.store || !payload.month) {
    setMessage("名前、店舗名、対象月を入力してください。", "error");
    return;
  }

  if (!requested.length) {
    setMessage("勤務・公休・有給・PTのどれかを1日以上入力してください。", "error");
    return;
  }

  setMessage("送信中です...");
  form.querySelector(".primary").disabled = true;

  try {
    await submitPayload(payload);
    localStorage.setItem(storageKey, JSON.stringify(payload));
    setMessage("申請しました。同じ名前・店舗名・対象月で再申請すると変更できます。", "success");
    showToast("申請しました", "シフト希望を保存しました。");
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    form.querySelector(".primary").disabled = false;
  }
});

monthInput.value = getDefaultMonth();
buildHourOptions(modalStart, "開始");
buildHourOptions(modalEnd, "終了");
updateConnectionStatus();
restoreDraft();
