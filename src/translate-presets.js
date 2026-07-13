// ==========================================
// Translation provider presets
// User only needs an API key; base URL + model are prefilled.
//
// Verified via Context7 (ctx7) against official docs — 2026-07-13:
// - DeepSeek: /websites/api-docs_deepseek  (v4 models; legacy names retire 2026-07-24)
// - OpenAI: /websites/developers_openai_api
// - OpenRouter: /websites/openrouter_ai
// - Kimi: /websites/platform_kimi  (moonshot.cn / moonshot.ai)
// - SiliconFlow: /websites/siliconflow_en + /websites/siliconflow_cn_cn
// - Gemini OpenAI-compat: /websites/ai_google_dev_gemini-api
// - DeepL: /websites/developers_deepl
// - Groq: /websites/console_groq
// - DashScope: /dashscope/dashscope-sdk-python
// - Zhipu: /websites/bigmodel_cn_cn
// - Mistral: /mistralai/platform-docs-public
// ==========================================

/**
 * @typedef {object} TranslateModelOption
 * @property {string} id
 * @property {string} label
 * @property {boolean} [default]
 */

/**
 * @typedef {object} TranslatePreset
 * @property {string} id
 * @property {string} label
 * @property {string} group  // official | china | aggregator | translate | custom
 * @property {string} groupLabel
 * @property {'openai'|'anthropic'|'deepl'} kind
 * @property {string} [baseUrl]
 * @property {string} [defaultModel]
 * @property {TranslateModelOption[]} [models]
 * @property {'free'|'pro'} [deeplEndpoint]
 * @property {string} [keyHint]
 * @property {string} [note]
 * @property {string} [docsUrl]
 * @property {string[]} [hostOrigins] // for permission hints
 */

/** @type {TranslatePreset[]} */
export const TRANSLATE_PRESETS = [
  // ----- Official / global -----
  {
    id: 'openai',
    label: 'OpenAI',
    group: 'official',
    groupLabel: '官方直连',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o-mini', label: 'gpt-4o-mini（推荐·省钱）', default: true },
      { id: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
      { id: 'gpt-5-mini', label: 'gpt-5-mini' },
      { id: 'gpt-5-nano', label: 'gpt-5-nano（更省）' },
      { id: 'gpt-4.1', label: 'gpt-4.1' },
      { id: 'gpt-4o', label: 'gpt-4o' },
      { id: 'o4-mini', label: 'o4-mini' },
    ],
    keyHint: 'sk-...',
    note: '官方 Chat Completions：https://api.openai.com/v1/chat/completions',
    docsUrl: 'https://platform.openai.com/api-keys',
    hostOrigins: ['https://api.openai.com'],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    group: 'official',
    groupLabel: '官方直连',
    kind: 'openai',
    // Context7: base_url https://api.deepseek.com ; models deepseek-v4-flash / deepseek-v4-pro
    // legacy deepseek-chat / deepseek-reasoner map to v4-flash modes until 2026-07-24
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-v4-flash',
    models: [
      { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash（推荐）', default: true },
      { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro（更强）' },
      { id: 'deepseek-chat', label: 'deepseek-chat（旧名，2026-07-24 停用）' },
      { id: 'deepseek-reasoner', label: 'deepseek-reasoner（旧名，2026-07-24 停用）' },
    ],
    keyHint: 'sk-...',
    note: '默认推荐。官方已切换 V4；旧模型名 deepseek-chat 将于 2026-07-24 停用',
    docsUrl: 'https://api-docs.deepseek.com',
    hostOrigins: ['https://api.deepseek.com'],
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    group: 'official',
    groupLabel: '官方直连',
    kind: 'openai',
    // Context7: base_url https://generativelanguage.googleapis.com/v1beta/openai/
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.5-flash',
    models: [
      { id: 'gemini-3.5-flash', label: 'gemini-3.5-flash（推荐）', default: true },
      { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
      { id: 'gemini-2.0-flash', label: 'gemini-2.0-flash' },
      { id: 'gemini-2.0-flash-lite', label: 'gemini-2.0-flash-lite（更省）' },
    ],
    keyHint: 'AIza...',
    note: 'Gemini OpenAI 兼容端点（Authorization: Bearer）',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/openai',
    hostOrigins: ['https://generativelanguage.googleapis.com'],
  },
  {
    id: 'groq',
    label: 'Groq',
    group: 'official',
    groupLabel: '官方直连',
    kind: 'openai',
    // Context7: baseURL https://api.groq.com/openai/v1
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    models: [
      {
        id: 'meta-llama/llama-4-scout-17b-16e-instruct',
        label: 'Llama-4 Scout（推荐·快）',
        default: true,
      },
      {
        id: 'meta-llama/llama-4-maverick-17b-128e-instruct',
        label: 'Llama-4 Maverick',
      },
      { id: 'llama-3.3-70b-versatile', label: 'llama-3.3-70b-versatile' },
      { id: 'llama-3.1-8b-instant', label: 'llama-3.1-8b-instant（极速）' },
      { id: 'gemma2-9b-it', label: 'gemma2-9b-it' },
    ],
    keyHint: 'gsk_...',
    note: '推理极快，适合长文分段翻译',
    docsUrl: 'https://console.groq.com/keys',
    hostOrigins: ['https://api.groq.com'],
  },
  {
    id: 'mistral',
    label: 'Mistral',
    group: 'official',
    groupLabel: '官方直连',
    kind: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    models: [
      { id: 'mistral-small-latest', label: 'mistral-small-latest（推荐）', default: true },
      { id: 'mistral-medium-latest', label: 'mistral-medium-latest' },
      { id: 'open-mistral-nemo', label: 'open-mistral-nemo' },
    ],
    keyHint: '...',
    note: '官方 POST /v1/chat/completions',
    docsUrl: 'https://docs.mistral.ai',
    hostOrigins: ['https://api.mistral.ai'],
  },

  // ----- China official -----
  {
    id: 'moonshot',
    label: 'Kimi（国内 api.moonshot.cn）',
    group: 'china',
    groupLabel: '国内官方',
    kind: 'openai',
    // Context7 /websites/platform_kimi: CN https://api.moonshot.cn/v1
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k2.5',
    models: [
      { id: 'kimi-k2.5', label: 'kimi-k2.5（推荐）', default: true },
      { id: 'kimi-k2.6', label: 'kimi-k2.6（最新）' },
      { id: 'kimi-k2-turbo-preview', label: 'kimi-k2-turbo-preview' },
      { id: 'kimi-k2-0905-preview', label: 'kimi-k2-0905-preview' },
      { id: 'kimi-k2-thinking', label: 'kimi-k2-thinking' },
    ],
    keyHint: 'sk-...',
    note: '国内开放平台。国际站请选「Kimi International」',
    docsUrl: 'https://platform.moonshot.cn',
    hostOrigins: ['https://api.moonshot.cn'],
  },
  {
    id: 'moonshot-intl',
    label: 'Kimi International（api.moonshot.ai）',
    group: 'china',
    groupLabel: '国内官方',
    kind: 'openai',
    // Context7 FAQ: international base URL https://api.moonshot.ai/v1
    baseUrl: 'https://api.moonshot.ai/v1',
    defaultModel: 'kimi-k2.5',
    models: [
      { id: 'kimi-k2.5', label: 'kimi-k2.5（推荐）', default: true },
      { id: 'kimi-k2.6', label: 'kimi-k2.6（最新）' },
      { id: 'kimi-k2-turbo-preview', label: 'kimi-k2-turbo-preview' },
    ],
    keyHint: 'sk-...',
    note: 'Kimi 国际开放平台端点',
    docsUrl: 'https://platform.moonshot.ai',
    hostOrigins: ['https://api.moonshot.ai'],
  },
  {
    id: 'qwen',
    label: '通义千问 Qwen',
    group: 'china',
    groupLabel: '国内官方',
    kind: 'openai',
    // Context7: DASHSCOPE_COMPATIBLE_BASE_URL → .../compatible-mode/v1
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-turbo',
    models: [
      { id: 'qwen-turbo', label: 'qwen-turbo（推荐·省钱）', default: true },
      { id: 'qwen-plus', label: 'qwen-plus' },
      { id: 'qwen-max', label: 'qwen-max' },
      { id: 'qwen-long', label: 'qwen-long（长文）' },
    ],
    keyHint: 'sk-...',
    note: 'DashScope OpenAI 兼容模式（compatible-mode/v1）',
    docsUrl: 'https://help.aliyun.com/zh/model-studio',
    hostOrigins: ['https://dashscope.aliyuncs.com'],
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    group: 'china',
    groupLabel: '国内官方',
    kind: 'openai',
    // Context7: POST https://open.bigmodel.cn/api/paas/v4/chat/completions
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    models: [
      { id: 'glm-4-flash', label: 'glm-4-flash（推荐·省钱）', default: true },
      { id: 'glm-4-air', label: 'glm-4-air' },
      { id: 'glm-z1-air', label: 'glm-z1-air' },
      { id: 'glm-4-plus', label: 'glm-4-plus' },
      { id: 'glm-4', label: 'glm-4' },
    ],
    keyHint: '...',
    note: '智谱 open.bigmodel.cn · /api/paas/v4',
    docsUrl: 'https://open.bigmodel.cn',
    hostOrigins: ['https://open.bigmodel.cn'],
  },
  {
    id: 'doubao',
    label: '豆包 / 火山方舟',
    group: 'china',
    groupLabel: '国内官方',
    kind: 'openai',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-1-5-lite-32k',
    models: [
      { id: 'doubao-1-5-lite-32k', label: 'doubao-lite（推荐，按控制台接入点改）', default: true },
      { id: 'doubao-1-5-pro-32k', label: 'doubao-pro（按控制台接入点改）' },
    ],
    keyHint: '...',
    note: '模型名请改成你在方舟控制台创建的「推理接入点 ID」',
    docsUrl: 'https://console.volcengine.com/ark',
    hostOrigins: ['https://ark.cn-beijing.volces.com'],
  },
  {
    id: 'minimax',
    label: 'MiniMax Token Plan · Anthropic（推荐）',
    group: 'aggregator',
    groupLabel: '聚合 / Token Plan',
    // Token Plan / Claude Code / 多数 Agent 走 Anthropic Messages：
    // ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic
    // POST .../anthropic/v1/messages  (x-api-key + anthropic-version)
    // Key 前缀通常 sk-cp-（与按量 sk- 不互通）
    kind: 'anthropic',
    baseUrl: 'https://api.minimaxi.com/anthropic/v1',
    defaultModel: 'MiniMax-M2.5-highspeed',
    models: [
      {
        id: 'MiniMax-M2.5-highspeed',
        label: 'MiniMax-M2.5-highspeed（推荐·翻译快）',
        default: true,
      },
      { id: 'MiniMax-M2.5', label: 'MiniMax-M2.5（性价比）' },
      { id: 'MiniMax-M2.7-highspeed', label: 'MiniMax-M2.7-highspeed' },
      { id: 'MiniMax-M2.7', label: 'MiniMax-M2.7' },
      { id: 'MiniMax-M3', label: 'MiniMax-M3（最新）' },
      { id: 'MiniMax-M2.1-highspeed', label: 'MiniMax-M2.1-highspeed' },
      { id: 'MiniMax-M2', label: 'MiniMax-M2' },
    ],
    keyHint: 'sk-cp-...（Token Plan）',
    note: '与 Claude Code / 多数 Agent 相同：Anthropic 协议。填 Token Plan Key（sk-cp-）。若要用 OpenAI 协议请选下方 OpenAI 档',
    docsUrl: 'https://platform.minimaxi.com/docs/api-reference/text-anthropic-api',
    hostOrigins: ['https://api.minimaxi.com'],
  },
  {
    id: 'minimax-openai',
    label: 'MiniMax Token Plan · OpenAI',
    group: 'aggregator',
    groupLabel: '聚合 / Token Plan',
    kind: 'openai',
    baseUrl: 'https://api.minimaxi.com/v1',
    defaultModel: 'MiniMax-M2.5-highspeed',
    models: [
      {
        id: 'MiniMax-M2.5-highspeed',
        label: 'MiniMax-M2.5-highspeed（推荐）',
        default: true,
      },
      { id: 'MiniMax-M2.5', label: 'MiniMax-M2.5' },
      { id: 'MiniMax-M2.7-highspeed', label: 'MiniMax-M2.7-highspeed' },
      { id: 'MiniMax-M3', label: 'MiniMax-M3' },
      { id: 'MiniMax-M2', label: 'MiniMax-M2' },
    ],
    keyHint: 'sk-cp-... 或 sk-...',
    note: 'OpenAI 兼容 /v1/chat/completions。Token Plan 更推荐 Anthropic 档',
    docsUrl: 'https://platform.minimaxi.com/docs/api-reference/text-openai-api',
    hostOrigins: ['https://api.minimaxi.com'],
  },
  {
    id: 'minimax-intl',
    label: 'MiniMax Token Plan · Anthropic（International）',
    group: 'aggregator',
    groupLabel: '聚合 / Token Plan',
    kind: 'anthropic',
    // Official intl: ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic
    baseUrl: 'https://api.minimax.io/anthropic/v1',
    defaultModel: 'MiniMax-M2.5-highspeed',
    models: [
      {
        id: 'MiniMax-M2.5-highspeed',
        label: 'MiniMax-M2.5-highspeed（推荐·翻译快）',
        default: true,
      },
      { id: 'MiniMax-M2.5', label: 'MiniMax-M2.5' },
      { id: 'MiniMax-M2.7-highspeed', label: 'MiniMax-M2.7-highspeed' },
      { id: 'MiniMax-M3', label: 'MiniMax-M3' },
      { id: 'MiniMax-M2', label: 'MiniMax-M2' },
    ],
    keyHint: 'sk-cp-...（Token Plan）',
    note: '国际站 Anthropic · api.minimax.io/anthropic/v1/messages',
    docsUrl: 'https://platform.minimax.io/docs/api-reference/text-anthropic-api',
    hostOrigins: ['https://api.minimax.io'],
  },
  {
    id: 'minimax-intl-openai',
    label: 'MiniMax Token Plan · OpenAI（International）',
    group: 'aggregator',
    groupLabel: '聚合 / Token Plan',
    kind: 'openai',
    baseUrl: 'https://api.minimax.io/v1',
    defaultModel: 'MiniMax-M2.5-highspeed',
    models: [
      {
        id: 'MiniMax-M2.5-highspeed',
        label: 'MiniMax-M2.5-highspeed（推荐）',
        default: true,
      },
      { id: 'MiniMax-M3', label: 'MiniMax-M3' },
      { id: 'MiniMax-M2.7-highspeed', label: 'MiniMax-M2.7-highspeed' },
    ],
    keyHint: 'sk-cp-...',
    note: '国际站 OpenAI 兼容 /v1/chat/completions',
    docsUrl: 'https://platform.minimax.io/docs',
    hostOrigins: ['https://api.minimax.io'],
  },
  {
    id: 'stepfun-plan',
    label: '阶跃 Step Plan · Anthropic（推荐）',
    group: 'aggregator',
    groupLabel: '聚合 / Token Plan',
    // Step Plan Anthropic: POST https://api.stepfun.com/step_plan/v1/messages
    // SDK base_url = https://api.stepfun.com/step_plan
    kind: 'anthropic',
    baseUrl: 'https://api.stepfun.com/step_plan/v1',
    defaultModel: 'step-3.5-flash-2603',
    models: [
      {
        id: 'step-3.5-flash-2603',
        label: 'step-3.5-flash-2603（推荐·省 Credit）',
        default: true,
      },
      { id: 'step-3.7-flash', label: 'step-3.7-flash（旗舰多模态）' },
      { id: 'step-3.5-flash', label: 'step-3.5-flash' },
      { id: 'step-router-v1', label: 'step-router-v1（智能路由，仅 Plan）' },
    ],
    keyHint: 'Step Plan 专用 Key',
    note: 'Anthropic Messages（/step_plan/v1/messages）。与 OpenAI 档 Base URL 不同，勿混用',
    docsUrl: 'https://platform.stepfun.com/docs/zh/api-reference/chat/messages-create',
    hostOrigins: ['https://api.stepfun.com'],
  },
  {
    id: 'stepfun-plan-openai',
    label: '阶跃 Step Plan · OpenAI',
    group: 'aggregator',
    groupLabel: '聚合 / Token Plan',
    kind: 'openai',
    baseUrl: 'https://api.stepfun.com/step_plan/v1',
    defaultModel: 'step-3.5-flash-2603',
    models: [
      {
        id: 'step-3.5-flash-2603',
        label: 'step-3.5-flash-2603（推荐）',
        default: true,
      },
      { id: 'step-3.7-flash', label: 'step-3.7-flash' },
      { id: 'step-3.5-flash', label: 'step-3.5-flash' },
      { id: 'step-router-v1', label: 'step-router-v1' },
    ],
    keyHint: 'Step Plan 专用 Key',
    note: 'OpenAI 兼容 /step_plan/v1/chat/completions',
    docsUrl: 'https://platform.stepfun.com/docs/zh/step-plan/overview',
    hostOrigins: ['https://api.stepfun.com'],
  },
  {
    id: 'stepfun',
    label: '阶跃 StepFun · Anthropic（按量）',
    group: 'aggregator',
    groupLabel: '聚合 / Token Plan',
    kind: 'anthropic',
    // SDK base https://api.stepfun.com → /v1/messages
    baseUrl: 'https://api.stepfun.com/v1',
    defaultModel: 'step-3.7-flash',
    models: [
      { id: 'step-3.7-flash', label: 'step-3.7-flash（推荐）', default: true },
      { id: 'step-3.5-flash-2603', label: 'step-3.5-flash-2603' },
      { id: 'step-3.5-flash', label: 'step-3.5-flash' },
    ],
    keyHint: 'STEP_API_KEY',
    note: '按量 Anthropic · /v1/messages。订阅请用 Step Plan 档',
    docsUrl: 'https://platform.stepfun.com/docs/zh/api-reference/chat/messages-create',
    hostOrigins: ['https://api.stepfun.com'],
  },
  {
    id: 'stepfun-openai',
    label: '阶跃 StepFun · OpenAI（按量）',
    group: 'aggregator',
    groupLabel: '聚合 / Token Plan',
    kind: 'openai',
    baseUrl: 'https://api.stepfun.com/v1',
    defaultModel: 'step-3.7-flash',
    models: [
      { id: 'step-3.7-flash', label: 'step-3.7-flash（推荐）', default: true },
      { id: 'step-3.5-flash-2603', label: 'step-3.5-flash-2603' },
      { id: 'step-3.5-flash', label: 'step-3.5-flash' },
    ],
    keyHint: 'STEP_API_KEY',
    note: '按量 OpenAI · /v1/chat/completions',
    docsUrl: 'https://platform.stepfun.com/docs/zh/api-reference/chat/chat-completion-create',
    hostOrigins: ['https://api.stepfun.com'],
  },

  // ----- Other aggregators / token plans -----
  {
    id: 'openrouter',
    label: 'OpenRouter（多模型额度）',
    group: 'aggregator',
    groupLabel: '聚合 / Token Plan',
    kind: 'openai',
    // Context7: baseURL https://openrouter.ai/api/v1
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    models: [
      { id: 'openai/gpt-4o-mini', label: 'openai/gpt-4o-mini（推荐·省钱）', default: true },
      { id: 'openai/gpt-5.2', label: 'openai/gpt-5.2' },
      { id: 'google/gemini-2.0-flash-001', label: 'google/gemini-2.0-flash' },
      { id: 'deepseek/deepseek-chat', label: 'deepseek/deepseek-chat' },
      { id: 'anthropic/claude-3.5-haiku', label: 'anthropic/claude-3.5-haiku' },
      { id: 'moonshotai/kimi-k2-0905', label: 'moonshotai/kimi-k2-0905' },
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'meta-llama/llama-3.3-70b' },
      { id: 'qwen/qwen-2.5-72b-instruct', label: 'qwen/qwen-2.5-72b' },
    ],
    keyHint: 'sk-or-...',
    note: '一个 Key 换多家模型。请求会附带 OpenRouter 推荐的可选站点头',
    docsUrl: 'https://openrouter.ai/docs/quickstart',
    hostOrigins: ['https://openrouter.ai'],
  },
  {
    id: 'siliconflow',
    label: '硅基流动 SiliconFlow（国内）',
    group: 'aggregator',
    groupLabel: '聚合 / Token Plan',
    kind: 'openai',
    // Context7 CN docs: https://api.siliconflow.cn/v1
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'Qwen/Qwen2.5-7B-Instruct',
    models: [
      { id: 'Qwen/Qwen2.5-7B-Instruct', label: 'Qwen2.5-7B（推荐·便宜）', default: true },
      { id: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen2.5-72B' },
      { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek-V3' },
      { id: 'Pro/deepseek-ai/DeepSeek-R1', label: 'DeepSeek-R1（Pro）' },
      { id: 'THUDM/glm-4-9b-chat', label: 'GLM-4-9B' },
    ],
    keyHint: 'sk-...',
    note: '国内域名 api.siliconflow.cn；国际站见下一档',
    docsUrl: 'https://docs.siliconflow.cn',
    hostOrigins: ['https://api.siliconflow.cn'],
  },
  {
    id: 'siliconflow-intl',
    label: 'SiliconFlow International',
    group: 'aggregator',
    groupLabel: '聚合 / Token Plan',
    kind: 'openai',
    // Context7 EN docs: https://api.siliconflow.com/v1
    baseUrl: 'https://api.siliconflow.com/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    models: [
      { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek-V3（推荐）', default: true },
      { id: 'Qwen/Qwen2.5-7B-Instruct', label: 'Qwen2.5-7B' },
      { id: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen2.5-72B' },
    ],
    keyHint: 'sk-...',
    note: '国际文档域名 api.siliconflow.com',
    docsUrl: 'https://docs.siliconflow.com',
    hostOrigins: ['https://api.siliconflow.com'],
  },
  {
    id: 'aihubmix',
    label: 'AiHubMix（中转 / 额度包）',
    group: 'aggregator',
    groupLabel: '聚合 / Token Plan',
    kind: 'openai',
    baseUrl: 'https://aihubmix.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o-mini', label: 'gpt-4o-mini（推荐）', default: true },
      { id: 'gpt-4o', label: 'gpt-4o' },
      { id: 'claude-3-5-haiku-latest', label: 'claude-3.5-haiku' },
      { id: 'deepseek-chat', label: 'deepseek-chat' },
      { id: 'gemini-2.0-flash', label: 'gemini-2.0-flash' },
    ],
    keyHint: 'sk-...',
    note: '常见 GPT/Claude 中转与额度包，OpenAI 兼容',
    docsUrl: 'https://aihubmix.com',
    hostOrigins: ['https://aihubmix.com'],
  },
  {
    id: 'api302',
    label: '302.AI（聚合额度）',
    group: 'aggregator',
    groupLabel: '聚合 / Token Plan',
    kind: 'openai',
    baseUrl: 'https://api.302.ai/v1',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o-mini', label: 'gpt-4o-mini（推荐）', default: true },
      { id: 'gpt-4o', label: 'gpt-4o' },
      { id: 'deepseek-chat', label: 'deepseek-chat' },
      { id: 'claude-3-5-haiku-latest', label: 'claude-3.5-haiku' },
      { id: 'gemini-2.0-flash', label: 'gemini-2.0-flash' },
    ],
    keyHint: 'sk-...',
    note: '多模型聚合与按量/套餐额度',
    docsUrl: 'https://302.ai',
    hostOrigins: ['https://api.302.ai'],
  },
  {
    id: 'api2d',
    label: 'API2D（中转）',
    group: 'aggregator',
    groupLabel: '聚合 / Token Plan',
    kind: 'openai',
    baseUrl: 'https://oa.api2d.net/v1',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o-mini', label: 'gpt-4o-mini（推荐）', default: true },
      { id: 'gpt-4o', label: 'gpt-4o' },
      { id: 'gpt-3.5-turbo', label: 'gpt-3.5-turbo' },
    ],
    keyHint: 'fk...',
    note: '老牌 OpenAI 中转，Key 多为 fk 开头',
    docsUrl: 'https://api2d.com',
    hostOrigins: ['https://oa.api2d.net'],
  },
  {
    id: 'closeai',
    label: 'CloseAI（中转）',
    group: 'aggregator',
    groupLabel: '聚合 / Token Plan',
    kind: 'openai',
    baseUrl: 'https://api.openai-proxy.org/v1',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o-mini', label: 'gpt-4o-mini（推荐）', default: true },
      { id: 'gpt-4o', label: 'gpt-4o' },
      { id: 'gpt-3.5-turbo', label: 'gpt-3.5-turbo' },
    ],
    keyHint: 'sk-...',
    note: '若域名有变更，可在高级选项里改 Base URL',
    docsUrl: 'https://closeai-asia.com',
    hostOrigins: ['https://api.openai-proxy.org'],
  },
  {
    id: 'together',
    label: 'Together AI',
    group: 'aggregator',
    groupLabel: '聚合 / Token Plan',
    kind: 'openai',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
    models: [
      {
        id: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
        label: 'Llama-3.1-8B-Turbo（推荐）',
        default: true,
      },
      {
        id: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
        label: 'Llama-3.1-70B-Turbo',
      },
      { id: 'Qwen/Qwen2.5-7B-Instruct-Turbo', label: 'Qwen2.5-7B-Turbo' },
    ],
    keyHint: '...',
    note: '海外开源模型聚合，按量计费',
    docsUrl: 'https://api.together.xyz',
    hostOrigins: ['https://api.together.xyz'],
  },
  {
    id: 'fireworks',
    label: 'Fireworks',
    group: 'aggregator',
    groupLabel: '聚合 / Token Plan',
    kind: 'openai',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    defaultModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
    models: [
      {
        id: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
        label: 'Llama-3.3-70B（推荐）',
        default: true,
      },
      {
        id: 'accounts/fireworks/models/qwen2p5-72b-instruct',
        label: 'Qwen2.5-72B',
      },
    ],
    keyHint: '...',
    note: '高速开源模型托管',
    docsUrl: 'https://fireworks.ai',
    hostOrigins: ['https://api.fireworks.ai'],
  },
  {
    id: 'oneapi',
    label: 'One API / New API（自建中转）',
    group: 'aggregator',
    groupLabel: '聚合 / Token Plan',
    kind: 'openai',
    baseUrl: 'http://localhost:3000/v1',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o-mini', label: 'gpt-4o-mini（按你站内模型名改）', default: true },
      { id: 'gpt-4o', label: 'gpt-4o' },
      { id: 'deepseek-chat', label: 'deepseek-chat' },
      { id: 'claude-3-5-haiku', label: 'claude-3-5-haiku' },
    ],
    keyHint: 'sk-...',
    note: '自建 / 团队 OneAPI·NewAPI·壳站。请在高级选项改成你的域名 /v1',
    docsUrl: 'https://github.com/songquanpeng/one-api',
    hostOrigins: [],
  },

  // ----- Professional translation -----
  {
    id: 'deepl-free',
    label: 'DeepL Free',
    group: 'translate',
    groupLabel: '专业翻译',
    kind: 'deepl',
    // Context7: Free host https://api-free.deepl.com ; Auth DeepL-Auth-Key
    deeplEndpoint: 'free',
    defaultModel: '',
    models: [],
    keyHint: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx',
    note: 'POST /v2/translate · Host api-free.deepl.com · Header DeepL-Auth-Key',
    docsUrl: 'https://developers.deepl.com/docs',
    hostOrigins: ['https://api-free.deepl.com'],
  },
  {
    id: 'deepl-pro',
    label: 'DeepL Pro',
    group: 'translate',
    groupLabel: '专业翻译',
    kind: 'deepl',
    // Context7: Pro host https://api.deepl.com
    deeplEndpoint: 'pro',
    defaultModel: '',
    models: [],
    keyHint: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    note: 'POST /v2/translate · Host api.deepl.com · Header DeepL-Auth-Key',
    docsUrl: 'https://developers.deepl.com/docs',
    hostOrigins: ['https://api.deepl.com'],
  },

  // ----- Custom -----
  {
    id: 'custom',
    label: '自定义 OpenAI 兼容',
    group: 'custom',
    groupLabel: '自定义',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o-mini', label: 'gpt-4o-mini', default: true },
      { id: 'deepseek-chat', label: 'deepseek-chat' },
      { id: 'gpt-4o', label: 'gpt-4o' },
    ],
    keyHint: 'sk-... 或你的中转 Key',
    note: '任意 Token Plan / 壳站：填 Base URL（以 /v1 结尾）和模型名即可',
    hostOrigins: [],
  },
];

// Default for this project owner: MiniMax Token Plan (CN)
export const DEFAULT_PRESET_ID = 'minimax';

const PRESET_MAP = new Map(TRANSLATE_PRESETS.map((p) => [p.id, p]));

export function getTranslatePreset(presetId) {
  return PRESET_MAP.get(presetId) || PRESET_MAP.get(DEFAULT_PRESET_ID);
}

export function listTranslatePresets() {
  return TRANSLATE_PRESETS.slice();
}

/** Group presets for <select> optgroup rendering */
export function groupTranslatePresets() {
  /** @type {Map<string, { group: string, groupLabel: string, items: TranslatePreset[] }>} */
  const groups = new Map();
  for (const p of TRANSLATE_PRESETS) {
    if (!groups.has(p.group)) {
      groups.set(p.group, {
        group: p.group,
        groupLabel: p.groupLabel,
        items: [],
      });
    }
    groups.get(p.group).items.push(p);
  }
  return Array.from(groups.values());
}

export function getPresetDefaultModel(preset) {
  if (!preset) return '';
  const marked = preset.models?.find((m) => m.default);
  return marked?.id || preset.defaultModel || preset.models?.[0]?.id || '';
}

/**
 * Infer preset from legacy settings (provider + baseUrl) for upgrades.
 */
export function inferPresetIdFromLegacy(raw) {
  if (!raw || typeof raw !== 'object') return DEFAULT_PRESET_ID;
  if (raw.presetId && PRESET_MAP.has(raw.presetId)) return raw.presetId;

  if (raw.provider === 'deepl') {
    return raw.deeplEndpoint === 'pro' ? 'deepl-pro' : 'deepl-free';
  }

  const base = String(raw.baseUrl || '')
    .trim()
    .replace(/\/+$/, '')
    .toLowerCase();

  if (!base) return DEFAULT_PRESET_ID;

  // Prefer exact / longest baseUrl match across openai + anthropic presets
  let bestId = null;
  let bestLen = -1;
  for (const p of TRANSLATE_PRESETS) {
    if (p.kind === 'deepl' || !p.baseUrl) continue;
    const pb = p.baseUrl.replace(/\/+$/, '').toLowerCase();
    if (base === pb || base.startsWith(pb) || pb.startsWith(base)) {
      if (pb.length > bestLen) {
        bestLen = pb.length;
        bestId = p.id;
      }
    }
  }
  if (bestId) return bestId;

  // Legacy MiniMax host still seen in older docs / clients
  if (base.includes('/anthropic') && base.includes('api.minimaxi.com')) {
    return 'minimax';
  }
  if (base.includes('/anthropic') && base.includes('api.minimax.io')) {
    return 'minimax-intl';
  }
  if (base.includes('api.minimax.chat') || base.includes('api.minimaxi.com')) {
    return base.includes('/v1') && !base.includes('anthropic')
      ? 'minimax-openai'
      : 'minimax';
  }
  if (base.includes('api.minimax.io')) {
    return base.includes('/v1') && !base.includes('anthropic')
      ? 'minimax-intl-openai'
      : 'minimax-intl';
  }
  // StepFun Step Plan uses /step_plan ; paygo uses plain host
  if (base.includes('api.stepfun.com/step_plan')) {
    return 'stepfun-plan';
  }
  if (base.includes('api.stepfun.com')) {
    return 'stepfun';
  }

  // Unknown base URL → custom, keep their values
  return 'custom';
}

/**
 * Resolve effective endpoint fields from saved settings + preset catalog.
 */
export function resolveTranslateEndpoint(settings) {
  const presetId = settings?.presetId || DEFAULT_PRESET_ID;
  const preset = getTranslatePreset(presetId);
  const isCustom = preset.id === 'custom' || settings?.useCustomEndpoint;

  let baseUrl = String(settings?.baseUrl || '').trim().replace(/\/+$/, '');
  let model = String(settings?.model || '').trim();

  if (preset.kind === 'deepl') {
    return {
      presetId: preset.id,
      kind: 'deepl',
      provider: 'deepl',
      baseUrl: '',
      model: '',
      deeplEndpoint: preset.deeplEndpoint || 'free',
      preset,
    };
  }

  if (!isCustom || !baseUrl) {
    baseUrl = (preset.baseUrl || '').replace(/\/+$/, '');
  }
  if (!model) {
    model = getPresetDefaultModel(preset);
  }

  const kind = preset.kind === 'anthropic' ? 'anthropic' : 'openai';
  return {
    presetId: preset.id,
    kind,
    provider: kind,
    baseUrl,
    model,
    deeplEndpoint: 'free',
    preset,
  };
}

/** Build Anthropic Messages URL from a preset baseUrl. */
export function buildAnthropicMessagesUrl(baseUrl) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (!base) return '';
  if (base.endsWith('/messages')) return base;
  if (base.endsWith('/v1')) return `${base}/messages`;
  // e.g. https://api.minimaxi.com/anthropic or https://api.stepfun.com/step_plan
  return `${base}/v1/messages`;
}

/** Collect host origins for manifest / permission requests */
export function collectPresetHostPatterns() {
  const set = new Set();
  for (const p of TRANSLATE_PRESETS) {
    for (const origin of p.hostOrigins || []) {
      set.add(`${origin}/*`);
    }
  }
  return Array.from(set);
}
