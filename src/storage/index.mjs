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
};

export const MAX_SESSIONS = 30;

function createMemoryBackend() {
  const m = new Map();
  return {
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
  };
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
    saveProfile({ jdText, resumeText, jd, resume } = {}) {
      const list = readList(KEYS.profiles);
      const record = {
        id: genId('p', list),
        createdAt: new Date().toISOString(),
        jdText, resumeText, jd, resume,
      };
      list.push(record);
      return write(KEYS.profiles, list) ? record : false;
    },
    listProfiles() {
      return readList(KEYS.profiles);
    },
    getProfile(id) {
      return readList(KEYS.profiles).find((p) => p && p.id === id) ?? null;
    },

    // ---------- sessions ----------
    saveSession(resultWithReport) {
      const list = readList(KEYS.sessions);
      const input = resultWithReport && typeof resultWithReport === 'object' ? resultWithReport : {};
      const existingIdx = input.id ? list.findIndex((s) => s && s.id === input.id) : -1;
      const record = {
        ...input,
        id: existingIdx >= 0 ? input.id : (input.id || genId('s', list)),
        // 契约 §9（V1.2 P0-1）：savedAt 为 epoch 毫秒数字，消费端按数字排序与格式化
        savedAt: Date.now(),
      };
      if (existingIdx >= 0) {
        list[existingIdx] = record; // 同 id 覆盖更新，不追加
      } else {
        list.push(record);
      }
      while (list.length > MAX_SESSIONS) list.shift(); // 修剪最旧
      return write(KEYS.sessions, list) ? record : false;
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

    // ---------- ledger（练习台账：场次与分数趋势） ----------
    appendLedger(entry) {
      const list = readList(KEYS.ledger);
      list.push(entry);
      return write(KEYS.ledger, list) ? entry : false;
    },
    getLedger() {
      return readList(KEYS.ledger);
    },
  };
}
