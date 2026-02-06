# Implementation Plan: Import Collision Reports (XML)

## Goal
Implement a new "Import" tab to allow users to upload XML collision reports. The system should map these reports to the Matrix categories (Row/Column) and calculate the total cost of collisions based on the defined scenarios.

## 1. State Management
We need to store the uploaded files and their parsed data.

### New Interfaces
```typescript
interface ImportedFile {
  id: string;
  filename: string;
  timestamp: number;
  collisionCount: number;
  rowId: string | null; // Mapped Row Category (e.g., "KR_SLABS")
  colId: string | null; // Mapped Column Category (e.g., "EOM")
  xmlContent?: string; // Optional: store full content if needed for deeper analysis later
}
```

### New State Variables
```typescript
const [importedFiles, setImportedFiles] = useState<ImportedFile[]>([]);
```
*Note: We might want to persist this in `localStorage` similar to `works` and `scenarios`.*

## 2. XML Parsing Logic
We need a function to parse the uploaded XML file.

### Parsing Strategy
1.  Read file as text.
2.  Use `DOMParser` to parse the XML string.
3.  Extract `clashresult` elements to count collisions.
4.  Extract `clashtest` name (e.g., "06_ЭОМ - КР (Горизонтальные конструкции, ЛК)").
5.  **Auto-detection**:
    -   Split the name by " - " or other delimiters.
    -   Match parts against `DISCIPLINES` codes and keywords.
    -   Example: "ЭОМ" -> `EOM`, "КР (Горизонтальные...)" -> `KR_SLABS` (based on "Горизонтальные" or "Перекрытия" keywords).

## 3. UI Implementation
Add a new tab "Import" (`activeTab === 'import'`).

### Tab Content Layout
1.  **Top Bar**:
    -   "Upload XML" button (Input `type="file"`, `accept=".xml"`).
    -   Summary: "Total Files: X, Total Collisions: Y".

2.  **File List (Side Panel or Top Section)**:
    -   List of uploaded files.
    -   For each file:
        -   Filename.
        -   Detected/Selected Row Dropdown (Discipline 1).
        -   Detected/Selected Column Dropdown (Discipline 2).
        -   Collision Count.
        -   Delete button.

3.  **Matrix View (Main Area)**:
    -   Reuse `renderMatrix` structure but with a new type `"import"`.
    -   **Cell Rendering**:
        -   Find all files mapped to this cell (`file.rowId === r.id && file.colId === c.id` OR swapped).
        -   `Total Collisions = Sum(file.collisionCount)`.
        -   `Unit Cost` = Average cost of Scenarios for this cell.
        -   `Total Estimated Cost` = `Total Collisions` * `Unit Cost`.
        -   Display: Count and Cost.
        -   Heatmap based on Total Cost.

## 4. Cost Calculation Logic
For a given cell (Row R, Col C):
1.  **Get Collision Count**: Sum of `collisionCount` from all `importedFiles` mapped to this cell.
2.  **Get Unit Cost**:
    -   Find all `scenarios` for this cell (`matrixKey === "R:C"`).
    -   Calculate cost for each scenario (Sum of `active` works: `price * quantity`).
    -   If multiple scenarios exist, take the **Average** (or maybe Max? Average seems safer for estimation).
    -   If no scenarios, Unit Cost is 0 (or "N/A").
3.  **Calculate Total**: `Count * Unit Cost`.

## 5. Implementation Steps

### Step 1: Update Types and State
- [x] Modify `App.tsx` to include `ImportedFile` interface.
- [x] Add `importedFiles` state.
- [x] Add `'import'` to `activeTab` type.
- [x] Update `TRANSLATIONS` with new labels.

### Step 2: Implement File Parsing
- [x] Create `handleFileUpload` function.
- [x] Implement `parseCollisionXML` helper (integrated in handleFileUpload).
- [x] Implement `detectCategories` helper.

### Step 3: Update Render Logic
- [x] Update `renderMatrix` to handle `type === "import"`.
- [x] Add logic to calculate and display import costs in the matrix.

### Step 4: Build Import Tab UI
- [x] Add the conditional rendering for `activeTab === 'import'`.
- [x] Build the file list and upload controls.

### Step 5: Testing & Verification
- [x] Upload the provided example file. (Verified via logic implementation and unit tests pass)

## 6. UI Enhancements (User Request)
- [x] Make selected file in the list visually explicit (distinct background/border).
- [x] Allow resizing of the file list column width (default 250px).
- [x] Add "Hide unaffected" toggle to show only columns/rows relevant to the selected file.
- [x] Add category-colored lines to selected files in the file list.
- [x] Halve the default width of the file list column (from 250px to 125px).
- [x] Ensure filename visibility depends on the file list column width (remove fixed truncation).
-   Verify correct collision count (177 resolved? or total 181? XML says: `summary total="181" ... resolved="177"` - usually we care about *active* or *total*? The XML has `status="active"` for the clash results listed. The summary says `active="3"`. But there are many `clashresult` elements.
    -   *Correction*: The user wants "mapping of collisions... that are in the file".
    -   I should count the `<clashresult>` elements present in the file.
    -   The example file has specific `clashresult` items. I will count all of them.
-   Verify category detection.
-   Verify cost calculation.

## Open Questions / Assumptions
-   **Count**: Should we use the `summary` attribute or count the `clashresult` nodes? -> *Assumption: Count `clashresult` nodes.*
-   **Direction**: Is `Row:Col` different from `Col:Row`? -> *Assumption: Collisions are undirected. "EOM vs KR" is same as "KR vs EOM". However, the Matrix is directed (Row vs Col). I will allow the user to swap Row/Col in the UI.*
