// src/storage/index.mjs — 本地持久化（契约 §9）
// backend 接口 { getItem, setItem, removeItem }，默认内存实现；浏览器侧传 localStorage。
// 键前缀 guomian:。坏数据永不白屏：任何键上的 JSON.parse 失败/形状非法一律回默认值；
// setItem 抛异常（如配额满）时捕获并做一次「牺牲最旧 session」的修剪重试，再失败静默返回 false。

const PREFIX = 'guomian:';
const KEYS = {
  profiles: `${PREFIX}profiles`,
  sessions: `${PREFIX}sessions`,
  entitlements: `${PREFIX}entitlements`,
  ledger: `${PREFIX}ledger`,
  custom: `${PREFIX}custom`,
};

export const MAX_SESSIONS = 30;
// 自定义题集上限（契约 §9 V2.3）：超限拒收返回 false、零写入——与 sessions 的「剪最旧」相反，
// 用户手录的题不许被机器丢，满了只能由用户自己删。
export const MAX_CUSTOM = 50;
// 简历档案上限（契约 §9 V2.4 #6）：拒收语义与 custom 同源——档案是用户主动存的
// JD+简历组合，不许被机器剪最旧；满了走 deleteProfile 由用户自己删。
export const MAX_PROFILES = 10;

function createMemoryBackend() {
  const m = new Map();
  return {
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
  };
}

// 修剪判据（V2.2 P1-2）：按 savedAt 数字找最旧，不按插入顺序——备份恢复后新旧记录混排，
// 插入顺序不再等于时间顺序。savedAt 非有限数字视为最旧优先牺牲；同值取最先插入的（稳定）。
function oldestIndex(list) {
  let idx = 0;
  for (let i = 1; i < list.length; i++) {
    const a = Number.isFinite(list[i]?.savedAt) ? list[i].savedAt : -Infinity;
    const b = Number.isFinite(list[idx]?.savedAt) ? list[idx].savedAt : -Infinity;
    if (a < b) idx = i;
  }
  return idx;
}

export function createStore(backend) {
  const be = backend && typeof backend.getItem === 'function' ? backend : createMemoryBackend();
  let seq = 0;

  function readJSON(key, fallback) {
    let raw;
    try {
      raw = be.getItem(key);
    } catch {
      return fallback;
    }
    if (raw === null || raw === undefined) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function readList(key) {
    const v = readJSON(key, []);
    return Array.isArray(v) ? v : [];
  }

  // ---- V2.4 #5：多标签并发写防护（V1.2 挂账自认的读改写窗口收口） ----
  // 列表面的「读快照→内存改→整体写回」不是原子操作：A 标签页读到快照后、写回之前，
  // B 标签页可能已落盘，A 的写回会把 B 的数据整体覆盖（lost update）。
  // localStorage 没有真 CAS 原语，这里用「读时 raw 字符串快照」当版本票据做乐观并发：
  // 写盘前复核该键当前 raw 与快照逐字一致才落盘；不一致说明窗口内有他方写入，
  // 取最新数据重放本次变更（mutate 必须无副作用、可重放）。有限次重试后仍冲突则
  // 末次直接落盘——同机同键写入频率极低，连环冲突只剩理论意义，活锁比小概率覆盖更糟。
  const MAX_CAS_RETRIES = 3;

  function readRaw(key) {
    try {
      const r = be.getItem(key);
      return r === null || r === undefined ? null : String(r);
    } catch {
      return null;
    }
  }

  // mutate(list) -> { list, result } | false（false = 变更方拒绝写入，如 custom 满额）
  function updateList(key, mutate) {
    for (let attempt = 0; ; attempt += 1) {
      const snapshot = readRaw(key);
      let list = [];
      if (snapshot !== null) {
        try {
          const v = JSON.parse(snapshot);
          if (Array.isArray(v)) list = v;
        } catch { /* 坏数据回默认值，口径同 readList */ }
      }
      const out = mutate(list);
      if (out === false) return false;
      if (attempt >= MAX_CAS_RETRIES || readRaw(key) === snapshot) {
        return write(key, out.list) ? out.result : false;
      }
      // 快照已过期：他标签页在读改写窗口内写过，丢弃本轮结果、取最新数据重放
    }
  }

  // 写入器：首次失败 → 修剪一次（牺牲最旧 session）→ 重试一次 → 再失败静默 false。
  // 写的目标就是 sessions 键时，修剪直接作用在待写数组上（改落盘旧数据救不了新值）。
  function write(key, value) {
    try {
      be.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      let retryValue = value;
      try {
        if (key === KEYS.sessions && Array.isArray(value) && value.length > 0) {
          retryValue = value.slice(1);
        } else {
          const sessions = readList(KEYS.sessions);
          if (sessions.length > 0) {
            try { be.setItem(KEYS.sessions, JSON.stringify(sessions.slice(1))); } catch { /* 修剪本身失败也不炸 */ }
          }
        }
        be.setItem(key, JSON.stringify(retryValue));
        return true;
      } catch {
        return false;
      }
    }
  }

  function genId(kind, existing) {
    const taken = new Set(existing.map((x) => x && x.id));
    for (;;) {
      seq += 1;
      const id = `${kind}-${Date.now().toString(36)}-${seq.toString(36)}`;
      if (!taken.has(id)) return id;
    }
  }

  return {
    // ---------- profiles ----------
    // V2.4 #6：收可选 name（档案下拉展示名，不传不造假字段）；MAX_PROFILES 满则拒收
    // 返回 false 零写入（拒收不修剪，与 custom 同语义）。
    saveProfile({ name, jdText, resumeText, jd, resume } = {}) {
      return updateList(KEYS.profiles, (list) => {
        if (list.length >= MAX_PROFILES) return false;
        const record = {
          id: genId('p', list),
          createdAt: new Date().toISOString(),
          ...(name !== undefined ? { name } : {}),
          jdText, resumeText, jd, resume,
        };
        list.push(record);
        return { list, result: record };
      });
    },
    listProfiles() {
      return readList(KEYS.profiles);
    },
    getProfile(id) {
      return readList(KEYS.profiles).find((p) => p && p.id === id) ?? null;
    },
    deleteProfile(id) {
      return updateList(KEYS.profiles, (list) => {
        const idx = list.findIndex((p) => p && p.id === id);
        if (idx < 0) return false;
        list.splice(idx, 1);
        return { list, result: true };
      });
    },

    // ---------- sessions ----------
    saveSession(resultWithReport) {
      const input = resultWithReport && typeof resultWithReport === 'object' ? resultWithReport : {};
      return updateList(KEYS.sessions, (list) => {
        const existingIdx = input.id ? list.findIndex((s) => s && s.id === input.id) : -1;
        const existing = existingIdx >= 0 ? list[existingIdx] : null;
        // 契约 §9（V1.2 P0-1 + V2.2 P1-2）：savedAt 为 epoch 毫秒数字——传入有限数字则保留
        // （备份恢复时间保真）；upsert 未传时保留原记录值（改 report 不改时间线位置）；
        // ISO 字符串/NaN 等坏值仍盖 Date.now()（P0 防线不回退）。
        let savedAt;
        if (Number.isFinite(input.savedAt)) savedAt = input.savedAt;
        else if (existing && Number.isFinite(existing.savedAt)) savedAt = existing.savedAt;
        else savedAt = Date.now();
        const record = {
          ...input,
          id: existing ? input.id : (input.id || genId('s', list)),
          savedAt,
        };
        if (existing) {
          list[existingIdx] = record; // 同 id 覆盖更新，不追加
        } else {
          list.push(record);
        }
        while (list.length > MAX_SESSIONS) list.splice(oldestIndex(list), 1); // 按 savedAt 剪最旧
        return { list, result: record };
      });
    },
    listSessions() {
      return readList(KEYS.sessions);
    },
    getSession(id) {
      return readList(KEYS.sessions).find((s) => s && s.id === id) ?? null;
    },

    // ---------- entitlements ----------
    getEntitlements() {
      const v = readJSON(KEYS.entitlements, null);
      if (!v || typeof v !== 'object' || Array.isArray(v)) {
        return { credits: 0, memberUntil: null };
      }
      return {
        ...v,
        credits: Number.isFinite(v.credits) ? v.credits : 0,
        memberUntil: typeof v.memberUntil === 'string' ? v.memberUntil : null,
      };
    },
    setEntitlements(e) {
      return write(KEYS.entitlements, e);
    },

    // ---------- custom（自定义题集，V2.3）：满则拒收，绝不修剪 ----------
    addCustomQuestion({ text, type } = {}) {
      return updateList(KEYS.custom, (list) => {
        if (list.length >= MAX_CUSTOM) return false; // 超限拒收，零写入
        const record = { id: genId('c', list), text, type, createdAt: Date.now() };
        list.push(record);
        return { list, result: record };
      });
    },
    listCustomQuestions() {
      return readList(KEYS.custom);
    },
    removeCustomQuestion(id) {
      return updateList(KEYS.custom, (list) => {
        const idx = list.findIndex((q) => q && q.id === id);
        if (idx < 0) return false;
        list.splice(idx, 1);
        return { list, result: true };
      });
    },

    // ---------- ledger（练习台账：场次与分数趋势） ----------
    appendLedger(entry) {
      return updateList(KEYS.ledger, (list) => {
        list.push(entry);
        return { list, result: entry };
      });
    },
    getLedger() {
      return readList(KEYS.ledger);
    },
  };
}
