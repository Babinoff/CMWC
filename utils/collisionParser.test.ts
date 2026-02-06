import { describe, it, expect } from 'vitest';
import { detectCategories } from './collisionParser';
import { JSDOM } from 'jsdom';

describe('collisionParser', () => {
    const parseXML = (xml: string) => {
        const dom = new JSDOM(xml, { contentType: "text/xml" });
        return dom.window.document;
    };

    it('should detect AR_WALLS from pathlink (11.10 example)', () => {
        const xml = `
        <exchange>
            <clashtest>
                <name>Test</name>
            </clashtest>
            <batchtest>
                <clashresults>
                    <clashresult>
                        <pathlink>
                            <node>Файл</node>
                            <node>Файл</node>
                            <node>W-1470_AR_R21.nwc</node>
                            <node>Этаж 01</node>
                            <node>Стены</node>
                            <node>Базовая стена</node>
                            <node>ADSK_Внутренняя_Кирпич_250</node>
                            <node>Базовая стена</node>
                            <node>Кладка_Кирпич_Рядовой_120мм</node>
                        </pathlink>
                        <pathlink>
                             <node>Other</node>
                        </pathlink>
                    </clashresult>
                </clashresults>
            </batchtest>
        </exchange>
        `;
        const doc = parseXML(xml);
        const result = detectCategories("11.10_АР (Кладка) - КР (Верт).xml", doc);
        
        // It should pick AR_WALLS from "Кладка" or "Стены" or "Кирпич" in the pathlink
        // The parser returns {r, c}. Since we only provided one pathlink relevant to AR_WALLS, 
        // it might return it as 'r' or 'c' depending on order or if both found.
        // In my logic:
        // const deepR = mapPathToCategory(path1);
        // const deepC = mapPathToCategory(path2);
        // return { r: deepR || locR, c: deepC || locC };
        // Here path1 is AR_WALLS. path2 is "Other" -> null.
        // So r should be AR_WALLS, c should be null (or fallback).
        // Wait, fallback logic runs if return didn't happen.
        // But if (deepR || deepC) is true, it returns immediately.
        
        expect(result.r).toBe("AR_WALLS");
    });

    it('should detect VK_K from pathlink (05 example)', () => {
        const xml = `
        <exchange>
            <clashtest>
                <name>Test</name>
            </clashtest>
            <batchtest>
                <clashresults>
                    <clashresult>
                        <pathlink>
                            <node>Файл</node>
                            <node>Файл</node>
                            <node>W-1470_VK_VO_R21.nwc</node>
                            <node>Трубы</node>
                            <node>Типы трубопроводов</node>
                            <node>ADSK_Чугун_Безраструбный SML_DIN EN 877</node>
                            <node>Типы трубопроводов</node>
                            <node>SML</node>
                        </pathlink>
                        <pathlink>
                             <node>Other</node>
                        </pathlink>
                    </clashresult>
                </clashresults>
            </batchtest>
        </exchange>
        `;
        const doc = parseXML(xml);
        const result = detectCategories("05_ВК - АР (Вертикальные конструкции).xml", doc);
        
        expect(result.r).toBe("VK_K");
    });

    it('should detect AR_FACADE from locator if available', () => {
        const xml = `
        <exchange>
            <clashtest>
                <left>
                    <clashselection>
                        <locator>lcop_selection_set_tree/АР/Фасад</locator>
                    </clashselection>
                </left>
                <right>
                    <clashselection>
                        <locator>lcop_selection_set_tree/КР/Стены</locator>
                    </clashselection>
                </right>
            </clashtest>
        </exchange>
        `;
        const doc = parseXML(xml);
        const result = detectCategories("any_file.xml", doc);
        
        expect(result.r).toBe("AR_FACADE");
        expect(result.c).toBe("KR_WALLS");
    });

    it('should detect OV_ITP from pathlink with Latin ITP', () => {
        const xml = `
        <exchange>
            <clashtest>
                <clashresults>
                    <clashresult>
                        <pathlink>
                            <node>W-1470_ITP_R21.nwc</node>
                            <node>Материалы изоляции труб</node>
                        </pathlink>
                        <pathlink>
                             <node>Other</node>
                        </pathlink>
                    </clashresult>
                </clashresults>
            </clashtest>
        </exchange>
        `;
        const doc = parseXML(xml);
        const result = detectCategories("file.xml", doc);
        expect(result.r).toBe("OV_ITP");
    });

    it('should detect OV_ITP from filename 16_КР + ИТП (Изоляция)', () => {
        // Test fallback when XML has no info
        const result = detectCategories("16_КР + ИТП (Изоляция).xml", undefined);
        expect(result.c).toBe("OV_ITP"); // Or r depending on order
        // 16_КР + ИТП -> "КР + ИТП" -> matches KR and ИТП
        // "КР" -> KR_WALLS (default or from refinement?) 
        // "ИТП" -> OV_ITP
        // Let's see what it returns exactly. 
        // With codeMap having "ИТП", it should find OV_ITP.
        // Found IDs might be [KR_WALLS, OV_ITP] or similar.
    });
});
