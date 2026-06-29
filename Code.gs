const SPREADSHEET_ID = "site1";
const SUBMISSION_SHEET_NAME = "シフト提出";
const ACCEPTING = true;
const DEADLINE_DAY = 15;
const DEFAULT_START = "11:00";
const DEFAULT_END = "20:00";

const APP_STORES = [
  { label: "A", value: "A" },
  { label: "B", value: "B" },
  { label: "C", value: "C" },
  { label: "D", value: "D" },
  { label: "E", value: "E" },
  { label: "F", value: "F" },
  { label: "G", value: "G" },
  { label: "H", value: "H" },
  { label: "I, value: "I" },
];
const STORES = APP_STORES.map((store) => store.value);

const STAFF_GROUPS = [
  { role: "エリマネ", names: ["J"], color: "#93c47d" },
  { role: "店長", names: ["K"], color: "#c9daf8" },
  { role: "正社トレーナー", names: ["L"], color: "#d9ead3" },
  { role: "バイトトレーナー", names: ["M"], color: "#f9cb9c" },
  { role: "研修中バイト", names: ["N"], color: "#fce5cd" },
  { role: "アルバイト", names: ["O"], color: "#ead1dc" },
];

const SUBMISSION_HEADERS = [
  "更新日時",
  "名前",
  "店舗名",
  "対象月",
  "提出期限",
  "勤務日数",
  "公休日数",
  "有給日数",
  "PT日数",
  "未申請日数",
  "月間シフトJSON",
  "月間シフト表示",
  "備考",
];

function doGet() {
  return HtmlService
    .createTemplateFromFile("GasApp")
    .evaluate()
    .setTitle("月間シフト提出")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    return json(submitShift(payload));
  } catch (error) {
    return json({ ok: false, error: error.message });
  }
}

function getInitialData() {
  return {
    ok: true,
    accepting: ACCEPTING,
    deadlineDay: DEADLINE_DAY,
    stores: APP_STORES.map((store) => store.label),
    staffNames: getStaffNames(),
    staffGroups: STAFF_GROUPS,
  };
}

function authorizeOnce() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  getSubmissionSheet(spreadsheet);
  return "権限確認が完了しました。";
}

function submitShift(payload) {
  if (!ACCEPTING) {
    throw new Error("現在、シフト提出の受付は停止中です。");
  }

  validatePayload(payload);

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getSubmissionSheet(spreadsheet);
  const name = normalizeKey(payload.name);
  const store = normalizeStoreName(payload.store || payload.contact);
  const row = findExistingRow(sheet, name, store, payload.month);
  const summary = summarize(payload.shifts);
  const values = [
    new Date(),
    name,
    store,
    payload.month,
    `毎月${payload.deadlineDay || DEADLINE_DAY}日`,
    summary.work,
    summary.holiday,
    summary.paid,
    summary.pt,
    summary.blank,
    JSON.stringify(payload.shifts),
    formatShifts(payload.shifts),
    payload.notes || "",
  ];

  if (row) {
    sheet.getRange(row, 1, 1, values.length).setValues([values]);
  } else {
    sheet.appendRow(values);
  }

  SpreadsheetApp.flush();
  rebuildMonthViews(spreadsheet, payload.month);
  SpreadsheetApp.flush();

  return { ok: true, updated: Boolean(row), month: payload.month };
}

function getSubmissionSheet(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(SUBMISSION_SHEET_NAME) || spreadsheet.insertSheet(SUBMISSION_SHEET_NAME);
  const currentHeaders = sheet.getRange(1, 1, 1, SUBMISSION_HEADERS.length).getValues()[0];
  const needsHeaders = sheet.getLastRow() === 0 || currentHeaders[0] !== SUBMISSION_HEADERS[0];

  if (needsHeaders) {
    sheet.getRange(1, 1, 1, SUBMISSION_HEADERS.length).setValues([SUBMISSION_HEADERS]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function findExistingRow(sheet, name, store, month) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const rows = sheet.getRange(2, 1, lastRow - 1, SUBMISSION_HEADERS.length).getValues();
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (row[1] === name && row[2] === store && row[3] === month) {
      return index + 2;
    }
  }

  return null;
}

function validatePayload(payload) {
  if (!payload.name) throw new Error("名前を選択してください。");
  if (!(payload.store || payload.contact)) throw new Error("店舗名を選択してください。");
  if (!payload.month) throw new Error("対象月を選択してください。");
  if (!Array.isArray(payload.shifts) || payload.shifts.length === 0) {
    throw new Error("月間シフトを入力してください。");
  }

  const requested = payload.shifts.filter((shift) => shift.type !== "未申請");
  if (!requested.length) {
    throw new Error("勤務・公休・有給・PTのどれかを1日以上入力してください。");
  }
}

function summarize(shifts) {
  return shifts.reduce((total, shift) => {
    const type = normalizeShiftType(shift.type);
    if (type === "勤務") total.work += 1;
    if (type === "公休") total.holiday += 1;
    if (type === "有給") total.paid += 1;
    if (type === "PT") total.pt += 1;
    if (type === "未申請") total.blank += 1;
    return total;
  }, { work: 0, holiday: 0, paid: 0, pt: 0, blank: 0 });
}

function formatShifts(shifts) {
  return shifts.map((shift) => {
    const value = formatShiftValue(shift);
    return `${shift.date}(${shift.weekday}) ${shift.type} ${value}`.trim();
  }).join("\n");
}

function rebuildMonthViews(spreadsheet, month) {
  const normalizedMonth = normalizeMonthValue(month);
  const records = getMonthRecords(spreadsheet, normalizedMonth);
  writeMatrixSheet(spreadsheet, `全体_${normalizedMonth}`, records, normalizedMonth, "全体");
}

function getMonthRecords(spreadsheet, month) {
  const sheet = getSubmissionSheet(spreadsheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  return sheet.getRange(2, 1, lastRow - 1, SUBMISSION_HEADERS.length)
    .getValues()
    .filter((row) => normalizeMonthValue(row[3]) === normalizeMonthValue(month))
    .map((row) => ({
      name: normalizeKey(row[1]),
      store: normalizeStoreName(row[2]),
      month: normalizeMonthValue(row[3]),
      shifts: normalizeShifts(safeJsonParse(row[10], [])),
      notes: normalizeKey(row[12]),
    }));
}

function rebuildLatestMonthView() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getSubmissionSheet(spreadsheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error("シフト提出にデータがありません。");

  const months = sheet.getRange(2, 4, lastRow - 1, 1)
    .getValues()
    .flat()
    .map(normalizeMonthValue)
    .filter(Boolean);
  if (!months.length) throw new Error("対象月が入っている提出データがありません。");

  const latestMonth = months[months.length - 1];
  rebuildMonthViews(spreadsheet, latestMonth);
  return `${latestMonth} の全体シートを再作成しました。`;
}

function writeMatrixSheet(spreadsheet, sheetName, records, month, label) {
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  const matrix = buildWeeklyMatrix(records, month, label);
  const rowCount = matrix.values.length;
  const colCount = matrix.values[0].length;

  ensureSheetSize(sheet, rowCount, colCount);
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart();
  sheet.clear();
  sheet.getRange(1, 1, rowCount, colCount).setValues(matrix.values);

  applyWeeklyMatrixFormatting(sheet, matrix);
}

function buildWeeklyMatrix(records, month, label) {
  const [year, monthNumber] = month.split("-").map(Number);
  const days = buildMonthDays(year, monthNumber);
  const weeks = splitIntoWeeks(days);
  const maxDataColumns = Math.max(...weeks.map((week) => getWeekColumnSpan(week)));
  const totalColumns = 2 + maxDataColumns;
  const values = [];
  const sections = [];

  weeks.forEach((week, weekIndex) => {
    const sectionStartRow = values.length + 1;
    const titleRow = createRow(totalColumns);
    titleRow[0] = weekIndex === 0 ? "シフト表" : "";
    titleRow[2] = `${label} ${month} 第${weekIndex + 1}週`;
    values.push(titleRow);

    const dateRow = createRow(totalColumns);
    const weekdayRow = createRow(totalColumns);
    const storeRow = createRow(totalColumns);
    const countRow = createRow(totalColumns);
    countRow[1] = "通し出勤人数";

    const dayColumns = [];
    let column = 3;
    week.forEach((day) => {
      const span = day.weekday === "金" ? 1 : STORES.length;
      const stores = day.weekday === "金" ? ["全店休み"] : STORES;

      dateRow[column - 1] = day.label;
      weekdayRow[column - 1] = day.weekday;
      stores.forEach((store, index) => {
        storeRow[column - 1 + index] = store;
        countRow[column - 1 + index] = day.weekday === "金" ? "" : countWorking(records, day.dateValue, store);
      });

      dayColumns.push({
        ...day,
        startColumn: column,
        span,
        stores,
      });
      column += span;
    });

    values.push(dateRow, weekdayRow, storeRow, countRow);

    const groupRanges = [];
    STAFF_GROUPS.forEach((group, groupIndex) => {
      const groupStartRow = values.length + 1;
      group.names.forEach((name, nameIndex) => {
        const row = createRow(totalColumns);
        row[0] = nameIndex === 0 ? group.role : "";
        row[1] = name;

        dayColumns.forEach((day) => {
          day.stores.forEach((store, storeIndex) => {
            if (day.weekday === "金") {
              row[day.startColumn - 1] = "";
              return;
            }
            row[day.startColumn - 1 + storeIndex] = getShiftCell(records, name, day.dateValue, store);
          });
        });

        values.push(row);
      });

      groupRanges.push({
        role: group.role,
        color: group.color,
        startRow: groupStartRow,
        endRow: values.length,
      });

      if (groupIndex < STAFF_GROUPS.length - 1) {
        values.push(createRow(totalColumns));
      }
    });

    sections.push({
      startRow: sectionStartRow,
      titleRow: sectionStartRow,
      dateRow: sectionStartRow + 1,
      weekdayRow: sectionStartRow + 2,
      storeRow: sectionStartRow + 3,
      countRow: sectionStartRow + 4,
      staffStartRow: sectionStartRow + 5,
      endRow: values.length,
      dayColumns,
      groupRanges,
    });

    values.push(createRow(totalColumns));
  });

  return { values, sections, totalColumns };
}

function buildMonthDays(year, monthNumber) {
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const days = [];

  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(year, monthNumber - 1, day);
    days.push({
      day,
      dateValue: `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      label: `${monthNumber}/${day}`,
      weekday: weekdays[date.getDay()],
      weekDayIndex: date.getDay(),
    });
  }

  return days;
}

function splitIntoWeeks(days) {
  const weeks = [];
  let currentWeek = [];

  days.forEach((day) => {
    if (currentWeek.length && day.weekday === "月") {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    currentWeek.push(day);
  });

  if (currentWeek.length) weeks.push(currentWeek);
  return weeks;
}

function getWeekColumnSpan(week) {
  return week.reduce((total, day) => total + (day.weekday === "金" ? 1 : STORES.length), 0);
}

function countWorking(records, dateValue, store) {
  return records.filter((record) => {
    if (normalizeStoreName(record.store) !== normalizeStoreName(store)) return false;
    const shift = record.shifts.find((item) => normalizeDateValue(item.date) === dateValue);
    const type = normalizeShiftType(shift?.type);
    return shift && (type === "勤務" || type === "PT");
  }).length;
}

function getShiftCell(records, name, dateValue, store) {
  const record = records.find((item) => (
    normalizeKey(item.name) === normalizeKey(name) &&
    normalizeStoreName(item.store) === normalizeStoreName(store)
  ));
  if (!record) return "";

  const shift = record.shifts.find((item) => normalizeDateValue(item.date) === dateValue);
  return formatShiftValue(shift);
}

function formatShiftValue(shift) {
  const type = normalizeShiftType(shift?.type);
  if (!shift || type === "未申請") return "";
  if (type === "公休") return "NG";
  if (type === "有給") return "有給";

  const start = normalizeTime(shift.start);
  const end = normalizeTime(shift.end);
  const time = start || end ? `${formatHour(start)}-${formatHour(end)}` : "";

  if (type === "勤務") {
    if (start === DEFAULT_START && end === DEFAULT_END) return "";
    return time;
  }

  if (type === "PT") {
    return time ? `PT${time}` : "PT";
  }

  return "";
}

function normalizeShiftType(value) {
  const text = normalizeKey(value);
  if (!text || text === "未選択" || text === "未申請") return "未申請";
  if (text === "勤務") return "勤務";
  if (text === "公休" || text === "NG") return "公休";
  if (text === "有給") return "有給";
  if (text.toUpperCase() === "PT") return "PT";
  return text;
}

function normalizeKey(value) {
  return String(value || "")
    .replace(/\u200b/g, "")
    .replace(/\u3000/g, " ")
    .trim();
}

function normalizeStoreName(value) {
  const text = normalizeKey(value);
  const matched = APP_STORES.find((store) => (
    normalizeKey(store.label) === text ||
    normalizeKey(store.value) === text
  ));
  return matched ? matched.value : text;
}

function normalizeMonthValue(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM");
  }

  const text = normalizeKey(value);
  if (!text) return "";

  const iso = text.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?/);
  if (iso) return `${iso[1]}-${String(Number(iso[2])).padStart(2, "0")}`;

  const jp = text.match(/^(\d{4})年\s*(\d{1,2})月/);
  if (jp) return `${jp[1]}-${String(Number(jp[2])).padStart(2, "0")}`;

  return text;
}

function normalizeDateValue(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  const text = normalizeKey(value);
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${String(Number(iso[2])).padStart(2, "0")}-${String(Number(iso[3])).padStart(2, "0")}`;
  }
  return text;
}

function normalizeTime(value) {
  const text = normalizeKey(value);
  if (!text) return "";
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return text;
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

function formatHour(value) {
  const text = normalizeTime(value);
  if (!text) return "";
  const match = text.match(/^(\d{1,2}):\d{2}$/);
  return match ? String(Number(match[1])) : text;
}

function normalizeShifts(shifts) {
  if (!Array.isArray(shifts)) return [];
  return shifts.map((shift) => ({
    ...shift,
    date: normalizeDateValue(shift.date),
    type: normalizeShiftType(shift.type),
    start: normalizeTime(shift.start),
    end: normalizeTime(shift.end),
  }));
}

function applyWeeklyMatrixFormatting(sheet, matrix) {
  const rowCount = matrix.values.length;
  const colCount = matrix.values[0].length;
  const firstDataColumn = 3;

  sheet.setFrozenRows(0);
  sheet.getRange(1, 1, rowCount, colCount)
    .setFontFamily("Arial")
    .setFontSize(9)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setWrap(true)
    .setBorder(true, true, true, true, true, true, "#000000", SpreadsheetApp.BorderStyle.SOLID);

  matrix.sections.forEach((section) => {
    sheet.getRange(section.titleRow, 1, 1, 2)
      .merge()
      .setFontWeight("bold")
      .setFontSize(12)
      .setBackground("#ffffff");

    sheet.getRange(section.titleRow, firstDataColumn, 1, colCount - 2)
      .merge()
      .setFontWeight("bold")
      .setFontSize(12)
      .setBackground("#ffffff");

    sheet.getRange(section.dateRow, firstDataColumn, 1, colCount - 2).setBackground("#ffe599").setFontWeight("bold");
    sheet.getRange(section.weekdayRow, firstDataColumn, 1, colCount - 2).setBackground("#ffe599").setFontWeight("bold");
    sheet.getRange(section.storeRow, firstDataColumn, 1, colCount - 2).setBackground("#00ffff").setFontWeight("bold");
    sheet.getRange(section.countRow, 2, 1, colCount - 1).setBackground("#ff00ff").setFontWeight("bold");

    section.dayColumns.forEach((day) => {
      if (day.span > 1) {
        sheet.getRange(section.dateRow, day.startColumn, 1, day.span).merge();
        sheet.getRange(section.weekdayRow, day.startColumn, 1, day.span).merge();
      }

      if (day.weekday === "金") {
        sheet.getRange(section.storeRow, day.startColumn, 1, 1)
          .setBackground("#d9d9d9")
          .setFontWeight("bold");
        sheet.getRange(section.staffStartRow, day.startColumn, section.endRow - section.staffStartRow + 1, 1)
          .setBackground("#f3f3f3");
      }

      const dayHeight = section.endRow - section.dateRow + 1;
      sheet.getRange(section.dateRow, day.startColumn, dayHeight, 1)
        .setBorder(null, true, null, null, null, null, "#000000", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
      sheet.getRange(section.dateRow, day.startColumn + day.span - 1, dayHeight, 1)
        .setBorder(null, null, null, true, null, null, "#000000", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    });

    section.groupRanges.forEach((group) => {
      const rows = group.endRow - group.startRow + 1;
      const roleRange = sheet.getRange(group.startRow, 1, rows, 1);
      if (rows > 1) roleRange.merge();
      roleRange.setBackground(group.color).setFontWeight("bold");
      sheet.getRange(group.startRow, 2, rows, 1).setBackground(group.color).setFontWeight("bold");
    });
  });

  sheet.setColumnWidths(1, 1, 110);
  sheet.setColumnWidths(2, 1, 112);
  sheet.setColumnWidths(firstDataColumn, colCount - 2, 48);
  sheet.setRowHeights(1, rowCount, 24);

  matrix.sections.forEach((section) => {
    sheet.setRowHeight(section.titleRow, 30);
    sheet.setRowHeight(section.countRow, 26);
    if (section.endRow + 1 <= rowCount) sheet.setRowHeight(section.endRow + 1, 12);
  });

  sheet.setFrozenColumns(2);
}

function ensureSheetSize(sheet, rowCount, colCount) {
  if (sheet.getMaxRows() < rowCount) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rowCount - sheet.getMaxRows());
  }

  if (sheet.getMaxColumns() < colCount) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), colCount - sheet.getMaxColumns());
  }
}

function getStaffNames() {
  const names = [];
  STAFF_GROUPS.forEach((group) => {
    group.names.forEach((name) => {
      if (!names.includes(name)) names.push(name);
    });
  });
  return names;
}

function createRow(length) {
  return Array(length).fill("");
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function json(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
