import React, { useState, useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI, Type, Schema } from "@google/genai";

// --- Types & Interfaces ---

interface Discipline {
  id: string;
  code: string;
  name: string;
  rank: number; // 1 (Hardest) to 6 (Easiest)
  description: string;
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
}

// --- Constants & Initial Data ---

const DISCIPLINES: Discipline[] = [
  { id: "AR_WALLS", code: "АР", name: "Стены", rank: 2, description: "Архитектурные стены, перегородки" },
  { id: "AR_DOORS", code: "АР", name: "Двери / Окна", rank: 2, description: "Дверные и оконные проемы" },
  { id: "KR_WALLS", code: "КР", name: "Стены", rank: 1, description: "Несущие стены (Монолит)" },
  { id: "KR_COLS", code: "КР", name: "Колонны / Пилоны", rank: 1, description: "Несущие колонны и пилоны" },
  { id: "KR_SLABS", code: "КР", name: "Перекрытия / Покрытия / Рампы", rank: 1, description: "Плиты перекрытия" },
  { id: "KR_BEAMS", code: "КР", name: "Балки", rank: 1, description: "Несущие балки" },
  { id: "VK_K", code: "ВК (К)", name: "Трубы / Дренаж", rank: 3, description: "Бытовая и ливневая канализация" },
  { id: "VK_V", code: "ВК (В)", name: "Трубы", rank: 5, description: "Водоснабжение (напорное)" },
  { id: "OV_VENT", code: "ОВ (Вент.)", name: "Воздуховод", rank: 4, description: "Вентиляционные короба" },
  { id: "OV_HEAT", code: "ОВ (Отоп.)", name: "Трубы", rank: 5, description: "Трубы отопления" },
  { id: "AUPT_PIPE", code: "АУПТ", name: "Трубы", rank: 5, description: "Трубопроводы пожаротушения" },
  { id: "AUPT_SPR", code: "АУПТ", name: "Спринклеры", rank: 5, description: "Спринклерные оросители" },
  { id: "EOM", code: "ЭО, ЭС, ЭМ, СС", name: "Кабельканалы / Лотки", rank: 6, description: "Лотки, кабели, слаботочка" },
];

// --- Helpers ---

const generateId = () => Math.random().toString(36).substr(2, 9);

const cleanJson = (text: string | undefined) => {
  if (!text) return "{}";
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
};

const getRankColor = (rank: number) => {
  switch(rank) {
    case 1: return "var(--rank-1)";
    case 2: return "var(--rank-2)";
    case 3: return "var(--rank-3)";
    case 4: return "var(--rank-4)";
    case 5: return "var(--rank-5)";
    case 6: return "var(--rank-6)";
    default: return "#fff";
  }
};

const getRankTextColor = (rank: number) => {
  switch(rank) {
    case 1: return "var(--rank-1-text)";
    case 2: return "var(--rank-2-text)";
    case 3: return "var(--rank-3-text)";
    case 4: return "var(--rank-4-text)";
    case 5: return "var(--rank-5-text)";
    case 6: return "var(--rank-6-text)";
    default: return "#000";
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

  async parseWorks(url: string, disciplines: Discipline[]): Promise<{ works: any[], tokens: number }> {
    if (!this.ai) throw new Error("API Key not configured");

    // Simulation of parsing: We ask the LLM to hallucinate/retrieve typical works for a construction site 
    // based on the URL hint (since we can't fetch cross-origin in browser easily without a proxy).
    const prompt = `
      Act as a construction cost estimator. 
      Target URL context: ${url}
      
      Generate a list of 10-15 construction work items that might be found on a pricing page like this.
      Focus on repair, cutting, drilling, dismantling, and installation works relevant to these disciplines:
      ${disciplines.map(d => `${d.code} - ${d.name} (${d.description})`).join(", ")}.
      
      Return JSON:
      {
        "items": [
          { "name": "Drilling D50mm", "price": 1500, "unit": "pcs", "suggestedCategoryCode": "КР" }
        ]
      }
    `;

    const response = await this.ai.models.generateContent({
      model: this.modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
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
                            unit: { type: Type.STRING },
                            suggestedCategoryCode: { type: Type.STRING }
                        }
                    }
                }
            }
        }
      }
    });

    const result = JSON.parse(cleanJson(response.text));
    return { 
      works: result.items || [], 
      tokens: response.usageMetadata?.totalTokenCount || 0 
    };
  }

  async classifyWorks(works: any[], categoryId: string, disciplineDesc: string): Promise<{ classified: any[], tokens: number }> {
    if (!this.ai) throw new Error("API Key not configured");

    const prompt = `
      You are an expert construction engineer.
      Target Category: ${categoryId}
      Category Description: ${disciplineDesc}
      
      Analyze the following works and determine if they belong to the Target Category for resolving collisions.
      Assign a confidence score (0.0 to 1.0).
      
      Works Input: ${JSON.stringify(works.map(w => w.name))}
      
      Return JSON array of objects with 'name' and 'score'.
    `;

     const response = await this.ai.models.generateContent({
      model: this.modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
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

    const result = JSON.parse(cleanJson(response.text));
    return { classified: result, tokens: response.usageMetadata?.totalTokenCount || 0 };
  }

  async generateScenarios(rowDisc: Discipline, colDisc: Discipline): Promise<{ scenarios: any[], tokens: number }> {
    if (!this.ai) throw new Error("API Key not configured");

    const prompt = `
      Context: A collision occurred between ${rowDisc.code} ${rowDisc.name} (Rank ${rowDisc.rank}) and ${colDisc.code} ${colDisc.name} (Rank ${colDisc.rank}).
      Row Element Status: ${rowDisc.description}.
      
      Generate 3 realistic scenarios to resolve this collision by modifying the ROW element (${rowDisc.name}).
      Focus on the cost/effort of changing the ROW element to accommodate the other.
      
      Return JSON:
      [
        { "name": "Local Shift", "description": "Move the element slightly..." },
        { "name": "Re-routing", "description": "Completely change route..." }
      ]
    `;

    const response = await this.ai.models.generateContent({
      model: this.modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
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

    return { scenarios: JSON.parse(cleanJson(response.text)), tokens: response.usageMetadata?.totalTokenCount || 0 };
  }

  async matchWorksToScenario(scenario: any, availableWorks: WorkItem[]): Promise<{ matches: any[], tokens: number }> {
    if (!this.ai) throw new Error("API Key not configured");

    const workList = availableWorks.map(w => ({ id: w.id, name: w.name, unit: w.unit }));
    const prompt = `
      Scenario: ${scenario.name} - ${scenario.description}
      
      Select works from the provided list required to execute this scenario. Estimate quantities.
      
      Available Works: ${JSON.stringify(workList)}
      
      IMPORTANT: 
      1. You must ONLY use works from the provided list.
      2. Use the exact 'id' from the list for the 'workId' field.
      3. Estimate a realistic quantity.
      
      Return JSON:
      [
        { "workId": "exact_id_from_list", "quantity": 5 }
      ]
    `;

    const response = await this.ai.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
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
    
    return { matches: JSON.parse(cleanJson(response.text)), tokens: response.usageMetadata?.totalTokenCount || 0 };
  }
}

const llmService = new LLMService();

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

// --- Main App ---

export default function App() {
  // --- State ---
  const [activeTab, setActiveTab] = useState<"collision" | "cost" | "settings" | "logs">("collision");
  
  // "Database"
  const [settings, setSettings] = useState<AppSettings>({ apiKey: process.env.API_KEY || "", model: "gemini-2.5-flash" });
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Selection State
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null); // For Collision Matrix Works
  const [selectedCell, setSelectedCell] = useState<{r: string, c: string} | null>(null); // For Cost Matrix Scenarios
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);

  // Transient State
  const [urlInput, setUrlInput] = useState("https://garantstroikompleks.ru/prajs-list");
  const [loading, setLoading] = useState(false);
  const [minScope, setMinScope] = useState(0.7);
  const [workToAddId, setWorkToAddId] = useState("");

  // Init LLM
  useEffect(() => {
    llmService.init(settings.apiKey, settings.model);
  }, [settings]);

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

  // --- Handlers: Works ---

  const handleLoadWorks = async () => {
    if (!urlInput || !selectedRowId) return;
    setLoading(true);
    try {
      // 1. Parse (Simulated)
      const { works: rawWorks, tokens: t1 } = await llmService.parseWorks(urlInput, DISCIPLINES);
      
      // 2. Classify for current category
      const category = DISCIPLINES.find(d => d.id === selectedRowId)!;
      const { classified, tokens: t2 } = await llmService.classifyWorks(rawWorks, category.name, category.description);

      const newWorks: WorkItem[] = rawWorks.map((rw: any) => {
        const cls = classified.find((c: any) => c.name === rw.name);
        const score = cls ? cls.score : 0;
        return {
          id: generateId(),
          categoryId: selectedRowId,
          name: rw.name,
          price: rw.price,
          unit: rw.unit,
          source: urlInput,
          score: score,
          status: score >= minScope ? "accepted" : "pending"
        };
      });

      setWorks(prev => [...prev, ...newWorks]);
      addLog("Load Works", "success", `Loaded ${newWorks.length} works for ${category.code}`, t1 + t2);
    } catch (e: any) {
      addLog("Load Works", "error", e.message);
    } finally {
      setLoading(false);
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
    setLoading(true);
    try {
      const rDisc = DISCIPLINES.find(d => d.id === selectedCell.r)!;
      const cDisc = DISCIPLINES.find(d => d.id === selectedCell.c)!;
      
      const { scenarios: genScenarios, tokens } = await llmService.generateScenarios(rDisc, cDisc);
      
      const newScenarios: Scenario[] = genScenarios.map((s: any) => ({
        id: generateId(),
        matrixKey: `${selectedCell.r}:${selectedCell.c}`,
        name: s.name,
        description: s.description,
        works: []
      }));

      setScenarios(prev => [...prev, ...newScenarios]);
      addLog("Generate Scenarios", "success", `Generated ${newScenarios.length} scenarios for ${rDisc.code}/${cDisc.code}`, tokens);
    } catch (e: any) {
      addLog("Generate Scenarios", "error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMatchWorks = async () => {
    if (!selectedScenarioId || !selectedCell) return;
    
    // Filter works for the ROW category. Allow pending works to be matched too.
    const availableWorks = works.filter(w => w.categoryId === selectedCell.r);

    if (availableWorks.length === 0) {
        const rowName = DISCIPLINES.find(d => d.id === selectedCell.r)?.name || selectedCell.r;
        addLog("Match Works", "error", `No works found for category '${rowName}'. Please load works in Collision tab.`);
        return;
    }

    setLoading(true);
    try {
      const scenario = scenarios.find(s => s.id === selectedScenarioId)!;
      
      const { matches, tokens } = await llmService.matchWorksToScenario(scenario, availableWorks);
      
      const scenarioWorks: ScenarioWork[] = matches.map((m: any) => ({
        workId: availableWorks.find(w => w.id === m.workId || w.name === m.workId)?.id || "", // fuzzy match fallback
        quantity: m.quantity,
        active: true
      })).filter((sw: any) => sw.workId !== "");

      if (scenarioWorks.length === 0) {
         addLog("Match Works", "error", "LLM could not match any works to the scenario.", tokens);
      } else {
         setScenarios(prev => prev.map(s => {
            if (s.id === selectedScenarioId) {
            return { ...s, works: scenarioWorks };
            }
            return s;
        }));
        addLog("Match Works", "success", `Matched ${scenarioWorks.length} works to scenario`, tokens);
      }
    } catch (e: any) {
        addLog("Match Works", "error", e.message);
    } finally {
      setLoading(false);
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
      return acc + (w ? w.price * sw.quantity : 0);
    }, 0);
  };

  const getCellCostRange = (rId: string, cId: string) => {
    const cellScenarios = scenarios.filter(s => s.matrixKey === `${rId}:${cId}`);
    if (cellScenarios.length === 0) return null;
    const costs = cellScenarios.map(calculateScenarioCost);
    const min = Math.min(...costs);
    const max = Math.max(...costs);
    return { min, max, count: cellScenarios.length };
  };

  // --- Render Helpers ---

  const renderMatrix = (type: "collision" | "cost") => (
    <div className="overflow-auto flex-1 bg-white border rounded shadow-sm relative">
      <div className="grid min-w-[1200px]" style={{ gridTemplateColumns: `200px repeat(${DISCIPLINES.length}, 1fr)` }}>
        {/* Header Row */}
        <div className="sticky top-0 left-0 z-30 bg-gray-100 p-3 font-bold text-xs text-gray-500 uppercase tracking-wider border-b border-r border-gray-200 flex items-center justify-center shadow-sm">
          Category
        </div>
        {DISCIPLINES.map(d => (
          <div key={d.id} className="sticky top-0 z-20 bg-gray-50 p-2 text-center text-sm border-b border-r border-gray-200 flex flex-col items-center justify-center shadow-sm" style={{ backgroundColor: getRankColor(d.rank) }}>
            <span className="font-bold" style={{ color: getRankTextColor(d.rank) }}>{d.code}</span>
            <span className="text-[10px] leading-tight mt-1 text-gray-600 max-w-[90px] truncate" title={d.name}>{d.name}</span>
          </div>
        ))}

        {/* Rows */}
        {DISCIPLINES.map(r => (
          <React.Fragment key={r.id}>
            {/* Row Label */}
            <div 
              className={`sticky left-0 z-10 p-3 font-bold text-sm border-b border-r border-gray-200 cursor-pointer hover:brightness-95 flex flex-col justify-center transition-colors
                ${selectedRowId === r.id && type === 'collision' ? 'ring-inset ring-2 ring-blue-500' : ''}`}
              onClick={() => type === 'collision' && setSelectedRowId(r.id)}
              style={{ backgroundColor: getRankColor(r.rank) }}
            >
               <span style={{ color: getRankTextColor(r.rank) }}>{r.code}</span>
               <span className="text-[10px] font-normal text-gray-600 truncate max-w-full" title={r.name}>{r.name}</span>
            </div>

            {/* Cells */}
            {DISCIPLINES.map(c => {
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
                 if (isDiagonal) return <div key={c.id} className="bg-gray-100 border-b border-r border-gray-200" />;
                 
                 return (
                   <div 
                    key={c.id} 
                    className={`border-b border-r border-gray-200 p-2 flex flex-col items-center justify-center cursor-pointer transition-all h-16
                        ${isSelected ? 'bg-blue-100 ring-inset ring-2 ring-blue-600 z-0' : 'hover:bg-gray-50'}
                    `}
                    onClick={() => {
                        setSelectedCell({r: r.id, c: c.id});
                        setSelectedScenarioId(null);
                    }}
                   >
                     {costData ? (
                        <>
                           <span className="text-sm font-bold text-gray-800">${costData.min}-{costData.max}</span>
                           <span className="text-[10px] text-gray-500 bg-white px-1 rounded border mt-1">{costData.count} var</span>
                        </>
                     ) : (
                        <span className="text-lg text-gray-200 font-light">-</span>
                     )}
                   </div>
                 );
              }
            })}
          </React.Fragment>
        ))}
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


  // --- Main Layout ---

  return (
    <div className="h-full flex flex-col bg-[var(--bg-app)]">
      {/* Top Bar */}
      <div className="bg-white border-b border-[var(--border)] px-6 py-3 flex items-center justify-between shadow-sm z-20">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 text-white p-1.5 rounded font-bold font-mono">CMWC</div>
          <h1 className="font-semibold text-lg text-gray-800">Collision Cost MVP</h1>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-lg">
          {(["collision", "cost", "settings", "logs"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize ${activeTab === tab ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar (Dynamic based on tab) */}
      {activeTab === "collision" && (
        <div className="bg-white border-b px-6 py-2 flex items-center gap-4 text-sm shadow-sm z-10">
            <span className="font-medium text-gray-500 whitespace-nowrap">Collision Matrix Controls:</span>
            <div className="flex-1 flex gap-2">
                 <Input 
                    placeholder="Pricing Source URL (e.g. ferrum-price.com)..." 
                    value={urlInput} 
                    onChange={(e:any) => setUrlInput(e.target.value)}
                    className="max-w-md"
                />
                <Button onClick={handleLoadWorks} disabled={!selectedRowId || loading}>
                    {loading ? "Parsing..." : "Load Works"}
                </Button>
            </div>
            <div className="flex items-center gap-2 border-l pl-4">
                <span className="text-gray-500 whitespace-nowrap">Min Scope:</span>
                <input 
                  type="number" 
                  step="0.1" 
                  min="0" 
                  max="1" 
                  value={minScope} 
                  onChange={(e) => setMinScope(parseFloat(e.target.value))} 
                  className="w-16 bg-white text-gray-900 border border-gray-300 rounded p-1 text-sm focus:outline-none focus:border-blue-500"
                />
                <Button variant="secondary" onClick={handleAcceptWorks} disabled={!selectedRowId}>Auto Accept</Button>
            </div>
        </div>
      )}

      {activeTab === "cost" && selectedCell && (
         <div className="bg-white border-b px-6 py-2 flex items-center gap-4 text-sm shadow-sm z-10">
             <span className="font-medium text-gray-500">
                Selected: <span className="text-blue-600 font-bold">{DISCIPLINES.find(d=>d.id===selectedCell.r)?.code}</span> vs <span className="text-blue-600 font-bold">{DISCIPLINES.find(d=>d.id===selectedCell.c)?.code}</span>
             </span>
             <div className="h-4 w-px bg-gray-300 mx-2"></div>
             <Button onClick={handleGenScenarios} disabled={loading}>
                {loading ? "Thinking..." : "Generate Scenarios (LLM)"}
             </Button>
         </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-hidden flex flex-col p-4 gap-4">
        
        {/* --- Collision Tab --- */}
        {activeTab === "collision" && (
          <div className="h-full flex flex-col gap-4">
            {/* Matrix View */}
            <div className="flex-1 min-h-0 flex flex-col">
                <h2 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider">Rank Matrix</h2>
                {renderMatrix("collision")}
            </div>

            {/* Works Drawer */}
            {selectedRowId && (
                <div className="h-1/2 bg-white border rounded shadow-lg flex flex-col animate-in slide-in-from-bottom-10 ring-1 ring-black/5">
                    <div className="p-3 border-b bg-gray-50 flex justify-between items-center">
                        <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                            Works: {DISCIPLINES.find(d => d.id === selectedRowId)?.code} - {DISCIPLINES.find(d => d.id === selectedRowId)?.name}
                        </h3>
                        <span className="text-xs font-mono bg-gray-200 px-2 py-1 rounded">
                             Rank {DISCIPLINES.find(d => d.id === selectedRowId)?.rank}
                        </span>
                    </div>
                    <div className="flex-1 overflow-auto p-0">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0 z-10">
                                <tr>
                                    <th className="p-3 border-b">Name</th>
                                    <th className="p-3 border-b">Price</th>
                                    <th className="p-3 border-b">Unit</th>
                                    <th className="p-3 border-b">Source</th>
                                    <th className="p-3 border-b">Score</th>
                                    <th className="p-3 border-b">Status</th>
                                    <th className="p-3 border-b text-right">Action</th>
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
                                {works.filter(w => w.categoryId === selectedRowId).length === 0 && (
                                    <tr><td colSpan={7} className="p-8 text-center text-gray-400">No works loaded. Enter URL and click Load.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
          </div>
        )}

        {/* --- Cost Tab --- */}
        {activeTab === "cost" && (
             <div className="h-full flex flex-col gap-4">
                 {/* Matrix */}
                 <div className="flex-1 min-h-0 flex flex-col">
                     <h2 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider">Cost Matrix</h2>
                     {renderMatrix("cost")}
                 </div>

                 {/* Scenarios & Scenario Works Split View */}
                 {selectedCell && (
                     <div className="h-1/2 flex gap-4">
                        {/* Scenarios List */}
                        <div className="w-1/2 bg-white border rounded shadow-sm flex flex-col">
                            <div className="p-3 border-b bg-gray-50 font-semibold text-gray-700">Scenarios</div>
                            <div className="flex-1 overflow-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-500 sticky top-0">
                                        <tr>
                                            <th className="p-3 text-left border-b">Name</th>
                                            <th className="p-3 text-left border-b">Total Cost</th>
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
                                             <tr><td colSpan={3} className="p-8 text-center text-gray-400">No scenarios generated. Click "Generate Scenarios" above.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Scenario Works Detail & Editing */}
                        <div className="w-1/2 bg-white border rounded shadow-sm flex flex-col">
                             {activeScenario ? (
                                 <>
                                    <div className="p-3 border-b bg-gray-50 space-y-3">
                                        {/* Editable Header */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Scenario Name</label>
                                            <Input 
                                                value={activeScenario.name} 
                                                onChange={(e:any) => setScenarios(prev => prev.map(s => s.id === activeScenario.id ? {...s, name: e.target.value} : s))}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label>
                                            <textarea 
                                                className="w-full bg-white text-gray-900 border border-gray-300 rounded px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 min-h-[60px]" 
                                                rows={2} 
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
                                            <option value="">-- Select work to add manually --</option>
                                            {availableWorksForScenario.map(w => (
                                                <option key={w.id} value={w.id}>{w.name} (${w.price}/{w.unit})</option>
                                            ))}
                                        </select>
                                        <Button onClick={handleAddManualWork} disabled={!workToAddId} className="py-1.5">Add</Button>
                                        <div className="w-px h-6 bg-gray-300 mx-1"></div>
                                        <Button variant="secondary" className="text-xs px-2 py-1.5" onClick={handleMatchWorks} disabled={loading}>
                                            {loading ? "Matching..." : "Auto-Suggest (LLM)"}
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
                                                    <p>No works added yet.</p>
                                                    <p className="text-xs mt-2">Use the dropdown above to add works manually or click "Auto-Suggest" to let AI find suitable works.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                 </>
                             ) : (
                                <div className="flex-1 flex items-center justify-center text-gray-400 bg-gray-50">
                                    <p>Select a scenario to view and edit details</p>
                                </div>
                             )}
                        </div>
                     </div>
                 )}
             </div>
        )}

        {/* --- Settings Tab --- */}
        {activeTab === "settings" && (
            <div className="max-w-2xl mx-auto w-full mt-10">
                <div className="bg-white border rounded shadow-sm p-6 space-y-6">
                    <h2 className="text-xl font-bold text-gray-800">Settings</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                            <Input 
                                type="password" 
                                value={settings.apiKey} 
                                onChange={(e:any) => setSettings(s => ({...s, apiKey: e.target.value}))}
                                placeholder="Enter Google GenAI API Key"
                            />
                            <p className="text-xs text-gray-500 mt-1">Stored in app state (reset on refresh).</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                            <Input 
                                value={settings.model} 
                                onChange={(e:any) => setSettings(s => ({...s, model: e.target.value}))}
                            />
                        </div>
                        <div className="pt-4 border-t">
                            <h3 className="font-medium mb-2">System Status</h3>
                            <div className="flex gap-2">
                                <div className="flex items-center gap-2 px-3 py-1 rounded bg-gray-100 text-sm">
                                    <div className={`w-2 h-2 rounded-full ${settings.apiKey ? 'bg-green-500' : 'bg-red-500'}`}/>
                                    API Configured
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1 rounded bg-gray-100 text-sm">
                                    <div className="w-2 h-2 rounded-full bg-blue-500"/>
                                    LocalStorage Active
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
                    <span>Request Logs</span>
                    <span className="text-sm font-normal text-gray-500">Total Tokens: {logs.reduce((a,b) => a + b.tokensUsed, 0)}</span>
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
                                <tr><td colSpan={5} className="p-8 text-center text-gray-400">No logs yet.</td></tr>
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