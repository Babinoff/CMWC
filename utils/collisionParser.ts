export const mapPathToCategory = (path: string): string | null => {
    const p = path.toUpperCase();
    
    // AI (Interiors)
    if (p.includes("АИ") || p.includes("INTERIORS") || p.includes("ОТДЕЛКА")) return "AI";
    
    // SS (Low Current)
    if (p.includes("СС") || p.includes("АПС") || p.includes("ПОЖАРН") || p.includes("LOW CURRENT")) return "SS";

    // OV - ITP
    if (p.includes("ИТП") || p.includes("ITP") || p.includes("HEAT POINT") || p.includes("ТЕПЛОВОЙ ПУНКТ")) return "OV_ITP";

    // AR - Facade / Roof / Walls
    if (p.includes("ФАСАД") || p.includes("FACADE")) return "AR_FACADE";
    if (p.includes("КРОВЛЯ") || p.includes("ROOF")) return "AR_ROOF";
    if (p.includes("КЛАДКА") || p.includes("BRICK") || p.includes("BLOCK")) return "AR_WALLS";
    
    // VK - SML (Cast Iron) -> Drainage
    if (p.includes("SML") || p.includes("ЧУГУН") || p.includes("КАНАЛИЗАЦИЯ")) return "VK_K";

    // KR (Constructive)
    if (p.includes("КР") || p.includes("KR") || p.includes("KJR")) {
        if (p.includes("СТЕН") || p.includes("WALL")) return "KR_WALLS";
        if (p.includes("КОЛОН") || p.includes("COLUMN") || p.includes("ПИЛОН") || p.includes("PYLON")) return "KR_COLS";
        if (p.includes("ПЕРЕКР") || p.includes("SLAB") || p.includes("ПЛИТ") || p.includes("FLOOR")) return "KR_SLABS";
        if (p.includes("БАЛК") || p.includes("BEAM") || p.includes("РИГЕЛ")) return "KR_BEAMS";
    }

    // AR (Architecture) - Standard
    if (p.includes("АР") || p.includes("AR")) {
        if (p.includes("СТЕН") || p.includes("WALL") || p.includes("ПЕРЕГОРОД")) return "AR_WALLS";
        if (p.includes("ДВЕР") || p.includes("DOOR") || p.includes("ОКН") || p.includes("WINDOW")) return "AR_DOORS";
    }

    // Fallback to standard disciplines if path contains them explicitly
    if (p.includes("ВИС/АПТ")) return "AUPT_PIPE";
    if (p.includes("ВИС/ВК")) return "VK_V"; // Generic VK
    if (p.includes("ВИС/ОВ")) return "OV_VENT"; // Generic OV
    if (p.includes("ВИС/ЭОМ")) return "EOM";

    return null;
};

export const codeMap: Record<string, string[]> = {
    "АР": ["AR_WALLS", "AR_DOORS", "AR_FACADE", "AR_ROOF"],
    "AR": ["AR_WALLS", "AR_DOORS", "AR_FACADE", "AR_ROOF"],
    "КР": ["KR_WALLS", "KR_COLS", "KR_SLABS", "KR_BEAMS"],
    "KR": ["KR_WALLS", "KR_COLS", "KR_SLABS", "KR_BEAMS"],
    "ВК": ["VK_K", "VK_V"],
    "VK": ["VK_K", "VK_V"],
    "ОВ": ["OV_VENT", "OV_HEAT", "OV_ITP"],
    "OV": ["OV_VENT", "OV_HEAT", "OV_ITP"],
    "ИТП": ["OV_ITP"],
    "ITP": ["OV_ITP"],
    "АУПТ": ["AUPT_PIPE", "AUPT_SPR"],
    "AUPT": ["AUPT_PIPE", "AUPT_SPR"],
    "ЭОМ": ["EOM"],
    "EOM": ["EOM"],
    "ЭО": ["EOM"],
    "ЭС": ["EOM"],
    "ЭМ": ["EOM"],
    "СС": ["SS"],
    "SS": ["SS"],
    "АИ": ["AI"],
    "AI": ["AI"]
};

export const refinement = (possibleIds: string[], text: string) => {
    if (possibleIds.length === 1) return possibleIds[0];
    
    const textLower = text.toLowerCase();
    
    // AR Refinement
    if (possibleIds.includes("AR_FACADE") && (textLower.includes("фасад") || textLower.includes("facade"))) return "AR_FACADE";
    if (possibleIds.includes("AR_ROOF") && (textLower.includes("кровл") || textLower.includes("roof"))) return "AR_ROOF";
    if (possibleIds.includes("AR_WALLS") && (textLower.includes("стен") || textLower.includes("верт") || textLower.includes("кладк") || textLower.includes("block") || textLower.includes("brick"))) return "AR_WALLS";
    if (possibleIds.includes("AR_DOORS") && (textLower.includes("двер") || textLower.includes("окон"))) return "AR_DOORS";

    // KR Refinement
    if (possibleIds.includes("KR_SLABS") && (textLower.includes("перекрыт") || textLower.includes("плит") || textLower.includes("горизонт"))) return "KR_SLABS";
    if (possibleIds.includes("KR_WALLS") && (textLower.includes("стен"))) return "KR_WALLS";
    if (possibleIds.includes("KR_COLS") && (textLower.includes("колон") || textLower.includes("пилон"))) return "KR_COLS";
    if (possibleIds.includes("KR_BEAMS") && (textLower.includes("балк") || textLower.includes("ригел"))) return "KR_BEAMS";
    
    // OV Refinement
    if (possibleIds.includes("OV_ITP") && (textLower.includes("итп") || textLower.includes("itp") || textLower.includes("heat point"))) return "OV_ITP";
    if (possibleIds.includes("OV_VENT") && (textLower.includes("вент") || textLower.includes("воздух"))) return "OV_VENT";
    if (possibleIds.includes("OV_HEAT") && (textLower.includes("отоп") || textLower.includes("тепл"))) return "OV_HEAT";

    // VK Refinement
    if (possibleIds.includes("VK_K") && (textLower.includes("канал") || textLower.includes("сток") || textLower.includes("sml"))) return "VK_K";
    if (possibleIds.includes("VK_V") && (textLower.includes("вод"))) return "VK_V";

    // AUPT Refinement
    if (possibleIds.includes("AUPT_PIPE") && (textLower.includes("труб"))) return "AUPT_PIPE";
    if (possibleIds.includes("AUPT_SPR") && (textLower.includes("спринкл"))) return "AUPT_SPR";
    
    return possibleIds[0];
};

export const detectCategories = (filename: string, xmlDoc?: Document): { r: string | null, c: string | null } => {
    // --- Level 1: XML Structure Analysis (Locators & PathLinks) ---
    if (xmlDoc) {
      // 1.2 Check <clashtest> locators
      const leftLoc = xmlDoc.querySelector("clashtest > left > clashselection > locator")?.textContent || "";
      const rightLoc = xmlDoc.querySelector("clashtest > right > clashselection > locator")?.textContent || "";
      
      const locR = mapPathToCategory(leftLoc);
      const locC = mapPathToCategory(rightLoc);

      if (locR && locC) return { r: locR, c: locC };

      // 1.3 Check <pathlink> in first few results (Deep Scan)
      const results = xmlDoc.getElementsByTagName("clashresult");
      const limit = Math.min(results.length, 5); // Check first 5 collisions
      
      for (let i = 0; i < limit; i++) {
          const pathLinks = results[i].getElementsByTagName("pathlink");
          if (pathLinks.length >= 2) {
              // Combine all nodes in pathlink to a single string for matching
              const path1 = Array.from(pathLinks[0].getElementsByTagName("node")).map(n => n.textContent).join("/");
              const path2 = Array.from(pathLinks[1].getElementsByTagName("node")).map(n => n.textContent).join("/");
              
              const deepR = mapPathToCategory(path1);
              const deepC = mapPathToCategory(path2);

              if (deepR || deepC) {
                   // Return what we found, mixing with what we might have found from locators
                   return { 
                       r: deepR || locR, 
                       c: deepC || locC 
                   };
              }
          }
      }
    }

    // --- Level 2: Filename Parsing (Fallback) ---
    const parts = filename.split(/[-_+]/).map(p => p.trim().toUpperCase());
    let r: string | null = null;
    let c: string | null = null;
    
    const foundIds: string[] = [];
    
    // Attempt to extract two distinct categories
    // We look for patterns like "AR... - AR..."
    // Simple splitting by separator might be misleading if we need to refine based on the specific part context
    
    // Let's rely on the original filename/string but split by " - " or similar broad delimiters first to separate left/right
    const mainParts = filename.split(/\s+[-_]\s+/); // Split by " - " or " _ " with spaces
    
    const processPart = (text: string) => {
         const textUpper = text.toUpperCase();
         for (const [code, ids] of Object.entries(codeMap)) {
            if (textUpper.includes(code)) {
                 return refinement(ids, text);
            }
         }
         return null;
    };

    if (mainParts.length >= 2) {
         // We have clear separation like "11.05_АР (Верт)" and "АР (Окна и Двери)"
         const id1 = processPart(mainParts[0]);
         const id2 = processPart(mainParts[1]);
         if (id1) foundIds.push(id1);
         if (id2) foundIds.push(id2);
    } else {
        // Fallback to original logic if no clear delimiter
        parts.forEach(part => {
          const cleanPart = part.split('(')[0].trim(); // This might strip useful info like (Верт)
          // Instead of stripping, let's use the full part for matching code, but pass full part to refinement
           for (const [code, ids] of Object.entries(codeMap)) {
                if (cleanPart.includes(code)) {
                     // Pass the specific part text to refinement, not the whole filename, to avoid cross-contamination
                     foundIds.push(refinement(ids, part)); 
                     break;
                }
            }
        });
    }

    if (foundIds.length >= 1) r = foundIds[0];
    if (foundIds.length >= 2) c = foundIds[1];
    
    return { r, c };
};
