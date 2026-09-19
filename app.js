"use strict";

// 旧静的版は利用停止中。入力、端末保存、外部通信は行わない。
const legacyStatus = document.querySelector("#legacyStatus");
if (legacyStatus) legacyStatus.textContent = "利用停止中：新しいシフト提出URLを使用してください";
