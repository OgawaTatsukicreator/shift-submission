//デフォルト設定
const SPREADSHEET_ID = "10Bbk7EtA5rmrXscdcRsXrx-vA2e9x03-lvv9CmF0DiA";
const OVERALL_SPREADSHEET_ID = "1-YGP2DGfasv5sKSyNMqNX730gXXm-VAD5BXbSb746O8";
const ADMIN_SPREADSHEET_ID = "1dKq5NNRDGWZR04hcw6JsChFFdCHxdd3gypsk7MFCRXE"; //上3行は保存用スプシ
const AREA_SPREADSHEET_ID = "1zDqQI5D5Vcswwp30TT9mC1c39qRw9vuyyFhQEvooE6E"; // エリア確認用スプシ。作成後にIDを差し替える。
const SUBMISSION_LOG_SPREADSHEET_ID = "1c2E4Fj-8x8l7ojUBSNeGDcz8RoC1nukzig6s6q3ZBUg"; // シフト提出状況兼PT提出log確認用スプシ。作成後にIDを差し替える。
const ACCEPTING = true; //シフトを受付中かどうか
const DEADLINE_DAY = 15; //シフトの締め切り日
const DEFAULT_START = "11:00"; //デフォの勤務開始時間
const DEFAULT_END = "20:00"; //デフォの勤務終了時間

const SHEETS = {
  AREAS: "エリアマスタ",
  STORES: "店舗マスタ",
  STAFF: "従業員マスタ",
  STAFF_STORES: "従業員店舗設定",
  FILES: "管理対象ファイル",
  SUBMISSIONS: "シフト希望",
  PT_REQUESTS: "PT申請",
  CONFIRMED: "確定シフト",
  CHANGE_LOG: "変更履歴",
}; //スプシ内シート

//
const COLORS = {
  FIXED: "#b6d7a8",
  HELP: "#9fc5e8",
  DRAFT: "#fff2cc",
  OFF: "#f4cccc",
  HEADER_DATE: "#ffe599",
  HEADER_STORE: "#00ffff",
  COUNT: "#ff00ff",
  CLOSED: "#eeeeee",
}; //スプシシートのカラー

const ROLE_COLORS = {
  "エリマネ": "#93c47d",
  "店長": "#c9daf8",
  "正社トレーナー": "#d9ead3",
  "バイトトレーナー": "#f9cb9c",
  "研修中バイト": "#fce5cd",
  "アルバイト": "#ead1dc",
}; // 役職の表示色のみコード側に保持。エリア・店舗・従業員はDB管理用スプシから読み取る。

const HEADERS = {
  [SHEETS.AREAS]: ["エリアID", "エリア名", "表示順", "有効フラグ"],
  [SHEETS.STORES]: ["店舗ID", "店舗名", "短縮名", "エリアID", "表示順", "有効フラグ"],
  [SHEETS.STAFF]: ["従業員ID", "氏名", "主所属エリアID", "主所属店舗ID", "雇用区分", "役職", "権限", "表示順", "有効フラグ"],
  [SHEETS.STAFF_STORES]: ["従業員ID", "エリアID", "店舗ID", "関係区分", "通常表示", "ヘルプ候補表示", "有効フラグ"],
  [SHEETS.FILES]: ["管理単位", "エリアID", "店舗ID", "スプレッドシートID", "用途", "編集権限者", "有効フラグ"],
  [SHEETS.SUBMISSIONS]: ["希望ID", "対象月", "従業員ID", "氏名", "所属エリアID", "所属店舗ID", "提出日時", "提出状態", "勤務日数", "休み日数", "有給日数", "PT日数", "未入力日数", "希望JSON", "希望表示", "備考"],
  [SHEETS.PT_REQUESTS]: ["PT申請ID", "従業員ID", "氏名", "所属店舗ID", "勤務エリアID", "勤務店舗ID", "勤務日", "開始時刻", "終了時刻", "申請日時", "状態", "備考"],
  [SHEETS.CONFIRMED]: ["確定シフトID", "対象月", "日付", "従業員ID", "氏名", "所属エリアID", "所属店舗ID", "勤務エリアID", "勤務店舗ID", "開始時刻", "終了時刻", "区分", "確定元", "確定日時", "確定者ID"],
  [SHEETS.CHANGE_LOG]: ["変更ID", "対象データ種別", "対象ID", "変更前", "変更後", "変更理由", "変更者ID", "変更日時"],
}; //ヘッダー定義

function doGet() {
  return HtmlService
    .createTemplateFromFile("GasApp")
    .evaluate()
    .setTitle("月間シフト提出")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    console.log("ユーザーがWebページを開きました。")
} //Webページに飛んだ際HTMLファイルを読み込んで画面を表示します

function doPost(e) {
  //submitShift(payload):1か月分のシフト希望を出したときに実行される。
  try {
    const payload = JSON.parse(e.postData.contents);
    if (payload.kind === "pt") return json(submitPtRequest(payload));
    return json(submitShift(payload)); 
  } catch (error) {
    return json({ ok: false, error: error.message });
    console.log("シフトもしくはPT申請を送信しました。")
  }
} //ユーザーがシフト希望を送った際に作動

function authorizeOnce() {
  const spreadsheet = getMasterSpreadsheet();
  setupMasterSheets();
  return `権限確認が完了しました。${spreadsheet.getName()}`;
}

function getInitialData() {
  setupMasterSheets();
  return {
    ok: true,
    accepting: ACCEPTING,
    deadlineDay: DEADLINE_DAY,
    defaultStart: DEFAULT_START,
    defaultEnd: DEFAULT_END,
    areas: getAreas(),
    stores: getStores(),
    staff: getStaff(),
    staffStoreSettings: getStaffStoreSettings(),
    shiftTypes: ["未入力", "勤務可能", "休み希望", "有給希望", "PT"],
  };
}

function submitShift(payload) {
  if (!ACCEPTING) throw new Error("現在、シフト提出の受付は停止中です。");
  setupMasterSheets();
  validateShiftPayload(payload);  
  
  //validateShiftPayload:受付期間中チェックし送信されたデータの不備を検証。

  const logSpreadsheet = getSubmissionLogSpreadsheet();
  const overallSpreadsheet = getOverallSpreadsheet();
  const sheet = getSheetWithHeaders(logSpreadsheet, SHEETS.SUBMISSIONS);
  const staff = findStaff(payload.employeeId, payload.name);
  const store = findStore(payload.storeId || staff.primaryStoreId);
  const area = findArea(payload.areaId || store.areaId);
  const month = normalizeMonthValue(payload.month);
  const shifts = normalizeShifts(payload.shifts);
  const summary = summarize(shifts);
  const hopeId = makeSubmissionId(month, staff.employeeId);
  const row = findRowByKeys(sheet, { 1: hopeId });
  const values = [
    hopeId,
    month,
    staff.employeeId,
    staff.name,
    area.areaId,
    store.storeId,
    new Date(),
    "提出済み",
    summary.work,
    summary.holiday,
    summary.paid,
    summary.pt,
    summary.blank,
    JSON.stringify(shifts),
    formatShifts(shifts),
    normalizeKey(payload.notes),
  ];

  writeRow(sheet, row, values);
  SpreadsheetApp.flush();
  rebuildMonthViews(overallSpreadsheet, month);
  SpreadsheetApp.flush();

  return { ok: true, updated: Boolean(row), month, hopeId };
}

function submitPtRequest(payload) {
  setupMasterSheets();
  validatePtPayload(payload);

  const logSpreadsheet = getSubmissionLogSpreadsheet();
  const overallSpreadsheet = getOverallSpreadsheet();
  const ptSheet = getSheetWithHeaders(logSpreadsheet, SHEETS.PT_REQUESTS);
  const staff = findStaff(payload.employeeId, payload.name);
  const workStore = findStore(payload.workStoreId || payload.storeId || staff.primaryStoreId);
  const workArea = findArea(payload.workAreaId || workStore.areaId);
  const workDate = normalizeDateValue(payload.date);
  const start = normalizeTime(payload.start || DEFAULT_START);
  const end = normalizeTime(payload.end || DEFAULT_END);
  const requestId = `PT-${staff.employeeId}-${workDate}-${Date.now()}`;
  const status = "自動確定";

  ptSheet.appendRow([
    requestId,
    staff.employeeId,
    staff.name,
    staff.primaryStoreId,
    workArea.areaId,
    workStore.storeId,
    workDate,
    start,
    end,
    new Date(),
    status,
    normalizeKey(payload.notes),
  ]);

  const confirmed = {
    month: workDate.slice(0, 7),
    date: workDate,
    employeeId: staff.employeeId,
    name: staff.name,
    homeAreaId: staff.primaryAreaId,
    homeStoreId: staff.primaryStoreId,
    workAreaId: workArea.areaId,
    workStoreId: workStore.storeId,
    start,
    end,
    type: "PT",
    source: "PT申請",
    confirmerId: staff.employeeId,
  };
  upsertConfirmedShift(overallSpreadsheet, confirmed);
  appendChangeLog(overallSpreadsheet, "PT申請", requestId, "", JSON.stringify(confirmed), "PT自動確定", staff.employeeId);
  rebuildMonthViews(overallSpreadsheet, confirmed.month);

  return { ok: true, status, requestId, confirmed };
}

function getMySchedule(query) {
  setupMasterSheets();
  const employee = findStaff(query.employeeId, query.name);
  const month = normalizeMonthValue(query.month);
  const overallSpreadsheet = getOverallSpreadsheet();
  const logSpreadsheet = getSubmissionLogSpreadsheet();
  const confirmedRows = readObjects(getSheetWithHeaders(overallSpreadsheet, SHEETS.CONFIRMED))
    .filter((row) => row["従業員ID"] === employee.employeeId && normalizeMonthValue(row["対象月"]) === month);
  const hopeRows = readObjects(getSheetWithHeaders(logSpreadsheet, SHEETS.SUBMISSIONS))
    .filter((row) => row["従業員ID"] === employee.employeeId && normalizeMonthValue(row["対象月"]) === month);

  return {
    ok: true,
    employee,
    month,
    confirmed: confirmedRows.map(normalizeConfirmedObject),
    hopes: hopeRows.length ? safeJsonParse(hopeRows[0]["希望JSON"], []) : [],
  };
}

function confirmActiveSheet() {
  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const activeSheet = activeSpreadsheet.getActiveSheet();
  const month = detectMonthFromSheetName(activeSheet.getName()) || detectMonthFromMatrix(activeSheet) || normalizeMonthValue(new Date());
  const targetAreaId = detectAreaIdFromSheetName(activeSheet.getName());
  return confirmMatrixSheet({
    sourceSpreadsheetId: activeSpreadsheet.getId(),
    sourceSheetName: activeSheet.getName(),
    month,
    areaId: targetAreaId,
    confirmerId: Session.getActiveUser().getEmail() || "spreadsheet-user",
  });
}

function confirmMatrixSheet(options) {
  setupMasterSheets();
  const master = getMasterSpreadsheet();
  const sourceSpreadsheetId = options.sourceSpreadsheetId || getManagedSpreadsheetId_("エリア確認", AREA_SPREADSHEET_ID, options.areaId);
  const sourceSpreadsheet = SpreadsheetApp.openById(sourceSpreadsheetId);
  const sheet = sourceSpreadsheet.getSheetByName(options.sourceSheetName);
  if (!sheet) throw new Error(`確定対象シートが見つかりません: ${options.sourceSheetName}`);

  const parsed = parseConfirmedCells(sheet, options.month, options.confirmerId);
  const filtered = options.areaId
    ? parsed.filter((item) => item.workAreaId === options.areaId)
    : parsed;

  filtered.forEach((item) => upsertConfirmedShift(master, item));
  appendChangeLog(master, "確定シフト", `${sourceSpreadsheetId}:${options.sourceSheetName}`, "", JSON.stringify(filtered), "シート確定ボタン", options.confirmerId);
  rebuildMonthViews(master, options.month);
  return `${filtered.length}件の確定シフトを反映しました。`;
}

function setupMasterSheets() {
  console.log("[setupMasterSheets] 4ファイル構成のシート/ヘッダー確認開始");
  const overall = getOverallSpreadsheet();
  const db = getDbSpreadsheet();
  const area = getAreaSpreadsheet();
  const log = getSubmissionLogSpreadsheet();

  [SHEETS.CONFIRMED, SHEETS.CHANGE_LOG].forEach((sheetName) => getSheetWithHeaders(overall, sheetName));
  [SHEETS.AREAS, SHEETS.STORES, SHEETS.STAFF, SHEETS.STAFF_STORES, SHEETS.FILES].forEach((sheetName) => getSheetWithHeaders(db, sheetName));
  [SHEETS.SUBMISSIONS, SHEETS.PT_REQUESTS].forEach((sheetName) => getSheetWithHeaders(log, sheetName));
  getSheetWithHeaders(area, SHEETS.FILES);

  console.log("[setupMasterSheets] 4ファイル構成のシート/ヘッダー確認完了");
  return true;
}

function rebuildLatestMonthView() {
  const logSpreadsheet = getSubmissionLogSpreadsheet();
  const submissions = readObjects(getSheetWithHeaders(logSpreadsheet, SHEETS.SUBMISSIONS));
  const months = submissions.map((row) => normalizeMonthValue(row["対象月"])).filter(Boolean);
  if (!months.length) throw new Error("シフト希望に対象月データがありません。");
  const latestMonth = months[months.length - 1];
  rebuildMonthViews(getOverallSpreadsheet(), latestMonth);
  return `${latestMonth} の全体/エリアシートを再作成しました。`;
}

function rebuildMonthViews(spreadsheet, month) {
  const normalizedMonth = normalizeMonthValue(month);
  const records = getMonthRecords(spreadsheet, normalizedMonth);
  const overallSpreadsheet = getOverallSpreadsheet();
  const areaSpreadsheet = getAreaSpreadsheet();
  writeMatrixSheet(overallSpreadsheet, `全体_${normalizedMonth}`, records, normalizedMonth, "全体", null);
  getAreas().forEach((area) => {
    const areaRecords = records.filter((record) => record.homeAreaId === area.areaId || record.storeAreaId === area.areaId);
    writeMatrixSheet(areaSpreadsheet, `エリア_${area.areaId}_${normalizedMonth}`, areaRecords, normalizedMonth, area.areaName, area.areaId);
  });
}

function getMonthRecords(spreadsheet, month) {
  const submissions = readObjects(getSheetWithHeaders(getSubmissionLogSpreadsheet(), SHEETS.SUBMISSIONS))
    .filter((row) => normalizeMonthValue(row["対象月"]) === month)
    .map((row) => ({
      employeeId: row["従業員ID"],
      name: row["氏名"],
      homeAreaId: row["所属エリアID"],
      homeStoreId: row["所属店舗ID"],
      storeId: row["所属店舗ID"],
      storeAreaId: row["所属エリアID"],
      shifts: normalizeShifts(safeJsonParse(row["希望JSON"], [])),
      source: "hope",
    }));

  const confirmed = readObjects(getSheetWithHeaders(getOverallSpreadsheet(), SHEETS.CONFIRMED))
    .filter((row) => normalizeMonthValue(row["対象月"]) === month)
    .map((row) => ({
      employeeId: row["従業員ID"],
      name: row["氏名"],
      homeAreaId: row["所属エリアID"],
      homeStoreId: row["所属店舗ID"],
      storeId: row["勤務店舗ID"],
      storeAreaId: row["勤務エリアID"],
      shifts: [{
        date: normalizeDateValue(row["日付"]),
        type: row["区分"] === "休み" ? "休み希望" : row["区分"],
        start: normalizeTime(row["開始時刻"]),
        end: normalizeTime(row["終了時刻"]),
        confirmed: true,
      }],
      source: "confirmed",
    }));

  return mergeRecordSources(submissions, confirmed);
}

function writeMatrixSheet(spreadsheet, sheetName, records, month, label, areaId) {
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  const matrix = buildWeeklyMatrix(records, month, label, areaId);
  const rowCount = matrix.values.length;
  const colCount = matrix.values[0].length;

  ensureSheetSize(sheet, rowCount, colCount);
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart();
  sheet.clear();
  sheet.getRange(1, 1, rowCount, colCount).setValues(matrix.values);
  applyWeeklyMatrixFormatting(sheet, matrix);
}

function buildWeeklyMatrix(records, month, label, areaId) {
  const [year, monthNumber] = month.split("-").map(Number);
  const days = buildMonthDays(year, monthNumber);
  const weeks = splitIntoWeeks(days);
  const stores = getStores().filter((store) => !areaId || store.areaId === areaId);
  const staffGroups = getMatrixStaffGroups(areaId);
  const maxDataColumns = Math.max(...weeks.map((week) => getWeekColumnSpan(week, stores)));
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
      const closed = day.weekday === "金";
      const dayStores = closed ? [{ storeId: "CLOSED", shortName: "全店休み", areaId: "" }] : stores;
      const span = dayStores.length;
      dateRow[column - 1] = day.label;
      weekdayRow[column - 1] = day.weekday;
      dayStores.forEach((store, index) => {
        storeRow[column - 1 + index] = store.shortName || store.storeName;
        countRow[column - 1 + index] = closed ? "" : countWorking(records, day.dateValue, store.storeId);
      });
      dayColumns.push({ ...day, startColumn: column, span, stores: dayStores, closed });
      column += span;
    });

    values.push(dateRow, weekdayRow, storeRow, countRow);

    const groupRanges = [];
    staffGroups.forEach((group, groupIndex) => {
      const groupStartRow = values.length + 1;
      group.staff.forEach((staff, nameIndex) => {
        const row = createRow(totalColumns);
        row[0] = nameIndex === 0 ? group.role : "";
        row[1] = staff.name;
        dayColumns.forEach((day) => {
          day.stores.forEach((store, storeIndex) => {
            row[day.startColumn - 1 + storeIndex] = day.closed ? "" : getShiftCell(records, staff.employeeId, staff.name, day.dateValue, store.storeId);
          });
        });
        values.push(row);
      });
      groupRanges.push({ role: group.role, color: group.color, startRow: groupStartRow, endRow: values.length });
      if (groupIndex < staffGroups.length - 1) values.push(createRow(totalColumns));
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

function parseConfirmedCells(sheet, month, confirmerId) {
  const range = sheet.getDataRange();
  const values = range.getValues();
  const backgrounds = range.getBackgrounds();
  const result = [];
  const staffByName = Object.fromEntries(getStaff().map((staff) => [staff.name, staff]));
  const storeByShort = Object.fromEntries(getStores().flatMap((store) => [[store.shortName, store], [store.storeName, store], [store.storeId, store]]));

  for (let r = 0; r < values.length; r++) {
    if (values[r][0] !== "シフト表") continue;
    const dateRow = values[r + 1] || [];
    const storeRow = values[r + 3] || [];
    let currentDate = "";
    for (let staffRow = r + 5; staffRow < values.length; staffRow++) {
      const staffName = normalizeKey(values[staffRow][1]);
      if (!staffName && !values[staffRow][0]) break;
      if (!staffName || !staffByName[staffName]) continue;
      const staff = staffByName[staffName];
      for (let c = 2; c < values[staffRow].length; c++) {
        if (dateRow[c]) currentDate = resolveMatrixDate(month, dateRow[c]);
        const store = storeByShort[normalizeKey(storeRow[c])];
        if (!currentDate || !store) continue;
        const color = normalizeColor(backgrounds[staffRow][c]);
        const confirmType = getConfirmTypeFromColor(color);
        if (!confirmType) continue;
        const parsed = parseShiftCell(values[staffRow][c], confirmType);
        if (!parsed) continue;
        result.push({
          month,
          date: currentDate,
          employeeId: staff.employeeId,
          name: staff.name,
          homeAreaId: staff.primaryAreaId,
          homeStoreId: staff.primaryStoreId,
          workAreaId: store.areaId,
          workStoreId: store.storeId,
          start: parsed.start,
          end: parsed.end,
          type: parsed.type,
          source: "エリア別シート",
          confirmerId,
        });
      }
    }
  }
  return result;
}

function upsertConfirmedShift(spreadsheet, item) {
  const sheet = getSheetWithHeaders(spreadsheet, SHEETS.CONFIRMED);
  const confirmedId = makeConfirmedId(item.date, item.employeeId, item.workStoreId);
  const row = findRowByKeys(sheet, { 1: confirmedId });
  const values = [
    confirmedId,
    item.month,
    item.date,
    item.employeeId,
    item.name,
    item.homeAreaId,
    item.homeStoreId,
    item.workAreaId,
    item.workStoreId,
    item.start,
    item.end,
    item.type,
    item.source,
    new Date(),
    item.confirmerId || "",
  ];
  writeRow(sheet, row, values);
}

function validateShiftPayload(payload) {
  if (!(payload.employeeId || payload.name)) throw new Error("名前を選択してください。");
  if (!payload.storeId) throw new Error("店舗を選択してください。");
  if (!payload.areaId) throw new Error("エリアを選択してください。");
  if (!payload.month) throw new Error("対象月を選択してください。");
  if (!Array.isArray(payload.shifts) || payload.shifts.length === 0) throw new Error("月間シフトを入力してください。");
  const requested = payload.shifts.filter((shift) => normalizeShiftType(shift.type) !== "未入力");
  if (!requested.length) throw new Error("勤務可能・休み希望・有給希望・PTのどれかを1日以上入力してください。");
}

function validatePtPayload(payload) {
  if (!(payload.employeeId || payload.name)) throw new Error("名前を選択してください。");
  if (!payload.date) throw new Error("PT申請日を選択してください。");
  const workDate = new Date(`${normalizeDateValue(payload.date)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (workDate < tomorrow) throw new Error("PT申請は前日までに行ってください。");
}

function summarize(shifts) {
  return shifts.reduce((total, shift) => {
    const type = normalizeShiftType(shift.type);
    if (type === "勤務可能") total.work += 1;
    if (type === "休み希望") total.holiday += 1;
    if (type === "有給希望") total.paid += 1;
    if (type === "PT") total.pt += 1;
    if (type === "未入力") total.blank += 1;
    return total;
  }, { work: 0, holiday: 0, paid: 0, pt: 0, blank: 0 });
}

function countWorking(records, dateValue, storeId) {
  return records.filter((record) => {
    if (record.storeId !== storeId) return false;
    const shift = record.shifts.find((item) => normalizeDateValue(item.date) === dateValue);
    const type = normalizeShiftType(shift && shift.type);
    return shift && (type === "勤務可能" || type === "PT" || type === "通常" || type === "ヘルプ");
  }).length;
}

function getShiftCell(records, employeeId, name, dateValue, storeId) {
  const record = records.find((item) => (
    (item.employeeId === employeeId || item.name === name) &&
    item.storeId === storeId
  ));
  if (!record) return "";
  const shift = record.shifts.find((item) => normalizeDateValue(item.date) === dateValue);
  return formatShiftValue(shift, record.source);
}

function formatShiftValue(shift, source) {
  const type = normalizeShiftType(shift && shift.type);
  if (!shift || type === "未入力") return "";
  if (type === "休み希望" || type === "休み") return "NG";
  if (type === "有給希望" || type === "有給") return "有給";
  const start = normalizeTime(shift.start);
  const end = normalizeTime(shift.end);
  const time = start || end ? `${formatHour(start)}-${formatHour(end)}` : "";
  if (type === "PT") return time ? `PT${time}` : "PT";
  if (source === "confirmed" && type === "ヘルプ") return time || "";
  if (start === DEFAULT_START && end === DEFAULT_END) return "";
  return time;
}

function parseShiftCell(value, confirmType) {
  const text = normalizeKey(value);
  if (confirmType === "休み") return { type: "休み", start: "", end: "" };
  if (text === "有給") return { type: "有給", start: "", end: "" };
  if (text === "NG") return { type: "休み", start: "", end: "" };
  const pt = text.match(/^PT\s*(\d{1,2})(?::?00)?[-〜~](\d{1,2})(?::?00)?$/i);
  if (pt) return { type: "PT", start: `${pad2(pt[1])}:00`, end: `${pad2(pt[2])}:00` };
  if (/^PT$/i.test(text)) return { type: "PT", start: DEFAULT_START, end: DEFAULT_END };
  const time = text.match(/^(\d{1,2})(?::?00)?[-〜~](\d{1,2})(?::?00)?$/);
  const type = confirmType === "ヘルプ" ? "ヘルプ" : "通常";
  if (time) return { type, start: `${pad2(time[1])}:00`, end: `${pad2(time[2])}:00` };
  if (!text) return { type, start: DEFAULT_START, end: DEFAULT_END };
  return null;
}

function getConfirmTypeFromColor(color) {
  if (color === COLORS.FIXED) return "通常";
  if (color === COLORS.HELP) return "ヘルプ";
  if (color === COLORS.OFF) return "休み";
  return "";
}

function getMatrixStaffGroups(areaId) {
  const staff = getStaff().filter((member) => !areaId || member.primaryAreaId === areaId || canHelpInArea(member.employeeId, areaId));
  const roles = [];
  staff.forEach((member) => {
    const role = normalizeKey(member.role) || "未設定";
    if (!roles.includes(role)) roles.push(role);
  });
  return roles.map((role) => ({
    role,
    color: getRoleColor(role),
    staff: staff.filter((member) => (normalizeKey(member.role) || "未設定") === role),
  })).filter((group) => group.staff.length);
}

function getRoleColor(role) {
  if (ROLE_COLORS[role]) return ROLE_COLORS[role];
  const colors = ["#c9daf8", "#d9ead3", "#f9cb9c", "#fce5cd", "#ead1dc", "#d9d2e9", "#d0e0e3"];
  const index = Math.abs(hashString_(role)) % colors.length;
  return colors[index];
}

function canHelpInArea(employeeId, areaId) {
  return getStaffStoreSettings().some((setting) => (
    setting.employeeId === employeeId &&
    setting.areaId === areaId &&
    setting.helpCandidate
  ));
}

function getAreas() {
  return readObjects(getSheetWithHeaders(getDbSpreadsheet(), SHEETS.AREAS)).map((row) => ({
    areaId: row["エリアID"],
    areaName: row["エリア名"],
    order: Number(row["表示順"]) || 0,
    active: toBoolean(row["有効フラグ"]),
  })).filter((row) => row.active).sort((a, b) => a.order - b.order);
}

function getStores() {
  return readObjects(getSheetWithHeaders(getDbSpreadsheet(), SHEETS.STORES)).map((row) => ({
    storeId: row["店舗ID"],
    storeName: row["店舗名"],
    shortName: row["短縮名"],
    areaId: row["エリアID"],
    order: Number(row["表示順"]) || 0,
    active: toBoolean(row["有効フラグ"]),
  })).filter((row) => row.active).sort((a, b) => a.order - b.order);
}

function getStaff() {
  return readObjects(getSheetWithHeaders(getDbSpreadsheet(), SHEETS.STAFF)).map((row) => ({
    employeeId: row["従業員ID"],
    name: row["氏名"],
    primaryAreaId: row["主所属エリアID"],
    primaryStoreId: row["主所属店舗ID"],
    employmentType: row["雇用区分"],
    role: row["役職"],
    permission: row["権限"],
    order: Number(row["表示順"]) || 0,
    active: toBoolean(row["有効フラグ"]),
  })).filter((row) => row.active).sort((a, b) => a.order - b.order);
}

function getStaffStoreSettings() {
  return readObjects(getSheetWithHeaders(getDbSpreadsheet(), SHEETS.STAFF_STORES)).map((row) => ({
    employeeId: row["従業員ID"],
    areaId: row["エリアID"],
    storeId: row["店舗ID"],
    relation: row["関係区分"],
    normalDisplay: toBoolean(row["通常表示"]),
    helpCandidate: toBoolean(row["ヘルプ候補表示"]),
    active: toBoolean(row["有効フラグ"]),
  })).filter((row) => row.active);
}

function findStaff(employeeId, name) {
  const key = normalizeKey(employeeId);
  const nameKey = normalizeKey(name);
  const staff = getStaff().find((item) => item.employeeId === key || item.name === nameKey);
  if (!staff) throw new Error("従業員が見つかりません。");
  return staff;
}

function findStore(storeIdOrName) {
  const key = normalizeKey(storeIdOrName);
  const store = getStores().find((item) => (
    item.storeId === key ||
    item.storeName === key ||
    item.shortName === key
  ));
  if (!store) throw new Error(`店舗が見つかりません: ${storeIdOrName}`);
  return store;
}

function findStoreSafe(storeIdOrName) {
  try {
    return findStore(storeIdOrName);
  } catch (error) {
    console.warn("[findStoreSafe] 店舗が見つからないためID表示で継続", { storeIdOrName, error: error.message });
    return null;
  }
}

function findArea(areaIdOrName) {
  const key = normalizeKey(areaIdOrName);
  const area = getAreas().find((item) => item.areaId === key || item.areaName === key);
  if (!area) throw new Error(`エリアが見つかりません: ${areaIdOrName}`);
  return area;
}

function getMasterSpreadsheet() {
  return getOverallSpreadsheet();
}

function getDbSpreadsheet() {
  return SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID);
}

function getAreaSpreadsheet() {
  return SpreadsheetApp.openById(getManagedSpreadsheetId_("エリア確認", AREA_SPREADSHEET_ID));
}

function getSubmissionLogSpreadsheet() {
  return SpreadsheetApp.openById(getManagedSpreadsheetId_("提出ログ", SUBMISSION_LOG_SPREADSHEET_ID));
}

function getManagedSpreadsheetId_(unit, fallbackId, areaId, storeId) {
  const db = SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID);
  const sheet = getSheetWithHeaders(db, SHEETS.FILES);
  const rows = readObjects(sheet);
  const matched = rows.find((row) => (
    normalizeKey(row["管理単位"]) === normalizeKey(unit) &&
    (!areaId || normalizeKey(row["エリアID"]) === normalizeKey(areaId)) &&
    (!storeId || normalizeKey(row["店舗ID"]) === normalizeKey(storeId)) &&
    toBoolean(row["有効フラグ"])
  ));
  return normalizeKey(matched && matched["スプレッドシートID"]) || fallbackId;
}

function getSheetWithHeaders(spreadsheet, sheetName) {
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  const headers = HEADERS[sheetName];
  if (!headers) return sheet;
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const missing = sheet.getLastRow() === 0 || current.join("\t") !== headers.join("\t");
  if (missing) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function readObjects(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2) return [];
  const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  const headers = values[0];
  return values.slice(1).filter((row) => row.some((cell) => cell !== "")).map((row) => {
    const object = {};
    headers.forEach((header, index) => object[header] = row[index]);
    return object;
  });
}

function writeRow(sheet, row, values) {
  if (row) {
    sheet.getRange(row, 1, 1, values.length).setValues([values]);
  } else {
    sheet.appendRow(values);
  }
}

function findRowByKeys(sheet, keyMap) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const maxColumn = Math.max(...Object.keys(keyMap).map(Number));
  const rows = sheet.getRange(2, 1, lastRow - 1, Math.max(sheet.getLastColumn(), maxColumn)).getValues();
  for (let index = 0; index < rows.length; index++) {
    const matched = Object.keys(keyMap).every((column) => normalizeKey(rows[index][Number(column) - 1]) === normalizeKey(keyMap[column]));
    if (matched) return index + 2;
  }
  return null;
}

function appendChangeLog(spreadsheet, type, targetId, before, after, reason, userId) {
  getSheetWithHeaders(spreadsheet, SHEETS.CHANGE_LOG).appendRow([
    `LOG-${Date.now()}`,
    type,
    targetId,
    before,
    after,
    reason,
    userId,
    new Date(),
  ]);
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
    sheet.getRange(section.titleRow, 1, 1, 2).merge().setFontWeight("bold").setFontSize(12).setBackground("#ffffff");
    sheet.getRange(section.titleRow, firstDataColumn, 1, colCount - 2).merge().setFontWeight("bold").setFontSize(12).setBackground("#ffffff");
    sheet.getRange(section.dateRow, firstDataColumn, 1, colCount - 2).setBackground(COLORS.HEADER_DATE).setFontWeight("bold");
    sheet.getRange(section.weekdayRow, firstDataColumn, 1, colCount - 2).setBackground(COLORS.HEADER_DATE).setFontWeight("bold");
    sheet.getRange(section.storeRow, firstDataColumn, 1, colCount - 2).setBackground(COLORS.HEADER_STORE).setFontWeight("bold");
    sheet.getRange(section.countRow, 2, 1, colCount - 1).setBackground(COLORS.COUNT).setFontWeight("bold");

    section.dayColumns.forEach((day) => {
      if (day.span > 1) {
        sheet.getRange(section.dateRow, day.startColumn, 1, day.span).merge();
        sheet.getRange(section.weekdayRow, day.startColumn, 1, day.span).merge();
      }
      if (day.closed) {
        sheet.getRange(section.storeRow, day.startColumn, 1, 1).setBackground(COLORS.CLOSED).setFontWeight("bold");
        sheet.getRange(section.staffStartRow, day.startColumn, section.endRow - section.staffStartRow + 1, 1).setBackground("#f3f3f3");
      }
      const dayHeight = section.endRow - section.dateRow + 1;
      sheet.getRange(section.dateRow, day.startColumn, dayHeight, 1).setBorder(null, true, null, null, null, null, "#000000", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
      sheet.getRange(section.dateRow, day.startColumn + day.span - 1, dayHeight, 1).setBorder(null, null, null, true, null, null, "#000000", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
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
  sheet.setFrozenColumns(2);
}

function ensureSheetSize(sheet, rowCount, colCount) {
  if (sheet.getMaxRows() < rowCount) sheet.insertRowsAfter(sheet.getMaxRows(), rowCount - sheet.getMaxRows());
  if (sheet.getMaxColumns() < colCount) sheet.insertColumnsAfter(sheet.getMaxColumns(), colCount - sheet.getMaxColumns());
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

function getWeekColumnSpan(week, stores) {
  return week.reduce((total, day) => total + (day.weekday === "金" ? 1 : stores.length), 0);
}

function mergeRecordSources(submissions, confirmed) {
  const map = {};
  submissions.forEach((record) => {
    map[`${record.employeeId}:${record.storeId}:hope`] = record;
  });
  confirmed.forEach((record) => {
    const key = `${record.employeeId}:${record.storeId}:confirmed`;
    if (!map[key]) map[key] = { ...record, shifts: [] };
    map[key].shifts = map[key].shifts.concat(record.shifts);
  });
  return Object.values(map);
}

function normalizeConfirmedObject(row) {
  const workStore = findStoreSafe(row["勤務店舗ID"]);
  return {
    date: normalizeDateValue(row["日付"]),
    employeeId: row["従業員ID"],
    name: row["氏名"],
    workStoreId: row["勤務店舗ID"],
    workStoreName: workStore ? workStore.storeName : normalizeKey(row["勤務店舗ID"]),
    start: normalizeTime(row["開始時刻"]),
    end: normalizeTime(row["終了時刻"]),
    type: row["区分"],
  };
}

function normalizeShiftType(value) {
  const text = normalizeKey(value);
  if (!text || text === "未選択" || text === "未申請" || text === "未入力") return "未入力";
  if (text === "勤務" || text === "勤務可能" || text === "通常") return text === "通常" ? "通常" : "勤務可能";
  if (text === "公休" || text === "休み" || text === "休み希望" || text === "NG") return text === "休み" ? "休み" : "休み希望";
  if (text === "有給" || text === "有給希望") return text === "有給" ? "有給" : "有給希望";
  if (text === "ヘルプ") return "ヘルプ";
  if (text.toUpperCase() === "PT") return "PT";
  return text;
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

function formatShifts(shifts) {
  return shifts.map((shift) => `${shift.date} ${shift.type} ${formatShiftValue(shift)}`.trim()).join("\n");
}

function normalizeKey(value) {
  return String(value || "").replace(/\u200b/g, "").replace(/\u3000/g, " ").trim();
}

function hashString_(value) {
  return normalizeKey(value).split("").reduce((hash, char) => {
    return ((hash << 5) - hash) + char.charCodeAt(0);
  }, 0);
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
  if (iso) return `${iso[1]}-${String(Number(iso[2])).padStart(2, "0")}-${String(Number(iso[3])).padStart(2, "0")}`;
  return text;
}

function normalizeTime(value) {
  const text = normalizeKey(value);
  if (!text) return "";
  const match = text.match(/^(\d{1,2}):?(\d{2})?/);
  if (!match) return text;
  return `${pad2(match[1])}:${match[2] || "00"}`;
}

function formatHour(value) {
  const text = normalizeTime(value);
  if (!text) return "";
  const match = text.match(/^(\d{1,2}):\d{2}$/);
  return match ? String(Number(match[1])) : text;
}

function pad2(value) {
  return String(Number(value)).padStart(2, "0");
}

function toBoolean(value) {
  return value === true || String(value).toUpperCase() === "TRUE";
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

function makeSubmissionId(month, employeeId) {
  return `HOPE-${month}-${employeeId}`;
}

function makeConfirmedId(date, employeeId, storeId) {
  return `FIX-${date}-${employeeId}-${storeId}`;
}

function normalizeColor(value) {
  return String(value || "").toLowerCase();
}

function resolveMatrixDate(month, label) {
  const match = normalizeKey(label).match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!match) return "";
  const [year] = month.split("-");
  return `${year}-${pad2(match[1])}-${pad2(match[2])}`;
}

function detectMonthFromSheetName(name) {
  const match = normalizeKey(name).match(/(\d{4}-\d{2})/);
  return match ? match[1] : "";
}

function detectAreaIdFromSheetName(name) {
  const match = normalizeKey(name).match(/^エリア_([^_]+)_\d{4}-\d{2}$/);
  return match ? match[1] : "";
}

function detectMonthFromMatrix(sheet) {
  const value = sheet.getRange(1, 3).getDisplayValue();
  const match = value.match(/(\d{4}-\d{2})/);
  return match ? match[1] : "";
}

function json(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

const ADMIN_DB_SHEET_NAME = "ID_DB";
const ADMIN_FILE_SHEET_NAME = SHEETS.FILES;
const ADMIN_DB_HEADERS = [
  "変更",
  "従業員ID",
  "氏名",
  "主所属エリアID",
  "主所属店舗ID",
  "雇用区分",
  "役職",
  "権限",
  "表示順",
  "有効フラグ",
  "処理結果",
  "更新日時",
];
const ADMIN_FILE_HEADERS = [
  "管理単位",
  "エリアID",
  "店舗ID",
  "スプレッドシートID",
  "用途",
  "編集権限者",
  "有効フラグ",
  "備考",
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("シフト制作")
    .addItem("初期シート作成", "setupMasterSheets")
    .addItem("管理者ID_DB作成", "setupAdminDatabase")
    .addItem("ID_DBの変更を反映", "applyAdminIdDbChanges")
    .addItem("最新月の全体/エリアシート再作成", "rebuildLatestMonthView")
    .addItem("このシートを確定反映", "confirmActiveSheet")
    .addToUi();
}

function getOverallSpreadsheet() {
  return SpreadsheetApp.openById(getManagedSpreadsheetId_("全体確認", OVERALL_SPREADSHEET_ID));
}

function getAdminSpreadsheet() {
  return SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID);
}

function setupAdminDatabase() {
  const admin = getAdminSpreadsheet();
  const idDb = getAdminSheetWithHeaders_(admin, ADMIN_DB_SHEET_NAME, ADMIN_DB_HEADERS);
  getAdminSheetWithHeaders_(admin, ADMIN_FILE_SHEET_NAME, ADMIN_FILE_HEADERS);
  applyAdminCheckboxes_(idDb);
  return "管理者用ID_DBのヘッダーを作成しました。マスタデータはスプレッドシートに入力してください。";
}

function applyAdminIdDbChanges() {
  setupMasterSheets();
  const admin = getAdminSpreadsheet();
  const db = getDbSpreadsheet();
  const idDb = getAdminSheetWithHeaders_(admin, ADMIN_DB_SHEET_NAME, ADMIN_DB_HEADERS);
  const staffSheet = getSheetWithHeaders(db, SHEETS.STAFF);
  const rows = idDb.getDataRange().getValues();
  const now = new Date();
  let changed = 0;

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const shouldApply = row[0] === true || String(row[0]).toUpperCase() === "TRUE";
    if (!shouldApply) continue;

    const employeeId = normalizeKey(row[1]);
    const name = normalizeKey(row[2]);
    if (!employeeId || !name) {
      idDb.getRange(rowIndex + 1, 11, 1, 2).setValues([["従業員IDと氏名は必須です", now]]);
      continue;
    }

    const values = [
      employeeId,
      name,
      normalizeKey(row[3]),
      normalizeKey(row[4]),
      normalizeKey(row[5]),
      normalizeKey(row[6]),
      normalizeKey(row[7]),
      Number(row[8]) || rowIndex,
      row[9] === true || String(row[9]).toUpperCase() === "TRUE",
    ];
    const targetRow = findRowByKeys(staffSheet, { 1: employeeId });
    writeRow(staffSheet, targetRow, values);

    idDb.getRange(rowIndex + 1, 1).setValue(false);
    idDb.getRange(rowIndex + 1, 11, 1, 2).setValues([["反映済み", now]]);
    appendChangeLog(db, "従業員マスタ", employeeId, "", JSON.stringify(values), "管理者ID_DB変更", "admin");
    changed += 1;
  }

  SpreadsheetApp.flush();
  return `${changed}件の従業員情報を反映しました。`;
}

function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== ADMIN_DB_SHEET_NAME) return;
  if (e.range.getColumn() !== 1 || e.range.getRow() === 1) return;
  if (e.value !== "TRUE") return;
  sheet.getRange(e.range.getRow(), 11, 1, 2).setValues([["変更待ち: メニューまたはボタンで反映してください", new Date()]]);
}

function getAdminSheetWithHeaders_(spreadsheet, sheetName, headers) {
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (sheet.getLastRow() === 0 || current.join("\t") !== headers.join("\t")) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function applyAdminCheckboxes_(sheet) {
  const maxRows = Math.max(sheet.getMaxRows() - 1, 1);
  sheet.getRange(2, 1, maxRows, 1).insertCheckboxes();
  sheet.getRange(2, 10, maxRows, 1).insertCheckboxes();
  sheet.autoResizeColumns(1, ADMIN_DB_HEADERS.length);
}
