
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
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
  apiKey: string;
  model: string;
  language: "en" | "ru";
}

interface LoadingState {
    step: string;
    progress: number;
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
    btnThinking: "Thinking",
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
    apiKeyHint: "Stored in app state (reset on refresh).",
    modelLabel: "Model",
    languageLabel: "Language",
    dataMgmt: "Data Management (Persistence)",
    dataMgmtHint: "Data is automatically saved to your browser's LocalStorage. To save to a file (e.g., for GitHub repo sync), export the database as JSON.",
    btnExport: "Download DB (.json)",
    btnImport: "Import DB (.json)",
    systemStatus: "System Status",
    apiConfigured: "API Configured",
    storageActive: "LocalStorage Active",
    logsTitle: "Request Logs",
    totalTokens: "Total Tokens",
    noLogs: "No logs yet.",
    steps: {
        parsing: "Parsing Page...",
        classifying: "Classifying...",
        analyzing: "Analyzing Collision...",
        finalizing: "Finalizing...",
        generating: "Generating Scenarios...",
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
    btnThinking: "Думаю",
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
    apiKeyHint: "Хранится в состоянии приложения (сбрасывается при обновлении).",
    modelLabel: "Модель",
    languageLabel: "Язык",
    dataMgmt: "Управление данными",
    dataMgmtHint: "Данные автоматически сохраняются в LocalStorage браузера. Для сохранения в файл (например, для Git) экспортируйте БД в JSON.",
    btnExport: "Скачать БД (.json)",
    btnImport: "Импортировать БД (.json)",
    systemStatus: "Статус системы",
    apiConfigured: "API Настроен",
    storageActive: "LocalStorage Активен",
    logsTitle: "Логи запросов",
    totalTokens: "Всего токенов",
    noLogs: "Логов пока нет.",
    steps: {
        parsing: "Парсинг страницы...",
        classifying: "Классификация...",
        analyzing: "Анализ коллизии...",
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
  // Remove markdown code blocks and whitespace
  let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  
  // Robustly find start of JSON
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  
  let start = 0;
  if (firstBrace === -1 && firstBracket === -1) {
      // No JSON found
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
    // Attempt to recover truncated JSON (specifically arrays)
    if (cleaned.trim().startsWith('[') && !cleaned.trim().endsWith(']')) {
         try {
             // Find the last valid closing object brace '}'
             const lastCloseObj = cleaned.lastIndexOf('}');
             if (lastCloseObj > 0) {
                 // Close the array manually
                 const salvaged = cleaned.substring(0, lastCloseObj + 1) + ']';
                 console.warn("Recovered truncated JSON array.");
                 return JSON.parse(salvaged);
             }
         } catch (e2) {
             // Recovery failed
         }
    }
    
    console.warn("JSON Parse Failed (Cleaned):", cleaned.substring(0, 100) + "...");
    return null;
  }
};

const getDisciplineStyle = (d: Discipline) => {
  // CONFIGURATION: Discipline Color Mapping
  // All colors are now lighter pastels for better UI consistency
  
  if (d.code.startsWith("ВК")) {
    // Pastel Blue for Water/Drainage
    return { bg: "#e0f2fe", text: "#0369a1" }; // sky-100, sky-700
  }
  if (d.code.startsWith("ОВ")) {
    // Pastel Orange for HVAC
    return { bg: "#ffedd5", text: "#c2410c" }; // orange-100, orange-700
  }

  // Fallback to Rank defaults
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

// --- LLM Service ---

class LLMService {
  private ai: GoogleGenAI | null = null;
  private modelName: string = "gemini-2.5-flash";

  init(apiKey: string, model: string) {
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
      this.modelName = model || "gemini-2.5-flash";
    }
  }

  async parseWorks(url: string, targetDiscipline: {code: string, name: string, description: string, keywords: string}, lang: 'en' | 'ru'): Promise<{ works: any[], tokens: number }> {
    if (!this.ai) throw new Error("API Key not configured");
    
    const langPrompt = lang === 'ru' ? "Output ONLY in Russian language." : "Output ONLY in English language.";
    
    const prompt = `
      Act as a construction cost estimator. 
      Target URL context: ${url}
      
      Task: Extract exactly 20 construction work items from the context that are MOST RELEVANT to the following discipline:
      Code: ${targetDiscipline.code}
      Name: ${targetDiscipline.name}
      Description: ${targetDiscipline.description}
      Keywords: ${targetDiscipline.keywords}
      
      IMPORTANT: 
      1. Prioritize works that match the Keywords (e.g., if keywords mention "concrete", find concrete works).
      2. If specific works are not found, include general construction works.
      3. Do NOT include the full HTML.
      4. Return ONLY valid JSON.
      
      ${langPrompt}
      
      Return JSON:
      {
        "items": [
          { "name": "Drilling D50mm", "price": 1500, "unit": "pcs" }
        ]
      }
    `;

    const response = await this.ai.models.generateContent({
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
                            unit: { type: Type.STRING }
                        }
                    }
                }
            }
        }
      }
    });

    const result = safeParseJSON(response.text);
    return { 
      works: result?.items || [], 
      tokens: response.usageMetadata?.totalTokenCount || 0 
    };
  }

  async classifyWorks(works: any[], categoryId: string, disciplineDesc: string, keywords: string): Promise<{ classified: any[], tokens: number }> {
    if (!this.ai) throw new Error("API Key not configured");

    const prompt = `
      You are an expert construction engineer specializing in BIM and collision resolution.
      
      Task: Evaluate relevance of construction works for resolving collisions in the Target Category.
      
      Target Category: ${categoryId}
      Category Description: ${disciplineDesc}
      Key Related Terms: ${keywords}
      
      Scoring Rules:
      1. High Score (0.8 - 1.0): Work explicitly mentions materials or methods specific to this category (e.g. "Concrete drilling" for Monolith/KR, "Pipe cutting" for Pipes). 
         Note: For KR (Constructive), works involving "Concrete", "Diamond Drilling", "Cutting openings" are Critical and should be scored HIGH.
      2. Medium Score (0.5 - 0.7): General construction works plausible for this category.
      3. Low Score (0.0 - 0.2): Unrelated works (e.g. Painting for Pipes, Flooring for Ceiling).
      
      Works Input: ${JSON.stringify(works.map(w => w.name))}
      
      Return JSON array of objects with 'name' and 'score'.
    `;

     const response = await this.ai.models.generateContent({
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

    const result = safeParseJSON(response.text);
    const validResult = Array.isArray(result) ? result : [];
    
    return { classified: validResult, tokens: response.usageMetadata?.totalTokenCount || 0 };
  }

  // CONFIGURATION: LLM Prompts
  // Modified to be less restrictive to prevent "0 scenarios" refusals.
  async generateScenarios(rowDisc: {code: string, name: string}, colDisc: {code: string, name: string}, lang: 'en' | 'ru'): Promise<{ scenarios: any[], tokens: number }> {
    if (!this.ai) throw new Error("API Key not configured");

    const langPrompt = lang === 'ru' ? "Output strictly in Russian language." : "Output strictly in English language.";

    const prompt = `
      Role: Senior Construction Engineer.
      Task: Provide 3 standard construction solutions for when a "${rowDisc.code} ${rowDisc.name}" element collides with a "${colDisc.code} ${colDisc.name}" element.
      Focus on modifying the ${rowDisc.name} (Row element).

      If a specific solution isn't obvious, provide generic standard resolutions such as "Local Shift", "Change Cross-Section", or "Rerouting".
      
      Requirements:
      1. Name: A short title (2-5 words).
      2. Description: A practical technical explanation of the work required.
      3. Return ONLY valid JSON.
      
      ${langPrompt}

      Return JSON Array:
      [
        { "name": "Local Shift", "description": "Move the element slightly..." }
      ]
    `;

    const response = await this.ai.models.generateContent({
      model: this.modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 2000,
        // Set permissiveness to avoid blocking common construction terms like "cutting" or "breaking"
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
    
    const result = safeParseJSON(response.text);
    // Robustness: check if result is an object containing "scenarios" or "items" instead of array
    let scenarios = [];
    if (Array.isArray(result)) {
        scenarios = result;
    } else if (result && Array.isArray(result.scenarios)) {
        scenarios = result.scenarios;
    } else if (result && Array.isArray(result.items)) {
        scenarios = result.items;
    } else if (result && typeof result === 'object' && Object.keys(result).length > 0) {
        // Fallback: try to find any array property
        const val = Object.values(result).find(v => Array.isArray(v));
        if (val) scenarios = val as any[];
    }

    return { scenarios: scenarios, tokens: response.usageMetadata?.totalTokenCount || 0 };
  }

  async matchWorksToScenario(scenario: any, availableWorks: WorkItem[]): Promise<{ matches: any[], tokens: number }> {
    if (!this.ai) throw new Error("API Key not configured");

    const workList = availableWorks.map(w => ({ id: w.id, name: w.name, unit: w.unit }));
    const prompt = `
      Role: Construction Cost Estimator.
      Task: Identify items from the "Available Works" list that are required to perform the construction scenario described below.
      
      Scenario Name: ${scenario.name}
      Description: ${scenario.description}
      
      Available Works: ${JSON.stringify(workList)}
      
      Instructions:
      1. Select ALL works that seem relevant to the scenario description.
      2. If an exact match isn't found, pick the closest functional equivalent (e.g. if "Drilling" is needed, pick "Diamond Drilling" or "Hole cutting").
      3. Be generous in selection to ensure the cost is captured.
      4. Return an empty array ONLY if absolutely no works are relevant.
      
      Output Format: JSON Array of objects with 'workId' and 'quantity'.
    `;

    const response = await this.ai.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
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
    
    const result = safeParseJSON(response.text);
    return { matches: Array.isArray(result) ? result : [], tokens: response.usageMetadata?.totalTokenCount || 0 };
  }
}

const llmService = new LLMService();

// --- Hooks ---

const useProgressSimulator = () => {
  const intervalsRef = useRef<Record<string, NodeJS.Timeout>>({});

  const startProgress = useCallback((id: string, setState: React.Dispatch<React.SetStateAction<Record<string, LoadingState>>>, initialStep: string) => {
    // Set initial
    setState(prev => ({ ...prev, [id]: { step: initialStep, progress: 5 } }));
    
    // Clear existing if any
    if (intervalsRef.current[id]) clearInterval(intervalsRef.current[id]);

    // Start interval
    intervalsRef.current[id] = setInterval(() => {
        setState(prev => {
            const current = prev[id];
            if (!current) return prev;
            // Increment until 90%
            const nextProgress = current.progress >= 90 ? 90 : current.progress + (Math.random() * 3);
            return {
                ...prev,
                [id]: { ...current, progress: nextProgress }
            };
        });
    }, 400); // Update every 400ms
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
    // Remove from state
    setState(prev => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
      return () => {
          Object.values(intervalsRef.current).forEach(clearInterval);
      };
  }, []);

  return { startProgress, updateStep, stopProgress };
};

// --- Components ---

const Button = ({ children, onClick, variant = "primary", disabled = false, className = "" }: any) => {
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
  
  // "Database"
  const [settings, setSettings] = useState<AppSettings>({ apiKey: process.env.API_KEY || "", model: "gemini-2.5-flash", language: "en" });
  
  // Initialize from LocalStorage
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
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null); // For Collision Matrix Works
  const [selectedCell, setSelectedCell] = useState<{r: string, c: string} | null>(null); // For Cost Matrix Scenarios
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);

  // Transient State
  const [urlInput, setUrlInput] = useState("https://garantstroikompleks.ru/prajs-list");
  const [minScope, setMinScope] = useState(0.7);
  const [workToAddId, setWorkToAddId] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  
  // Loading States
  const [loadingRows, setLoadingRows] = useState<Record<string, LoadingState>>({});
  const [loadingCells, setLoadingCells] = useState<Record<string, LoadingState>>({});
  const [loadingMatches, setLoadingMatches] = useState<Record<string, LoadingState>>({});
  const [generalLoading, setGeneralLoading] = useState(false); // Fallback
  
  // Hooks
  const { startProgress, updateStep, stopProgress } = useProgressSimulator();

  // Translation Helper
  const t = useCallback((key: string) => {
      const lang = settings.language || 'en';
      const dict: any = TRANSLATIONS[lang];
      // Simple dot notation access support
      return key.split('.').reduce((o, i) => o?.[i], dict) || key;
  }, [settings.language]);

  // Translated Disciplines
  const localizedDisciplines = useMemo(() => {
      return DISCIPLINES.map(d => ({
          ...d,
          name: t(`disciplines.${d.nameKey}`),
          description: t(`disciplines.${d.descKey}`),
          keywords: t(`disciplines.${d.keywordsKey}`)
      }));
  }, [settings.language, t]);

  // Init LLM
  useEffect(() => {
    llmService.init(settings.apiKey, settings.model);
  }, [settings]);

  // Persistence Effects
  useEffect(() => {
    localStorage.setItem("cmwc_works", JSON.stringify(works));
  }, [works]);

  useEffect(() => {
    localStorage.setItem("cmwc_scenarios", JSON.stringify(scenarios));
  }, [scenarios]);

  // Logger
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

  // --- Handlers: Data Export/Import ---

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

  // --- Handlers: Works ---

  const handleLoadWorks = async () => {
    const targetRowId = selectedRowId; 
    
    if (!urlInput || !targetRowId) return;
    if (loadingRows[targetRowId]) return;

    const targetCategory = localizedDisciplines.find(d => d.id === targetRowId)!;

    startProgress(targetRowId, setLoadingRows, t('steps.parsing'));
    setPanelOpen(true);
    let totalTokens = 0;

    try {
      // Step 1: Parse Works (Targeting Specific Category)
      const { works: rawWorks, tokens: t1 } = await llmService.parseWorks(
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
           throw new Error(`No works parsed for category ${targetCategory.code} from URL/Context.`);
      }

      updateStep(targetRowId, setLoadingRows, t('steps.classifying'));

      // Step 2: Classify Works (with error boundary)
      let classified: any[] = [];
      let t2 = 0;
      
      try {
          const clsResult = await llmService.classifyWorks(rawWorks, targetCategory.name, targetCategory.description, targetCategory.keywords);
          classified = clsResult.classified;
          t2 = clsResult.tokens;
          totalTokens += t2;
      } catch (clsError: any) {
          console.warn("Classification failed, works will be loaded without scores.", clsError);
          addLog("Classify Works", "error", `Classification failed for ${targetCategory.code} (${targetCategory.name}): ${clsError.message}`);
          // Proceed with empty classification -> scores will be 0
      }

      updateStep(targetRowId, setLoadingRows, t('steps.finalizing'));

      const newWorks: WorkItem[] = rawWorks.map((rw: any) => {
        // Robust finding: handle case where classified is empty or missing items
        const cls = Array.isArray(classified) ? classified.find((c: any) => c.name === rw.name) : null;
        const score = cls && typeof cls.score === 'number' ? cls.score : 0;
        
        return {
          id: generateId(),
          categoryId: targetRowId,
          name: rw.name || "Unknown Work",
          price: typeof rw.price === 'number' ? rw.price : 0,
          unit: rw.unit || "unit",
          source: urlInput,
          score: score,
          status: score >= minScope ? "accepted" : "pending"
        };
      });

      setWorks(prev => [...prev, ...newWorks]);
      addLog("Load Works", "success", `Loaded ${newWorks.length} works for ${targetCategory.code} (${targetCategory.name})`, totalTokens);

    } catch (e: any) {
      addLog("Load Works", "error", `${targetCategory.code} (${targetCategory.name}): ${e.message}`, totalTokens);
      // Clean up state immediately on error
      setLoadingRows(prev => {
         const newState = { ...prev };
         delete newState[targetRowId];
         return newState;
      });
    } finally {
      stopProgress(targetRowId, setLoadingRows);
    }
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

  // --- Handlers: Scenarios ---

  const handleGenScenarios = async () => {
    if (!selectedCell) return;
    const cellKey = `${selectedCell.r}:${selectedCell.c}`;
    
    // Prevent double submission
    if (loadingCells[cellKey]) return;

    startProgress(cellKey, setLoadingCells, t('steps.analyzing'));
    setPanelOpen(true);
    setGeneralLoading(true);

    try {
      const rDisc = localizedDisciplines.find(d => d.id === selectedCell.r)!;
      const cDisc = localizedDisciplines.find(d => d.id === selectedCell.c)!;
      
      const { scenarios: genScenarios, tokens } = await llmService.generateScenarios(
          { code: rDisc.code, name: rDisc.name },
          { code: cDisc.code, name: cDisc.name },
          settings.language
      );
      
      updateStep(cellKey, setLoadingCells, t('steps.finalizing'));

      if (!genScenarios || genScenarios.length === 0) {
           throw new Error("LLM returned 0 scenarios. Try again or check model configuration.");
      }

      const newScenarios: Scenario[] = genScenarios.map((s: any) => ({
        id: generateId(),
        matrixKey: cellKey,
        name: s.name,
        description: s.description,
        works: []
      }));

      setScenarios(prev => [...prev, ...newScenarios]);
      addLog("Generate Scenarios", "success", `Row: ${rDisc.code} vs Col: ${cDisc.code}. Generated ${newScenarios.length} scenarios.`, tokens);
    } catch (e: any) {
      const rDisc = localizedDisciplines.find(d => d.id === selectedCell.r);
      const cDisc = localizedDisciplines.find(d => d.id === selectedCell.c);
      addLog("Generate Scenarios", "error", `Row: ${rDisc?.code} vs Col: ${cDisc?.code}. Error: ${e.message}`);
      
      // Force cleanup
      setLoadingCells(prev => {
         const newState = { ...prev };
         delete newState[cellKey];
         return newState;
      });
    } finally {
      setGeneralLoading(false);
      stopProgress(cellKey, setLoadingCells);
    }
  };

  const handleMatchWorks = async () => {
    if (!selectedScenarioId || !selectedCell) return;
    
    // Filter works for the ROW category. Allow pending works to be matched too.
    const availableWorks = works.filter(w => w.categoryId === selectedCell.r);
    const categoryName = localizedDisciplines.find(d => d.id === selectedCell.r)?.name;
    const categoryCode = localizedDisciplines.find(d => d.id === selectedCell.r)?.code;

    if (availableWorks.length === 0) {
        addLog("Match Works", "error", `No works found for category '${categoryCode} ${categoryName}'. Please load works in Collision tab.`);
        return;
    }

    // Do NOT set generalLoading to true, to allow UI interaction
    // setGeneralLoading(true); 
    
    // Use the scenario ID to track progress
    startProgress(selectedScenarioId, setLoadingMatches, t('steps.matching'));

    try {
      const scenario = scenarios.find(s => s.id === selectedScenarioId)!;
      
      const { matches, tokens } = await llmService.matchWorksToScenario(scenario, availableWorks);
      
      const scenarioWorks: ScenarioWork[] = matches.map((m: any) => {
        let qty = 1;
        // Strict quantity parsing
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
         addLog("Match Works", "error", `Scenario: '${scenario.name}'. LLM could not match any works from ${categoryCode}.`, tokens);
      } else {
         setScenarios(prev => prev.map(s => {
            if (s.id === selectedScenarioId) {
            return { ...s, works: scenarioWorks };
            }
            return s;
        }));
        addLog("Match Works", "success", `Scenario: '${scenario.name}'. Matched ${scenarioWorks.length} works from ${categoryCode}.`, tokens);
      }
    } catch (e: any) {
        addLog("Match Works", "error", e.message);
    } finally {
      // setGeneralLoading(false);
      stopProgress(selectedScenarioId, setLoadingMatches);
    }
  };

  const handleAddManualWork = () => {
    if (!selectedScenarioId || !workToAddId) return;
    
    setScenarios(prev => prev.map(s => {
        if (s.id === selectedScenarioId) {
            // Check if already exists
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

  // --- Calculation ---
  
  const calculateScenarioCost = (s: Scenario) => {
    return s.works.reduce((acc, sw) => {
      if (!sw.active) return acc;
      const w = works.find(wk => wk.id === sw.workId);
      // Ensure we don't propagate NaN
      const price = (w && typeof w.price === 'number' && !isNaN(w.price)) ? w.price : 0;
      const qty = (typeof sw.quantity === 'number' && !isNaN(sw.quantity)) ? sw.quantity : 0;
      return acc + (price * qty);
    }, 0);
  };

  const getCellCostRange = (rId: string, cId: string) => {
    const cellScenarios = scenarios.filter(s => s.matrixKey === `${rId}:${cId}`);
    if (cellScenarios.length === 0) return null;
    const costs = cellScenarios.map(calculateScenarioCost);
    // Filter valid scenarios (>0) to avoid displaying 0-0 range if work is just not selected yet
    const validCosts = costs.filter(c => c > 0);
    if (validCosts.length === 0 && costs.length > 0) return { min: 0, max: 0, count: costs.length };
    if (validCosts.length === 0) return null;

    const min = Math.min(...validCosts);
    const max = Math.max(...validCosts);
    return { min, max, count: cellScenarios.length };
  };

  // --- Render Helpers ---

  const renderMatrix = (type: "collision" | "cost") => (
    <div className="overflow-auto flex-1 bg-white border rounded shadow-sm relative">
      <div className="grid min-w-[1200px]" style={{ gridTemplateColumns: `200px repeat(${localizedDisciplines.length}, 1fr)` }}>
        {/* Header Row */}
        <div className="sticky top-0 left-0 z-30 bg-gray-100 p-3 font-bold text-xs text-gray-500 uppercase tracking-wider border-b border-r border-gray-200 flex items-center justify-center shadow-sm">
          {t('table.name')}
        </div>
        {localizedDisciplines.map(d => {
            const style = getDisciplineStyle(d);
            return (
                <div key={d.id} className="sticky top-0 z-20 p-2 text-center text-sm border-b border-r border-gray-200 flex flex-col items-center justify-center shadow-sm" style={{ backgroundColor: style.bg }}>
                    <span className="font-bold" style={{ color: style.text }}>{d.code}</span>
                    <span className="text-[10px] leading-tight mt-1 opacity-80 max-w-[90px] truncate" style={{ color: style.text }} title={d.name}>{d.name}</span>
                </div>
            );
        })}

        {/* Rows */}
        {localizedDisciplines.map(r => {
          const style = getDisciplineStyle(r);
          const isRowLoading = loadingRows[r.id];
          
          // Stats for Collision View & Cost View (Unified)
          const rowWorks = works.filter(w => w.categoryId === r.id);
          const totalWorks = rowWorks.length;
          const acceptedWorks = rowWorks.filter(w => w.status === 'accepted').length;
          
          // Unified Row Header
          const isSelectedRow = (type === "collision" && selectedRowId === r.id) || (type === "cost" && selectedCell?.r === r.id);
          
          return (
          <React.Fragment key={r.id}>
            {/* Row Label */}
            <div 
              className={`sticky left-0 z-10 p-2 font-bold text-sm border-b border-r border-gray-200 cursor-pointer hover:brightness-95 flex flex-col justify-center transition-colors relative overflow-hidden min-h-[64px]
                ${isSelectedRow ? 'ring-inset ring-2 ring-blue-500' : ''}
                ${isRowLoading ? 'shadow-[inset_0_0_10px_rgba(37,99,235,0.2)] border-l-4 border-l-blue-500' : ''}
                `}
              onClick={() => {
                  if (type === 'collision') {
                      if (selectedRowId === r.id) {
                          setPanelOpen(!panelOpen);
                      } else {
                          setSelectedRowId(r.id);
                          setPanelOpen(true);
                      }
                  }
                  // In Cost view, clicking row header doesn't select the row in the same way, but could
              }}
              style={{ backgroundColor: style.bg }}
            >
               {/* Loading Progress Bar Background */}
               {isRowLoading && (
                   <div className="absolute bottom-0 left-0 h-1 bg-blue-500 transition-all duration-300 z-20" style={{ width: `${isRowLoading.progress}%` }}></div>
               )}
               {isRowLoading && (
                   <div className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full animate-ping"></div>
               )}

               <div className="flex flex-col items-start px-2 w-full">
                    <span style={{ color: style.text }} className="relative z-10">{r.code}</span>
                    <span className="text-[10px] font-normal opacity-80 truncate max-w-full relative z-10" style={{ color: style.text }} title={r.name}>{r.name}</span>
               </div>
               
               {/* Works Stats Badge - Unified and Fixed to prevent artifacts */}
               {totalWorks > 0 && !isRowLoading && (
                  <div className="flex gap-1 mt-1.5 px-2 relative z-10 w-full overflow-hidden">
                      <span className="text-[9px] bg-white/60 text-black px-1.5 py-0.5 rounded shadow-sm border border-black/5 whitespace-nowrap">{totalWorks}</span>
                      {acceptedWorks > 0 && (
                          <span className="text-[9px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded shadow-sm border border-green-200 whitespace-nowrap">✓ {acceptedWorks}</span>
                      )}
                  </div>
               )}

               {/* Show Loading Status Text if Selected */}
               {isRowLoading && isSelectedRow && (
                   <span className="text-[9px] text-blue-700 bg-white/80 rounded px-1 mx-2 mt-1 relative z-10 w-fit">{isRowLoading.step} ({Math.round(isRowLoading.progress)}%)</span>
               )}
            </div>

            {/* Cells */}
            {localizedDisciplines.map(c => {
              const isDiagonal = r.id === c.id;
              const cellKey = `${r.id}:${c.id}`;
              const isSelected = selectedCell?.r === r.id && selectedCell?.c === c.id;
              
              if (type === "collision") {
                 const symbol = isDiagonal ? "Д" : "П";
                 const bgClass = symbol === 'Д' ? 'bg-red-50 text-red-700 font-bold' : 'text-gray-400 font-light';
                 
                 return (
                   <div key={c.id} className={`border-b border-r border-gray-200 p-2 flex items-center justify-center ${bgClass} hover:bg-gray-50 transition-colors cursor-default`}>
                     {symbol}
                   </div>
                 );
              } else {
                 // Cost Matrix
                 const costData = getCellCostRange(r.id, c.id);
                 const isCellLoading = loadingCells[cellKey];
                 // Check if any scenario in this cell is matching
                 const isMatching = scenarios.some(s => s.matrixKey === cellKey && loadingMatches[s.id]);
                 
                 if (isDiagonal) return <div key={c.id} className="bg-gray-100 border-b border-r border-gray-200" />;
                 
                 return (
                   <div 
                    key={c.id} 
                    className={`border-b border-r border-gray-200 p-2 flex flex-col items-center justify-center cursor-pointer transition-all h-16 relative overflow-hidden
                        ${isSelected ? 'bg-blue-100 ring-inset ring-2 ring-blue-600 z-0' : 'hover:bg-gray-50'}
                        ${isCellLoading ? 'bg-blue-50' : ''}
                    `}
                    onClick={() => {
                        if (selectedCell?.r === r.id && selectedCell?.c === c.id) {
                            setPanelOpen(!panelOpen);
                        } else {
                            setSelectedCell({r: r.id, c: c.id});
                            setSelectedScenarioId(null);
                            setPanelOpen(true);
                        }
                    }}
                   >
                     {/* Cell Loading State */}
                     {isCellLoading && (
                         <>
                            <div className="absolute bottom-0 left-0 h-1 bg-blue-500 transition-all duration-300 z-10" style={{ width: `${isCellLoading.progress}%` }}></div>
                            <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                            <span className="text-[9px] text-blue-600 font-medium animate-pulse">{isCellLoading.step}</span>
                         </>
                     )}
                     
                     {/* Matching Indicator in Cell */}
                     {!isCellLoading && isMatching && (
                         <div className="absolute top-1 right-1 w-2 h-2 bg-orange-500 rounded-full animate-pulse z-10" title="Auto-Suggesting Works..."></div>
                     )}

                     {!isCellLoading && costData ? (
                        <>
                           <span className="text-sm font-bold text-gray-800">${costData.min}-{costData.max}</span>
                           <span className="text-[10px] text-gray-500 bg-white px-1 rounded border mt-1">{costData.count} var</span>
                        </>
                     ) : !isCellLoading ? (
                        <span className="text-lg text-gray-200 font-light">-</span>
                     ) : null}
                   </div>
                 );
              }
            })}
          </React.Fragment>
        )})}
      </div>
    </div>
  );
  
  // Computed for Render
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


  // --- Main Layout ---

  return (
    <div className="h-full flex flex-col bg-[var(--bg-app)]">
      {/* Top Bar */}
      <div className="bg-white border-b border-[var(--border)] px-6 py-3 flex items-center justify-between shadow-sm z-20">
        {/* SWAPPED: Tabs on Left */}
        <div className="flex bg-gray-100 p-1 rounded-lg">
          {(["collision", "cost", "settings", "logs"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize ${activeTab === tab ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t(`tabs.${tab}`)}
            </button>
          ))}
        </div>
        
        {/* SWAPPED: Logo on Right */}
        <div className="flex items-center gap-3">
          <h1 className="font-semibold text-lg text-gray-800">{t('appTitle')}</h1>
          <div className="bg-blue-600 text-white p-1.5 rounded font-bold font-mono">CMWC</div>
        </div>
      </div>

      {/* Toolbar (Dynamic based on tab) */}
      {activeTab === "collision" && (
        <div className="bg-white border-b px-6 py-2 flex items-center gap-4 text-sm shadow-sm z-10">
            <span className="font-medium text-gray-500 whitespace-nowrap">{t('collisionControls')}:</span>
            <div className="flex-1 flex gap-2">
                 <Input 
                    placeholder={t('placeholderUrl')}
                    value={urlInput} 
                    onChange={(e:any) => setUrlInput(e.target.value)}
                    className="max-w-md"
                />
                <Button 
                    onClick={handleLoadWorks} 
                    disabled={!selectedRowId || !!currentRowLoading}
                >
                    {currentRowLoading ? `${t('btnLoading')} (${Math.round(currentRowLoading.progress)}%)...` : t('btnLoad')}
                </Button>
            </div>
            <div className="flex items-center gap-2 border-l pl-4">
                <span className="text-gray-500 whitespace-nowrap">{t('minScope')}:</span>
                <input 
                  type="number" 
                  step="0.1" 
                  min="0" 
                  max="1" 
                  value={minScope} 
                  onChange={(e) => setMinScope(parseFloat(e.target.value))} 
                  className="w-16 bg-white text-gray-900 border border-gray-300 rounded p-1 text-sm focus:outline-none focus:border-blue-500"
                />
                <Button variant="secondary" onClick={handleAcceptWorks} disabled={!selectedRowId}>{t('btnAutoAccept')}</Button>
            </div>
        </div>
      )}

      {activeTab === "cost" && selectedCell && (
         <div className="bg-white border-b px-6 py-2 flex items-center gap-4 text-sm shadow-sm z-10">
             <span className="font-medium text-gray-500">
                {t('selected')}: <span className="text-blue-600 font-bold">{localizedDisciplines.find(d=>d.id===selectedCell.r)?.code}</span> vs <span className="text-blue-600 font-bold">{localizedDisciplines.find(d=>d.id===selectedCell.c)?.code}</span>
             </span>
             <div className="h-4 w-px bg-gray-300 mx-2"></div>
             <Button onClick={handleGenScenarios} disabled={!!currentCellLoading}>
                {currentCellLoading ? `${t('btnThinking')} (${currentCellLoading.step})...` : t('btnGenerate')}
             </Button>
         </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-hidden flex flex-col p-4 gap-4">
        
        {/* --- Collision Tab --- */}
        {activeTab === "collision" && (
          <div className="h-full flex flex-col gap-4">
            {/* Matrix View */}
            <div className={`flex flex-col transition-all duration-300 ease-in-out ${selectedRowId && panelOpen ? 'h-1/2' : 'h-full'}`}>
                <h2 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider flex justify-between items-center">
                    <span>{t('rankMatrix')}</span>
                    {selectedRowId && <span className="text-xs font-normal text-gray-400">{t('toggleDrawer')}</span>}
                </h2>
                {renderMatrix("collision")}
            </div>

            {/* Works Drawer */}
            {selectedRowId && (
                <>
                    {!panelOpen && (
                         <div 
                            className="bg-white border-l-4 border-l-blue-500 border rounded shadow p-3 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors"
                            onClick={() => setPanelOpen(true)}
                         >
                             <div className="flex flex-col">
                                <span className="text-sm font-semibold text-gray-700">
                                    {t('worksPanel')}: {localizedDisciplines.find(d => d.id === selectedRowId)?.code} <span className="text-gray-400 font-normal">({works.filter(w => w.categoryId === selectedRowId).length} items)</span>
                                </span>
                                {currentRowLoading && (
                                    <span className="text-xs text-blue-500 font-medium animate-pulse">
                                        {currentRowLoading.step} ({Math.round(currentRowLoading.progress)}%)
                                    </span>
                                )}
                             </div>
                             <div className="flex items-center gap-2 text-blue-600 text-sm font-medium">
                                <span>{t('showPanel')}</span>
                                <ToggleButton open={false} onClick={() => setPanelOpen(true)} />
                             </div>
                         </div>
                    )}
                    <div className={`bg-white border rounded shadow-lg flex flex-col transition-all duration-300 ease-in-out ${panelOpen ? 'h-1/2 opacity-100' : 'h-0 opacity-0 overflow-hidden border-0'}`}>
                        <div className="p-3 border-b bg-gray-50 flex justify-between items-center relative">
                            {/* Loading Overlay for Panel Header */}
                             {currentRowLoading && (
                                <div className="absolute bottom-0 left-0 h-1 bg-blue-500 transition-all duration-300 z-20" style={{ width: `${currentRowLoading.progress}%` }}></div>
                             )}

                            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                                {t('worksPanel')}: {localizedDisciplines.find(d => d.id === selectedRowId)?.code} - {localizedDisciplines.find(d => d.id === selectedRowId)?.name}
                                {currentRowLoading && <span className="text-xs font-normal text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{currentRowLoading.step}</span>}
                            </h3>
                            <div className="flex items-center gap-4">
                                <span className="text-xs font-mono bg-gray-200 px-2 py-1 rounded text-gray-600">
                                    Rank {localizedDisciplines.find(d => d.id === selectedRowId)?.rank}
                                </span>
                                <div className="flex items-center gap-1 text-gray-500 hover:text-gray-800 cursor-pointer" onClick={() => setPanelOpen(false)}>
                                    <span className="text-xs font-medium uppercase">{t('hide')}</span>
                                    <ToggleButton open={panelOpen} onClick={() => setPanelOpen(false)} />
                                </div>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto p-0 relative">
                            {/* Content Loading Overlay if empty and loading */}
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
                                            <td className="p-3 font-mono">${w.price}</td>
                                            <td className="p-3 text-gray-500">{w.unit}</td>
                                            <td className="p-3 text-xs text-gray-400 truncate max-w-[100px]">{w.source}</td>
                                            <td className="p-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-16 h-1.5 bg-gray-200 rounded overflow-hidden">
                                                        <div className={`h-full ${w.score > 0.7 ? 'bg-green-500' : 'bg-yellow-500'}`} style={{width: `${w.score * 100}%`}}/>
                                                    </div>
                                                    <span className="text-xs">{w.score.toFixed(2)}</span>
                                                </div>
                                            </td>
                                            <td className="p-3">
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize
                                                    ${w.status === 'accepted' ? 'bg-green-100 text-green-800' : 
                                                    w.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                    {w.status}
                                                </span>
                                            </td>
                                            <td className="p-3 text-right">
                                                <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => setWorks(prev => prev.map(wk => wk.id === w.id ? {...wk, status: 'accepted'} : wk))} className="text-green-600 hover:bg-green-100 p-1 rounded transition-colors">✓</button>
                                                    <button onClick={() => setWorks(prev => prev.map(wk => wk.id === w.id ? {...wk, status: 'rejected'} : wk))} className="text-red-600 hover:bg-red-100 p-1 rounded transition-colors">✕</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {!currentRowLoading && works.filter(w => w.categoryId === selectedRowId).length === 0 && (
                                        <tr><td colSpan={7} className="p-8 text-center text-gray-400">{t('noWorks')}</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
          </div>
        )}

        {/* --- Cost Tab --- */}
        {activeTab === "cost" && (
             <div className="h-full flex flex-col gap-4">
                 {/* Matrix */}
                 <div className={`flex flex-col transition-all duration-300 ease-in-out ${selectedCell && panelOpen ? 'h-1/2' : 'h-full'}`}>
                     <h2 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider flex justify-between items-center">
                        <span>{t('costMatrix')}</span>
                        {selectedCell && <span className="text-xs font-normal text-gray-400">{t('toggleDetail')}</span>}
                     </h2>
                     {renderMatrix("cost")}
                 </div>

                 {/* Scenarios & Scenario Works Split View */}
                 {selectedCell && (
                     <>
                        {!panelOpen && (
                            <div 
                                className="bg-white border-l-4 border-l-blue-500 border rounded shadow p-3 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors" 
                                onClick={() => setPanelOpen(true)}
                            >
                                <div className="flex flex-col">
                                    <span className="text-sm font-semibold text-gray-700">
                                        {t('scenarios')}: {localizedDisciplines.find(d => d.id === selectedCell.r)?.code} vs {localizedDisciplines.find(d => d.id === selectedCell.c)?.code}
                                    </span>
                                    {currentCellLoading && (
                                        <span className="text-xs text-blue-500 font-medium animate-pulse">
                                            {t('steps.generating')} ({Math.round(currentCellLoading.progress)}%)
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-blue-600 text-sm font-medium">
                                    <span>{t('showPanel')}</span>
                                    <ToggleButton open={false} onClick={() => setPanelOpen(true)} />
                                </div>
                            </div>
                        )}
                        <div className={`flex gap-4 transition-all duration-300 ease-in-out ${panelOpen ? 'h-1/2 opacity-100' : 'h-0 opacity-0 overflow-hidden'}`}>
                            {/* Scenarios List */}
                            <div className="w-1/2 bg-white border rounded shadow-sm flex flex-col relative">
                                {/* Loading Overlay for List (Replaces content) */}
                                {currentCellLoading ? (
                                    <div className="absolute inset-0 bg-white z-20 flex flex-col items-center justify-center">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                                        <span className="text-sm font-medium text-blue-600 animate-pulse">{t('generatingScenarios')}</span>
                                        <span className="text-xs text-gray-400 mt-2">{currentCellLoading.step} ({Math.round(currentCellLoading.progress)}%)</span>
                                    </div>
                                ) : (
                                    <>
                                        <div className="p-3 border-b bg-gray-50 font-semibold text-gray-700 flex justify-between items-center">
                                            <span>{t('scenarios')}</span>
                                            <div className="flex items-center gap-1 text-gray-500 hover:text-gray-800 cursor-pointer" onClick={() => setPanelOpen(false)}>
                                                <span className="text-xs font-medium uppercase">{t('hide')}</span>
                                                <ToggleButton open={panelOpen} onClick={() => setPanelOpen(false)} />
                                            </div>
                                        </div>
                                        <div className="flex-1 overflow-auto">
                                            <table className="w-full text-sm">
                                                <thead className="bg-gray-50 text-gray-500 sticky top-0">
                                                    <tr>
                                                        <th className="p-3 text-left border-b">{t('table.name')}</th>
                                                        <th className="p-3 text-left border-b">{t('table.totalCost')}</th>
                                                        <th className="p-3 w-10 border-b"></th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y">
                                                    {scenarios.filter(s => s.matrixKey === `${selectedCell.r}:${selectedCell.c}`).map(s => (
                                                        <tr 
                                                            key={s.id} 
                                                            className={`cursor-pointer hover:bg-blue-50 ${selectedScenarioId === s.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
                                                            onClick={() => setSelectedScenarioId(s.id)}
                                                        >
                                                            <td className="p-3">
                                                                <div className="font-medium">{s.name}</div>
                                                                <div className="text-xs text-gray-500 truncate max-w-[200px]">{s.description}</div>
                                                            </td>
                                                            <td className="p-3 font-mono font-medium text-blue-700">
                                                                ${calculateScenarioCost(s)}
                                                            </td>
                                                            <td className="p-3">
                                                                <button className="text-red-400 hover:text-red-600" onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setScenarios(prev => prev.filter(x => x.id !== s.id));
                                                                    if(selectedScenarioId === s.id) setSelectedScenarioId(null);
                                                                }}>×</button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {scenarios.filter(s => s.matrixKey === `${selectedCell.r}:${selectedCell.c}`).length === 0 && (
                                                        <tr><td colSpan={3} className="p-8 text-center text-gray-400">{t('noScenarios')}</td></tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Scenario Works Detail & Editing */}
                            <div className="w-1/2 bg-white border rounded shadow-sm flex flex-col relative">
                                {activeScenario ? (
                                    <>
                                        {/* Overlay for Matching Process */}
                                        {currentMatchLoading && (
                                            <div className="absolute inset-0 bg-white/70 z-30 flex flex-col items-center justify-center backdrop-blur-[1px]">
                                                <div className="w-48 bg-gray-200 rounded-full h-2 mb-2 overflow-hidden">
                                                    <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{width: `${currentMatchLoading.progress}%`}}></div>
                                                </div>
                                                <span className="text-sm font-bold text-blue-700 animate-pulse">{currentMatchLoading.step}</span>
                                            </div>
                                        )}

                                        <div className="p-3 border-b bg-gray-50 space-y-3">
                                            {/* Editable Header */}
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{t('scenarioName')}</label>
                                                <Input 
                                                    value={activeScenario.name} 
                                                    onChange={(e:any) => setScenarios(prev => prev.map(s => s.id === activeScenario.id ? {...s, name: e.target.value} : s))}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{t('description')}</label>
                                                <textarea 
                                                    className="w-full bg-white text-gray-900 border border-gray-300 rounded px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 min-h-[60px]" 
                                                    rows={4} 
                                                    value={activeScenario.description} 
                                                    onChange={(e:any) => setScenarios(prev => prev.map(s => s.id === activeScenario.id ? {...s, description: e.target.value} : s))}
                                                />
                                            </div>
                                        </div>

                                        {/* Add Work Bar */}
                                        <div className="p-2 border-b bg-gray-100 flex gap-2 items-center">
                                            <select 
                                                className="flex-1 bg-white text-gray-900 border border-gray-300 rounded px-2 py-2 text-xs focus:outline-none focus:border-blue-500"
                                                value={workToAddId}
                                                onChange={(e) => setWorkToAddId(e.target.value)}
                                            >
                                                <option value="">{t('addManual')}</option>
                                                {availableWorksForScenario.map(w => (
                                                    <option key={w.id} value={w.id}>{w.name} (${w.price}/{w.unit})</option>
                                                ))}
                                            </select>
                                            <Button onClick={handleAddManualWork} disabled={!workToAddId} className="py-1.5">{t('btnAdd')}</Button>
                                            <div className="w-px h-6 bg-gray-300 mx-1"></div>
                                            {/* Removed disabled={generalLoading} */}
                                            <Button variant="secondary" className="text-xs px-2 py-1.5" onClick={handleMatchWorks} disabled={!!currentMatchLoading}>
                                                {currentMatchLoading ? t('btnMatching') : t('btnAutoSuggest')}
                                            </Button>
                                        </div>

                                        {/* Works List */}
                                        <div className="flex-1 overflow-auto p-3">
                                            <div className="space-y-2">
                                                {activeScenario.works.map((sw, idx) => {
                                                    const w = works.find(k => k.id === sw.workId);
                                                    return (
                                                        <div key={sw.workId} className="flex items-center gap-2 p-2 border rounded bg-gray-50">
                                                            <input 
                                                                type="checkbox" 
                                                                checked={sw.active} 
                                                                onChange={() => {
                                                                    setScenarios(prev => prev.map(s => {
                                                                        if(s.id === activeScenario.id) {
                                                                            const newWorks = [...s.works];
                                                                            newWorks[idx] = {...newWorks[idx], active: !newWorks[idx].active};
                                                                            return {...s, works: newWorks};
                                                                        }
                                                                        return s;
                                                                    }))
                                                                }}
                                                                className="h-4 w-4 text-blue-600 rounded"
                                                            />
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-sm font-medium truncate" title={w?.name}>{w?.name || "Unknown Work"}</div>
                                                                <div className="text-xs text-gray-500">${w?.price} / {w?.unit}</div>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <input 
                                                                    type="number" 
                                                                    className="w-16 text-right bg-white text-gray-900 border border-gray-300 rounded p-1 text-sm focus:outline-none focus:border-blue-500"
                                                                    value={sw.quantity}
                                                                    onChange={(e) => {
                                                                        const val = parseFloat(e.target.value);
                                                                        setScenarios(prev => prev.map(s => {
                                                                            if(s.id === activeScenario.id) {
                                                                                const newWorks = [...s.works];
                                                                                newWorks[idx] = {...newWorks[idx], quantity: val};
                                                                                return {...s, works: newWorks};
                                                                            }
                                                                            return s;
                                                                        }))
                                                                    }}
                                                                />
                                                            </div>
                                                            <div className="w-16 text-right text-sm font-mono">
                                                                ${((w?.price || 0) * sw.quantity).toFixed(0)}
                                                            </div>
                                                            <button 
                                                                onClick={() => handleRemoveWorkFromScenario(sw.workId)}
                                                                className="text-gray-400 hover:text-red-500 p-1"
                                                                title="Remove work"
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    )
                                                })}
                                                {activeScenario.works.length === 0 && (
                                                    <div className="text-center text-gray-400 mt-10 p-4 border-2 border-dashed rounded">
                                                        <p>{t('noWorksAdded')}</p>
                                                        <p className="text-xs mt-2">{t('noWorksAddedHint')}</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex-1 flex items-center justify-center text-gray-400 bg-gray-50">
                                        <p>{t('selectScenario')}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                     </>
                 )}
             </div>
        )}

        {/* --- Settings Tab --- */}
        {activeTab === "settings" && (
            <div className="max-w-2xl mx-auto w-full mt-10">
                <div className="bg-white border rounded shadow-sm p-6 space-y-6">
                    <h2 className="text-xl font-bold text-gray-800">{t('settingsTitle')}</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{t('apiKeyLabel')}</label>
                            <Input 
                                type="password" 
                                value={settings.apiKey} 
                                onChange={(e:any) => setSettings(s => ({...s, apiKey: e.target.value}))}
                                placeholder="Enter Google GenAI API Key"
                            />
                            <p className="text-xs text-gray-500 mt-1">{t('apiKeyHint')}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{t('modelLabel')}</label>
                            <Input 
                                value={settings.model} 
                                onChange={(e:any) => setSettings(s => ({...s, model: e.target.value}))}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{t('languageLabel')}</label>
                            <div className="flex bg-gray-100 rounded p-1 w-fit">
                                <button 
                                    className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${settings.language === 'en' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                    onClick={() => setSettings(s => ({...s, language: 'en'}))}
                                >
                                    English
                                </button>
                                <button 
                                    className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${settings.language === 'ru' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                    onClick={() => setSettings(s => ({...s, language: 'ru'}))}
                                >
                                    Русский
                                </button>
                            </div>
                        </div>

                        <div className="pt-4 border-t">
                            <h3 className="font-medium mb-2">{t('dataMgmt')}</h3>
                             <p className="text-sm text-gray-600 mb-4">{t('dataMgmtHint')}</p>
                            <div className="flex gap-3 items-center">
                                <Button variant="secondary" onClick={handleExportData}>
                                    {t('btnExport')}
                                </Button>
                                <div className="relative">
                                    <input 
                                        type="file" 
                                        accept=".json"
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        onChange={handleImportData}
                                    />
                                    <Button variant="secondary">
                                        {t('btnImport')}
                                    </Button>
                                </div>
                                <span className="text-xs text-gray-500">
                                    {works.length} works, {scenarios.length} scenarios loaded.
                                </span>
                            </div>
                        </div>
                        <div className="pt-4 border-t">
                            <h3 className="font-medium mb-2">{t('systemStatus')}</h3>
                            <div className="flex gap-2">
                                <div className="flex items-center gap-2 px-3 py-1 rounded bg-gray-100 text-sm">
                                    <div className={`w-2 h-2 rounded-full ${settings.apiKey ? 'bg-green-500' : 'bg-red-500'}`}/>
                                    {t('apiConfigured')}
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1 rounded bg-gray-100 text-sm">
                                    <div className="w-2 h-2 rounded-full bg-blue-500"/>
                                    {t('storageActive')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* --- Logs Tab --- */}
        {activeTab === "logs" && (
            <div className="h-full bg-white border rounded shadow-sm flex flex-col">
                <div className="p-4 border-b bg-gray-50 font-bold text-gray-700 flex justify-between">
                    <span>{t('logsTitle')}</span>
                    <span className="text-sm font-normal text-gray-500">{t('totalTokens')}: {logs.reduce((a,b) => a + b.tokensUsed, 0)}</span>
                </div>
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 sticky top-0">
                            <tr>
                                <th className="p-3">Time</th>
                                <th className="p-3">Action</th>
                                <th className="p-3">Status</th>
                                <th className="p-3">Tokens</th>
                                <th className="p-3">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {logs.map(log => (
                                <tr key={log.id} className="hover:bg-gray-50">
                                    <td className="p-3 text-gray-500 font-mono text-xs">
                                        {new Date(log.timestamp).toLocaleTimeString()}
                                    </td>
                                    <td className="p-3 font-medium">{log.action}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${log.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {log.status}
                                        </span>
                                    </td>
                                    <td className="p-3 font-mono">{log.tokensUsed}</td>
                                    <td className="p-3 text-gray-600">{log.details}</td>
                                </tr>
                            ))}
                            {logs.length === 0 && (
                                <tr><td colSpan={5} className="p-8 text-center text-gray-400">{t('noLogs')}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
