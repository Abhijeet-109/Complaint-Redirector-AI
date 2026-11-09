# Plan: Remove Fashion Card from Homepage Category Grid

## Objective
Hide the "Fashion" category card from the homepage "Shop by Category" grid so exactly 8 cards remain, forming a clean 4×2 layout at tablet width and 8×1 at desktop. No database, API, navigation menu, or other component is touched.

---

## Findings

### Component responsible
`frontend/src/components/home/CategorySection.jsx`

This is the homepage grid labeled "Shop by category" (mounted at `Home.jsx:97`). It:
- Calls `flattenCategories(categories)` internally to produce `allCategories`
- Renders **every** category in that flat list — currently 9 cards (Fashion + 8 children/siblings)
- Uses `cat.slug` for fallback image lookups and the DOM id `fk-category-${cat.slug}`

### What `LifestyleSection` is
`LifestyleSection.jsx` ("Find Your Style", `Home.jsx:118`) is a separate 4-card lifestyle section that takes `categories.slice(0, 4)` from the already-flattened `categoryRows`. It is **not** the target grid and must not be changed.

### Grid CSS
`index.css:507` — `.fk-categories-grid { grid-template-columns: repeat(8, 1fr); }`  
Responsive breakpoint at `index.css:1045` — `@media (max-width: 1200px) { repeat(4, 1fr) }` → 4×2 layout for 8 cards.  
No CSS change is needed; 8 cards already fit the existing responsive rules.

### Category data source
`productService.categories()` returns a nested tree. `flattenCategories` in `CategorySection.jsx` flattens it. The Fashion category has `slug === 'fashion'`. Its children (Men, Women, Footwear) appear as siblings in the flat list with their own slugs.

---

## Change Required

### File: `frontend/src/components/home/CategorySection.jsx`

**One line change** — filter `allCategories` to exclude the Fashion slug before rendering.

Current code (line 6):
```js
const allCategories = flattenCategories(categories);
```

Replace with:
```js
const allCategories = flattenCategories(categories).filter((cat) => cat.slug !== 'fashion');
```

That is the **only source file to edit**.

---

## What is NOT changed
| Area | Status |
|---|---|
| PostgreSQL Fashion category record | Untouched |
| Category API / backend routes | Untouched |
| Fashion as parent of Men, Women, Footwear | Untouched |
| Navigation menu (`CategoryNav`) | Untouched |
| Admin category management screens | Untouched |
| `LifestyleSection.jsx` | Untouched |
| `Home.jsx` | Untouched |
| `index.css` grid CSS | Untouched |
| Product descriptions, ImageKit integration | Untouched |

---

## Verification Steps

1. Run the production build:
   ```
   cd frontend && npm run build
   ```
   Build must complete with no errors.

2. Start a local preview server and open the homepage.

3. Count category cards in the "Shop by category" section — must be exactly **8**:
   Men, Women, Accessories, Footwear, Home & Living, Beauty, Electronics, Stationery.

4. Confirm the Fashion card is absent.

5. Click each of the 8 cards and confirm navigation fires (scroll to product grid with correct category filter).

6. Resize viewport below 1200 px — grid must reflow to 4×2.

7. Confirm Fashion still appears in the `CategoryNav` secondary navigation bar.

8. Confirm Fashion still appears in admin category management.

---

## Risk / Rollback
Low risk — single filter expression on the client-side render path.  
Rollback: remove the `.filter(...)` call to restore the 9-card layout.
