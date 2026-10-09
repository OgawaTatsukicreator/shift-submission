'use strict';

// Run with: node --test tests/store-selection.test.cjs
// If sandbox realpath checks return EPERM, add --preserve-symlinks
// and --preserve-symlinks-main before --test.
// Execute Code.gs itself. Only GAS IO, operation ownership, and view rebuilding
// are replaced; master filtering, authentication, validation, and row writes run.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
const NOW = Date.parse('2026-10-01T03:00:00.000Z');
const MONTH = '2026-11';
const TOKEN = 'valid-test-session';
const DOMAIN_SHEETS = new Set(['シフト希望', 'PT申請', '確定シフト', '変更履歴', '操作処理状態']);
const DESTINATIONS = [
  ['A_HOME', 'S_HOME'],
  ['A_HOME', 'S_UNLINKED'],
  ['A_OTHER', 'S_CROSS'],
  ['A_OTHER', 'S_CROSS_2'],
  ['A_THIRD', 'S_THIRD'],
];

class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : [NOW]));
  }
  static now() { return NOW; }
}

function formatDate(date, timeZone, format) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map((part) => [part.type, part.value]));
  const tokens = {
    yyyy: parts.year, MM: parts.month, dd: parts.day,
    HH: parts.hour, mm: parts.minute, ss: parts.second,
    M: String(Number(parts.month)), d: String(Number(parts.day)),
  };
  return format.replace(/yyyy|MM|dd|HH|mm|ss|M|d/g, (token) => tokens[token]);
}

class MemorySheet {
  constructor(name, headers, events) {
    this.name = name;
    this.rows = [Array.from(headers)];
    this.events = events;
  }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return Math.max(...this.rows.map((row) => row.length)); }
  setFrozenRows() {}
  getRange(row, column, rowCount = 1, columnCount = 1) {
    return {
      getValues: () => Array.from({ length: rowCount }, (_, r) => (
        Array.from({ length: columnCount }, (_, c) => this.rows[row - 1 + r]?.[column - 1 + c] ?? '')
      )),
      getValue: () => this.rows[row - 1]?.[column - 1] ?? '',
      setValues: (values) => {
        assert.equal(values.length, rowCount);
        values.forEach((valuesRow, r) => {
          assert.equal(valuesRow.length, columnCount);
          while (this.rows.length < row + r) this.rows.push([]);
          valuesRow.forEach((value, c) => { this.rows[row - 1 + r][column - 1 + c] = value; });
        });
        this.events.writes.push({ sheet: this.name, row, column });
      },
      setValue: (value) => {
        while (this.rows.length < row) this.rows.push([]);
        this.rows[row - 1][column - 1] = value;
        this.events.writes.push({ sheet: this.name, row, column });
      },
    };
  }
  appendRow(values) {
    this.rows.push(Array.from(values));
    this.events.writes.push({ sheet: this.name, row: this.rows.length, column: 1 });
  }
}

function plain(value) { return JSON.parse(JSON.stringify(value)); }

function createFixture(authState = 'valid') {
  const events = { writes: [], claims: [], finishes: [], rebuilds: [], flushes: 0 };
  let uuid = 0;
  const app = vm.createContext({
    Date: FixedDate,
    console: { log() {}, warn() {}, error() {} },
    Utilities: {
      formatDate,
      getUuid: () => `test-operation-${++uuid}`,
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (algorithm, text, charset) => Array.from(crypto.createHash(algorithm).update(text, charset).digest()),
      base64EncodeWebSafe: (bytes) => Buffer.from(bytes).toString('base64url'),
    },
    Session: { getScriptTimeZone: () => 'Asia/Tokyo' },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: {
      flush: () => { events.flushes += 1; },
      openById: () => { throw new Error('Unexpected real spreadsheet lookup'); },
    },
  });
  vm.runInContext(source, app, { filename: 'Code.gs' });
  const headers = vm.runInContext('HEADERS', app);
  const sheets = new Map(Object.entries(headers).map(([name, columns]) => [name, new MemorySheet(name, columns, events)]));
  const spreadsheet = (id) => ({
    getId: () => id,
    getSheetByName: (name) => {
      assert.ok(sheets.has(name), `Unexpected sheet: ${name}`);
      return sheets.get(name);
    },
  });
  const db = spreadsheet('test-db');
  const log = spreadsheet('test-log');
  const overall = spreadsheet('test-overall');
  const seed = (name, rows) => { sheets.get(name).rows.push(...rows.map((row) => Array.from(row))); };
  seed('エリアマスタ', [
    ['A_HOME', 'Home area', 1, true],
    ['A_OTHER', 'Other area', 2, true],
    ['A_THIRD', 'Third area', 3, true],
    ['A_INACTIVE', 'Inactive area', 4, false],
  ]);
  seed('店舗マスタ', [
    ['S_HOME', 'Home store', 'Home', 'A_HOME', 1, true],
    ['S_UNLINKED', 'Unlinked store', 'Same', 'A_HOME', 2, true],
    ['S_CROSS', 'Cross-area store', 'Cross', 'A_OTHER', 3, true],
    ['S_CROSS_2', 'Second cross-area store', 'Cross2', 'A_OTHER', 4, true],
    ['S_THIRD', 'Third-area store', 'Third', 'A_THIRD', 5, true],
    ['S_INACTIVE', 'Inactive store', 'Inactive', 'A_OTHER', 6, false],
    ['S_DISABLED_AREA', 'Inactive-area store', 'Disabled', 'A_INACTIVE', 7, true],
  ]);
  seed('従業員マスタ', [
    ['E_LOGIN', 'Logged-in employee', 'A_HOME', 'S_HOME', '正社員', '店長', '', 1, true],
    ['E_LOCAL', 'Local employee', 'A_OTHER', 'S_CROSS', '正社員', '店長', '', 2, true],
    ['E_CONFIRMED', 'Cross-area confirmed employee', 'A_HOME', 'S_HOME', 'アルバイト', 'アルバイト', '', 3, true],
    ['E_UNRELATED', 'Unrelated employee', 'A_HOME', 'S_HOME', 'アルバイト', 'アルバイト', '', 4, true],
    ['E_INACTIVE', 'Inactive employee', 'A_HOME', 'S_HOME', 'アルバイト', 'アルバイト', '', 5, false],
  ]);
  // There are deliberately no rows in 従業員店舗設定.
  seed('業務設定', [['STORE_CLOSED_RULE', 'GLOBAL', '', 'NONE', '', '', true]]);
  seed('ログインアカウント', [[
    'E_LOGIN', 'unused-password-hash', 'unused-salt', new FixedDate(), new FixedDate(),
    authState !== 'disabled-account', 0, '', new FixedDate(), 1,
  ]]);
  seed('ログインセッション', [[
    app.hashSessionToken_(TOKEN), 'E_LOGIN', new FixedDate(),
    new FixedDate(authState === 'expired' ? NOW - 1 : NOW + 24 * 60 * 60 * 1000),
    new FixedDate(), authState !== 'revoked', 'test-session-id', authState === 'old-password' ? 2 : 1,
  ]]);
  app.getDbSpreadsheet = () => db;
  app.getSubmissionLogSpreadsheet = () => log;
  app.getOverallSpreadsheet = () => overall;
  app.ensureAuthSheets_ = () => {};
  app.claimOperation_ = (operationId, kind, payload, staff) => {
    events.claims.push({ operationId, kind, employeeId: staff.employeeId });
    return { completed: false };
  };
  app.finishOperation_ = (operationId, result) => { events.finishes.push({ operationId, result: plain(result) }); };
  app.rebuildMonthViews = (target, month, areaIds) => {
    assert.equal(target, overall);
    events.rebuilds.push({ month, areaIds: Array.from(areaIds) });
  };
  return { app, events, sheets, seed };
}

function payloadFor(kind, areaId = 'A_OTHER', storeId = 'S_CROSS', overrides = {}) {
  const base = { authToken: TOKEN, operationId: `test-${kind}`, employeeId: 'E_UNRELATED', notes: 'Test note' };
  if (kind === 'SHIFT_SUBMIT') {
    return {
      ...base, areaId, storeId, month: MONTH,
      shifts: Array.from({ length: 30 }, (_, index) => ({
        date: `${MONTH}-${String(index + 1).padStart(2, '0')}`,
        type: index === 1 ? '勤務可能' : '未入力',
        start: index === 1 ? '12:00' : '', end: index === 1 ? '18:00' : '',
      })),
      ...overrides,
    };
  }
  return { ...base, kind: 'pt', workAreaId: areaId, workStoreId: storeId, date: `${MONTH}-02`, start: '08:00', end: '12:00', ...overrides };
}

function submit(app, kind, payload) {
  return kind === 'SHIFT_SUBMIT' ? app.submitShift(payload) : app.submitPtRequest(payload);
}

function assertNoSubmissionWrites(fixture) {
  assert.deepEqual(fixture.events.writes.filter((event) => DOMAIN_SHEETS.has(event.sheet)), []);
  assert.deepEqual(fixture.events.claims, []);
  assert.deepEqual(fixture.events.finishes, []);
  assert.deepEqual(fixture.events.rebuilds, []);
}

test('operation validation accepts every active store in the selected active area without staff-store settings', async (t) => {
  for (const kind of ['SHIFT_SUBMIT', 'PT_SUBMIT']) {
    for (const [areaId, storeId] of DESTINATIONS) {
      await t.test(`${kind}: ${storeId}`, () => {
        const fixture = createFixture();
        const staff = fixture.app.authenticateSession_(TOKEN).staff;
        assert.equal(fixture.app.getStaffStoreSettings().length, 0);
        assert.doesNotThrow(() => fixture.app.validateOperationRequest_(kind, payloadFor(kind, areaId, storeId), staff));
        assertNoSubmissionWrites(fixture);
      });
    }
  }
});

test('actual normal and PT submissions save selected destinations and use the authenticated employee', async (t) => {
  for (const kind of ['SHIFT_SUBMIT', 'PT_SUBMIT']) {
    for (const [areaId, storeId] of DESTINATIONS) {
      await t.test(`${kind}: ${storeId}`, () => {
        const fixture = createFixture();
        const payload = payloadFor(kind, areaId, storeId);
        const operation = fixture.app.createSubmissionOperation(payload);
        assert.equal(operation.ok, true);
        assert.equal(operation.kind, kind);
        assert.equal(fixture.sheets.get('操作処理状態').rows[1][3], 'E_LOGIN');
        payload.operationId = operation.operationId;
        const result = submit(fixture.app, kind, payload);
        assert.equal(result.ok, true);
        assert.equal(fixture.events.claims.length, 1);
        assert.equal(fixture.events.claims[0].employeeId, 'E_LOGIN');
        assert.equal(fixture.events.finishes.length, 1);
        if (kind === 'SHIFT_SUBMIT') {
          const row = fixture.sheets.get('シフト希望').rows[1];
          assert.equal(row[2], 'E_LOGIN');
          assert.equal(row[4], areaId);
          assert.equal(row[5], storeId);
          assert.deepEqual(fixture.events.rebuilds, [{ month: MONTH, areaIds: [areaId, ''] }]);
        } else {
          const pt = fixture.sheets.get('PT申請').rows[1];
          assert.deepEqual(pt.slice(1, 6), ['E_LOGIN', 'Logged-in employee', 'S_HOME', areaId, storeId]);
          const confirmed = fixture.sheets.get('確定シフト').rows[1];
          assert.deepEqual(confirmed.slice(3, 9), ['E_LOGIN', 'Logged-in employee', 'A_HOME', 'S_HOME', areaId, storeId]);
          assert.equal(confirmed[11], 'PT');
          assert.equal(fixture.sheets.get('変更履歴').rows.length, 2);
          assert.deepEqual(fixture.events.rebuilds, [{ month: MONTH, areaIds: [areaId, 'A_HOME'] }]);
        }
      });
    }
  }
});

test('cross-area monthly resubmission rebuilds both the selected and previous areas', () => {
  const fixture = createFixture();
  fixture.seed('シフト希望', [[
    `HOPE-${MONTH}-E_LOGIN`, MONTH, 'E_LOGIN', 'Logged-in employee', 'A_HOME', 'S_HOME',
    new FixedDate(), '提出済み', 1, 0, 0, 0, 29, '[]', '', '',
  ]]);
  const result = fixture.app.submitShift(payloadFor('SHIFT_SUBMIT'));
  assert.equal(result.updated, true);
  assert.equal(fixture.sheets.get('シフト希望').rows.length, 2);
  assert.deepEqual(fixture.events.rebuilds, [{ month: MONTH, areaIds: ['A_OTHER', 'A_HOME'] }]);
});

const INVALID_DESTINATIONS = [
  ['inactive store', 'A_OTHER', 'S_INACTIVE', /店舗が見つかりません/],
  ['unknown store', 'A_OTHER', 'S_UNKNOWN', /店舗が見つかりません/],
  ['mismatched area', 'A_HOME', 'S_CROSS', /このエリアに所属していません/],
  ['inactive area', 'A_INACTIVE', 'S_DISABLED_AREA', /エリアが見つかりません/],
  ['unknown area', 'A_UNKNOWN', 'S_CROSS', /エリアが見つかりません/],
];

test('invalid destinations reject during operation validation and actual submission before claims or writes', async (t) => {
  for (const kind of ['SHIFT_SUBMIT', 'PT_SUBMIT']) {
    for (const [name, areaId, storeId, error] of INVALID_DESTINATIONS) {
      await t.test(`${kind}: ${name}`, () => {
        const fixture = createFixture();
        const payload = payloadFor(kind, areaId, storeId);
        const staff = fixture.app.authenticateSession_(TOKEN).staff;
        assert.throws(() => fixture.app.validateOperationRequest_(kind, payload, staff), error);
        assertNoSubmissionWrites(fixture);
        assert.throws(() => fixture.app.createSubmissionOperation(payload), error);
        assertNoSubmissionWrites(fixture);
        assert.throws(() => submit(fixture.app, kind, payload), error);
        assertNoSubmissionWrites(fixture);
      });
    }
  }
});

test('legacy PT areaId/storeId aliases preserve selected-area validation', async (t) => {
  await t.test('cross-area alias submission succeeds', () => {
    const fixture = createFixture();
    const payload = payloadFor('PT_SUBMIT', undefined, undefined, {
      workAreaId: '', workStoreId: '', areaId: 'A_OTHER', storeId: 'S_CROSS',
    });
    assert.doesNotThrow(() => fixture.app.validateOperationRequest_('PT_SUBMIT', payload, fixture.app.authenticateSession_(TOKEN).staff));
    assert.equal(fixture.app.submitPtRequest(payload).ok, true);
    assert.deepEqual(fixture.sheets.get('PT申請').rows[1].slice(4, 6), ['A_OTHER', 'S_CROSS']);
  });
  for (const [name, areaId, storeId, error] of INVALID_DESTINATIONS) {
    await t.test(name, () => {
      const fixture = createFixture();
      const payload = payloadFor('PT_SUBMIT', undefined, undefined, { workAreaId: '', workStoreId: '', areaId, storeId });
      assert.throws(() => fixture.app.validateOperationRequest_('PT_SUBMIT', payload, fixture.app.authenticateSession_(TOKEN).staff), error);
      assert.throws(() => fixture.app.createSubmissionOperation(payload), error);
      assert.throws(() => fixture.app.submitPtRequest(payload), error);
      assertNoSubmissionWrites(fixture);
    });
  }
});

test('whitespace-only destinations cannot match blank aliases in active master rows', async (t) => {
  const whitespaceCases = [
    ['ASCII space', ' '],
    ['full-width space', '\u3000'],
    ['zero-width space', '\u200b'],
  ];
  for (const mode of ['SHIFT_SUBMIT', 'PT_SUBMIT', 'legacy PT']) {
    const kind = mode === 'SHIFT_SUBMIT' ? 'SHIFT_SUBMIT' : 'PT_SUBMIT';
    for (const [name, whitespace] of whitespaceCases) {
      for (const field of ['store', 'area']) {
        await t.test(`${mode}: ${name} ${field}`, () => {
          const fixture = createFixture();
          // These rows remain valid and selectable by ID. Without empty-key
          // rejection, a normalized blank input would match their blank aliases.
          fixture.sheets.get('店舗マスタ').rows.find((row) => row[0] === 'S_CROSS')[2] = '';
          fixture.sheets.get('エリアマスタ').rows.find((row) => row[0] === 'A_OTHER')[1] = '';
          const staff = fixture.app.authenticateSession_(TOKEN).staff;
          const valid = payloadFor(kind);
          assert.doesNotThrow(() => fixture.app.validateOperationRequest_(kind, valid, staff));

          const areaId = field === 'area' ? whitespace : 'A_OTHER';
          const storeId = field === 'store' ? whitespace : 'S_CROSS';
          const payload = mode === 'legacy PT'
            ? payloadFor(kind, undefined, undefined, { workAreaId: '', workStoreId: '', areaId, storeId })
            : payloadFor(kind, areaId, storeId);
          const error = field === 'store' ? /店舗を選択してください/ : /エリアを選択してください/;
          assert.throws(() => fixture.app.validateOperationRequest_(kind, payload, staff), error);
          assertNoSubmissionWrites(fixture);
          assert.throws(() => fixture.app.createSubmissionOperation(payload), error);
          assertNoSubmissionWrites(fixture);
          assert.throws(() => submit(fixture.app, kind, payload), error);
          assertNoSubmissionWrites(fixture);
        });
      }
    }
  }
});

test('invalid destination IDs cannot resolve through names or short names of active master rows', async (t) => {
  const collisions = [
    ['inactive store ID matching a store name', 'store', 'S_INACTIVE', 1],
    ['inactive store ID matching a short name', 'store', 'S_INACTIVE', 2],
    ['unknown store ID matching a store name', 'store', 'S_UNKNOWN', 1],
    ['unknown store ID matching a short name', 'store', 'S_UNKNOWN', 2],
    ['inactive area ID matching an area name', 'area', 'A_INACTIVE', 1],
    ['unknown area ID matching an area name', 'area', 'A_UNKNOWN', 1],
  ];
  for (const mode of ['SHIFT_SUBMIT', 'PT_SUBMIT', 'legacy PT']) {
    const kind = mode === 'SHIFT_SUBMIT' ? 'SHIFT_SUBMIT' : 'PT_SUBMIT';
    for (const [name, field, invalidId, aliasColumn] of collisions) {
      await t.test(`${mode}: ${name}`, () => {
        const fixture = createFixture();
        if (field === 'store') {
          fixture.sheets.get('店舗マスタ').rows.find((row) => row[0] === 'S_CROSS')[aliasColumn] = invalidId;
          assert.equal(fixture.app.findStore(invalidId).storeId, 'S_CROSS');
        } else {
          fixture.sheets.get('エリアマスタ').rows.find((row) => row[0] === 'A_OTHER')[aliasColumn] = invalidId;
          assert.equal(fixture.app.findArea(invalidId).areaId, 'A_OTHER');
        }
        const areaId = field === 'area' ? invalidId : 'A_OTHER';
        const storeId = field === 'store' ? invalidId : 'S_CROSS';
        const payload = mode === 'legacy PT'
          ? payloadFor(kind, undefined, undefined, { workAreaId: '', workStoreId: '', areaId, storeId })
          : payloadFor(kind, areaId, storeId);
        const staff = fixture.app.authenticateSession_(TOKEN).staff;
        const error = field === 'store' ? /店舗が見つかりません/ : /エリアが見つかりません/;
        assert.throws(() => fixture.app.validateOperationRequest_(kind, payload, staff), error);
        assertNoSubmissionWrites(fixture);
        assert.throws(() => fixture.app.createSubmissionOperation(payload), error);
        assertNoSubmissionWrites(fixture);
        assert.throws(() => submit(fixture.app, kind, payload), error);
        assertNoSubmissionWrites(fixture);
      });
    }
  }
});

test('valid destination IDs select their own rows when earlier master names collide', async (t) => {
  for (const mode of ['SHIFT_SUBMIT', 'PT_SUBMIT', 'legacy PT']) {
    const kind = mode === 'SHIFT_SUBMIT' ? 'SHIFT_SUBMIT' : 'PT_SUBMIT';
    for (const [name, aliasColumn] of [['store name', 1], ['short name', 2]]) {
      await t.test(`${mode}: earlier ${name}`, () => {
        const fixture = createFixture();
        const decoyStore = ['S_DECOY', 'Decoy store', 'Decoy', 'A_OTHER', 0, true];
        decoyStore[aliasColumn] = 'S_CROSS';
        fixture.seed('店舗マスタ', [decoyStore]);
        fixture.sheets.get('エリアマスタ').rows.find((row) => row[0] === 'A_HOME')[1] = 'A_OTHER';
        const stores = fixture.app.getStores();
        assert.ok(stores.findIndex((store) => store.storeId === 'S_DECOY') < stores.findIndex((store) => store.storeId === 'S_CROSS'));
        const areas = fixture.app.getAreas();
        assert.ok(areas.findIndex((area) => area.areaId === 'A_HOME') < areas.findIndex((area) => area.areaId === 'A_OTHER'));
        const payload = mode === 'legacy PT'
          ? payloadFor(kind, undefined, undefined, { workAreaId: '', workStoreId: '', areaId: 'A_OTHER', storeId: 'S_CROSS' })
          : payloadFor(kind);
        const staff = fixture.app.authenticateSession_(TOKEN).staff;
        assert.doesNotThrow(() => fixture.app.validateOperationRequest_(kind, payload, staff));
        const operation = fixture.app.createSubmissionOperation(payload);
        assert.equal(operation.ok, true);
        payload.operationId = operation.operationId;
        assert.equal(submit(fixture.app, kind, payload).ok, true);
        const row = fixture.sheets.get(kind === 'SHIFT_SUBMIT' ? 'シフト希望' : 'PT申請').rows[1];
        assert.deepEqual(row.slice(4, 6), ['A_OTHER', 'S_CROSS']);
        if (kind === 'PT_SUBMIT') {
          assert.deepEqual(fixture.sheets.get('確定シフト').rows[1].slice(7, 9), ['A_OTHER', 'S_CROSS']);
        }
      });
    }
  }
});

test('invalid authentication rejects operation creation and actual submission before domain writes', async (t) => {
  const authCases = [
    ['missing token', 'valid', ''],
    ['unknown token', 'valid', 'unknown-test-session'],
    ['expired session', 'expired', TOKEN],
    ['revoked session', 'revoked', TOKEN],
    ['disabled account', 'disabled-account', TOKEN],
    ['password version changed', 'old-password', TOKEN],
  ];
  for (const kind of ['SHIFT_SUBMIT', 'PT_SUBMIT']) {
    for (const [name, authState, authToken] of authCases) {
      await t.test(`${kind}: ${name}`, () => {
        for (const action of ['create', 'submit']) {
          const fixture = createFixture(authState);
          const payload = payloadFor(kind, undefined, undefined, { authToken });
          assert.throws(() => action === 'create'
            ? fixture.app.createSubmissionOperation(payload)
            : submit(fixture.app, kind, payload), /ログイン|パスワード/);
          // Authentication may revoke an invalid session; no business data or
          // operation record may be written and no operation may be claimed.
          assertNoSubmissionWrites(fixture);
        }
      });
    }
  }
});

function matrixRecords() {
  return [
    { employeeId: 'E_LOGIN', name: 'Logged-in employee', storeId: 'S_CROSS', storeAreaId: 'A_OTHER', source: 'submission',
      shifts: [{ date: `${MONTH}-02`, type: '勤務可能', start: '12:00', end: '18:00' }] },
    { employeeId: 'E_CONFIRMED', name: 'Cross-area confirmed employee', storeId: 'S_CROSS_2', storeAreaId: 'A_OTHER', source: 'confirmed',
      shifts: [{ date: `${MONTH}-02`, type: 'PT', start: '08:00', end: '12:00', confirmed: true }] },
    { employeeId: 'E_UNRELATED', name: 'Unrelated employee', storeId: 'S_THIRD', storeAreaId: 'A_THIRD', source: 'submission',
      shifts: [{ date: `${MONTH}-02`, type: '勤務可能', start: '12:00', end: '18:00' }] },
    { employeeId: 'E_INACTIVE', name: 'Inactive employee', storeId: 'S_CROSS', storeAreaId: 'A_OTHER', source: 'submission', shifts: [] },
  ];
}

test('area staff groups include recorded cross-area employees without help settings and exclude unrelated employees', () => {
  const fixture = createFixture();
  const members = (records) => Array.from(fixture.app.getMatrixStaffGroups('A_OTHER', records).flatMap((group) => group.staff), (staff) => staff.employeeId).sort();
  assert.equal(fixture.app.getStaffStoreSettings().length, 0);
  assert.deepEqual(members([]), ['E_LOCAL']);
  assert.deepEqual(members(matrixRecords()), ['E_CONFIRMED', 'E_LOCAL', 'E_LOGIN']);
});

test('weekly area matrix includes cross-area submission and confirmed rows with their actual cells', () => {
  const fixture = createFixture();
  const matrix = fixture.app.buildWeeklyMatrix(matrixRecords(), MONTH, 'Other area', 'A_OTHER');
  for (const section of matrix.sections) {
    const names = Array.from(matrix.values.slice(section.staffStartRow - 1, section.endRow), (row) => row[1]).filter(Boolean).sort();
    assert.deepEqual(names, ['Cross-area confirmed employee', 'Local employee', 'Logged-in employee']);
  }
  const section = matrix.sections.find((part) => part.dayColumns.some((day) => day.dateValue === `${MONTH}-02`));
  const day = section.dayColumns.find((part) => part.dateValue === `${MONTH}-02`);
  const rows = matrix.values.slice(section.staffStartRow - 1, section.endRow);
  const normalColumn = day.startColumn - 1 + day.stores.findIndex((store) => store.storeId === 'S_CROSS');
  const ptColumn = day.startColumn - 1 + day.stores.findIndex((store) => store.storeId === 'S_CROSS_2');
  assert.equal(rows.find((row) => row[1] === 'Logged-in employee')[normalColumn], '12-18');
  assert.equal(rows.find((row) => row[1] === 'Cross-area confirmed employee')[ptColumn], 'PT8-12');
  assert.equal(matrix.values[section.countRow - 1][normalColumn], 1);
  assert.equal(matrix.values[section.countRow - 1][ptColumn], 1);
});

test('same-name local employees do not inherit a cross-area employee\'s matrix cells', async (t) => {
  for (const [sourceName, type, start, end, expected] of [
    ['submission', '勤務可能', '12:00', '18:00', '12-18'],
    ['confirmed', 'PT', '08:00', '12:00', 'PT8-12'],
  ]) {
    await t.test(sourceName, () => {
      const fixture = createFixture();
      const duplicateName = 'Same-name employee';
      for (const employeeId of ['E_LOGIN', 'E_LOCAL']) {
        fixture.sheets.get('従業員マスタ').rows.find((row) => row[0] === employeeId)[1] = duplicateName;
      }
      const date = `${MONTH}-02`;
      const records = [{
        employeeId: 'E_LOGIN', name: duplicateName, storeId: 'S_CROSS', storeAreaId: 'A_OTHER', source: sourceName,
        shifts: [{ date, type, start, end }],
      }];
      assert.equal(fixture.app.getShiftCell(records, 'E_LOGIN', date, 'S_CROSS'), expected);
      assert.equal(fixture.app.getShiftCell(records, 'E_LOCAL', date, 'S_CROSS'), '');
      const groups = fixture.app.getMatrixStaffGroups('A_OTHER', records);
      assert.deepEqual(Array.from(groups.flatMap((group) => group.staff), (staff) => staff.employeeId), ['E_LOGIN', 'E_LOCAL']);
      const matrix = fixture.app.buildWeeklyMatrix(records, MONTH, 'Other area', 'A_OTHER');
      const section = matrix.sections.find((part) => part.dayColumns.some((day) => day.dateValue === date));
      const day = section.dayColumns.find((part) => part.dateValue === date);
      const column = day.startColumn - 1 + day.stores.findIndex((store) => store.storeId === 'S_CROSS');
      // Both employees belong to the same role. Master display order puts the
      // visiting E_LOGIN first and the unsubmitted local E_LOCAL second.
      const role = section.groupRanges.find((group) => group.role === '店長');
      const visitingRow = matrix.values[role.startRow - 1];
      const localRow = matrix.values[role.startRow];
      assert.equal(visitingRow[1], duplicateName);
      assert.equal(localRow[1], duplicateName);
      assert.equal(visitingRow[column], expected);
      assert.ok(localRow.slice(2).every((cell) => cell === ''));
      assert.equal(matrix.values[section.countRow - 1][column], 1);
    });
  }
});
