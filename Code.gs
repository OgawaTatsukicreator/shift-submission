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
const WORK_MIN_TIME = "11:00";
const WORK_MAX_TIME = "20:00";
const PT_MIN_TIME = "07:00";
const PT_MAX_TIME = "22:00";
const SESSION_LIFETIME_HOURS = 12;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_LOCK_MINUTES = 15;
const PASSWORD_HASH_ROUNDS = 1200;
const SHIFT_TIME_ZONE = "Asia/Tokyo";
const SHIFT_INPUT_TYPES = ["未入力", "勤務可能", "休み希望", "有給希望", "PT"];
const ADMIN_EMAILS_PROPERTY = "SHIFT_SYSTEM_ADMIN_EMAILS";

// 同じGAS実行内だけで読込結果を共有し、次のリクエストには持ち越さない。
let requestCache_ = {};

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
  LOGIN_ACCOUNTS: "ログインアカウント",
  AUTH_SESSIONS: "ログインセッション",
  PASSWORD_SUMMARY: "従業員パスワードサマリ",
  OPERATIONS: "操作処理状態",
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
  [SHEETS.LOGIN_ACCOUNTS]: ["従業員ID", "パスワードハッシュ", "パスワードソルト", "登録日時", "最終ログイン日時", "有効フラグ", "ログイン失敗回数", "ロック期限", "パスワード更新日時", "パスワード版"],
  [SHEETS.AUTH_SESSIONS]: ["トークンハッシュ", "従業員ID", "発行日時", "有効期限", "最終利用日時", "有効フラグ", "セッションID", "発行時パスワード版"],
  [SHEETS.PASSWORD_SUMMARY]: ["従業員ID", "パスワードハッシュ", "更新日時", "有効フラグ", "パスワード版"],
  [SHEETS.OPERATIONS]: ["操作ID", "処理種別", "業務キー", "従業員ID", "ペイロードハッシュ", "状態", "保存状態", "結果JSON", "エラーコード", "作成日時", "更新日時"],
}; //ヘッダー定義

function doGet() {
  console.log("[doGet] Webアプリを表示します");
  return HtmlService
    .createTemplateFromFile("GasApp")
    .evaluate()
    .setTitle("シフト提出・希望確認");
} //Webページに飛んだ際HTMLファイルを読み込んで画面を表示します

function doPost(e) {
  //submitShift(payload):1か月分のシフト希望を出したときに実行される。
  try {
    const payload = JSON.parse(e.postData.contents);
    console.log("[doPost] 申請を受信", { kind: payload.kind || "shift" });
    if (payload.kind === "pt") return json(submitPtRequest(payload));
    return json(submitShift(payload));
  } catch (error) {
    const trackingId = Utilities.getUuid();
    console.error("[doPost] 申請処理に失敗", {
      trackingId,
      errorName: error && error.name ? error.name : "Error",
    });
    return json({
      ok: false,
      error: `処理中に問題が発生しました。入力内容は保持したまま、もう一度お試しください。お問い合わせ番号: ${trackingId}`,
      trackingId,
    });
  }
} //ユーザーがシフト希望を送った際に作動

function authorizeOnce() {
  resetRequestCache_();
  bootstrapAdminAllowlist_();
  assertAdminUser_();
  const spreadsheet = getMasterSpreadsheet();
  setupMasterSheets();
  return `権限確認が完了しました。${spreadsheet.getName()}`;
}

function bootstrapAdminAllowlist_() {
  const properties = PropertiesService.getScriptProperties();
  if (normalizeKey(properties.getProperty(ADMIN_EMAILS_PROPERTY))) return;
  const activeEmail = normalizeEmail_(Session.getActiveUser().getEmail());
  const effectiveEmail = normalizeEmail_(Session.getEffectiveUser().getEmail());
  if (!activeEmail || activeEmail !== effectiveEmail) {
    throw new Error("管理者の初期設定は、スクリプト所有者がApps ScriptエディタからauthorizeOnceを実行してください。");
  }
  properties.setProperty(ADMIN_EMAILS_PROPERTY, activeEmail);
  console.log("[bootstrapAdminAllowlist_] 管理者許可リストを初期化", { adminEmail: activeEmail });
}

function getAdminEmails_() {
  return normalizeKey(PropertiesService.getScriptProperties().getProperty(ADMIN_EMAILS_PROPERTY))
    .split(/[\s,;]+/)
    .map(normalizeEmail_)
    .filter(Boolean);
}

function assertAdminUser_() {
  const activeEmail = normalizeEmail_(Session.getActiveUser().getEmail());
  if (!activeEmail || !getAdminEmails_().includes(activeEmail)) {
    throw new Error("この管理操作を実行する権限がありません。管理者アカウントで実行してください。");
  }
  return activeEmail;
}

function normalizeEmail_(value) {
  return normalizeKey(value).toLowerCase();
}

/** ログイン済みユーザー向けの初期データを返す。 */
function getInitialData(authToken) {
  resetRequestCache_();
  const auth = authenticateSession_(authToken);
  return buildInitialData_(auth.staff);
}

/** 初回登録前に、従業員IDが有効なマスタ情報か確認する。 */
function lookupEmployeeForRegistration(payload) {
  resetRequestCache_();
  ensureAuthSheets_();
  const employeeId = normalizeKey(payload && payload.employeeId);
  if (!employeeId) throw new Error("従業員IDを入力してください。");

  const staff = findStaffById_(employeeId);
  const accountSheet = getSheetWithHeaders(getAuthSpreadsheet_(), SHEETS.LOGIN_ACCOUNTS);
  const accountRow = findRowByKeys(accountSheet, { 1: staff.employeeId });
  if (accountRow) {
    const active = toBoolean(accountSheet.getRange(accountRow, 6).getValue());
    if (active) throw new Error("この従業員IDは登録済みです。ログイン画面から進んでください。");
  }

  console.log("[lookupEmployeeForRegistration] 従業員ID確認完了", { employeeId: staff.employeeId });
  return { ok: true, employee: toPublicStaff_(staff) };
}

/** 従業員マスタと照合後、初回パスワードを登録する。 */
function registerAccount(payload) {
  resetRequestCache_();
  ensureAuthSheets_();
  const employeeId = normalizeKey(payload && payload.employeeId);
  const password = String(payload && payload.password || "");
  const passwordConfirm = String(payload && payload.passwordConfirm || "");
  validateNewPassword_(password, passwordConfirm);
  const staff = findStaffById_(employeeId);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheetWithHeaders(getAuthSpreadsheet_(), SHEETS.LOGIN_ACCOUNTS);
    const existingRow = findRowByKeys(sheet, { 1: staff.employeeId });
    if (existingRow && toBoolean(sheet.getRange(existingRow, 6).getValue())) {
      throw new Error("この従業員IDは登録済みです。ログイン画面から進んでください。");
    }

    const salt = createRandomSecret_();
    const passwordHash = hashPassword_(password, salt);
    const now = new Date();
    const targetRow = existingRow || sheet.getLastRow() + 1;
    const previousValues = existingRow
      ? sheet.getRange(existingRow, 1, 1, HEADERS[SHEETS.LOGIN_ACCOUNTS].length).getValues()[0]
      : null;
    const values = [
      staff.employeeId,
      passwordHash,
      salt,
      now,
      now,
      true,
      0,
      "",
      now,
      1,
    ];
    writeRow(sheet, existingRow, values);
    try {
      syncPasswordSummaryForAccount_(staff.employeeId, passwordHash, true, now, 1);
    } catch (error) {
      if (previousValues) {
        sheet.getRange(targetRow, 1, 1, previousValues.length).setValues([previousValues]);
      } else {
        sheet.getRange(targetRow, 1, 1, HEADERS[SHEETS.LOGIN_ACCOUNTS].length).clearContent();
      }
      throw new Error("パスワード登録を完了できませんでした。時間をおいてもう一度お試しください。");
    }
  } finally {
    lock.releaseLock();
  }

  const session = createSession_(staff, 1);
  console.log("[registerAccount] 初回登録完了", { employeeId: staff.employeeId });
  return buildAuthResponse_(staff, session);
}

/** 登録済みパスワードを照合してログインする。 */
function login(payload) {
  resetRequestCache_();
  ensureAuthSheets_();
  const employeeId = normalizeKey(payload && payload.employeeId);
  const password = String(payload && payload.password || "");
  if (!employeeId || !password) throw new Error("従業員IDとパスワードを入力してください。");

  const staff = findStaffById_(employeeId);
  const sheet = getSheetWithHeaders(getAuthSpreadsheet_(), SHEETS.LOGIN_ACCOUNTS);
  const row = findRowByKeys(sheet, { 1: staff.employeeId });
  if (!row || !toBoolean(sheet.getRange(row, 6).getValue())) {
    throw new Error("パスワードが未登録です。初めての方から登録してください。");
  }

  const values = sheet.getRange(row, 1, 1, HEADERS[SHEETS.LOGIN_ACCOUNTS].length).getValues()[0];
  const lockUntil = toDate_(values[7]);
  if (lockUntil && lockUntil.getTime() > Date.now()) {
    const minutes = Math.max(1, Math.ceil((lockUntil.getTime() - Date.now()) / 60000));
    throw new Error(`ログインが一時停止されています。${minutes}分後にもう一度お試しください。`);
  }

  const matched = timingSafeEqual_(hashPassword_(password, String(values[2] || "")), String(values[1] || ""));
  if (!matched) {
    const failures = Number(values[6]) + 1;
    const shouldLock = failures >= LOGIN_MAX_FAILURES;
    const nextLockUntil = shouldLock ? new Date(Date.now() + LOGIN_LOCK_MINUTES * 60000) : "";
    sheet.getRange(row, 7, 1, 2).setValues([[shouldLock ? 0 : failures, nextLockUntil]]);
    console.warn("[login] パスワード不一致", { employeeId: staff.employeeId, failures });
    if (shouldLock) throw new Error(`入力を${LOGIN_MAX_FAILURES}回確認できなかったため、${LOGIN_LOCK_MINUTES}分間ログインを停止しました。`);
    throw new Error("従業員IDまたはパスワードが正しくありません。");
  }

  sheet.getRange(row, 5).setValue(new Date());
  sheet.getRange(row, 7, 1, 2).setValues([[0, ""]]);
  const passwordVersion = getPasswordVersion_(values[9]);
  const session = createSession_(staff, passwordVersion);
  console.log("[login] ログイン成功", { employeeId: staff.employeeId });
  return buildAuthResponse_(staff, session);
}

/** ログイン中の本人だけが現在のパスワードを使って変更できる。 */
function changePassword(payload) {
  resetRequestCache_();
  const auth = authenticateSession_(payload && payload.authToken);
  const currentPassword = String(payload && payload.currentPassword || "");
  const newPassword = String(payload && payload.newPassword || "");
  const passwordConfirm = String(payload && payload.passwordConfirm || "");
  if (!currentPassword) throw new Error("現在のパスワードを入力してください。");
  validateNewPassword_(newPassword, passwordConfirm);
  if (currentPassword === newPassword) throw new Error("現在とは異なるパスワードを入力してください。");

  const staff = auth.staff;
  let passwordVersion = 1;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheetWithHeaders(getAuthSpreadsheet_(), SHEETS.LOGIN_ACCOUNTS);
    const row = findRowByKeys(sheet, { 1: staff.employeeId });
    if (!row || !toBoolean(sheet.getRange(row, 6).getValue())) {
      throw new Error("ログインアカウントが見つかりません。管理者へ確認してください。");
    }

    const values = sheet.getRange(row, 1, 1, HEADERS[SHEETS.LOGIN_ACCOUNTS].length).getValues()[0];
    const currentMatched = timingSafeEqual_(
      hashPassword_(currentPassword, String(values[2] || "")),
      String(values[1] || "")
    );
    if (!currentMatched) throw new Error("現在のパスワードが正しくありません。");

    const salt = createRandomSecret_();
    const passwordHash = hashPassword_(newPassword, salt);
    const now = new Date();
    const previousValues = values.slice();
    passwordVersion = getPasswordVersion_(values[9]) + 1;
    const nextValues = values.slice();
    nextValues[1] = passwordHash;
    nextValues[2] = salt;
    nextValues[6] = 0;
    nextValues[7] = "";
    nextValues[8] = now;
    nextValues[9] = passwordVersion;
    sheet.getRange(row, 1, 1, HEADERS[SHEETS.LOGIN_ACCOUNTS].length).setValues([nextValues]);
    try {
      syncPasswordSummaryForAccount_(staff.employeeId, passwordHash, true, now, passwordVersion);
    } catch (error) {
      sheet.getRange(row, 1, 1, previousValues.length).setValues([previousValues]);
      try {
        syncPasswordSummaryForAccount_(staff.employeeId, previousValues[1], true, previousValues[8] || previousValues[3], getPasswordVersion_(previousValues[9]));
      } catch (rollbackError) {
        console.error("[changePassword] パスワードサマリの復元に失敗", {
          employeeId: staff.employeeId,
          errorName: rollbackError && rollbackError.name ? rollbackError.name : "Error",
        });
      }
      throw new Error("パスワード変更を完了できませんでした。時間をおいてもう一度お試しください。");
    }
  } finally {
    lock.releaseLock();
  }

  let session;
  try {
    session = createSession_(staff, passwordVersion);
  } catch (error) {
    throw new Error("パスワードは変更されましたが、ログイン更新を完了できませんでした。新しいパスワードでログインし直してください。");
  }
  console.log("[changePassword] パスワード変更完了", { employeeId: staff.employeeId });
  return { ok: true, session: buildSessionPayload_(staff, session) };
}

/** 保存済みトークンからログイン状態を復元する。 */
function getSessionData(authToken) {
  resetRequestCache_();
  const auth = authenticateSession_(authToken);
  console.log("[getSessionData] セッション復元", { employeeId: auth.staff.employeeId });
  return buildAuthResponse_(auth.staff, {
    token: authToken,
    expiresAt: auth.expiresAt,
    sessionId: auth.sessionId,
    passwordVersion: auth.passwordVersion,
  });
}

/** 現在のセッションを無効化する。 */
function logout(authToken) {
  resetRequestCache_();
  if (!authToken) return { ok: true };
  const sheet = getSheetWithHeaders(getAuthSpreadsheet_(), SHEETS.AUTH_SESSIONS);
  const row = findRowByKeys(sheet, { 1: hashSessionToken_(authToken) });
  if (row) sheet.getRange(row, 6).setValue(false);
  console.log("[logout] ログアウト完了");
  return { ok: true };
}

function buildInitialData_(staff) {
  const settings = getStaffStoreSettings().filter((setting) => setting.employeeId === staff.employeeId);
  return {
    ok: true,
    accepting: ACCEPTING,
    deadlineDay: DEADLINE_DAY,
    defaultSubmissionMonth: getDefaultShiftMonth_(),
    defaultStart: DEFAULT_START,
    defaultEnd: DEFAULT_END,
    areas: getAreas(),
    stores: getStores(),
    staff: [toPublicStaff_(staff)],
    staffStoreSettings: settings,
    shiftTypes: ["未入力", "勤務可能", "休み希望", "有給希望", "PT"],
  };
}

function buildAuthResponse_(staff, session) {
  return {
    ok: true,
    session: buildSessionPayload_(staff, session),
    initialData: buildInitialData_(staff),
  };
}

function buildSessionPayload_(staff, session) {
  return {
    authToken: session.token,
    expiresAt: toIsoString_(session.expiresAt),
    sessionId: session.sessionId || "",
    passwordVersion: getPasswordVersion_(session.passwordVersion),
    employeeId: staff.employeeId,
    name: staff.name,
    primaryAreaId: staff.primaryAreaId,
    primaryStoreId: staff.primaryStoreId,
    role: staff.role,
    permission: staff.permission,
  };
}

function ensureAuthSheets_() {
  const authSpreadsheet = getAuthSpreadsheet_();
  const accountSheet = getSheetWithHeaders(authSpreadsheet, SHEETS.LOGIN_ACCOUNTS);
  getSheetWithHeaders(authSpreadsheet, SHEETS.AUTH_SESSIONS);
  if (accountSheet.getLastRow() < 2) {
    const migrated = migrateLegacyAuthAccounts_(getDbSpreadsheet(), authSpreadsheet);
    if (migrated > 0) syncPasswordSummary_();
  }
}

/** 旧DB管理用ファイルのアカウントだけを提出ログ用ファイルへ移す。セッションは再利用しない。 */
function migrateLegacyAuthAccounts_(legacySpreadsheet, authSpreadsheet) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const source = legacySpreadsheet.getSheetByName(SHEETS.LOGIN_ACCOUNTS);
    if (!source || source.getLastRow() < 2) return 0;

    const target = getSheetWithHeaders(authSpreadsheet, SHEETS.LOGIN_ACCOUNTS);
    const headers = HEADERS[SHEETS.LOGIN_ACCOUNTS];
    const existingKeys = new Set(
      target.getLastRow() < 2
        ? []
        : target.getRange(2, 1, target.getLastRow() - 1, 1).getValues().flat().map(normalizeKey).filter(Boolean)
    );
    const values = readObjects(source)
      .filter((row) => {
        const key = normalizeKey(row[headers[0]]);
        if (!key || existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      })
      .map((row) => headers.map((header) => row[header] === undefined ? "" : row[header]));

    if (values.length) {
      target.getRange(target.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
      console.log("[migrateLegacyAuthAccounts_] 旧認証アカウントを移行", { migrated: values.length });
    }
    return values.length;
  } finally {
    lock.releaseLock();
  }
}

/** 管理者用ファイルのパスワードサマリを認証アカウントから再作成する。 */
function rebuildPasswordSummary() {
  resetRequestCache_();
  assertAdminUser_();
  ensureAuthSheets_();
  const count = syncPasswordSummary_();
  return `${count}件の従業員パスワードサマリを再作成しました。`;
}

function syncPasswordSummary_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const accountSheet = getSheetWithHeaders(getAuthSpreadsheet_(), SHEETS.LOGIN_ACCOUNTS);
    const summarySheet = getSheetWithHeaders(getDbSpreadsheet(), SHEETS.PASSWORD_SUMMARY);
    const values = readObjects(accountSheet)
      .filter((row) => normalizeKey(row["従業員ID"]) && normalizeKey(row["パスワードハッシュ"]))
      .map((row) => [
        normalizeKey(row["従業員ID"]),
        normalizeKey(row["パスワードハッシュ"]),
        row["パスワード更新日時"] || row["登録日時"] || new Date(),
        toBoolean(row["有効フラグ"]),
        getPasswordVersion_(row["パスワード版"]),
      ]);

    if (summarySheet.getLastRow() > 1) {
      summarySheet.getRange(2, 1, summarySheet.getLastRow() - 1, HEADERS[SHEETS.PASSWORD_SUMMARY].length).clearContent();
    }
    if (values.length) summarySheet.getRange(2, 1, values.length, values[0].length).setValues(values);
    return values.length;
  } finally {
    lock.releaseLock();
  }
}

function syncPasswordSummaryForAccount_(employeeId, passwordHash, active, updatedAt, passwordVersion) {
  const sheet = getSheetWithHeaders(getDbSpreadsheet(), SHEETS.PASSWORD_SUMMARY);
  const row = findRowByKeys(sheet, { 1: employeeId });
  writeRow(sheet, row, [employeeId, passwordHash, updatedAt || new Date(), active !== false, getPasswordVersion_(passwordVersion)]);
}

function findStaffById_(employeeId) {
  const key = normalizeKey(employeeId);
  if (!key) throw new Error("従業員IDを入力してください。");
  const staff = getStaff().find((item) => normalizeKey(item.employeeId) === key);
  if (!staff) throw new Error("従業員IDが従業員マスタに見つかりません。管理者へ確認してください。");
  return staff;
}

function toPublicStaff_(staff) {
  return {
    employeeId: staff.employeeId,
    name: staff.name,
    primaryAreaId: staff.primaryAreaId,
    primaryStoreId: staff.primaryStoreId,
    employmentType: staff.employmentType,
    role: staff.role,
    permission: staff.permission,
    order: staff.order,
    active: staff.active,
  };
}

function validateNewPassword_(password, passwordConfirm) {
  if (!password) throw new Error("パスワードを入力してください。");
  if (password.length < 8) throw new Error("パスワードは8文字以上で入力してください。");
  if (password.length > 72) throw new Error("パスワードは72文字以内で入力してください。");
  if (password !== passwordConfirm) throw new Error("確認用パスワードが一致しません。もう一度入力してください。");
}

function getPasswordVersion_(value) {
  const version = Number(value);
  return Number.isInteger(version) && version > 0 ? version : 1;
}

function createSession_(staff, passwordVersion) {
  const token = `${createRandomSecret_()}${createRandomSecret_()}`;
  const sessionId = Utilities.getUuid();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_HOURS * 60 * 60 * 1000);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheetWithHeaders(getAuthSpreadsheet_(), SHEETS.AUTH_SESSIONS);
    revokeSessionsForEmployee_(sheet, staff.employeeId);
    const row = findRowByKeys(sheet, { 2: staff.employeeId });
    writeRow(sheet, row, [
      hashSessionToken_(token),
      staff.employeeId,
      now,
      expiresAt,
      now,
      true,
      sessionId,
      getPasswordVersion_(passwordVersion),
    ]);
  } finally {
    lock.releaseLock();
  }
  return { token, expiresAt, sessionId, passwordVersion: getPasswordVersion_(passwordVersion) };
}

function revokeSessionsForEmployee_(sheet, employeeId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS[SHEETS.AUTH_SESSIONS].length).getValues();
  let revoked = 0;
  rows.forEach((row, index) => {
    if (normalizeKey(row[1]) !== normalizeKey(employeeId) || !toBoolean(row[5])) return;
    sheet.getRange(index + 2, 6).setValue(false);
    revoked += 1;
  });
  return revoked;
}

function authenticateSession_(authToken) {
  const token = normalizeKey(authToken);
  if (!token) throw new Error("ログインが必要です。もう一度ログインしてください。");

  ensureAuthSheets_();
  const sheet = getSheetWithHeaders(getAuthSpreadsheet_(), SHEETS.AUTH_SESSIONS);
  const row = findRowByKeys(sheet, { 1: hashSessionToken_(token) });
  if (!row) throw new Error("ログイン情報を確認できません。もう一度ログインしてください。");

  const values = sheet.getRange(row, 1, 1, HEADERS[SHEETS.AUTH_SESSIONS].length).getValues()[0];
  const expiresAt = toDate_(values[3]);
  if (!toBoolean(values[5]) || !expiresAt || expiresAt.getTime() <= Date.now()) {
    sheet.getRange(row, 6).setValue(false);
    throw new Error("ログインの有効期限が切れました。もう一度ログインしてください。");
  }

  const accountSheet = getSheetWithHeaders(getAuthSpreadsheet_(), SHEETS.LOGIN_ACCOUNTS);
  const accountRow = findRowByKeys(accountSheet, { 1: values[1] });
  if (!accountRow || !toBoolean(accountSheet.getRange(accountRow, 6).getValue())) {
    sheet.getRange(row, 6).setValue(false);
    throw new Error("ログインアカウントが無効です。管理者へ確認してください。");
  }
  const accountVersion = getPasswordVersion_(accountSheet.getRange(accountRow, 10).getValue());
  const sessionVersion = getPasswordVersion_(values[7]);
  if (sessionVersion !== accountVersion) {
    sheet.getRange(row, 6).setValue(false);
    throw new Error("パスワード変更後のため、もう一度ログインしてください。");
  }

  const lastUsedAt = toDate_(values[4]);
  if (!lastUsedAt || Date.now() - lastUsedAt.getTime() > 10 * 60 * 1000) {
    sheet.getRange(row, 5).setValue(new Date());
  }

  return {
    staff: findStaffById_(values[1]),
    expiresAt,
    sessionId: normalizeKey(values[6]),
    passwordVersion: sessionVersion,
  };
}

function createRandomSecret_() {
  return Utilities.getUuid().replace(/-/g, "");
}

function hashPassword_(password, salt) {
  let value = `${salt}\u0000${password}`;
  for (let round = 0; round < PASSWORD_HASH_ROUNDS; round++) {
    value = digestText_(`${salt}\u0000${value}`);
  }
  return value;
}

function hashSessionToken_(token) {
  return digestText_(String(token || ""));
}

function digestText_(value) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, "");
}

function timingSafeEqual_(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  const length = Math.max(a.length, b.length);
  let different = a.length ^ b.length;
  for (let index = 0; index < length; index++) {
    different |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return different === 0;
}

function toDate_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !Number.isNaN(value.getTime())) return value;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoString_(value) {
  const date = toDate_(value);
  return date ? date.toISOString() : "";
}

function validateStoreArea_(store, area) {
  if (normalizeKey(store.areaId) !== normalizeKey(area.areaId)) {
    throw new Error("選択した店舗は、このエリアに所属していません。エリアと店舗を選び直してください。");
  }
}

function createSubmissionOperation(payload) {
  resetRequestCache_();
  const auth = authenticateSession_(payload && payload.authToken);
  const kind = normalizeKey(payload && payload.kind) === "pt" ? "PT_SUBMIT" : "SHIFT_SUBMIT";
  validateOperationRequest_(kind, payload, auth.staff);
  const descriptor = buildOperationDescriptor_(kind, payload, auth.staff);
  const operationId = Utilities.getUuid();
  const now = new Date();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheetWithHeaders(getSubmissionLogSpreadsheet(), SHEETS.OPERATIONS);
    sheet.appendRow([
      operationId,
      kind,
      descriptor.businessKey,
      auth.staff.employeeId,
      descriptor.payloadHash,
      "READY",
      "未保存",
      "",
      "",
      now,
      now,
    ]);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, operationId, kind, businessKey: descriptor.businessKey };
}

function getOperationStatus(query) {
  resetRequestCache_();
  const auth = authenticateSession_(query && query.authToken);
  const operationId = normalizeKey(query && query.operationId);
  if (!operationId) throw new Error("操作IDを確認できません。もう一度お試しください。");
  const sheet = getSheetWithHeaders(getSubmissionLogSpreadsheet(), SHEETS.OPERATIONS);
  const row = findRowByKeys(sheet, { 1: operationId });
  if (!row) return { ok: true, operationId, status: "NOT_REGISTERED", saveState: "未保存" };
  const values = sheet.getRange(row, 1, 1, HEADERS[SHEETS.OPERATIONS].length).getValues()[0];
  if (normalizeKey(values[3]) !== auth.staff.employeeId) {
    throw new Error("この操作の状態を確認する権限がありません。");
  }
  return operationStatusFromValues_(values);
}

function validateOperationRequest_(kind, payload, staff) {
  if (kind === "SHIFT_SUBMIT") {
    validateShiftPayload(payload);
    assertShiftSubmissionWindow_(payload.month);
    const store = findStore(payload.storeId || staff.primaryStoreId);
    const area = findArea(payload.areaId || store.areaId);
    validateStoreArea_(store, area);
    assertStaffStoreAccess_(staff, area, store, false);
    return;
  }
  validatePtPayload(payload);
  const store = findStore(payload.workStoreId || payload.storeId || staff.primaryStoreId);
  const area = findArea(payload.workAreaId || store.areaId);
  validateStoreArea_(store, area);
  assertStaffStoreAccess_(staff, area, store, true);
}

function buildOperationDescriptor_(kind, payload, staff) {
  let businessKey;
  let normalized;
  if (kind === "SHIFT_SUBMIT") {
    const month = validateMonthValue_(payload.month);
    businessKey = `SHIFT:${month}:${staff.employeeId}`;
    normalized = {
      kind,
      businessKey,
      areaId: normalizeKey(payload.areaId),
      storeId: normalizeKey(payload.storeId),
      month,
      notes: normalizeKey(payload.notes),
      shifts: normalizeShifts(payload.shifts).map((shift) => ({
        date: shift.date,
        type: shift.type,
        start: shift.start,
        end: shift.end,
      })),
    };
  } else {
    const date = validateDateValue_(payload.date, "PT申請日");
    const workStoreId = normalizeKey(payload.workStoreId || payload.storeId || staff.primaryStoreId);
    businessKey = `PT:${staff.employeeId}:${date}:${workStoreId}`;
    normalized = {
      kind,
      businessKey,
      workAreaId: normalizeKey(payload.workAreaId || payload.areaId),
      workStoreId,
      date,
      start: normalizeTime(payload.start),
      end: normalizeTime(payload.end),
      notes: normalizeKey(payload.notes),
    };
  }
  return { businessKey, payloadHash: digestText_(JSON.stringify(normalized)) };
}

function claimOperation_(operationId, kind, payload, staff) {
  const id = normalizeKey(operationId);
  if (!id) throw new Error("操作IDを確認できません。画面を再読み込みしてからもう一度お試しください。");
  const descriptor = buildOperationDescriptor_(kind, payload, staff);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheetWithHeaders(getSubmissionLogSpreadsheet(), SHEETS.OPERATIONS);
    const row = findRowByKeys(sheet, { 1: id });
    if (!row) throw new Error("操作IDの受付情報が見つかりません。もう一度お試しください。");
    const values = sheet.getRange(row, 1, 1, HEADERS[SHEETS.OPERATIONS].length).getValues()[0];
    if (
      normalizeKey(values[1]) !== kind ||
      normalizeKey(values[2]) !== descriptor.businessKey ||
      normalizeKey(values[3]) !== staff.employeeId ||
      normalizeKey(values[4]) !== descriptor.payloadHash
    ) {
      throw new Error("同じ操作IDで送信内容が変更されています。入力内容を確認して新しく送信してください。");
    }
    const status = normalizeKey(values[5]);
    if (status === "COMPLETED") {
      return { completed: true, result: safeJsonParse(values[7], {}) };
    }
    const updatedAt = toDate_(values[10]);
    if (status === "PROCESSING" && updatedAt && Date.now() - updatedAt.getTime() < 2 * 60 * 1000) {
      throw new Error("同じ内容を処理中です。再送せず、しばらくお待ちください。");
    }
    sheet.getRange(row, 6, 1, 6).setValues([["PROCESSING", normalizeKey(values[6]) || "未保存", values[7] || "", "", values[9] || new Date(), new Date()]]);
    return { completed: false };
  } finally {
    lock.releaseLock();
  }
}

function finishOperation_(operationId, result) {
  updateOperationState_(operationId, "COMPLETED", "保存済み", result, "");
}

function failOperation_(operationId, saveState, errorCode) {
  updateOperationState_(operationId, "FAILED_RETRYABLE", saveState || "未保存", null, errorCode || "PROCESSING_ERROR");
}

function recordOperationFailureSafely_(operationId, saveState, errorCode) {
  try {
    failOperation_(operationId, saveState, errorCode);
  } catch (stateError) {
    console.error("[recordOperationFailureSafely_] 操作状態の失敗記録に失敗", {
      operationId,
      errorName: stateError && stateError.name ? stateError.name : "Error",
    });
  }
}

function updateOperationState_(operationId, status, saveState, result, errorCode) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheetWithHeaders(getSubmissionLogSpreadsheet(), SHEETS.OPERATIONS);
    const row = findRowByKeys(sheet, { 1: operationId });
    if (!row) return;
    sheet.getRange(row, 6, 1, 6).setValues([[
      status,
      saveState,
      result ? JSON.stringify(result) : "",
      errorCode,
      sheet.getRange(row, 10).getValue() || new Date(),
      new Date(),
    ]]);
  } finally {
    lock.releaseLock();
  }
}

function operationStatusFromValues_(values) {
  return {
    ok: true,
    operationId: normalizeKey(values[0]),
    kind: normalizeKey(values[1]),
    businessKey: normalizeKey(values[2]),
    status: normalizeKey(values[5]),
    saveState: normalizeKey(values[6]),
    result: safeJsonParse(values[7], null),
    errorCode: normalizeKey(values[8]),
    updatedAt: toIsoString_(values[10]),
  };
}

function submitShift(payload) {
  resetRequestCache_();
  if (!ACCEPTING) throw new Error("現在、シフト提出の受付は停止中です。");
  const auth = authenticateSession_(payload && payload.authToken);
  validateShiftPayload(payload);
  assertShiftSubmissionWindow_(payload.month);
  const staff = auth.staff;
  const store = findStore(payload.storeId || staff.primaryStoreId);
  const area = findArea(payload.areaId || store.areaId);
  validateStoreArea_(store, area);
  assertStaffStoreAccess_(staff, area, store, false);
  const operationId = normalizeKey(payload.operationId);
  const claim = claimOperation_(operationId, "SHIFT_SUBMIT", payload, staff);
  if (claim.completed) return { ...claim.result, replayed: true };

  let saveState = "未保存";
  try {
    const logSpreadsheet = getSubmissionLogSpreadsheet();
    const overallSpreadsheet = getOverallSpreadsheet();
    const sheet = getSheetWithHeaders(logSpreadsheet, SHEETS.SUBMISSIONS);
    const month = normalizeMonthValue(payload.month);
    const shifts = normalizeShifts(payload.shifts);
    const summary = summarize(shifts);
    const hopeId = makeSubmissionId(month, staff.employeeId);
    const row = findRowByKeys(sheet, { 1: hopeId });
    const previousAreaId = row ? normalizeKey(sheet.getRange(row, 5).getValue()) : "";
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
    saveState = "部分保存";
    rebuildMonthViews(overallSpreadsheet, month, [area.areaId, previousAreaId]);
    SpreadsheetApp.flush();

    const result = { ok: true, updated: Boolean(row), month, hopeId, operationId };
    finishOperation_(operationId, result);
    return result;
  } catch (error) {
    recordOperationFailureSafely_(operationId, saveState, "SHIFT_SUBMIT_FAILED");
    throw error;
  }
}

function submitPtRequest(payload) {
  resetRequestCache_();
  const auth = authenticateSession_(payload && payload.authToken);
  validatePtPayload(payload);

  const staff = auth.staff;
  const workStore = findStore(payload.workStoreId || payload.storeId || staff.primaryStoreId);
  const workArea = findArea(payload.workAreaId || workStore.areaId);
  validateStoreArea_(workStore, workArea);
  assertStaffStoreAccess_(staff, workArea, workStore, true);
  const operationId = normalizeKey(payload.operationId);
  const claim = claimOperation_(operationId, "PT_SUBMIT", payload, staff);
  if (claim.completed) return { ...claim.result, replayed: true };

  let saveState = "未保存";
  try {
    const logSpreadsheet = getSubmissionLogSpreadsheet();
    const overallSpreadsheet = getOverallSpreadsheet();
    const ptSheet = getSheetWithHeaders(logSpreadsheet, SHEETS.PT_REQUESTS);
    const workDate = normalizeDateValue(payload.date);
    const start = normalizeTime(payload.start || DEFAULT_START);
    const end = normalizeTime(payload.end || DEFAULT_END);
    const requestId = `PT-${operationId}`;
    const status = "自動確定";
    const ptRow = findRowByKeys(ptSheet, { 1: requestId });

    writeRow(ptSheet, ptRow, [
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
    saveState = "部分保存";

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
    appendChangeLog(overallSpreadsheet, "PT申請", requestId, "", JSON.stringify(confirmed), "PT自動確定", staff.employeeId, `LOG-${operationId}-PT`);
    rebuildMonthViews(overallSpreadsheet, confirmed.month, [workArea.areaId]);

    const result = { ok: true, status, requestId, confirmed, operationId };
    finishOperation_(operationId, result);
    return result;
  } catch (error) {
    recordOperationFailureSafely_(operationId, saveState, "PT_SUBMIT_FAILED");
    throw error;
  }
}

/** ログイン中の本人が提出した月間希望とPT申請だけを返す。 */
function getMyShiftHopes(query) {
  resetRequestCache_();
  const auth = authenticateSession_(query && query.authToken);
  const employee = auth.staff;
  const month = normalizeMonthValue(query && query.month);
  if (!month) throw new Error("対象月を選択してください。");

  const logSpreadsheet = getSubmissionLogSpreadsheet();
  const hopeRows = readObjects(getSheetWithHeaders(logSpreadsheet, SHEETS.SUBMISSIONS))
    .filter((row) => (
      normalizeKey(row["従業員ID"]) === employee.employeeId &&
      normalizeMonthValue(row["対象月"]) === month
    ));
  const ptRows = readObjects(getSheetWithHeaders(logSpreadsheet, SHEETS.PT_REQUESTS))
    .filter((row) => (
      normalizeKey(row["従業員ID"]) === employee.employeeId &&
      normalizeDateValue(row["勤務日"]).slice(0, 7) === month
    ));
  const hopeRow = hopeRows[0] || null;

  console.log("[getMyShiftHopes] 本人の提出希望を取得", {
    employeeId: employee.employeeId,
    month,
    hasSubmission: Boolean(hopeRow),
    ptRequests: ptRows.length,
  });

  return {
    ok: true,
    employee: toPublicStaff_(employee),
    month,
    submission: hopeRow ? {
      hopeId: normalizeKey(hopeRow["希望ID"]),
      submittedAt: toIsoString_(hopeRow["提出日時"]),
      status: normalizeKey(hopeRow["提出状態"]),
      areaId: normalizeKey(hopeRow["所属エリアID"]),
      storeId: normalizeKey(hopeRow["所属店舗ID"]),
      notes: normalizeKey(hopeRow["備考"]),
    } : null,
    hopes: hopeRow ? normalizeShifts(safeJsonParse(hopeRow["希望JSON"], [])) : [],
    ptRequests: ptRows.map((row) => ({
      requestId: normalizeKey(row["PT申請ID"]),
      date: normalizeDateValue(row["勤務日"]),
      workAreaId: normalizeKey(row["勤務エリアID"]),
      workStoreId: normalizeKey(row["勤務店舗ID"]),
      start: normalizeTime(row["開始時刻"]),
      end: normalizeTime(row["終了時刻"]),
      submittedAt: toIsoString_(row["申請日時"]),
      status: normalizeKey(row["状態"]),
      notes: normalizeKey(row["備考"]),
    })),
  };
}

function confirmActiveSheet() {
  resetRequestCache_();
  assertAdminUser_();
  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const activeSheet = activeSpreadsheet.getActiveSheet();
  const month = detectMonthFromSheetName(activeSheet.getName()) || detectMonthFromMatrix(activeSheet) || normalizeMonthValue(new Date());
  const targetAreaId = detectAreaIdFromSheetName(activeSheet.getName());
  return confirmMatrixSheet({
    sourceSpreadsheetId: activeSpreadsheet.getId(),
    sourceSheetName: activeSheet.getName(),
    month,
    areaId: targetAreaId,
  });
}

function confirmMatrixSheet(options) {
  resetRequestCache_();
  const adminEmail = assertAdminUser_();
  options = options || {};
  const month = validateMonthValue_(options.month);
  const areaId = normalizeKey(options.areaId);
  const master = getMasterSpreadsheet();
  const sourceSpreadsheetId = options.sourceSpreadsheetId || getManagedSpreadsheetId_("エリア確認", AREA_SPREADSHEET_ID, areaId);
  const sourceSpreadsheet = SpreadsheetApp.openById(sourceSpreadsheetId);
  const sheet = sourceSpreadsheet.getSheetByName(options.sourceSheetName);
  if (!sheet) throw new Error(`確定対象シートが見つかりません: ${options.sourceSheetName}`);

  const parsed = parseConfirmedCells(sheet, month, adminEmail);
  const filtered = areaId
    ? parsed.filter((item) => item.workAreaId === areaId)
    : parsed;
  if (areaId && filtered.length !== parsed.length) {
    throw new Error("確定対象シートに指定エリア外の勤務店舗が含まれています。");
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("別の確定処理が実行中です。しばらく待ってから再実行してください。");
  try {
    const previous = replaceConfirmedShifts_(master, month, areaId, filtered);
    appendChangeLog(
      master,
      "確定シフト",
      `${sourceSpreadsheetId}:${options.sourceSheetName}`,
      JSON.stringify(previous),
      JSON.stringify(filtered),
      "シート確定ボタン",
      adminEmail
    );
    rebuildMonthViews(master, month, areaId ? [areaId] : null);
    return `${filtered.length}件の確定シフトを反映しました。`;
  } finally {
    lock.releaseLock();
  }
}

function setupMasterSheets() {
  resetRequestCache_();
  assertAdminUser_();
  console.log("[setupMasterSheets] 4ファイル構成のシート/ヘッダー確認開始");
  const overall = getOverallSpreadsheet();
  const db = getDbSpreadsheet();
  const area = getAreaSpreadsheet();
  const log = getSubmissionLogSpreadsheet();

  [SHEETS.CONFIRMED, SHEETS.CHANGE_LOG].forEach((sheetName) => getSheetWithHeaders(overall, sheetName));
  [
    SHEETS.AREAS,
    SHEETS.STORES,
    SHEETS.STAFF,
    SHEETS.STAFF_STORES,
    SHEETS.FILES,
    SHEETS.PASSWORD_SUMMARY,
  ].forEach((sheetName) => getSheetWithHeaders(db, sheetName));
  [SHEETS.SUBMISSIONS, SHEETS.PT_REQUESTS, SHEETS.LOGIN_ACCOUNTS, SHEETS.AUTH_SESSIONS, SHEETS.OPERATIONS]
    .forEach((sheetName) => getSheetWithHeaders(log, sheetName));
  getSheetWithHeaders(area, SHEETS.FILES);

  const migrated = migrateLegacyAuthAccounts_(db, log);
  const summaryCount = syncPasswordSummary_();

  console.log("[setupMasterSheets] 4ファイル構成のシート/ヘッダー確認完了", { migrated, summaryCount });
  return true;
}

function rebuildLatestMonthView() {
  resetRequestCache_();
  assertAdminUser_();
  const logSpreadsheet = getSubmissionLogSpreadsheet();
  const submissions = readObjects(getSheetWithHeaders(logSpreadsheet, SHEETS.SUBMISSIONS));
  const months = submissions.map((row) => normalizeMonthValue(row["対象月"])).filter(Boolean);
  if (!months.length) throw new Error("シフト希望に対象月データがありません。");
  const latestMonth = months[months.length - 1];
  rebuildMonthViews(getOverallSpreadsheet(), latestMonth);
  return `${latestMonth} の全体/エリアシートを再作成しました。`;
}

function rebuildMonthViews(spreadsheet, month, targetAreaIds) {
  const normalizedMonth = normalizeMonthValue(month);
  const records = getMonthRecords(spreadsheet, normalizedMonth);
  const overallSpreadsheet = getOverallSpreadsheet();
  const areaSpreadsheet = getAreaSpreadsheet();
  writeMatrixSheet(overallSpreadsheet, `全体_${normalizedMonth}`, records, normalizedMonth, "全体", null);
  const requestedAreaIds = new Set((targetAreaIds || []).map(normalizeKey).filter(Boolean));
  const targetAreas = requestedAreaIds.size
    ? getAreas().filter((area) => requestedAreaIds.has(area.areaId))
    : getAreas();
  targetAreas.forEach((area) => {
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
  month = validateMonthValue_(month);
  const range = sheet.getDataRange();
  const values = range.getValues();
  const backgrounds = range.getBackgrounds();
  const result = [];
  const errors = [];
  const staffByName = {};
  getStaff().forEach((staff) => {
    const name = normalizeKey(staff.name);
    if (!name) return;
    const existing = staffByName[name];
    if (Object.prototype.hasOwnProperty.call(staffByName, name) && (!existing || existing.employeeId !== staff.employeeId)) {
      staffByName[name] = null;
    } else if (!Object.prototype.hasOwnProperty.call(staffByName, name)) {
      staffByName[name] = staff;
    }
  });
  const storeByAlias = {};
  getStores().forEach((store) => {
    [store.shortName, store.storeName, store.storeId].forEach((alias) => {
      const key = normalizeKey(alias);
      if (!key) return;
      if (Object.prototype.hasOwnProperty.call(storeByAlias, key) && storeByAlias[key] && storeByAlias[key].storeId !== store.storeId) {
        storeByAlias[key] = null;
      } else if (!Object.prototype.hasOwnProperty.call(storeByAlias, key)) {
        storeByAlias[key] = store;
      }
    });
  });

  const sectionRows = [];
  for (let r = 0; r + 4 < values.length; r++) {
    const title = normalizeKey(values[r][2]);
    if (/第\d+週$/.test(title) && normalizeKey(values[r + 4][1]) === "通し出勤人数") sectionRows.push(r);
  }
  if (!sectionRows.length) throw new Error("確定対象シートの週構成を確認できません。");

  sectionRows.forEach((r, sectionIndex) => {
    const sectionEnd = sectionIndex + 1 < sectionRows.length ? sectionRows[sectionIndex + 1] : values.length;
    const dateRow = values[r + 1] || [];
    const storeRow = values[r + 3] || [];
    let currentDate = "";
    const dateByColumn = {};
    for (let c = 2; c < Math.max(dateRow.length, storeRow.length); c++) {
      if (dateRow[c]) currentDate = resolveMatrixDate(month, dateRow[c]);
      dateByColumn[c] = currentDate;
    }
    for (let staffRow = r + 5; staffRow < sectionEnd; staffRow++) {
      const staffName = normalizeKey(values[staffRow][1]);
      if (!staffName) continue;
      const staff = staffByName[staffName];
      for (let c = 2; c < values[staffRow].length; c++) {
        const color = normalizeColor(backgrounds[staffRow][c]);
        const cellText = normalizeKey(values[staffRow][c]);
        const cellLabel = toA1Notation_(staffRow + 1, c + 1);
        if (color === COLORS.OFF) {
          if (cellText && cellText !== "NG") errors.push(`${cellLabel}: 赤セルへ勤務内容を入力できません`);
          continue;
        }
        const confirmType = getConfirmTypeFromColor(color);
        if (!confirmType) continue;
        if (!staff) {
          const reason = Object.prototype.hasOwnProperty.call(staffByName, staffName)
            ? "氏名が重複しています"
            : "従業員マスタに氏名がありません";
          errors.push(`${cellLabel}: ${staffName}の${reason}`);
          continue;
        }
        const date = dateByColumn[c];
        if (!date) {
          errors.push(`${cellLabel}: 日付を解決できません`);
          continue;
        }
        try {
          validateDateValue_(date, `${cellLabel}の日付`);
        } catch (error) {
          errors.push(`${cellLabel}: ${error.message}`);
          continue;
        }
        if (date.slice(0, 7) !== month) {
          errors.push(`${cellLabel}: 対象月外の日付です`);
          continue;
        }
        const storeAlias = normalizeKey(storeRow[c]);
        const store = storeByAlias[storeAlias];
        if (!store) {
          const reason = Object.prototype.hasOwnProperty.call(storeByAlias, storeAlias)
            ? "店舗名が重複しています"
            : "店舗マスタに店舗がありません";
          errors.push(`${cellLabel}: ${storeAlias || "空欄"}の${reason}`);
          continue;
        }
        if (cellText === "NG") {
          errors.push(`${cellLabel}: 緑・青セルへNGを入力できません`);
          continue;
        }
        const parsed = parseShiftCell(values[staffRow][c], confirmType);
        if (!parsed || parsed.type === "休み") {
          errors.push(`${cellLabel}: セル値を勤務として解釈できません`);
          continue;
        }
        try {
          if (parsed.type === "PT") {
            validateTimeRange_(parsed.start, parsed.end, PT_MIN_TIME, PT_MAX_TIME, "PT", date);
          } else if (parsed.type === "通常" || parsed.type === "ヘルプ") {
            validateTimeRange_(parsed.start, parsed.end, WORK_MIN_TIME, WORK_MAX_TIME, parsed.type, date);
          }
        } catch (error) {
          errors.push(`${cellLabel}: ${error.message}`);
          continue;
        }
        result.push({
          month,
          date,
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
  });
  if (errors.length) {
    const shown = errors.slice(0, 20);
    const suffix = errors.length > shown.length ? ` / ほか${errors.length - shown.length}件` : "";
    throw new Error(`確定対象セルを確認してください: ${shown.join(" / ")}${suffix}`);
  }
  return result;
}

function toA1Notation_(row, column) {
  let label = "";
  let value = column;
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return `${label}${row}`;
}

function confirmedShiftValues_(item) {
  return [
    makeConfirmedId(item.date, item.employeeId, item.workStoreId),
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
}

function replaceConfirmedShifts_(spreadsheet, month, areaId, items) {
  const sheet = getSheetWithHeaders(spreadsheet, SHEETS.CONFIRMED);
  const columnCount = HEADERS[SHEETS.CONFIRMED].length;
  const lastRow = sheet.getLastRow();
  const existing = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, columnCount).getValues() : [];
  const previous = [];
  const retained = existing.filter((row) => {
    const sameScope = normalizeMonthValue(row[1]) === month &&
      normalizeKey(row[12]) === "エリア別シート" &&
      (!areaId || normalizeKey(row[7]) === areaId);
    if (sameScope) previous.push(row);
    return !sameScope;
  });
  const nextRows = retained.concat(items.map(confirmedShiftValues_));
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, columnCount).clearContent();
  if (nextRows.length) sheet.getRange(2, 1, nextRows.length, columnCount).setValues(nextRows);
  return previous;
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
  if (!payload) throw new Error("送信データを確認できません。");
  if (!payload.storeId) throw new Error("店舗を選択してください。");
  if (!payload.areaId) throw new Error("エリアを選択してください。");
  if (!payload.month) throw new Error("対象月を選択してください。");
  if (!Array.isArray(payload.shifts) || payload.shifts.length === 0) throw new Error("月間シフトを入力してください。");
  const month = validateMonthValue_(payload.month);
  const expectedDays = daysInMonth_(month);
  if (payload.shifts.length !== expectedDays) {
    throw new Error(`${month}の全${expectedDays}日分を入力してください。画面を再読み込みしてからもう一度お試しください。`);
  }
  const seenDates = new Set();
  payload.shifts.forEach((shift) => {
    const date = validateDateValue_(shift && shift.date, "シフト日");
    if (date.slice(0, 7) !== month) throw new Error(`${date}は対象月${month}の日付ではありません。`);
    if (seenDates.has(date)) throw new Error(`${date}が重複しています。画面を再読み込みしてからもう一度お試しください。`);
    seenDates.add(date);
    const type = normalizeShiftType(shift && shift.type);
    if (!SHIFT_INPUT_TYPES.includes(type)) throw new Error(`${date}の希望区分を選び直してください。`);
  });
  const requested = payload.shifts.filter((shift) => normalizeShiftType(shift.type) !== "未入力");
  if (!requested.length) throw new Error("勤務可能・休み希望・有給希望・PTのどれかを1日以上入力してください。");
  requested.forEach((shift) => {
    const type = normalizeShiftType(shift.type);
    const date = normalizeDateValue(shift.date);
    if (type === "勤務可能") {
      validateTimeRange_(shift.start, shift.end, WORK_MIN_TIME, WORK_MAX_TIME, "勤務可能", date);
    }
    if (type === "PT") {
      validateTimeRange_(shift.start, shift.end, PT_MIN_TIME, PT_MAX_TIME, "PT", date);
    }
  });
}

function validatePtPayload(payload) {
  if (!payload) throw new Error("送信データを確認できません。");
  if (!(payload.workAreaId || payload.areaId)) throw new Error("エリアを選択してください。");
  if (!(payload.workStoreId || payload.storeId)) throw new Error("店舗を選択してください。");
  if (!payload.date) throw new Error("PT申請日を選択してください。");
  const date = validateDateValue_(payload.date, "PT申請日");
  validateTimeRange_(payload.start, payload.end, PT_MIN_TIME, PT_MAX_TIME, "PT", date);
  const today = Utilities.formatDate(new Date(), SHIFT_TIME_ZONE, "yyyy-MM-dd");
  if (date <= today) throw new Error("PT申請は前日までに行ってください。");
}

function validateMonthValue_(value) {
  const month = normalizeMonthValue(value);
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
    throw new Error("対象月の形式を確認してください。");
  }
  return month;
}

function validateDateValue_(value, label) {
  const date = normalizeDateValue(value);
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`${label}の形式を確認してください。`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    month < 1 || month > 12 || day < 1 ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`${label}に存在する日付を入力してください。`);
  }
  return date;
}

function daysInMonth_(monthValue) {
  const month = validateMonthValue_(monthValue);
  const parts = month.split("-").map(Number);
  return new Date(Date.UTC(parts[0], parts[1], 0)).getUTCDate();
}

function getShiftSubmissionDeadline_(monthValue) {
  const month = validateMonthValue_(monthValue);
  const parts = month.split("-").map(Number);
  // 対象月の前月15日23:59:59.999（Asia/Tokyo）をUTCへ変換する。
  return new Date(Date.UTC(parts[0], parts[1] - 2, DEADLINE_DAY, 14, 59, 59, 999));
}

function getDefaultShiftMonth_(nowValue) {
  const now = nowValue ? new Date(nowValue) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("受付時刻を確認できません。もう一度お試しください。");
  const current = Utilities.formatDate(now, SHIFT_TIME_ZONE, "yyyy-MM-dd").split("-").map(Number);
  const offset = current[2] <= DEADLINE_DAY ? 1 : 2;
  const target = new Date(Date.UTC(current[0], current[1] - 1 + offset, 1));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}`;
}

function assertShiftSubmissionWindow_(monthValue, nowValue) {
  const month = validateMonthValue_(monthValue);
  const deadline = getShiftSubmissionDeadline_(month);
  const now = nowValue ? new Date(nowValue) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("受付時刻を確認できません。もう一度お試しください。");
  if (now.getTime() > deadline.getTime()) {
    const display = Utilities.formatDate(deadline, SHIFT_TIME_ZONE, "yyyy年M月d日 HH:mm:ss");
    throw new Error(`${month}分の提出期限（${display}）を過ぎています。管理者へ確認してください。`);
  }
}

function assertStaffStoreAccess_(staff, area, store, help) {
  const primaryStore = normalizeKey(staff && staff.primaryStoreId);
  if (primaryStore && primaryStore === normalizeKey(store.storeId)) return;
  const allowed = getStaffStoreSettings().some((setting) => (
    normalizeKey(setting.employeeId) === normalizeKey(staff && staff.employeeId) &&
    normalizeKey(setting.areaId) === normalizeKey(area.areaId) &&
    normalizeKey(setting.storeId) === normalizeKey(store.storeId) &&
    (help ? setting.helpCandidate : setting.normalDisplay)
  ));
  if (!allowed) {
    throw new Error(help
      ? "この店舗へのPT申請権限を確認できません。所属設定を管理者へ確認してください。"
      : "この店舗へのシフト提出権限を確認できません。所属設定を管理者へ確認してください。");
  }
}

function validateTimeRange_(startValue, endValue, minTime, maxTime, label, date) {
  const rawStart = normalizeKey(startValue);
  const rawEnd = normalizeKey(endValue);
  const context = `${date ? `${date}の` : ""}${label}`;
  if (!rawStart || !rawEnd) throw new Error(`${context}は開始時間と終了時間を選択してください。`);
  if (!/^\d{1,2}:\d{2}$/.test(rawStart) || !/^\d{1,2}:\d{2}$/.test(rawEnd)) {
    throw new Error(`${context}の時間形式を確認してください。`);
  }

  const startMinutes = timeToMinutes_(rawStart);
  const endMinutes = timeToMinutes_(rawEnd);
  const minMinutes = timeToMinutes_(minTime);
  const maxMinutes = timeToMinutes_(maxTime);
  if (startMinutes === null || endMinutes === null) {
    throw new Error(`${context}の時間形式を確認してください。`);
  }
  if (startMinutes < minMinutes || startMinutes > maxMinutes || endMinutes < minMinutes || endMinutes > maxMinutes) {
    throw new Error(`${context}は${minTime}〜${maxTime}の範囲で指定してください。`);
  }
  if (startMinutes >= endMinutes) {
    throw new Error(`${context}の開始時間は終了時間より前にしてください。`);
  }
}

function timeToMinutes_(value) {
  const time = normalizeTime(value);
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 24 || minute > 59 || (hour === 24 && minute !== 0)) return null;
  return hour * 60 + minute;
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

function resetRequestCache_() {
  requestCache_ = {};
}

function memoizeRequest_(key, loader) {
  if (!Object.prototype.hasOwnProperty.call(requestCache_, key)) {
    requestCache_[key] = loader();
  }
  return requestCache_[key];
}

function getAreas() {
  return memoizeRequest_("master:areas", () => (
    readObjects(getSheetWithHeaders(getDbSpreadsheet(), SHEETS.AREAS)).map((row) => ({
      areaId: row["エリアID"],
      areaName: row["エリア名"],
      order: Number(row["表示順"]) || 0,
      active: toBoolean(row["有効フラグ"]),
    })).filter((row) => row.active).sort((a, b) => a.order - b.order)
  ));
}

function getStores() {
  return memoizeRequest_("master:stores", () => (
    readObjects(getSheetWithHeaders(getDbSpreadsheet(), SHEETS.STORES)).map((row) => ({
      storeId: row["店舗ID"],
      storeName: row["店舗名"],
      shortName: row["短縮名"],
      areaId: row["エリアID"],
      order: Number(row["表示順"]) || 0,
      active: toBoolean(row["有効フラグ"]),
    })).filter((row) => row.active).sort((a, b) => a.order - b.order)
  ));
}

function getStaff() {
  return memoizeRequest_("master:staff", () => (
    readObjects(getSheetWithHeaders(getDbSpreadsheet(), SHEETS.STAFF)).map((row) => ({
      employeeId: row["従業員ID"],
      name: row["氏名"],
      primaryAreaId: row["主所属エリアID"],
      primaryStoreId: row["主所属店舗ID"],
      employmentType: row["雇用区分"],
      role: row["役職"],
      permission: row["権限"],
      order: Number(row["表示順"]) || 0,
      active: toBoolean(row["有効フラグ"]),
    })).filter((row) => row.active).sort((a, b) => a.order - b.order)
  ));
}

function getStaffStoreSettings() {
  return memoizeRequest_("master:staff-store-settings", () => (
    readObjects(getSheetWithHeaders(getDbSpreadsheet(), SHEETS.STAFF_STORES)).map((row) => ({
      employeeId: row["従業員ID"],
      areaId: row["エリアID"],
      storeId: row["店舗ID"],
      relation: row["関係区分"],
      normalDisplay: toBoolean(row["通常表示"]),
      helpCandidate: toBoolean(row["ヘルプ候補表示"]),
      active: toBoolean(row["有効フラグ"]),
    })).filter((row) => row.active)
  ));
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
    console.warn("[findStoreSafe] 店舗が見つからないためID表示で継続", {
      storeIdOrName,
      errorName: error && error.name ? error.name : "Error",
    });
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
  return memoizeRequest_("spreadsheet:db", () => SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID));
}

function getAreaSpreadsheet() {
  return memoizeRequest_("spreadsheet:area", () => (
    SpreadsheetApp.openById(getManagedSpreadsheetId_("エリア確認", AREA_SPREADSHEET_ID))
  ));
}

function getSubmissionLogSpreadsheet() {
  return memoizeRequest_("spreadsheet:submission-log", () => (
    SpreadsheetApp.openById(getManagedSpreadsheetId_("提出ログ", SUBMISSION_LOG_SPREADSHEET_ID))
  ));
}

function getAuthSpreadsheet_() {
  return getSubmissionLogSpreadsheet();
}

function getManagedSpreadsheetId_(unit, fallbackId, areaId, storeId) {
  const db = getDbSpreadsheet();
  const sheet = getSheetWithHeaders(db, SHEETS.FILES);
  const rows = memoizeRequest_("master:managed-files", () => readObjects(sheet));
  const matched = rows.find((row) => (
    normalizeKey(row["管理単位"]) === normalizeKey(unit) &&
    (!areaId || normalizeKey(row["エリアID"]) === normalizeKey(areaId)) &&
    (!storeId || normalizeKey(row["店舗ID"]) === normalizeKey(storeId)) &&
    toBoolean(row["有効フラグ"])
  ));
  return normalizeKey(matched && matched["スプレッドシートID"]) || fallbackId;
}

function getSheetWithHeaders(spreadsheet, sheetName) {
  const key = `sheet:${spreadsheet.getId()}:${sheetName}`;
  return memoizeRequest_(key, () => {
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
  });
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

function appendChangeLog(spreadsheet, type, targetId, before, after, reason, userId, changeId) {
  const sheet = getSheetWithHeaders(spreadsheet, SHEETS.CHANGE_LOG);
  const resolvedChangeId = normalizeKey(changeId) || `LOG-${Date.now()}`;
  const row = changeId ? findRowByKeys(sheet, { 1: resolvedChangeId }) : null;
  writeRow(sheet, row, [
    resolvedChangeId,
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
    map[`${record.employeeId}:${record.storeId}`] = { ...record, shifts: record.shifts.slice() };
  });
  confirmed.forEach((record) => {
    const key = `${record.employeeId}:${record.storeId}`;
    if (!map[key]) map[key] = { ...record, shifts: [] };
    record.shifts.forEach((shift) => {
      const date = normalizeDateValue(shift.date);
      map[key].shifts = map[key].shifts.filter((item) => normalizeDateValue(item.date) !== date);
      map[key].shifts.push(shift);
    });
    map[key].source = "confirmed";
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
    .addItem("パスワードサマリ再作成", "rebuildPasswordSummary")
    .addItem("最新月の全体/エリアシート再作成", "rebuildLatestMonthView")
    .addItem("このシートを確定反映", "confirmActiveSheet")
    .addToUi();
}

function getOverallSpreadsheet() {
  return memoizeRequest_("spreadsheet:overall", () => (
    SpreadsheetApp.openById(getManagedSpreadsheetId_("全体確認", OVERALL_SPREADSHEET_ID))
  ));
}

function getAdminSpreadsheet() {
  return getDbSpreadsheet();
}

function setupAdminDatabase() {
  resetRequestCache_();
  assertAdminUser_();
  const admin = getAdminSpreadsheet();
  const idDb = getAdminSheetWithHeaders_(admin, ADMIN_DB_SHEET_NAME, ADMIN_DB_HEADERS);
  getAdminSheetWithHeaders_(admin, ADMIN_FILE_SHEET_NAME, ADMIN_FILE_HEADERS);
  applyAdminCheckboxes_(idDb);
  return "管理者用ID_DBのヘッダーを作成しました。マスタデータはスプレッドシートに入力してください。";
}

function applyAdminIdDbChanges() {
  assertAdminUser_();
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
  try {
    assertAdminUser_();
  } catch (error) {
    return;
  }
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
