// src/llm/index.mjs — LLM 适配层（契约 §6）
// 两条通路：OpenAI 兼容 HTTP（原生 fetch）与测试 mock 注入；配置不全一律返回 null，
// 调用方必须自备确定性降级路径。apiKey 只在本工厂闭包内持有，零持久化。
// HTTP 通路带硬超时（V1.2 P1-2 收口）：AbortSignal.timeout，默认 8000ms、config.timeoutMs 可调，
// 超时抛 LLMError——绝不让调用方等浏览器级超时。

const DEFAULT_TIMEOUT_MS = 8000;

export class LLMError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'LLMError';
    this.code = 'LLM';
  }
}

export function createLLM(config) {
  if (!config || typeof config !== 'object') return null;

  if (typeof config.mock === 'function') {
    const mock = config.mock;
    return {
      async complete({ system, messages = [], maxTokens } = {}) {
        const text = await mock({ system, messages, maxTokens });
        return { text: String(text ?? '') };
      },
    };
  }

  const baseURL = typeof config.baseURL === 'string' ? config.baseURL.trim() : '';
  const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : '';
  const model = typeof config.model === 'string' ? config.model.trim() : '';
  if (!baseURL || !apiKey || !model) return null;

  const endpoint = `${baseURL.replace(/\/+$/, '')}/chat/completions`;
  const timeoutMs = Number.isFinite(config.timeoutMs) && config.timeoutMs > 0
    ? config.timeoutMs
    : DEFAULT_TIMEOUT_MS;

  return {
    async complete({ system, messages = [], maxTokens } = {}) {
      const payload = {
        model,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          ...messages,
        ],
      };
      if (Number.isFinite(maxTokens)) payload.max_tokens = maxTokens;

      let res;
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
          throw new LLMError(`LLM 请求超时（>${timeoutMs}ms），已中止`, { cause: err });
        }
        throw new LLMError(`LLM 网络请求失败：${err && err.message ? err.message : err}`, { cause: err });
      }
      if (!res.ok) {
        throw new LLMError(`LLM 服务返回非 2xx：HTTP ${res.status}`);
      }
      let data;
      try {
        data = await res.json();
      } catch (err) {
        throw new LLMError('LLM 响应不是合法 JSON', { cause: err });
      }
      const text = data?.choices?.[0]?.message?.content;
      if (typeof text !== 'string') {
        throw new LLMError('LLM 响应缺少 choices[0].message.content');
      }
      return { text };
    },
  };
}
