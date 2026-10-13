# Flatkart UI & Integration Fixes — Implementation Plan

## Scope
Five targeted bug fixes. No redesigns, no backend API changes, no new routes or components.

---

## Issue 1 — False "Google Drive is not connected" status

### Root cause (confirmed by inspection)
`KnowledgeDocumentsTable.jsx` line 107 contains a **hardcoded static string**:
```jsx
<span className="fk-pipe-toolbar-hint">Google Drive is not connected</span>
```
This never reads live connection state. Meanwhile, `SourceConnectionsPanel.jsx` calls `driveService.getStatus()` and stores the result in local state (`status`, `statusLoading`, `statusError`).

The two sections are siblings rendered inside `PipelineManagementView.jsx` — they share no state. The `mapDocument` function in `KnowledgeDocumentsTable.jsx` also hardcodes `source: 'Local Upload'` for every document regardless of the `source` field returned by the backend (`documents.py` includes `source: "google_drive"` for Drive imports). The source filter therefore also misses Drive documents.

### Fix
**File: `frontend/src/components/admin/pipeline/KnowledgeDocumentsTable.jsx`**

1. Accept two new props: `driveConnected` (boolean | null) and `driveStatusLoading` (boolean).
2. Replace the hardcoded hint with a dynamic indicator:
   - `driveStatusLoading === true` → "Checking Drive connection…"
   - `driveConnected === true` → "Google Drive connected" (use green `.fk-pipe-badge-available` style inline or a small success span)
   - `driveConnected === false` → "Google Drive is not connected"
   - `driveConnected === null` (status error/unknown) → "Drive status unavailable"
3. Fix `mapDocument` to read `file.source` from the backend response and map it to a display label:
   - `"google_drive"` → `"Google Drive"`
   - anything else (or missing) → `"Local Upload"`
4. Add `"Google Drive"` as an option in the source filter `<select>`.

**File: `frontend/src/components/admin/pipeline/PipelineManagementView.jsx`**

5. `SourceConnectionsPanel` already owns `status` and `statusLoading` in its own internal state, which is not accessible from the parent. Lift the drive status state up into `PipelineManagementView`:
   - Add `driveStatus`, `driveStatusLoading` state to `PipelineManagementView`.
   - Add a `onStatusChange` prop to `SourceConnectionsPanel` that fires with the latest `{ status, loading }` whenever either changes.
   - Pass `driveConnected={driveStatus?.connected ?? null}` and `driveStatusLoading={driveStatusLoading}` to both `KnowledgeDocumentsTable` usages (all-view and tabbed-view).

**File: `frontend/src/components/admin/pipeline/SourceConnectionsPanel.jsx`**

6. Accept `onStatusChange` prop. Call it after every `refreshStatus()` settles:
   ```js
   setStatus(result);
   setStatusLoading(false);
   onStatusChange?.({ status: result, loading: false });
   ```
   Call it with `{ loading: true }` at the start of `refreshStatus` as well so the parent can reflect the checking state.

No backend changes required — `GET /drive/status` already returns `{ connected: bool, message: string }`.

---

## Issue 2 — Google Drive card button layout

### Root cause (confirmed by inspection)
`.fk-pipe-drive-source-actions` uses `flex-wrap: wrap` and `align-items: center` but has no explicit min/max widths or flex ordering. When three items are rendered (`Connected` badge + `Browse Files` + `Disconnect`), the badge and buttons share the same flex row without visual grouping, creating an awkward layout because the badge is styled identically in size to the action buttons.

### Fix
**File: `frontend/src/components/admin/pipeline/PipelineManagement.css`**

Update `.fk-pipe-drive-source-actions`:
```css
.fk-pipe-drive-source-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
```
Add a separator between the status badge and the action buttons:
```css
.fk-pipe-drive-source-actions .fk-pipe-badge-available,
.fk-pipe-drive-source-actions .fk-pipe-badge-pending {
  margin-right: 4px;   /* visual breathing room before action buttons */
}
```
Ensure the drive card left section has `min-width: 0` and `flex: 1` so it doesn't fight for space:
```css
.fk-pipe-drive-source-card .fk-pipe-source-left {
  flex: 1;
  min-width: 0;
}
```

No JSX changes needed for this issue — the structure is already correct (badge rendered first, then buttons). Pure CSS fix.

---

## Issue 3 — Knowledge Documents table column layout

### Root cause (confirmed by inspection)
`PipelineManagement.css` sets only two explicit column widths for the 7-column table:
- `th:nth-child(2)` / `td:nth-child(2)` → 22% (Document column)
- `th:nth-child(8)` / `td:nth-child(8)` → 205px (there is no 8th column — this rule is a dead no-op)
- `th:nth-child(5)` / `td:nth-child(5)` → 120px (Index Status)

No widths are set for Source, Type/Size, Chunks, or Actions. The table uses `table-layout: fixed` but with no widths on most columns, the browser distributes space evenly — leaving Document too narrow and Chunks/Actions too wide.

### Fix
**File: `frontend/src/components/admin/pipeline/PipelineManagement.css`**

Replace the three existing `nth-child` column rules with a full 7-column width assignment:

```css
/* col 1: checkbox */
.fk-pipe-table th:nth-child(1),
.fk-pipe-table td:nth-child(1) { width: 40px; text-align: center; }

/* col 2: Document — gets the majority of flex space */
.fk-pipe-table th:nth-child(2),
.fk-pipe-table td:nth-child(2) { /* no fixed width — takes remaining space */ }

/* col 3: Source */
.fk-pipe-table th:nth-child(3),
.fk-pipe-table td:nth-child(3) { width: 110px; }

/* col 4: Type / Size */
.fk-pipe-table th:nth-child(4),
.fk-pipe-table td:nth-child(4) { width: 100px; white-space: nowrap; }

/* col 5: Index Status */
.fk-pipe-table th:nth-child(5),
.fk-pipe-table td:nth-child(5) { width: 110px; }

/* col 6: Chunks */
.fk-pipe-table th:nth-child(6),
.fk-pipe-table td:nth-child(6) { width: 64px; text-align: right; }

/* col 7: Actions */
.fk-pipe-table th:nth-child(7),
.fk-pipe-table td:nth-child(7) { width: 130px; }
```

Also update `.fk-pipe-doc-title` to truncate long names with a tooltip:

**File: `frontend/src/components/admin/pipeline/KnowledgeDocumentsTable.jsx`**

Change the title `<strong>` to include a `title` attribute for full-name tooltip:
```jsx
<strong className="fk-pipe-doc-title" title={doc.name}>{doc.name}</strong>
```

And in CSS update `.fk-pipe-doc-title` to truncate:
```css
.fk-pipe-doc-title {
  font-weight: 700;
  color: var(--fk-text-primary, #1C352F);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;   /* truncate with tooltip */
}
```

Remove the dead `th:nth-child(8)` / `td:nth-child(8)` rule.

---

## Issue 4 — Department Redirections table alignment

### Root cause (confirmed by inspection)
`DepartmentRedirections.jsx` uses an inline `<table className="ad-redirection-table">` but `AdminDashboard.css` has no `.ad-redirection-table` definition — no `table-layout`, no column widths. The browser lays out columns by content width, causing the route cell (which contains a flex row with two dept names + an arrow) to vary in width per row, making columns shift.

The "Reason breakdown" column renders two `<span>` elements inside a `<div className="ad-reason-breakdown">` — this class also has no CSS definition, so the spans stack or inline depending on available width.

### Fix
**File: `frontend/src/components/admin/AdminDashboard.css`**

Add table layout definitions:
```css
/* ============================================================
   DEPARTMENT REDIRECTIONS TABLE
   ============================================================ */
.ad-redirection-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 12.5px;
}

.ad-redirection-table th,
.ad-redirection-table td {
  padding: 10px 12px;
  vertical-align: top;
  border-bottom: 1px solid #F1ECE2;
}

.ad-redirection-table thead th {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #637073;
  background-color: #FAF8F4;
  white-space: nowrap;
  padding-top: 8px;
  padding-bottom: 8px;
}

/* col 1: From → To dept route (largest share) */
.ad-redirection-table th:nth-child(1),
.ad-redirection-table td:nth-child(1) { width: auto; min-width: 180px; }

/* col 2: Transfers (narrow, centered) */
.ad-redirection-table th:nth-child(2),
.ad-redirection-table td:nth-child(2) { width: 80px; text-align: center; white-space: nowrap; }

/* col 3: Reason breakdown */
.ad-redirection-table th:nth-child(3),
.ad-redirection-table td:nth-child(3) { width: 200px; }

.ad-redirection-route {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}

.ad-redirection-route span,
.ad-redirection-route strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
}

.ad-reason-breakdown {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ad-reason-fault,
.ad-reason-proc {
  font-size: 11.5px;
  color: #556366;
  white-space: nowrap;
}

.ad-reason-fault {
  color: #C05B4B;
}

.ad-reason-proc {
  color: #4558A6;
}
```

No JSX changes needed — the class names are already applied in `DepartmentRedirections.jsx`.

---

## Issue 5 — "Open pipeline console" navigation broken

### Root cause (confirmed by inspection)
In `SharedAdminDashboard.jsx` the ribbon button is:
```jsx
<button className="ad-pipeline-btn" onClick={() => setIsPipelineModalOpen(true)}>
  Open pipeline console →
</button>
```
It sets `isPipelineModalOpen(true)` — but `PipelineConsoleModal` is **never rendered** anywhere in `SharedAdminDashboard.jsx`. The JSX does not include `<PipelineConsoleModal ... />`, so the state change is a no-op.

The actual pipeline console is `<PipelineManagementView />`, rendered when `currentView === 'pipeline'` (line ~375 of `SharedAdminDashboard.jsx`). So the fix is to change the button's `onClick` to `setCurrentView('pipeline')` instead of opening a non-existent modal.

The `isPipelineModalOpen` state and the `PipelineConsoleModal` import can be removed as they are dead code — but the strict warning says to touch only what is needed for the five issues. The minimum correct fix is to change only the `onClick` handler.

### Fix
**File: `frontend/src/components/admin/SharedAdminDashboard.jsx`**

Change the onClick of the ribbon button from:
```jsx
onClick={() => setIsPipelineModalOpen(true)}
```
to:
```jsx
onClick={() => { setCurrentView('pipeline'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
```

This uses the existing `currentView` / `setCurrentView` state already present in the component and navigates to the real `PipelineManagementView` inline view. No new routes, no new components, no modals.

---

## Files to be modified

| File | Issue(s) |
|---|---|
| `frontend/src/components/admin/pipeline/KnowledgeDocumentsTable.jsx` | 1, 3 |
| `frontend/src/components/admin/pipeline/SourceConnectionsPanel.jsx` | 1 |
| `frontend/src/components/admin/pipeline/PipelineManagementView.jsx` | 1 |
| `frontend/src/components/admin/pipeline/PipelineManagement.css` | 2, 3 |
| `frontend/src/components/admin/AdminDashboard.css` | 4 |
| `frontend/src/components/admin/SharedAdminDashboard.jsx` | 5 |

**Total: 6 files. No backend files touched.**

---

## Implementation order

1. **Issue 5** — one-line `onClick` fix in `SharedAdminDashboard.jsx`. Lowest risk, standalone.
2. **Issue 4** — CSS-only additions to `AdminDashboard.css`. No JSX changes.
3. **Issue 3** — CSS column width overhaul in `PipelineManagement.css` + `title` tooltip in `KnowledgeDocumentsTable.jsx`.
4. **Issue 2** — CSS-only additions to `PipelineManagement.css` (can be done alongside Issue 3 in the same file edit).
5. **Issue 1** — State lift in `PipelineManagementView.jsx`, callback prop in `SourceConnectionsPanel.jsx`, dynamic hint in `KnowledgeDocumentsTable.jsx`. Most interconnected change; do last.

---

## Validation checklist

- [ ] Clicking "Open pipeline console →" as Super Admin navigates to `PipelineManagementView` inline.
- [ ] Navigating away and back, and refreshing `/super-admin-dashboard`, preserves correct view state.
- [ ] Department Redirections table columns align at all data sizes (empty, 1 row, 5+ rows).
- [ ] Document name column receives the most space; Type/Size, Chunks, Actions are compact.
- [ ] Long document names truncate with ellipsis; native `title` tooltip shows the full name.
- [ ] Google Drive source filter in the document table shows both "Local Upload" and "Google Drive" options and correctly filters Drive-imported documents.
- [ ] Drive connection card on connect: badge reads "Connected", "Browse Files" and "Disconnect" appear.
- [ ] Drive connection card on disconnect: badge reads "Not connected", only "Connect" button shown.
- [ ] During status fetch: badge reads "Checking" in the card, toolbar hint reads "Checking Drive connection…".
- [ ] Both the Source Connections card AND the Knowledge Documents toolbar hint show the same state simultaneously.
- [ ] After successful OAuth callback (returning from Google), both sections update without page reload.
- [ ] After disconnecting, both sections update without page reload.
- [ ] Run `npm run build` (or `vite build`) in the frontend directory — zero new errors.
- [ ] Run any available frontend lint command (`npm run lint`) — zero new errors.

---

## Out of scope / manual verification needed

- Google OAuth credentials (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` in `backend/.env`) must be configured externally for a real OAuth round-trip test.
- The `PipelineConsoleModal` import and `isPipelineModalOpen` state in `SharedAdminDashboard.jsx` are dead code but are left in place per the strict "touch only what is needed" constraint. They can be cleaned up in a separate pass.
- The OAuth redirect URL `http://localhost:5173/admin` in `drive.py` must match the Google Cloud Console's authorized redirect URI list — this is a deployment concern, not a code fix.
