import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { GoogleGenAI, Type, Schema, HarmCategory, HarmBlockThreshold } from "@google/genai";

// --- Types & Interfaces ---

interface Discipline {
  id: string;
  code: string;
  rank: number; // 1 (Hardest) to 6 (Easiest)
  nameKey: string;
  descKey: string;
  keywordsKey: string;
}

interface WorkItem {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  currency?: string;
  unit: string;
  source: string;
  score: number; // 0 to 1
  status: "pending" | "accepted" | "rejected";
}

interface Scenario {
  id: string;
  matrixKey: string; // format: "rowId:colId"
  name: string;
  description: string;
  works: ScenarioWork[];
}

interface ScenarioWork {
  workId: string;
  quantity: number;
  active: boolean;
}

interface LogEntry {
  id: string;
  timestamp: number;
  action: string;
  status: "success" | "error";
  details: string;
  tokensUsed: number;
}

interface AppSettings {
  model: string;
  language: "en" | "ru";
  apiUrl: string;
  apiKey: string;
  enableAutomation: boolean;
}

interface LoadingState {
    step: string;
    progress: number;
}

interface BulkStatus {
    active: boolean;
    type: 'load' | 'gen' | 'match';
    total: number;
    current: number;
    label: string;
}

// --- Constants & Translations ---

const TRANSLATIONS = {
  en: {
    appTitle: "Collision Cost MVP",
    tabs: { collision: "Collision", cost: "Cost", settings: "Settings", logs: "Logs" },
    collisionControls: "Collision Matrix Controls",
    placeholderUrl: "Pricing Source URL (e.g. ferrum-price.com)...",
    btnLoad: "Load Works",
    btnLoading: "Loading",
    minScope: "Min Scope",
    btnAutoAccept: "Auto Accept",
    selected: "Selected",
    btnGenerate: "Generate Scenarios (LLM)",
    btnThinking: "Generating",
    rankMatrix: "Rank Matrix",
    toggleDrawer: "Click row header to toggle drawer",
    costMatrix: "Cost Matrix",
    toggleDetail: "Click cell to toggle detail panel",
    worksPanel: "Works",
    showPanel: "Show Panel",
    hide: "Hide",
    table: {
      name: "Name",
      price: "Price",
      unit: "Unit",
      source: "Source",
      score: "Score",
      status: "Status",
      action: "Action",
      totalCost: "Total Cost"
    },
    noWorks: "No works loaded. Enter URL and click Load.",
    scenarios: "Scenarios",
    noScenarios: "No scenarios generated. Click \"Generate Scenarios\" above.",
    generatingScenarios: "Generating scenarios from LLM...",
    scenarioName: "Scenario Name",
    description: "Description",
    addManual: "-- Select work to add manually --",
    btnAdd: "Add",
    btnAutoSuggest: "Auto-Suggest (LLM)",
    btnMatching: "Matching...",
    noWorksAdded: "No works added yet.",
    noWorksAddedHint: "Use the dropdown above to add works manually or click \"Auto-Suggest\" to let AI find suitable works.",
    selectScenario: "Select a scenario to view and edit details",
    settingsTitle: "Settings",
    apiKeyLabel: "API Key",
    apiKeyHint: "Leave empty to use the default environment key.",
    modelLabel: "Model",
    apiUrlLabel: "API Endpoint URL",
    languageLabel: "Language",
    dataMgmt: "Data Management (Persistence)",
    dataMgmtHint: "Data is automatically saved to your browser's LocalStorage. To save to a file (e.g., for GitHub repo sync), export the database as JSON.",
    btnExport: "Download DB (.json)",
    btnImport: "Import DB (.json)",
    btnReset: "Reset / Clear Data",
    systemStatus: "System Status",
    apiConfigured: "API Configured",
    storageActive: "LocalStorage Active",
    logsTitle: "Request Logs",
    totalTokens: "Total Tokens",
    noLogs: "No logs yet.",
    automationLabel: "Enable Full Automation",
    automationHint: "Enables bulk operations buttons. Use with caution (consumes many tokens).",
    btnBulkLoad: "Load All (Auto)",
    btnBulkGen: "Generate All Scenarios (Auto)",
    btnBulkMatch: "Match All Scenarios (Auto)",
    bulkLoadConfirm: "This will iterate through ALL categories and load works. It may consume a lot of tokens and time. Continue?",
    bulkGenConfirm: "This will generate scenarios for ALL matrix cells. Continue?",
    bulkMatchConfirm: "This will attempt to match works for ALL scenarios that have no works assigned. Continue?",
    steps: {
        parsing: "Parsing Page...",
        classifying: "Classifying...",
        analyzing: "Generating scenarios from LLM...",
        finalizing: "Finalizing...",
        generating: "Generating scenarios...",
        matching: "Matching Works..."
    },
    disciplines: {
        AR_WALLS_NAME: "Walls", AR_WALLS_DESC: "Architectural walls, partitions",
        AR_WALLS_KW: "brick, block, drywall, plaster, paint, dismantling, partition",
        
        AR_DOORS_NAME: "Doors / Windows", AR_DOORS_DESC: "Door and window openings",
        AR_DOORS_KW: "door, window, jam, installation, dismantling, opening",

        KR_WALLS_NAME: "Walls", KR_WALLS_DESC: "Load-bearing walls (Monolith)",
        KR_WALLS_KW: "concrete, monolith, reinforcement, drilling, diamond cutting, opening, hole",

        KR_COLS_NAME: "Columns / Pylons", KR_COLS_DESC: "Load-bearing columns",
        KR_COLS_KW: "concrete, monolith, column, pylon, drilling, diamond cutting, reinforcement, hole",

        KR_SLABS_NAME: "Slabs / Ramps", KR_SLABS_DESC: "Floor slabs",
        KR_SLABS_KW: "concrete, slab, floor, ceiling, drilling, cutting, opening",

        KR_BEAMS_NAME: "Beams", KR_BEAMS_DESC: "Load-bearing beams",
        KR_BEAMS_KW: "concrete, beam, drilling, cutting, reinforcement",

        VK_K_NAME: "Pipes / Drainage", VK_K_DESC: "Sewage and storm drainage",
        VK_K_KW: "pipe, drainage, sewage, plastic, installation, dismantling",

        VK_V_NAME: "Pipes", VK_V_DESC: "Water supply (Pressure)",
        VK_V_KW: "pipe, water supply, steel, polypropylene, installation, valve",

        OV_VENT_NAME: "Ducts", OV_VENT_DESC: "Ventilation ducts",
        OV_VENT_KW: "duct, ventilation, tin, installation, dismantling, diffusers",

        OV_HEAT_NAME: "Pipes", OV_HEAT_DESC: "Heating pipes",
        OV_HEAT_KW: "radiator, pipe, heating, welding, installation",

        AUPT_PIPE_NAME: "Pipes", AUPT_PIPE_DESC: "Fire extinguishing pipes",
        AUPT_PIPE_KW: "pipe, fire, steel, welding, painting",

        AUPT_SPR_NAME: "Sprinklers", AUPT_SPR_DESC: "Sprinkler heads",
        AUPT_SPR_KW: "sprinkler, head, fire",

        EOM_NAME: "Trays / Cables", EOM_DESC: "Cable trays, low voltage",
        EOM_KW: "tray, cable, wire, socket, switch, installation"
    }
  },
  ru: {
    appTitle: "Collision Cost MVP",
    tabs: { collision: "Коллизии", cost: "Стоимость", settings: "Настройки", logs: "Логи" },
    collisionControls: "Управление матрицей коллизий",
    placeholderUrl: "URL источника цен (например, ferrum-price.com)...",
    btnLoad: "Загрузить работы",
    btnLoading: "Загрузка",
    minScope: "Мин. порог",
    btnAutoAccept: "Авто-принятие",
    selected: "Выбрано",
    btnGenerate: "Сгенерировать сценарии (LLM)",
    btnThinking: "Генерация",
    rankMatrix: "Матрица Рангов",
    toggleDrawer: "Нажмите на заголовок строки, чтобы открыть панель",
    costMatrix: "Матрица Стоимости",
    toggleDetail: "Нажмите на ячейку, чтобы открыть детали",
    worksPanel: "Работы",
    showPanel: "Показать панель",
    hide: "Скрыть",
    table: {
      name: "Наименование",
      price: "Цена",
      unit: "Ед.изм.",
      source: "Источник",
      score: "Оценка",
      status: "Статус",
      action: "Действие",
      totalCost: "Общая стоимость"
    },
    noWorks: "Работы не загружены. Введите URL и нажмите Загрузить.",
    scenarios: "Сценарии",
    noScenarios: "Сценарии не сгенерированы. Нажмите \"Сгенерировать сценарии\" выше.",
    generatingScenarios: "Идет генерация сценариев...",
    scenarioName: "Название сценария",
    description: "Описание",
    addManual: "-- Выберите работу для добавления вручную --",
    btnAdd: "Добавить",
    btnAutoSuggest: "Авто-подбор (LLM)",
    btnMatching: "Подбор...",
    noWorksAdded: "Работы еще не добавлены.",
    noWorksAddedHint: "Используйте выпадающий список выше для ручного добавления или нажмите \"Авто-подбор\".",
    selectScenario: "Выберите сценарий для просмотра и редактирования",
    settingsTitle: "Настройки",
    apiKeyLabel: "API Ключ",
    apiKeyHint: "Оставьте пустым, чтобы использовать системный ключ по умолчанию.",
    modelLabel: "Модель",
    apiUrlLabel: "URL точки входа API",
    languageLabel: "Язык",
    dataMgmt: "Управление данными",
    dataMgmtHint: "Данные автоматически сохраняются в LocalStorage браузера. Для сохранения в файл (например, для Git) экспортируйте БД в JSON.",
    btnExport: "Скачать БД (.json)",
    btnImport: "Импортировать БД (.json)",
    btnReset: "Сбросить / Очистить данные",
    systemStatus: "Статус системы",
    apiConfigured: "API Настроен",
    storageActive: "LocalStorage Активен",
    logsTitle: "Логи запросов",
    totalTokens: "Всего токенов",
    noLogs: "Логов пока нет.",
    automationLabel: "Включить полную автоматизацию",
    automationHint: "Разрешает кнопки массовых операций. Осторожно: большой расход токенов.",
    btnBulkLoad: "Загрузить всё (Авто)",
    btnBulkGen: "Сгенер. всё (Авто)",
    btnBulkMatch: "Подбор всех (Авто)",
    bulkLoadConfirm: "Это запустит загрузку работ для ВСЕХ категорий по очереди. Это может занять время и потратить много токенов. Продолжить?",
    bulkGenConfirm: "Это запустит генерацию сценариев для ВСЕХ ячеек матрицы. Продолжить?",
    bulkMatchConfirm: "Это запустит подбор работ для ВСЕХ сценариев, где работы еще не назначены. Продолжить?",
    steps: {
        parsing: "Парсинг страницы...",
        classifying: "Классификация...",
        analyzing: "Генерация сценариев...",
        finalizing: "Завершение...",
        generating: "Генерация сценариев...",
        matching: "Подбор работ..."
    },
    disciplines: {
        AR_WALLS_NAME: "Стены", AR_WALLS_DESC: "Архитектурные стены, перегородки",
        AR_WALLS_KW: "кирпич, блок, гипсокартон, штукатурка, покраска, демонтаж, перегородка",

        AR_DOORS_NAME: "Двери / Окна", AR_DOORS_DESC: "Дверные и оконные проемы",
        AR_DOORS_KW: "дверь, окно, косяк, монтаж, демонтаж, проем",

        KR_WALLS_NAME: "Стены", KR_WALLS_DESC: "Несущие стены (Монолит)",
        KR_WALLS_KW: "бетон, монолит, арматура, бурение, алмазная резка, проем, отверстие",

        KR_COLS_NAME: "Колонны / Пилоны", KR_COLS_DESC: "Несущие колонны и пилоны",
        KR_COLS_KW: "бетон, монолит, колонна, пилон, бурение, алмазная резка, арматура, отверстие, восстановление",

        KR_SLABS_NAME: "Перекрытия / Покрытия / Рампы", KR_SLABS_DESC: "Плиты перекрытия",
        KR_SLABS_KW: "бетон, перекрытие, плита, бурение, резка, отверстие, монолит",

        KR_BEAMS_NAME: "Балки", KR_BEAMS_DESC: "Несущие балки",
        KR_BEAMS_KW: "бетон, балка, ригель, бурение, резка, арматура",

        VK_K_NAME: "Трубы / Дренаж", VK_K_DESC: "Бытовая и ливневая канализация",
        VK_K_KW: "труба, канализация, дренаж, пластик, монтаж, демонтаж",

        VK_V_NAME: "Трубы", VK_V_DESC: "Водоснабжение (напорное)",
        VK_V_KW: "труба, водоснабжение, сталь, полипропилен, монтаж, кран",

        OV_VENT_NAME: "Воздуховод", OV_VENT_DESC: "Вентиляционные короба",
        OV_VENT_KW: "воздуховод, вентиляция, жесть, монтаж, демонтаж, диффузор",

        OV_HEAT_NAME: "Трубы", OV_HEAT_DESC: "Трубы отопления",
        OV_HEAT_KW: "радиатор, труба, отопление, сварка, монтаж",

        AUPT_PIPE_NAME: "Трубы", AUPT_PIPE_DESC: "Трубопроводы пожаротушения",
        AUPT_PIPE_KW: "труба, пожаротушение, сталь, сварка, покраска",

        AUPT_SPR_NAME: "Спринклеры", AUPT_SPR_DESC: "Спринклерные оросители",
        AUPT_SPR_KW: "спринклер, ороситель, пожаротушение",

        EOM_NAME: "Кабельканалы / Лотки", EOM_DESC: "Лотки, кабели, слаботочка",
        EOM_KW: "лоток, кабель, провод, розетка, выключатель, монтаж"
    }
  }
};

const DISCIPLINES: Discipline[] = [
  { id: "AR_WALLS", code: "АР", rank: 2, nameKey: "AR_WALLS_NAME", descKey: "AR_WALLS_DESC", keywordsKey: "AR_WALLS_KW" },
  { id: "AR_DOORS", code: "АР", rank: 2, nameKey: "AR_DOORS_NAME", descKey: "AR_DOORS_DESC", keywordsKey: "AR_DOORS_KW" },
  { id: "KR_WALLS", code: "КР", rank: 1, nameKey: "KR_WALLS_NAME", descKey: "KR_WALLS_DESC", keywordsKey: "KR_WALLS_KW" },
  { id: "KR_COLS", code: "КР", rank: 1, nameKey: "KR_COLS_NAME", descKey: "KR_COLS_DESC", keywordsKey: "KR_COLS_KW" },
  { id: "KR_SLABS", code: "КР", rank: 1, nameKey: "KR_SLABS_NAME", descKey: "KR_SLABS_DESC", keywordsKey: "KR_SLABS_KW" },
  { id: "KR_BEAMS", code: "КР", rank: 1, nameKey: "KR_BEAMS_NAME", descKey: "KR_BEAMS_DESC", keywordsKey: "KR_BEAMS_KW" },
  { id: "VK_K", code: "ВК (К)", rank: 3, nameKey: "VK_K_NAME", descKey: "VK_K_DESC", keywordsKey: "VK_K_KW" },
  { id: "VK_V", code: "ВК (В)", rank: 5, nameKey: "VK_V_NAME", descKey: "VK_V_DESC", keywordsKey: "VK_V_KW" },
  { id: "OV_VENT", code: "ОВ (Вент.)", rank: 4, nameKey: "OV_VENT_NAME", descKey: "OV_VENT_DESC", keywordsKey: "OV_VENT_KW" },
  { id: "OV_HEAT", code: "ОВ (Отоп.)", rank: 5, nameKey: "OV_HEAT_NAME", descKey: "OV_HEAT_DESC", keywordsKey: "OV_HEAT_KW" },
  { id: "AUPT_PIPE", code: "АУПТ", rank: 5, nameKey: "AUPT_PIPE_NAME", descKey: "AUPT_PIPE_DESC", keywordsKey: "AUPT_PIPE_KW" },
  { id: "AUPT_SPR", code: "АУПТ", rank: 5, nameKey: "AUPT_SPR_NAME", descKey: "AUPT_SPR_DESC", keywordsKey: "AUPT_SPR_KW" },
  { id: "EOM", code: "ЭО, ЭС, ЭМ, СС", rank: 6, nameKey: "EOM_NAME", descKey: "EOM_DESC", keywordsKey: "EOM_KW" },
];

// --- Helpers ---

const generateId = () => Math.random().toString(36).substr(2, 9);

const cleanJson = (text: string | undefined) => {
  if (!text) return "{}";
  let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  
  let start = 0;
  if (firstBrace === -1 && firstBracket === -1) {
      return "{}";
  } else if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      start = firstBrace;
  } else {
      start = firstBracket;
  }
  
  return cleaned.substring(start);
};

const safeParseJSON = (text: string) => {
  const cleaned = cleanJson(text);
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    if (cleaned.trim().startsWith('[') && !cleaned.trim().endsWith(']')) {
         try {
             const lastCloseObj = cleaned.lastIndexOf('}');
             if (lastCloseObj > 0) {
                 const salvaged = cleaned.substring(0, lastCloseObj + 1) + ']';
                 console.warn("Recovered truncated JSON array.");
                 return JSON.parse(salvaged);
             }
         } catch (e2) {}
    }
    return null;
  }
};

const getDisciplineStyle = (d: Discipline) => {
  if (d.code.startsWith("ВК")) return { bg: "#e0f2fe", text: "#0369a1" };
  if (d.code.startsWith("ОВ")) return { bg: "#ffedd5", text: "#c2410c" };

  switch(d.rank) {
    case 1: return { bg: "var(--rank-1)", text: "var(--rank-1-text)" };
    case 2: return { bg: "var(--rank-2)", text: "var(--rank-2-text)" };
    case 3: return { bg: "var(--rank-3)", text: "var(--rank-3-text)" };
    case 4: return { bg: "var(--rank-4)", text: "var(--rank-4-text)" };
    case 5: return { bg: "var(--rank-5)", text: "var(--rank-5-text)" };
    case 6: return { bg: "var(--rank-6)", text: "var(--rank-6-text)" };
    default: return { bg: "#fff", text: "#000" };
  }
};

const getCurrencySymbol = (lang: string) => lang === 'ru' ? '₽' : '$';

const getDisplayCurrency = (w: WorkItem | Partial<WorkItem> | undefined, lang: string) => {
  const defaultSymbol = getCurrencySymbol(lang);
  if (!w || !w.currency) return defaultSymbol;
  const c = w.currency.toUpperCase().trim();
  if (['RUB', 'RUR', 'РУБ', '₽', 'USD', 'DOLLAR', '$'].includes(c)) return defaultSymbol;
  return w.currency;
};

const formatCompactNumber = (num: number) => {
  if (num === 0) return "0";
  if (!num) return "-";
  return new Intl.NumberFormat('en-US', {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(num);
};

// --- LLM Service ---

class LLMService {
  private ai: GoogleGenAI;
  private modelName: string = "gemini-2.5-flash";
  private apiUrl: string = "";
  private apiKey: string = "";

  constructor() {
    // Initialize with a placeholder if key is missing to prevent startup crash
    this.apiKey = process.env.API_KEY || "PENDING";
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
  }

  updateConfig(settings: AppSettings) {
      this.modelName = settings.model || "gemini-2.5-flash";
      this.apiKey = settings.apiKey || process.env.API_KEY || "PENDING";
      this.apiUrl = settings.apiUrl || "";
      this.ai = new GoogleGenAI({ apiKey: this.apiKey });
  }

  private async generateOpenAICompatible(params: any, retries = 3): Promise<{ rawText: string, response: any, status: number }> {
      const messages = [];
      // Handle system instruction if present
      if (params.config?.systemInstruction) {
          messages.push({ role: "system", content: params.config.systemInstruction });
      }
      // Add user content
      messages.push({ role: "user", content: params.contents });

      const body: any = {
          model: this.modelName,
          messages: messages,
          stream: false
      };

      // Handle JSON mode if requested
      if (params.config?.responseMimeType === "application/json") {
          body.response_format = { type: "json_object" };
      }
      
      if (params.config?.maxOutputTokens) {
          body.max_tokens = params.config.maxOutputTokens;
      }

      let lastError;
      for (let attempt = 0; attempt < retries; attempt++) {
          try {
              const response = await fetch(this.apiUrl, {
                  method: "POST",
                  headers: {
                      "Content-Type": "application/json",
                      "Authorization": `Bearer ${this.apiKey}`
                  },
                  body: JSON.stringify(body)
              });

              if (!response.ok) {
                  const errorText = await response.text();
                  throw new Error(`API Error ${response.status}: ${errorText}`);
              }

              const data = await response.json();
              const rawText = data.choices?.[0]?.message?.content || "";
              
              if (!rawText) throw new Error("Empty response from LLM");

              return { rawText, response: data, status: response.status };

          } catch (e: any) {
             lastError = e;
             const status = e.status || 500; 
             const isRetryable = status === 429 || status >= 500 || (e.message && (e.message.includes("Empty response") || e.message.includes("Generation stopped")));
            
             if (!isRetryable && attempt === 0) throw e; 
             if (attempt === retries - 1) throw e;
             
             await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
          }
      }
      throw lastError || new Error("Failed to generate content after retries");
  }

  private async safeGenerate(params: any, retries = 3): Promise<{ rawText: string, response: any, status: number }> {
      if (this.apiKey === "PENDING" || !this.apiKey) {
           throw new Error("API Key is not set. Please configure it in Settings.");
      }

      // Check if custom API (Mistral/OpenAI) is configured
      // We use custom logic if apiUrl is set and NOT pointing to googleapis.com
      if (this.apiUrl && !this.apiUrl.includes("googleapis.com")) {
          return this.generateOpenAICompatible(params, retries);
      }

      let lastError;
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const response = await this.ai.models.generateContent(params);
            let rawText = response.text || "";
            
            if (!rawText && response.candidates && response.candidates.length > 0) {
                const candidate = response.candidates[0];
                if (candidate.finishReason && candidate.finishReason !== 'STOP') {
                    // Try to extract text even if stopped for other reasons
                    if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0 && candidate.content.parts[0].text) {
                        rawText = candidate.content.parts[0].text;
                    } else {
                        // If completely empty, treat as retry-able error if possible, but finishReason might indicate blockage
                        throw new Error(`Generation stopped: ${candidate.finishReason}`);
                    }
                }
            }
            if (!rawText) throw new Error("Empty response from LLM");

            return { rawText, response, status: 200 };
        } catch (e: any) {
            lastError = e;
            // Retry logic
            const status = e.status || e.response?.status || e.statusCode;
            const isRetryable = status === 429 || status >= 500 || e.message.includes("Empty response") || e.message.includes("Generation stopped");
            
            if (!isRetryable && attempt === 0) throw e; 
            if (attempt === retries - 1) throw e;
            
            // Exponential backoff: 1s, 2s, 4s
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        }
      }
      throw lastError || new Error("Failed to generate content after retries");
  }

  async parseWorks(url: string, targetDiscipline: {code: string, name: string, description: string, keywords: string}, lang: 'en' | 'ru'): Promise<{ works: any[], tokens: number, status: number }> {
    const langPrompt = lang === 'ru' ? "Output ONLY in Russian language. Default currency to 'RUB' (₽) if ambiguous." : "Output ONLY in English language. Default currency to 'USD' ($).";
    
    const prompt = `
      Act as a construction cost estimator. 
      Target URL context: ${url}
      
      Task: Extract exactly 20 construction work items from the context that are MOST RELEVANT to the following discipline:
      Code: ${targetDiscipline.code}
      Name: ${targetDiscipline.name}
      Description: ${targetDiscipline.description}
      Keywords: ${targetDiscipline.keywords}
      
      IMPORTANT: 
      1. Prioritize works that match the Keywords.
      2. If specific works are not found, include general construction works.
      3. Do NOT include the full HTML.
      4. Return ONLY valid JSON.
      5. Extract the currency symbol or code if visible.
      
      ${langPrompt}
      
      Return JSON:
      {
        "items": [
          { "name": "Drilling D50mm", "price": 1500, "currency": "RUB", "unit": "pcs" }
        ]
      }
    `;

    const { rawText, response, status } = await this.safeGenerate({
      model: this.modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 8000, 
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                items: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            price: { type: Type.NUMBER },
                            currency: { type: Type.STRING, description: "Currency symbol or code (e.g. $, ₽, RUB, USD)" },
                            unit: { type: Type.STRING }
                        }
                    }
                }
            }
        }
      }
    });

    const result = safeParseJSON(rawText);
    if (!result || !result.items) {
        throw new Error(`Parsing failed. Raw Response:\n${rawText}`);
    }

    return { 
      works: result.items || [], 
      tokens: response.usageMetadata?.totalTokenCount || 0,
      status
    };
  }

  async classifyWorks(works: any[], categoryId: string, disciplineDesc: string, keywords: string): Promise<{ classified: any[], tokens: number, status: number }> {
    const prompt = `
      You are an expert construction engineer specializing in BIM and collision resolution.
      
      Task: Evaluate relevance of construction works for resolving collisions in the Target Category.
      
      Target Category: ${categoryId}
      Category Description: ${disciplineDesc}
      Key Related Terms: ${keywords}
      
      Scoring Rules:
      1. High Score (0.8 - 1.0): Work explicitly mentions materials or methods specific to this category (e.g. "Concrete drilling" for Monolith/KR). 
      2. Medium Score (0.5 - 0.7): General construction works plausible for this category.
      3. Low Score (0.0 - 0.2): Unrelated works.
      
      Works Input: ${JSON.stringify(works.map(w => w.name))}
      
      Return JSON array of objects with 'name' and 'score'.
    `;

     const { rawText, response, status } = await this.safeGenerate({
      model: this.modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 4000,
        responseSchema: {
             type: Type.ARRAY,
             items: {
                 type: Type.OBJECT,
                 properties: {
                     name: { type: Type.STRING },
                     score: { type: Type.NUMBER }
                 }
             }
        }
      }
    });

    const result = safeParseJSON(rawText);
    const validResult = Array.isArray(result) ? result : [];
    
    return { classified: validResult, tokens: response.usageMetadata?.totalTokenCount || 0, status };
  }

  async generateScenarios(rowDisc: {code: string, name: string}, colDisc: {code: string, name: string}, lang: 'en' | 'ru'): Promise<{ scenarios: any[], tokens: number, rawText: string, status: number }> {
    const langPrompt = lang === 'ru' ? "Output strictly in Russian language." : "Output strictly in English language.";

    const prompt = `
      Role: Senior Construction Engineer.
      Task: Provide 3 standard construction solutions for when a "${rowDisc.code} ${rowDisc.name}" element collides with a "${colDisc.code} ${colDisc.name}" element.
      Focus on modifying the ${rowDisc.name} (Row element).

      If a specific solution isn't obvious, provide generic standard resolutions such as "Local Shift", "Change Cross-Section", or "Rerouting".
      
      Requirements:
      1. Name: A short title (2-5 words).
      2. Description: A practical technical explanation of the work required.
      
      ${langPrompt}
    `;

    const { rawText, response, status } = await this.safeGenerate({
      model: this.modelName,
      contents: prompt,
      config: {
        systemInstruction: "You are a JSON-only API helper. Output strictly a valid JSON array. The 'name' property MUST be a short string (under 10 words). The 'description' property contains the detailed explanation. Do not wrap in markdown.",
        responseMimeType: "application/json",
        maxOutputTokens: 2000,
        safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }
        ],
        responseSchema: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    description: { type: Type.STRING }
                }
            }
        }
      }
    });
    
    const result = safeParseJSON(rawText);
    let scenarios = [];
    if (Array.isArray(result)) {
        scenarios = result;
    } else if (result && Array.isArray(result.scenarios)) {
        scenarios = result.scenarios;
    } else if (result && Array.isArray(result.items)) {
        scenarios = result.items;
    } else if (result && typeof result === 'object' && Object.keys(result).length > 0) {
        const val = Object.values(result).find(v => Array.isArray(v));
        if (val) scenarios = val as any[];
    }

    if (!scenarios) {
        throw new Error(`LLM returned 0 scenarios. Raw Response:\n${rawText}`);
    }

    scenarios = scenarios.map((s: any) => {
        let name = s.name || "Unknown Scenario";
        let description = s.description || "";
        if (name.split(' ').length > 15 && description.length < name.length) {
             if (!description) {
                 description = name;
                 name = "Proposed Solution (Auto-fix)";
             } else {
                 name = name.split(' ').slice(0, 8).join(' ') + "...";
             }
        }
        return { name, description };
    });

    return { scenarios, tokens: response.usageMetadata?.totalTokenCount || 0, rawText, status };
  }

  async matchWorksToScenario(scenario: any, availableWorks: WorkItem[]): Promise<{ matches: any[], tokens: number, rawText: string, status: number }> {
    const workList = availableWorks.map(w => ({ id: w.id, name: w.name, unit: w.unit }));
    const prompt = `
      Role: Construction Cost Estimator.
      Task: Identify items from the "Available Works" list that are required to perform the construction scenario described below.
      
      Scenario Name: ${scenario.name}
      Description: ${scenario.description}
      
      Available Works: ${JSON.stringify(workList)}
      
      Instructions:
      1. Select ALL works that seem relevant to the scenario description.
      2. If an exact match isn't found, pick the closest functional equivalent.
      3. Be generous in selection.
      4. Return an empty array ONLY if absolutely no works are relevant.
      
      Output Format: JSON Array of objects with 'workId' and 'quantity'.
    `;

    const { rawText, response, status } = await this.safeGenerate({
        model: this.modelName,
        contents: prompt,
        config: {
            systemInstruction: "You are a helpful estimator. Find matching works generously. Even weak matches are better than no matches. Output JSON.",
            responseMimeType: "application/json",
            maxOutputTokens: 2000,
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }
            ],
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        workId: { type: Type.STRING },
                        quantity: { type: Type.NUMBER }
                    }
                }
            }
        }
    });
    
    const result = safeParseJSON(rawText);
    const matches = Array.isArray(result) ? result : [];
    
    return { matches, tokens: response.usageMetadata?.totalTokenCount || 0, rawText, status };
  }
}

const llmService = new LLMService();

// --- Hooks ---

const useProgressSimulator = () => {
  const intervalsRef = useRef<Record<string, any>>({});

  const startProgress = useCallback((id: string, setState: React.Dispatch<React.SetStateAction<Record<string, LoadingState>>>, initialStep: string) => {
    setState(prev => ({ ...prev, [id]: { step: initialStep, progress: 5 } }));
    if (intervalsRef.current[id]) clearInterval(intervalsRef.current[id]);
    intervalsRef.current[id] = setInterval(() => {
        setState(prev => {
            const current = prev[id];
            if (!current) return prev;
            const nextProgress = current.progress >= 90 ? 90 : current.progress + (Math.random() * 3);
            return {
                ...prev,
                [id]: { ...current, progress: nextProgress }
            };
        });
    }, 400);
  }, []);

  const updateStep = useCallback((id: string, setState: React.Dispatch<React.SetStateAction<Record<string, LoadingState>>>, step: string, forceProgress?: number) => {
    setState(prev => {
        const current = prev[id];
        if (!current) return prev;
        return {
            ...prev,
            [id]: { step, progress: forceProgress !== undefined ? forceProgress : current.progress }
        };
    });
  }, []);

  const stopProgress = useCallback((id: string, setState: React.Dispatch<React.SetStateAction<Record<string, LoadingState>>>) => {
    if (intervalsRef.current[id]) {
        clearInterval(intervalsRef.current[id]);
        delete intervalsRef.current[id];
    }
    setState(prev => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
    });
  }, []);

  useEffect(() => {
      return () => {
          Object.values(intervalsRef.current).forEach(clearInterval);
      };
  }, []);

  return { startProgress, updateStep, stopProgress };
};

// --- Components ---

const Button = ({ children, onClick, variant = "primary", disabled = false, className = "", title = "" }: any) => {
  const baseStyle = "px-4 py-2 rounded font-medium transition-colors text-sm flex items-center gap-2";
  const variants: any = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300",
    secondary: "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:bg-gray-100",
    danger: "bg-red-500 text-white hover:bg-red-600",
    success: "bg-green-600 text-white hover:bg-green-700",
    ghost: "bg-transparent text-gray-600 hover:bg-gray-100"
  };
  
  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`${baseStyle} ${variants[variant]} ${className}`}
      title={title}
    >
      {children}
    </button>
  );
};

const Input = (props: any) => (
  <input 
    {...props}
    className={`w-full bg-white text-gray-900 border border-gray-300 rounded px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500 transition-shadow ${props.className || ""}`}
  />
);

const ToggleButton = ({ open, onClick }: { open: boolean, onClick: () => void }) => (
    <button 
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className="p-1.5 rounded-full hover:bg-black/10 text-current transition-colors focus:outline-none flex items-center justify-center"
        title={open ? "Collapse Panel" : "Expand Panel"}
    >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transform transition-transform duration-200 ${open ? 'rotate-180' : 'rotate-0'}`}>
            <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
    </button>
);

// --- Main App ---

export default function App() {
  // --- State ---
  const [activeTab, setActiveTab] = useState<"collision" | "cost" | "settings" | "logs">("collision");
  
  // "Database" google
  // const [settings, setSettings] = useState<AppSettings>({ 
  //   model: "gemini-2.5-flash", 
  //   language: "en",
  //   apiUrl: "https://generativelanguage.googleapis.com",
  //   apiKey: "",
  //   enableAutomation: true
  // });

  // "Database" mistral
  const [settings, setSettings] = useState<AppSettings>({ 
    model: "mistral-large-latest", 
    language: "en",
    apiUrl: "https://api.mistral.ai/v1/chat/completions",
    apiKey: "",
    enableAutomation: true
  });
  
  const [works, setWorks] = useState<WorkItem[]>(() => {
    try {
      const saved = localStorage.getItem("cmwc_works");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [scenarios, setScenarios] = useState<Scenario[]>(() => {
    try {
      const saved = localStorage.getItem("cmwc_scenarios");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Selection State
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<{r: string, c: string} | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);

  // Transient State
  const [urlInput, setUrlInput] = useState("https://garantstroikompleks.ru/prajs-list");
  const [minScope, setMinScope] = useState(0.7);
  const [workToAddId, setWorkToAddId] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  
  // Loading States
  const [loadingRows, setLoadingRows] = useState<Record<string, LoadingState>>({});
  const [loadingCells, setLoadingCells] = useState<Record<string, LoadingState>>({});
  const [loadingMatches, setLoadingMatches] = useState<Record<string, LoadingState>>({});
  const [bulkStatus, setBulkStatus] = useState<BulkStatus | null>(null);
  const [isStopping, setIsStopping] = useState(false);
  
  const abortOperation = useRef(false);

  const { startProgress, updateStep, stopProgress } = useProgressSimulator();

  const t = useCallback((key: string) => {
      const lang = settings.language || 'en';
      const dict: any = TRANSLATIONS[lang];
      return key.split('.').reduce((o, i) => o?.[i], dict) || key;
  }, [settings.language]);

  const localizedDisciplines = useMemo(() => {
      return DISCIPLINES.map(d => ({
          ...d,
          name: t(`disciplines.${d.nameKey}`),
          description: t(`disciplines.${d.descKey}`),
          keywords: t(`disciplines.${d.keywordsKey}`)
      }));
  }, [settings.language, t]);

  useEffect(() => {
    llmService.updateConfig(settings);
  }, [settings]);

  useEffect(() => {
    localStorage.setItem("cmwc_works", JSON.stringify(works));
  }, [works]);

  useEffect(() => {
    localStorage.setItem("cmwc_scenarios", JSON.stringify(scenarios));
  }, [scenarios]);

  const addLog = (action: string, status: "success" | "error", details: string, tokens: number = 0) => {
    const newLog: LogEntry = {
      id: generateId(),
      timestamp: Date.now(),
      action,
      status,
      details,
      tokensUsed: tokens
    };
    setLogs(prev => [newLog, ...prev]);
  };

  const handleExportData = () => {
    const data = { works, scenarios, timestamp: Date.now() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cmwc_data.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog("Export", "success", "Database exported to JSON file");
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target?.result as string);
        if (Array.isArray(data.works)) setWorks(data.works);
        if (Array.isArray(data.scenarios)) setScenarios(data.scenarios);
        addLog("Import", "success", `Imported ${data.works?.length || 0} works and ${data.scenarios?.length || 0} scenarios`);
        alert("Data imported successfully!");
      } catch (err) {
        addLog("Import", "error", "Failed to parse file");
        alert("Failed to parse file. Ensure it is a valid JSON export.");
      }
    };
    reader.readAsText(file);
  };

  // --- Actions ---

  const processLoadWorks = async (targetRowId: string) => {
    if (!urlInput || !targetRowId) return;
    
    const targetCategory = localizedDisciplines.find(d => d.id === targetRowId);
    if (!targetCategory) return;

    startProgress(targetRowId, setLoadingRows, t('steps.parsing'));
    let totalTokens = 0;

    try {
      const { works: rawWorks, tokens: t1, status } = await llmService.parseWorks(
          urlInput, 
          {
            code: targetCategory.code,
            name: targetCategory.name,
            description: targetCategory.description,
            keywords: targetCategory.keywords
          },
          settings.language
      );
      totalTokens += t1;
      
      if (!rawWorks || rawWorks.length === 0) {
           throw new Error(`[Status: ${status}] No works parsed for category ${targetCategory.code} from URL/Context.`);
      }

      updateStep(targetRowId, setLoadingRows, t('steps.classifying'));

      let classified: any[] = [];
      let t2 = 0;
      
      try {
          const clsResult = await llmService.classifyWorks(rawWorks, targetCategory.name, targetCategory.description, targetCategory.keywords);
          classified = clsResult.classified;
          t2 = clsResult.tokens;
          totalTokens += t2;
      } catch (clsError: any) {
          console.warn("Classification failed, works will be loaded without scores.", clsError);
          addLog("Classify Works", "error", `Classification failed for ${targetCategory.code}: ${clsError.message}`);
      }

      updateStep(targetRowId, setLoadingRows, t('steps.finalizing'));

      const newWorks: WorkItem[] = rawWorks.map((rw: any) => {
        const cls = Array.isArray(classified) ? classified.find((c: any) => c.name === rw.name) : null;
        const score = cls && typeof cls.score === 'number' ? cls.score : 0;
        
        return {
          id: generateId(),
          categoryId: targetRowId,
          name: rw.name || "Unknown Work",
          price: typeof rw.price === 'number' ? rw.price : 0,
          currency: ['RUB', 'RUR', 'РУБ', '₽', 'USD', 'DOLLAR', '$'].includes((rw.currency || '').toUpperCase()) ? undefined : rw.currency,
          unit: rw.unit || "unit",
          source: urlInput,
          score: score,
          status: score >= minScope ? "accepted" : "pending"
        };
      });

      setWorks(prev => [...prev, ...newWorks]);
      addLog("Load Works", "success", `[Status: ${status}] Loaded ${newWorks.length} works for ${targetCategory.code}`, totalTokens);

    } catch (e: any) {
      addLog("Load Works", "error", `${targetCategory.code} (${targetCategory.name}): ${e.message}`, totalTokens);
      throw e; // Re-throw to be handled by caller if needed
    } finally {
      stopProgress(targetRowId, setLoadingRows);
    }
  };

  const processGenerateScenarios = async (rId: string, cId: string) => {
    const cellKey = `${rId}:${cId}`;
    
    startProgress(cellKey, setLoadingCells, t('steps.analyzing'));

    try {
      const rDisc = localizedDisciplines.find(d => d.id === rId)!;
      const cDisc = localizedDisciplines.find(d => d.id === cId)!;
      
      const { scenarios: genScenarios, tokens, status } = await llmService.generateScenarios(
          { code: rDisc.code, name: rDisc.name },
          { code: cDisc.code, name: cDisc.name },
          settings.language
      );
      
      updateStep(cellKey, setLoadingCells, t('steps.finalizing'));

      if (!genScenarios || genScenarios.length === 0) {
           throw new Error(`[Status: ${status}] LLM returned 0 scenarios.`);
      }

      const newScenarios: Scenario[] = genScenarios.map((s: any) => ({
        id: generateId(),
        matrixKey: cellKey,
        name: s.name,
        description: s.description,
        works: []
      }));

      setScenarios(prev => [...prev, ...newScenarios]);
      addLog("Generate Scenarios", "success", `[Status: ${status}] Row: ${rDisc.code} vs Col: ${cDisc.code}. Generated ${newScenarios.length} scenarios.`, tokens);
    } catch (e: any) {
      const rDisc = localizedDisciplines.find(d => d.id === rId);
      const cDisc = localizedDisciplines.find(d => d.id === cId);
      addLog("Generate Scenarios", "error", `Row: ${rDisc?.code} vs Col: ${cDisc?.code}. Error: ${e.message}`);
    } finally {
      stopProgress(cellKey, setLoadingCells);
    }
  };

  const processMatchWorks = async (scenarioId: string, availableWorks: WorkItem[]) => {
      const scenario = scenarios.find(s => s.id === scenarioId);
      if (!scenario) return;

      if (availableWorks.length === 0) {
          addLog("Match Works", "error", `No works found for scenario ${scenario.name}.`);
          return;
      }

      startProgress(scenarioId, setLoadingMatches, t('steps.matching'));

      try {
        const { matches, tokens, rawText, status } = await llmService.matchWorksToScenario(scenario, availableWorks);
        
        const scenarioWorks: ScenarioWork[] = matches.map((m: any) => {
          let qty = 1;
          if (m.quantity !== undefined && m.quantity !== null) {
              const parsed = parseFloat(m.quantity);
              if (!isNaN(parsed) && parsed > 0) qty = parsed;
          }

          return {
              workId: availableWorks.find(w => w.id === m.workId || w.name === m.workId)?.id || "", 
              quantity: qty, 
              active: true
          };
        }).filter((sw: any) => sw.workId !== "");

        if (scenarioWorks.length === 0) {
           addLog("Match Works", "error", `[Status: ${status}] Scenario: '${scenario.name}'. LLM could not match any works.\n\nRaw Response:\n${rawText}`, tokens);
        } else {
           setScenarios(prev => prev.map(s => {
              if (s.id === scenarioId) {
              return { ...s, works: scenarioWorks };
              }
              return s;
          }));
          addLog("Match Works", "success", `[Status: ${status}] Scenario: '${scenario.name}'. Matched ${scenarioWorks.length} works.`, tokens);
        }
      } catch (e: any) {
          addLog("Match Works", "error", `Scenario '${scenario.name}': ${e.message}`);
      } finally {
        stopProgress(scenarioId, setLoadingMatches);
      }
  };

  const handleLoadWorks = () => {
      if (selectedRowId) {
          setPanelOpen(true);
          processLoadWorks(selectedRowId);
      }
  };

  const handleGenScenarios = () => {
      if (selectedCell) {
          setPanelOpen(true);
          processGenerateScenarios(selectedCell.r, selectedCell.c);
      }
  };

  const handleMatchWorks = () => {
    if (!selectedScenarioId || !selectedCell) return;
    const availableWorks = works.filter(w => w.categoryId === selectedCell.r);
    processMatchWorks(selectedScenarioId, availableWorks);
  };

  // --- Bulk Handlers ---

  const handleStopBulk = () => {
      abortOperation.current = true;
      setIsStopping(true);
      if (bulkStatus) {
          setBulkStatus(prev => prev ? ({ ...prev, label: "Stopping..." }) : null);
      }
  };

  const handleBulkLoadAll = async () => {
    if (!settings.enableAutomation) return;
    if (!urlInput) {
        alert("Please enter a Pricing Source URL first.");
        return;
    }
    
    if (!confirm(t('bulkLoadConfirm'))) return;

    abortOperation.current = false;
    setIsStopping(false);
    const discs = localizedDisciplines;
    const startTime = Date.now();
    addLog("Bulk Load", "success", `Starting Bulk Load Works for all ${discs.length} categories.`);
    
    setBulkStatus({ active: true, type: 'load', total: discs.length, current: 0, label: t('steps.parsing') });

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < discs.length; i++) {
        if (abortOperation.current) {
            addLog("Bulk Load", "error", "Operation stopped by user.");
            break;
        }

        const d = discs[i];
        
        // Skip if works already exist for this category
        const existingWorks = works.filter(w => w.categoryId === d.id);
        if (existingWorks.length > 0) {
            skippedCount++;
            continue;
        }

        // Update visual selection to show progress
        setSelectedRowId(d.id);
        setPanelOpen(true);
        
        setBulkStatus({ 
            active: true,
            type: 'load',
            total: discs.length, 
            current: i + 1, 
            label: `${t('btnLoading')} ${d.code}...` 
        });

        try {
            await processLoadWorks(d.id);
            successCount++;
        } catch (e) {
            console.error(`Bulk load error for ${d.code}`, e);
            failCount++;
        }
        
        // Small delay to allow UI to render animations cleanly
        await new Promise(r => setTimeout(r, 500));
    }
    
    setBulkStatus(null);
    setIsStopping(false);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    addLog("Bulk Load", "success", `Bulk Load Completed in ${duration}s. Success: ${successCount}, Failed: ${failCount}, Skipped: ${skippedCount}.`);
  };

  const handleBulkGenerateAll = async () => {
    if (!settings.enableAutomation) return;
    if (!confirm(t('bulkGenConfirm'))) return;

    abortOperation.current = false;
    setIsStopping(false);
    const startTime = Date.now();
    addLog("Bulk Generate", "success", "Starting Bulk Scenario Generation for all matrix cells.");
    
    let pendingCells = [];
    for (const r of localizedDisciplines) {
        // Only process rows that have works loaded
        const hasWorks = works.some(w => w.categoryId === r.id);
        if (!hasWorks) continue;

        for (const c of localizedDisciplines) {
             if (r.id === c.id) continue;
             const cellKey = `${r.id}:${c.id}`;
             const hasScenarios = scenarios.some(s => s.matrixKey === cellKey);
             if (!hasScenarios) {
                 pendingCells.push({r, c});
             }
        }
    }

    if (pendingCells.length === 0) {
        addLog("Bulk Generate", "success", "No pending cells to generate.");
        return;
    }

    setBulkStatus({ active: true, type: 'gen', total: pendingCells.length, current: 0, label: t('steps.generating') });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < pendingCells.length; i++) {
        if (abortOperation.current) {
            addLog("Bulk Generate", "error", "Operation stopped by user.");
            break;
        }

        const { r, c } = pendingCells[i];
        
        // Visual feedback
        setSelectedCell({ r: r.id, c: c.id });
        setPanelOpen(true);

        setBulkStatus({ 
            active: true,
            type: 'gen',
            total: pendingCells.length, 
            current: i + 1, 
            label: `${t('btnThinking')} ${r.code}:${c.code}...` 
        });

        try {
             await processGenerateScenarios(r.id, c.id);
             successCount++;
        } catch (e) {
             failCount++;
        }
        await new Promise(r => setTimeout(r, 200));
    }

    setBulkStatus(null);
    setIsStopping(false);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    addLog("Bulk Generate", "success", `Bulk Generation Completed in ${duration}s. Generated for ${successCount} cells. Failed: ${failCount}.`);
  };

  const handleBulkMatchAll = async () => {
     if (!settings.enableAutomation) return;
     if (!confirm(t('bulkMatchConfirm'))) return;
    
     abortOperation.current = false;
     setIsStopping(false);
     const startTime = Date.now();
     const emptyScenarios = scenarios.filter(s => s.works.length === 0);
     
     if (emptyScenarios.length === 0) {
         addLog("Bulk Match", "success", "No scenarios without works found.");
         return;
     }

     addLog("Bulk Match", "success", `Starting Bulk Matching for ${emptyScenarios.length} scenarios.`);

     setBulkStatus({ active: true, type: 'match', total: emptyScenarios.length, current: 0, label: t('steps.matching') });

     let successCount = 0;
     let failCount = 0;

     for (let i = 0; i < emptyScenarios.length; i++) {
         if (abortOperation.current) {
             addLog("Bulk Match", "error", "Operation stopped by user.");
             break;
         }

         const s = emptyScenarios[i];
         const [rId, cId] = s.matrixKey.split(':');
         
         // Visual feedback
         setSelectedCell({ r: rId, c: cId });
         setSelectedScenarioId(s.id);
         setPanelOpen(true);

         setBulkStatus({ 
            active: true,
            type: 'match',
            total: emptyScenarios.length, 
            current: i + 1, 
            label: `${t('btnMatching')} ${s.name.substring(0, 15)}...` 
         });

         const availableWorks = works.filter(w => w.categoryId === rId);
         if (availableWorks.length > 0) {
            try {
                await processMatchWorks(s.id, availableWorks);
                successCount++;
            } catch (e) {
                failCount++;
            }
         }
         await new Promise(r => setTimeout(r, 200));
     }
     
     setBulkStatus(null);
     setIsStopping(false);
     const duration = ((Date.now() - startTime) / 1000).toFixed(1);
     addLog("Bulk Match", "success", `Bulk Matching Completed in ${duration}s. Matched: ${successCount}. Failed: ${failCount}.`);
  };

  const handleAcceptWorks = () => {
    setWorks(prev => prev.map(w => {
      if (w.categoryId === selectedRowId && w.status === "pending") {
        if (w.score >= minScope) return { ...w, status: "accepted" };
        else return { ...w, status: "rejected" };
      }
      return w;
    }));
  };

  const handleAddManualWork = () => {
    if (!selectedScenarioId || !workToAddId) return;
    
    setScenarios(prev => prev.map(s => {
        if (s.id === selectedScenarioId) {
            if (s.works.some(sw => sw.workId === workToAddId)) return s;
            return {
                ...s,
                works: [...s.works, { workId: workToAddId, quantity: 1, active: true }]
            };
        }
        return s;
    }));
    setWorkToAddId("");
  };

  const handleRemoveWorkFromScenario = (workId: string) => {
    if (!selectedScenarioId) return;
    setScenarios(prev => prev.map(s => {
        if (s.id === selectedScenarioId) {
            return {
                ...s,
                works: s.works.filter(sw => sw.workId !== workId)
            };
        }
        return s;
    }));
  };

  const calculateScenarioCost = useCallback((s: Scenario) => {
    return s.works.reduce((acc, sw) => {
      if (!sw.active) return acc;
      const w = works.find(wk => wk.id === sw.workId);
      const price = (w && typeof w.price === 'number' && !isNaN(w.price)) ? w.price : 0;
      const qty = (typeof sw.quantity === 'number' && !isNaN(sw.quantity)) ? sw.quantity : 0;
      return acc + (price * qty);
    }, 0);
  }, [works]);

  const maxMatrixCost = useMemo(() => {
    if (!scenarios.length) return 0;
    let max = 0;
    scenarios.forEach(s => {
        const cost = calculateScenarioCost(s);
        if (cost > max) max = cost;
    });
    return max;
  }, [scenarios, calculateScenarioCost]);

  const getCellCostRange = (rId: string, cId: string) => {
    const cellScenarios = scenarios.filter(s => s.matrixKey === `${rId}:${cId}`);
    if (cellScenarios.length === 0) return null;
    const costs = cellScenarios.map(calculateScenarioCost);
    const validCosts = costs.filter(c => c > 0);
    if (validCosts.length === 0 && costs.length > 0) return { min: 0, max: 0, count: costs.length };
    if (validCosts.length === 0) return null;

    const min = Math.min(...validCosts);
    const max = Math.max(...validCosts);
    return { min, max, count: cellScenarios.length };
  };

  const renderMatrix = (type: "collision" | "cost") => (
    <div className="overflow-auto flex-1 bg-white border rounded shadow-sm relative">
      <div className="grid min-w-[var(--matrix-min-width)]" style={{ gridTemplateColumns: `var(--matrix-first-col-width) repeat(${localizedDisciplines.length}, 1fr)` }}>
        <div className="sticky top-0 left-0 z-30 bg-gray-100 p-2 md:p-3 font-bold text-xs text-gray-500 uppercase tracking-wider border-b border-r border-gray-200 flex items-center justify-center shadow-sm h-[var(--matrix-header-height)] md:h-24">
          {t('table.name')}
        </div>
        {localizedDisciplines.map(d => {
            const style = getDisciplineStyle(d);
            return (
                <div key={d.id} className="sticky top-0 z-20 p-2 text-center text-sm border-b border-r border-gray-200 flex flex-col items-center justify-center shadow-sm h-[var(--matrix-header-height)] md:h-24" style={{ backgroundColor: style.bg }}>
                    <span className="font-bold text-sm md:text-base" style={{ color: style.text }}>{d.code}</span>
                    <span className="text-[10px] leading-tight mt-1 opacity-80 max-w-[90px] truncate hidden md:block" style={{ color: style.text }} title={d.name}>{d.name}</span>
                </div>
            );
        })}

        {localizedDisciplines.map(r => {
          const style = getDisciplineStyle(r);
          const isRowLoading = loadingRows[r.id];
          const rowWorks = works.filter(w => w.categoryId === r.id);
          const totalWorks = rowWorks.length;
          const acceptedWorks = rowWorks.filter(w => w.status === 'accepted').length;
          const isSelectedRow = (type === "collision" && selectedRowId === r.id) || (type === "cost" && selectedCell?.r === r.id);
          
          return (
          <React.Fragment key={r.id}>
            <div 
              className={`sticky left-0 z-10 p-2 font-bold text-sm border-b border-r border-gray-200 cursor-pointer hover:brightness-95 flex flex-col justify-center transition-colors relative overflow-hidden h-[var(--matrix-cell-height)]
                ${isSelectedRow ? 'ring-inset ring-2 ring-blue-500' : ''}
                ${isRowLoading ? 'shadow-[inset_0_0_10px_rgba(37,99,235,0.2)] border-l-4 border-l-blue-500' : ''}
                `}
              onClick={() => {
                  if (type === 'collision') {
                      if (selectedRowId === r.id) setPanelOpen(!panelOpen);
                      else { setSelectedRowId(r.id); setPanelOpen(true); }
                  }
              }}
              style={{ backgroundColor: style.bg }}
            >
               {isRowLoading && (
                   <div className="absolute bottom-0 left-0 h-1 bg-blue-500 transition-all duration-300 z-20" style={{ width: `${isRowLoading.progress}%` }}></div>
               )}
               {isRowLoading && (
                   <div className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full animate-ping"></div>
               )}

               <div className="flex flex-col items-start px-1 md:px-2 w-full">
                    <span style={{ color: style.text }} className="relative z-10 text-sm md:text-base">{r.code}</span>
                    <span className="text-[10px] font-normal opacity-80 truncate max-w-full relative z-10 hidden md:block" style={{ color: style.text }} title={r.name}>{r.name}</span>
               </div>
               
               {totalWorks > 0 && !isRowLoading && (
                  <div className="absolute bottom-1 right-1 z-10 flex gap-1 bg-white/90 rounded px-1 md:px-1.5 py-0.5 border shadow-sm scale-75 md:scale-100 origin-bottom-right">
                      <span className="text-[9px] text-black">{totalWorks}</span>
                      {acceptedWorks > 0 && (
                          <span className="text-[9px] text-green-600 font-bold border-l border-gray-300 pl-1">✓ {acceptedWorks}</span>
                      )}
                  </div>
               )}

               {isRowLoading && isSelectedRow && (
                   <span className="text-[9px] text-blue-700 bg-white/80 rounded px-1 mx-2 mt-1 relative z-10 w-fit hidden md:block">{isRowLoading.step} ({Math.round(isRowLoading.progress)}%)</span>
               )}
            </div>

            {localizedDisciplines.map(c => {
              const isDiagonal = r.id === c.id;
              const cellKey = `${r.id}:${c.id}`;
              const isSelected = selectedCell?.r === r.id && selectedCell?.c === c.id;
              
              if (type === "collision") {
                 const symbol = isDiagonal ? "Д" : "П";
                 const bgClass = symbol === 'Д' ? 'bg-red-50 text-red-700 font-bold' : 'text-gray-400 font-light';
                 return (
                   <div key={c.id} className={`border-b border-r border-gray-200 p-2 flex items-center justify-center ${bgClass} hover:bg-gray-50 transition-colors cursor-default h-[var(--matrix-cell-height)]`}>
                     <span className="text-sm md:text-base">{symbol}</span>
                   </div>
                 );
              } else {
                 const costData = getCellCostRange(r.id, c.id);
                 const isCellLoading = loadingCells[cellKey];
                 const isMatching = scenarios.some(s => s.matrixKey === cellKey && loadingMatches[s.id]);
                 const displayCurrency = getCurrencySymbol(settings.language);

                 let cellStyle: React.CSSProperties = {};
                 if (!isSelected && !isCellLoading && costData && maxMatrixCost > 0) {
                    const ratio = Math.min(costData.max / maxMatrixCost, 1);
                    // Purple heat map to avoid conflict with KR (Red) and other disciplines
                    cellStyle = { backgroundColor: `rgba(147, 51, 234, ${ratio * 0.5})` };
                 }

                 if (isDiagonal) return <div key={c.id} className="bg-gray-100 border-b border-r border-gray-200 h-[var(--matrix-cell-height)]" />;
                 
                 return (
                   <div 
                    key={c.id} 
                    style={cellStyle}
                    className={`border-b border-r border-gray-200 p-1 md:p-2 flex flex-col items-center justify-center cursor-pointer transition-all h-[var(--matrix-cell-height)] relative overflow-hidden
                        ${isSelected ? 'bg-blue-100 ring-inset ring-2 ring-blue-600 z-0' : 'hover:bg-gray-50'}
                        ${isCellLoading ? 'bg-blue-50' : ''}
                    `}
                    onClick={() => {
                        if (selectedCell?.r === r.id && selectedCell?.c === c.id) setPanelOpen(!panelOpen);
                        else { setSelectedCell({r: r.id, c: c.id}); setSelectedScenarioId(null); setPanelOpen(true); }
                    }}
                   >
                     {isCellLoading && (
                         <>
                            <div className="absolute bottom-0 left-0 h-1 bg-blue-500 transition-all duration-300 z-10" style={{ width: `${isCellLoading.progress}%` }}></div>
                            <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                            <span className="text-[9px] text-blue-600 font-medium animate-pulse text-center leading-tight hidden md:block">{isCellLoading.step}</span>
                         </>
                     )}
                     {!isCellLoading && isMatching && (
                         <div className="absolute top-1 right-1 w-2 h-2 bg-orange-500 rounded-full animate-pulse z-10" title="Auto-Suggesting Works..."></div>
                     )}
                     {!isCellLoading && costData ? (
                        <>
                           <span className="text-[10px] md:text-sm font-bold text-gray-800">{displayCurrency}{formatCompactNumber(costData.min)}</span>
                           {costData.min !== costData.max && (
                                <span className="text-[8px] md:text-xs text-gray-500 hidden md:block">-{formatCompactNumber(costData.max)}</span>
                           )}
                           <span className="text-[8px] md:text-[10px] text-gray-500 bg-white px-1 rounded border mt-0.5 md:mt-1 scale-90 md:scale-100">{costData.count} var</span>
                        </>
                     ) : !isCellLoading ? <span className="text-sm md:text-lg text-gray-200 font-light">-</span> : null}
                   </div>
                 );
              }
            })}
          </React.Fragment>
        )})}
      </div>
    </div>
  );

  const availableWorksForScenario = useMemo(() => {
      if (!selectedCell) return [];
      return works.filter(w => w.categoryId === selectedCell.r);
  }, [works, selectedCell]);

  const activeScenario = useMemo(() => {
      if (!selectedScenarioId) return null;
      return scenarios.find(s => s.id === selectedScenarioId);
  }, [scenarios, selectedScenarioId]);
  
  const currentRowLoading = selectedRowId ? loadingRows[selectedRowId] : undefined;
  const currentCellLoading = selectedCell ? loadingCells[`${selectedCell.r}:${selectedCell.c}`] : undefined;
  const currentMatchLoading = activeScenario ? loadingMatches[activeScenario.id] : undefined;

  return (
    <div className="h-full flex flex-col bg-[var(--bg-app)]">
      <div className="bg-white border-b border-[var(--border)] px-4 md:px-6 py-2 md:py-3 flex flex-row items-center justify-between gap-3 shadow-sm z-20">
        <div className="flex bg-gray-100 p-1 rounded-lg flex-1 overflow-x-auto no-scrollbar">
          {(["collision", "cost", "settings", "logs"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-none px-3 md:px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize whitespace-nowrap ${activeTab === tab ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t(`tabs.${tab}`)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-none">
          <div className="bg-blue-600 text-white p-1.5 rounded font-bold font-mono text-xs md:text-base">CMWC</div>
          <h1 className="font-semibold text-lg text-gray-800 hidden md:block">{t('appTitle')}</h1>
        </div>
      </div>

      {activeTab === "collision" && (
        <div className="bg-white border-b px-2 md:px-6 py-2 md:py-3 flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-3 text-sm shadow-sm z-10">
            <span className="font-medium text-gray-500 whitespace-nowrap hidden md:block">{t('collisionControls')}:</span>
            <div className="flex-1 flex flex-col md:flex-row gap-1 md:gap-2">
                 <Input 
                    placeholder={t('placeholderUrl')}
                    value={urlInput} 
                    onChange={(e:any) => setUrlInput(e.target.value)}
                    className="w-full md:max-w-md"
                />
                <div className="flex gap-1 md:gap-2">
                    <Button onClick={handleLoadWorks} disabled={!selectedRowId || !!currentRowLoading} className="flex-1 md:flex-none justify-center">
                        {currentRowLoading ? `${t('btnLoading')}...` : t('btnLoad')}
                    </Button>
                    
                    {bulkStatus && bulkStatus.type === 'load' ? (
                        <div className="flex items-center gap-2 flex-1 max-w-xs bg-gray-100 rounded px-3 py-1 border border-blue-200">
                            <div className="text-xs font-bold text-blue-700 whitespace-nowrap min-w-[60px]">
                                {Math.round((bulkStatus.current / bulkStatus.total) * 100)}%
                            </div>
                            <div className="flex-1 h-2 bg-gray-300 rounded-full overflow-hidden hidden sm:block">
                                <div className="h-full bg-blue-600 transition-all duration-300" style={{width: `${(bulkStatus.current / bulkStatus.total) * 100}%`}}></div>
                            </div>
                            <Button 
                                variant="danger" 
                                className={`ml-1 !px-2 !py-0.5 !text-xs ${isStopping ? 'opacity-50 cursor-not-allowed' : ''}`}
                                onClick={handleStopBulk} 
                                disabled={isStopping}
                                title="Stop"
                            >
                                Stop
                            </Button>
                        </div>
                    ) : (
                        settings.enableAutomation && (
                            <Button variant="secondary" onClick={handleBulkLoadAll} title={t('automationHint')} className="flex-1 md:flex-none justify-center">
                                {t('btnBulkLoad')}
                            </Button>
                        )
                    )}
                </div>
            </div>
            <div className="flex items-center justify-between md:justify-start gap-2 border-t md:border-t-0 md:border-l pt-2 md:pt-0 md:pl-4">
                <div className="flex items-center gap-2">
                    <span className="text-gray-500 whitespace-nowrap">{t('minScope')}:</span>
                    <input type="number" step="0.1" min="0" max="1" value={minScope} onChange={(e) => setMinScope(parseFloat(e.target.value))} className="w-16 bg-white text-gray-900 border border-gray-300 rounded p-1 text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <Button variant="secondary" onClick={handleAcceptWorks} disabled={!selectedRowId}>{t('btnAutoAccept')}</Button>
            </div>
        </div>
      )}

      {activeTab === "cost" && (
         <div className="bg-white border-b px-4 md:px-6 py-2 flex flex-col md:flex-row items-stretch md:items-center gap-3 text-sm shadow-sm z-10">
             {selectedCell ? (
                 <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
                    <span className="font-medium text-gray-500">
                        {t('selected')}: <span className="text-blue-600 font-bold">{localizedDisciplines.find(d=>d.id===selectedCell.r)?.code}</span> vs <span className="text-blue-600 font-bold">{localizedDisciplines.find(d=>d.id===selectedCell.c)?.code}</span>
                    </span>
                    <div className="hidden md:block h-4 w-px bg-gray-300 mx-2"></div>
                    <Button onClick={handleGenScenarios} disabled={!!currentCellLoading} className="w-full md:w-auto justify-center">
                        {currentCellLoading ? `${t('btnThinking')}...` : t('btnGenerate')}
                    </Button>
                 </div>
             ) : (
                 <span className="text-gray-400 italic py-2">Select a cell to view details</span>
             )}
             
             {settings.enableAutomation && (
                <>
                    <div className="hidden md:block h-4 w-px bg-gray-300 mx-2"></div>
                    <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-center border-t md:border-t-0 pt-2 md:pt-0">
                        {bulkStatus && (bulkStatus.type === 'gen' || bulkStatus.type === 'match') ? (
                             <div className="flex items-center gap-2 flex-1 max-w-xs bg-gray-100 rounded px-3 py-1 border border-blue-200">
                                <div className="text-xs font-bold text-blue-700 whitespace-nowrap min-w-[60px]">
                                    {Math.round((bulkStatus.current / bulkStatus.total) * 100)}%
                                </div>
                                <div className="flex-1 h-2 bg-gray-300 rounded-full overflow-hidden w-24 hidden sm:block">
                                     <div className="h-full bg-blue-600 transition-all duration-300" style={{width: `${(bulkStatus.current / bulkStatus.total) * 100}%`}}></div>
                                </div>
                                <Button 
                                    variant="danger" 
                                    className={`ml-1 !px-2 !py-0.5 !text-xs ${isStopping ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    onClick={handleStopBulk} 
                                    disabled={isStopping}
                                    title="Stop"
                                >
                                    Stop
                                </Button>
                            </div>
                        ) : (
                           <div className="flex gap-2">
                                <Button variant="secondary" onClick={handleBulkGenerateAll} title={t('automationHint')} className="flex-1 md:flex-none justify-center">
                                    {t('btnBulkGen')}
                                </Button>
                                <Button variant="secondary" onClick={handleBulkMatchAll} title={t('automationHint')} className="flex-1 md:flex-none justify-center">
                                    {t('btnBulkMatch')}
                                </Button>
                           </div>
                        )}
                    </div>
                </>
             )}
         </div>
      )}

      <div className="flex-1 overflow-hidden flex flex-col p-4 gap-4">
        {activeTab === "collision" && (
          <div className="h-full flex flex-col gap-4">
            <div className={`flex flex-col transition-all duration-300 ease-in-out ${selectedRowId && panelOpen ? 'h-1/2' : 'h-full'}`}>
                <h2 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider flex justify-between items-center">
                    <span>{t('rankMatrix')}</span>
                    {selectedRowId && <span className="text-xs font-normal text-gray-400">{t('toggleDrawer')}</span>}
                </h2>
                {renderMatrix("collision")}
            </div>
            {selectedRowId && (
                <>
                    {!panelOpen && (
                         <div className="bg-white border-l-4 border-l-blue-500 border rounded shadow p-3 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setPanelOpen(true)}>
                             <div className="flex flex-col">
                                <span className="text-sm font-semibold text-gray-700">
                                    {t('worksPanel')}: {localizedDisciplines.find(d => d.id === selectedRowId)?.code} <span className="text-gray-400 font-normal">({works.filter(w => w.categoryId === selectedRowId).length} items)</span>
                                </span>
                                {currentRowLoading && <span className="text-xs text-blue-500 font-medium animate-pulse">{currentRowLoading.step} ({Math.round(currentRowLoading.progress)}%)</span>}
                             </div>
                             <div className="flex items-center gap-2 text-blue-600 text-sm font-medium"><span>{t('showPanel')}</span><ToggleButton open={false} onClick={() => setPanelOpen(true)} /></div>
                         </div>
                    )}
                    <div className={`bg-white border rounded shadow-lg flex flex-col transition-all duration-300 ease-in-out 
                        ${panelOpen ? (isMobileExpanded ? 'fixed inset-0 z-50 h-full' : 'h-1/2 opacity-100') : 'h-0 opacity-0 overflow-hidden border-0'}
                        ${isMobileExpanded ? 'md:relative md:h-1/2 md:inset-auto md:z-auto' : ''}
                    `}>
                        <div className="p-3 border-b bg-gray-50 flex justify-between items-center relative">
                             {currentRowLoading && <div className="absolute bottom-0 left-0 h-1 bg-blue-500 transition-all duration-300 z-20" style={{ width: `${currentRowLoading.progress}%` }}></div>}
                            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                                <button 
                                    className="md:hidden p-1 text-gray-500 hover:text-blue-600 border rounded bg-white shadow-sm mr-2"
                                    onClick={(e) => { e.stopPropagation(); setIsMobileExpanded(!isMobileExpanded); }}
                                    title={isMobileExpanded ? "Collapse" : "Expand"}
                                >
                                    {isMobileExpanded ? "▼" : "▲"}
                                </button>
                                {t('worksPanel')}: {localizedDisciplines.find(d => d.id === selectedRowId)?.code} - {localizedDisciplines.find(d => d.id === selectedRowId)?.name}
                                {currentRowLoading && <span className="text-xs font-normal text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{currentRowLoading.step}</span>}
                            </h3>
                            <div className="flex items-center gap-4">
                                <span className="text-xs font-mono bg-gray-200 px-2 py-1 rounded text-gray-600">Rank {localizedDisciplines.find(d => d.id === selectedRowId)?.rank}</span>
                                <div className="flex items-center gap-1 text-gray-500 hover:text-gray-800 cursor-pointer" onClick={() => setPanelOpen(false)}>
                                    <span className="text-xs font-medium uppercase">{t('hide')}</span><ToggleButton open={panelOpen} onClick={() => setPanelOpen(false)} />
                                </div>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto p-0 relative">
                            {currentRowLoading && works.filter(w => w.categoryId === selectedRowId).length === 0 && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 z-10 backdrop-blur-[1px]">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                                    <span className="text-sm text-gray-600">{currentRowLoading.step}</span>
                                </div>
                            )}
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0 z-10">
                                    <tr>
                                        <th className="p-3 border-b">{t('table.name')}</th>
                                        <th className="p-3 border-b">{t('table.price')}</th>
                                        <th className="p-3 border-b">{t('table.unit')}</th>
                                        <th className="p-3 border-b">{t('table.source')}</th>
                                        <th className="p-3 border-b">{t('table.score')}</th>
                                        <th className="p-3 border-b">{t('table.status')}</th>
                                        <th className="p-3 border-b text-right">{t('table.action')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {works.filter(w => w.categoryId === selectedRowId).map(w => (
                                        <tr key={w.id} className="hover:bg-gray-50 group">
                                            <td className="p-3">{w.name}</td>
                                            <td className="p-3 font-mono">{getDisplayCurrency(w, settings.language)}{w.price}</td>
                                            <td className="p-3 text-gray-500">{w.unit}</td>
                                            <td className="p-3 text-xs text-gray-400 truncate max-w-[100px]">{w.source}</td>
                                            <td className="p-3"><div className="flex items-center gap-2"><div className="w-16 h-1.5 bg-gray-200 rounded overflow-hidden"><div className={`h-full ${w.score > 0.7 ? 'bg-green-500' : 'bg-yellow-500'}`} style={{width: `${w.score * 100}%`}}/></div><span className="text-xs">{w.score.toFixed(2)}</span></div></td>
                                            <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${w.status === 'accepted' ? 'bg-green-100 text-green-800' : w.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>{w.status}</span></td>
                                            <td className="p-3 text-right"><div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => setWorks(prev => prev.map(wk => wk.id === w.id ? {...wk, status: 'accepted'} : wk))} className="text-green-600 hover:bg-green-100 p-1 rounded transition-colors">✓</button><button onClick={() => setWorks(prev => prev.map(wk => wk.id === w.id ? {...wk, status: 'rejected'} : wk))} className="text-red-600 hover:bg-red-100 p-1 rounded transition-colors">✕</button></div></td>
                                        </tr>
                                    ))}
                                    {!currentRowLoading && works.filter(w => w.categoryId === selectedRowId).length === 0 && <tr><td colSpan={7} className="p-8 text-center text-gray-400">{t('noWorks')}</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
          </div>
        )}

        {activeTab === "cost" && (
             <div className="h-full flex flex-col gap-4">
                 <div className={`flex flex-col transition-all duration-300 ease-in-out ${selectedCell && panelOpen ? 'h-1/2' : 'h-full'}`}>
                     <h2 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider flex justify-between items-center">
                        <span>{t('costMatrix')}</span>
                        {selectedCell && <span className="text-xs font-normal text-gray-400">{t('toggleDetail')}</span>}
                     </h2>
                     {renderMatrix("cost")}
                 </div>
                 {selectedCell && (
                     <>
                        {!panelOpen && (
                            <div className="bg-white border-l-4 border-l-blue-500 border rounded shadow p-3 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setPanelOpen(true)}>
                                <div className="flex flex-col">
                                    <span className="text-sm font-semibold text-gray-700">{t('scenarios')}: {localizedDisciplines.find(d => d.id === selectedCell.r)?.code} vs {localizedDisciplines.find(d => d.id === selectedCell.c)?.code}</span>
                                    {currentCellLoading && <span className="text-xs text-blue-500 font-medium animate-pulse">{t('steps.generating')} ({Math.round(currentCellLoading.progress)}%)</span>}
                                </div>
                                <div className="flex items-center gap-2 text-blue-600 text-sm font-medium"><span>{t('showPanel')}</span><ToggleButton open={false} onClick={() => setPanelOpen(true)} /></div>
                            </div>
                        )}
                        <div className={`flex flex-col md:flex-row gap-4 transition-all duration-300 ease-in-out 
                            ${panelOpen ? (isMobileExpanded ? 'fixed inset-0 z-50 h-full bg-white p-2' : 'h-1/2 opacity-100') : 'h-0 opacity-0 overflow-hidden'}
                            ${isMobileExpanded ? 'md:relative md:h-1/2 md:inset-auto md:z-auto md:bg-transparent md:p-0' : ''}
                        `}>
                            <div className="w-full md:w-1/2 bg-white border rounded shadow-sm flex flex-col relative">
                                {currentCellLoading ? (
                                    <div className="absolute inset-0 bg-white z-20 flex flex-col items-center justify-center">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                                        <span className="text-sm font-medium text-blue-600 animate-pulse">{t('generatingScenarios')}</span>
                                        <span className="text-xs text-gray-400 mt-2">{currentCellLoading.step} ({Math.round(currentCellLoading.progress)}%)</span>
                                    </div>
                                ) : (
                                    <>
                                        <div className="p-3 border-b bg-gray-50 font-semibold text-gray-700 flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                                <button 
                                                    className="md:hidden p-1 text-gray-500 hover:text-blue-600 border rounded bg-white shadow-sm"
                                                    onClick={(e) => { e.stopPropagation(); setIsMobileExpanded(!isMobileExpanded); }}
                                                    title={isMobileExpanded ? "Collapse" : "Expand"}
                                                >
                                                    {isMobileExpanded ? "▼" : "▲"}
                                                </button>
                                                <span>{t('scenarios')}</span>
                                            </div>
                                            <div className="flex items-center gap-1 text-gray-500 hover:text-gray-800 cursor-pointer" onClick={() => setPanelOpen(false)}>
                                                <span className="text-xs font-medium uppercase">{t('hide')}</span><ToggleButton open={panelOpen} onClick={() => setPanelOpen(false)} />
                                            </div>
                                        </div>
                                        <div className="flex-1 overflow-auto">
                                            <table className="w-full text-sm">
                                                <thead className="bg-gray-50 text-gray-500 sticky top-0"><tr><th className="p-3 text-left border-b">{t('table.name')}</th><th className="p-3 text-left border-b">{t('table.totalCost')}</th><th className="p-3 w-10 border-b"></th></tr></thead>
                                                <tbody className="divide-y">
                                                    {scenarios.filter(s => s.matrixKey === `${selectedCell.r}:${selectedCell.c}`).map(s => (
                                                        <tr key={s.id} className={`cursor-pointer hover:bg-blue-50 ${selectedScenarioId === s.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`} onClick={() => setSelectedScenarioId(s.id)}>
                                                            <td className="p-3"><div className="font-medium">{s.name}</div><div className="text-xs text-gray-500 truncate max-w-[200px]">{s.description}</div></td>
                                                            <td className="p-3 font-mono font-medium text-blue-700">{getCurrencySymbol(settings.language)}{calculateScenarioCost(s)}</td>
                                                            <td className="p-3"><button className="text-red-400 hover:text-red-600" onClick={(e) => { e.stopPropagation(); setScenarios(prev => prev.filter(x => x.id !== s.id)); if(selectedScenarioId === s.id) setSelectedScenarioId(null); }}>×</button></td>
                                                        </tr>
                                                    ))}
                                                    {scenarios.filter(s => s.matrixKey === `${selectedCell.r}:${selectedCell.c}`).length === 0 && <tr><td colSpan={3} className="p-8 text-center text-gray-400">{t('noScenarios')}</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                )}
                            </div>
                            <div className="w-full md:w-1/2 bg-white border rounded shadow-sm flex flex-col relative">
                                {activeScenario ? (
                                    <>
                                        {currentMatchLoading && (
                                            <div className="absolute inset-0 bg-white/70 z-30 flex flex-col items-center justify-center backdrop-blur-[1px]">
                                                <div className="w-48 bg-gray-200 rounded-full h-2 mb-2 overflow-hidden"><div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{width: `${currentMatchLoading.progress}%`}}></div></div>
                                                <span className="text-sm font-bold text-blue-700 animate-pulse">{currentMatchLoading.step}</span>
                                            </div>
                                        )}
                                        <div className="p-3 border-b bg-gray-50 space-y-3">
                                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">{t('scenarioName')}</label><Input value={activeScenario.name} onChange={(e:any) => setScenarios(prev => prev.map(s => s.id === activeScenario.id ? {...s, name: e.target.value} : s))}/></div>
                                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">{t('description')}</label><textarea className="w-full bg-white text-gray-900 border border-gray-300 rounded px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 min-h-[60px]" rows={4} value={activeScenario.description} onChange={(e:any) => setScenarios(prev => prev.map(s => s.id === activeScenario.id ? {...s, description: e.target.value} : s))}/></div>
                                        </div>
                                        <div className="p-2 border-b bg-gray-100 flex flex-wrap gap-2 items-center">
                                            <select className="flex-1 min-w-[150px] bg-white text-gray-900 border border-gray-300 rounded px-2 py-2 text-xs focus:outline-none focus:border-blue-500" value={workToAddId} onChange={(e) => setWorkToAddId(e.target.value)}>
                                                <option value="">{t('addManual')}</option>
                                                {availableWorksForScenario.map(w => <option key={w.id} value={w.id}>{w.name} ({getDisplayCurrency(w, settings.language)}{w.price}/{w.unit})</option>)}
                                            </select>
                                            <Button onClick={handleAddManualWork} disabled={!workToAddId} className="py-1.5">{t('btnAdd')}</Button>
                                            <div className="w-px h-6 bg-gray-300 mx-1 hidden sm:block"></div>
                                            <Button variant="secondary" className="text-xs px-2 py-1.5 whitespace-nowrap" onClick={handleMatchWorks} disabled={!!currentMatchLoading}>{currentMatchLoading ? t('btnMatching') : t('btnAutoSuggest')}</Button>
                                        </div>
                                        <div className="flex-1 overflow-auto p-3">
                                            <div className="space-y-2">
                                                {activeScenario.works.map((sw, idx) => {
                                                    const w = works.find(k => k.id === sw.workId);
                                                    return (
                                                        <div key={sw.workId} className="flex items-center gap-2 p-2 border rounded bg-gray-50">
                                                            <input type="checkbox" checked={sw.active} onChange={() => { setScenarios(prev => prev.map(s => { if(s.id === activeScenario.id) { const newWorks = [...s.works]; newWorks[idx] = {...newWorks[idx], active: !newWorks[idx].active}; return {...s, works: newWorks}; } return s; })) }} className="h-4 w-4 text-blue-600 rounded" />
                                                            <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate" title={w?.name}>{w?.name || "Unknown Work"}</div><div className="text-xs text-gray-500">{getDisplayCurrency(w, settings.language)}{w?.price} / {w?.unit}</div></div>
                                                            <div className="flex items-center gap-1"><input type="number" className="w-16 text-right bg-white text-gray-900 border border-gray-300 rounded p-1 text-sm focus:outline-none focus:border-blue-500" value={sw.quantity} onChange={(e) => { const val = parseFloat(e.target.value); setScenarios(prev => prev.map(s => { if(s.id === activeScenario.id) { const newWorks = [...s.works]; newWorks[idx] = {...newWorks[idx], quantity: val}; return {...s, works: newWorks}; } return s; })) }} /></div>
                                                            <div className="w-16 text-right text-sm font-mono">{getDisplayCurrency(w, settings.language)}{((w?.price || 0) * sw.quantity).toFixed(0)}</div>
                                                            <button onClick={() => handleRemoveWorkFromScenario(sw.workId)} className="text-gray-400 hover:text-red-500 p-1" title="Remove work">✕</button>
                                                        </div>
                                                    )
                                                })}
                                                {activeScenario.works.length === 0 && <div className="text-center text-gray-400 mt-10 p-4 border-2 border-dashed rounded"><p>{t('noWorksAdded')}</p><p className="text-xs mt-2">{t('noWorksAddedHint')}</p></div>}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex-1 flex items-center justify-center text-gray-400 bg-gray-50"><p>{t('selectScenario')}</p></div>
                                )}
                            </div>
                        </div>
                     </>
                 )}
             </div>
        )}

        {activeTab === "settings" && (
            <div className="flex-1 overflow-y-auto w-full bg-[var(--bg-app)]">
                <div className="max-w-2xl mx-auto w-full my-4 md:my-10 px-4">
                    <div className="bg-white border rounded shadow-sm p-4 md:p-6 space-y-6">
                    <h2 className="text-xl font-bold text-gray-800">{t('settingsTitle')}</h2>
                    <div className="space-y-4">
                        <div><label className="block text-sm font-medium text-gray-700 mb-1">{t('apiUrlLabel')}</label><Input value={settings.apiUrl} onChange={(e:any) => setSettings(s => ({...s, apiUrl: e.target.value}))}/></div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{t('apiKeyLabel')}</label>
                            <Input 
                                type="password" 
                                placeholder={process.env.API_KEY ? "Using System Key (Default)" : "Enter API Key"}
                                value={settings.apiKey} 
                                onChange={(e:any) => setSettings(s => ({...s, apiKey: e.target.value}))}
                            />
                            <p className="text-xs text-gray-500 mt-1">{t('apiKeyHint')}</p>
                        </div>

                        <div><label className="block text-sm font-medium text-gray-700 mb-1">{t('modelLabel')}</label><Input value={settings.model} onChange={(e:any) => setSettings(s => ({...s, model: e.target.value}))}/></div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{t('languageLabel')}</label>
                            <div className="flex bg-gray-100 rounded p-1 w-fit">
                                <button className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${settings.language === 'en' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`} onClick={() => setSettings(s => ({...s, language: 'en'}))}>English</button>
                                <button className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${settings.language === 'ru' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`} onClick={() => setSettings(s => ({...s, language: 'ru'}))}>Русский</button>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 bg-blue-50 p-4 rounded border border-blue-100">
                             <input 
                                type="checkbox" 
                                id="autoToggle"
                                checked={settings.enableAutomation} 
                                onChange={(e) => setSettings(s => ({...s, enableAutomation: e.target.checked}))}
                                className="h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                             />
                             <div className="flex-1">
                                <label htmlFor="autoToggle" className="block text-sm font-bold text-gray-800">{t('automationLabel')}</label>
                                <p className="text-xs text-gray-600">{t('automationHint')}</p>
                             </div>
                        </div>

                        <div className="pt-4 border-t">
                            <h3 className="font-medium mb-2">{t('dataMgmt')}</h3>
                             <p className="text-sm text-gray-600 mb-4">{t('dataMgmtHint')}</p>
                            <div className="flex gap-3 items-center">
                                <Button variant="secondary" onClick={handleExportData}>{t('btnExport')}</Button>
                                <div className="relative"><input type="file" accept=".json" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleImportData} /><Button variant="secondary">{t('btnImport')}</Button></div>
                                <span className="text-xs text-gray-500">{works.length} works, {scenarios.length} scenarios loaded.</span>
                            </div>
                            <div className="mt-4"><Button variant="danger" onClick={() => { if(confirm("Are you sure you want to reset all data? This cannot be undone.")) { setWorks([]); setScenarios([]); localStorage.removeItem("cmwc_works"); localStorage.removeItem("cmwc_scenarios"); addLog("Reset", "success", "All data cleared."); } }}>{t('btnReset')}</Button></div>
                        </div>
                        <div className="pt-4 border-t">
                            <h3 className="font-medium mb-2">{t('systemStatus')}</h3>
                            <div className="flex gap-2">
                                <div className="flex items-center gap-2 px-3 py-1 rounded bg-gray-100 text-sm"><div className={`w-2 h-2 rounded-full ${process.env.API_KEY || settings.apiKey ? 'bg-green-500' : 'bg-red-500'}`}/>{t('apiConfigured')}</div>
                                <div className="flex items-center gap-2 px-3 py-1 rounded bg-gray-100 text-sm"><div className="w-2 h-2 rounded-full bg-blue-500"/>{t('storageActive')}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            </div>
        )}

        {activeTab === "logs" && (
            <div className="h-full bg-white border rounded shadow-sm flex flex-col">
                <div className="p-4 border-b bg-gray-50 font-bold text-gray-700 flex justify-between"><span>{t('logsTitle')}</span><span className="text-sm font-normal text-gray-500">{t('totalTokens')}: {logs.reduce((a,b) => a + b.tokensUsed, 0)}</span></div>
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-sm text-left table-fixed">
                        <thead className="bg-gray-50 text-gray-500 sticky top-0"><tr><th className="p-3 w-24">Time</th><th className="p-3 w-32">Action</th><th className="p-3 w-24">Status</th><th className="p-3 w-24">Tokens</th><th className="p-3">Details</th></tr></thead>
                        <tbody className="divide-y">
                            {logs.map(log => (
                                <tr key={log.id} className="hover:bg-gray-50">
                                    <td className="p-3 text-gray-500 font-mono text-xs align-top">{new Date(log.timestamp).toLocaleTimeString()}</td>
                                    <td className="p-3 font-medium align-top">{log.action}</td>
                                    <td className="p-3 align-top"><span className={`px-2 py-0.5 rounded text-xs font-medium ${log.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{log.status}</span></td>
                                    <td className="p-3 font-mono align-top">{log.tokensUsed}</td>
                                    <td className="p-3 text-gray-600 align-top"><div className="whitespace-pre-wrap font-mono text-xs max-h-48 overflow-y-auto border rounded p-1 bg-gray-50">{log.details}</div></td>
                                </tr>
                            ))}
                            {logs.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-400">{t('noLogs')}</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}

