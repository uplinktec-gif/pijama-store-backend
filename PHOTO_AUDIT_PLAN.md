# 📸 Pluma Pijamas - Photo Audit & Fix Plan

## Current Issue
Website product cover images don't show **complete products**. For example:
- ❌ ZARA (Trio Americano): Showing only **blusa + shorts**, NOT the complete **calça + blusa + robe**
- ❌ ANNE: Showing incomplete outfit
- ❌ NUBIA: Showing incomplete outfit
- ❌ MIA: Showing only blusa + shorts
- ❌ LIVIA: Showing incomplete outfit
- ❌ BEATRIZ: Showing incomplete outfit
- ❌ LIA: Showing incomplete outfit

## Product Requirements

### Complete Product = What Must Show in Photos

| Produto | Type | Complete Product | Current Status |
|---------|------|-----------------|-----------------|
| **ZARA** | Trio Americano | calça + blusa + robe (3 pieces) | ❌ Missing robe/calça |
| **ANNE** | Pijama Longo | blusa + calça (2 pieces) | ❌ Incomplete |
| **NUBIA** | Trio + Cardigan | calça + blusa + cardigan (3 pieces) | ❌ Incomplete |
| **LIA** | Conjunto Longo | blusa + calça (2 pieces) | ❌ Incomplete |
| **MIA** | Alcinha Set | blusa + shorts (2 pieces) | ❌ Incomplete |
| **LIVIA** | Camisola Americana | camisola (1-2 pieces) | ❌ Incomplete |
| **BEATRIZ** | Conjunto Feminino | blusa + shorts/calça (2 pieces) | ❌ Incomplete |

## Fix Strategy

### Phase 1: Photo ID Validation (PRIORITY 1)

For each product/color combination, verify that the **FIRST photo ID** in the array shows the complete product. This photo appears as the "cover image" on the product card.

**Method:**
1. Open Google Drive > PIJAMAS folder > Product folder > FOTOS
2. Check first photo ID for each color
3. Does it show the complete product?
   - ✅ YES → Keep it
   - ❌ NO → Find and replace with a photo that shows complete product

### Phase 2: Photo ID Replacement (PRIORITY 2)

If first photo doesn't show complete product, find the correct photo ID that does.

**Google Drive Photo Organization:**
```
PIJAMA [PRODUCT]
├── FOTOS
│   ├── Pijama [Product] - [Color1].jpg  ← Try these first
│   ├── Pijama [Product] - [Color1]_2.jpg
│   ├── Pijama [Product] - [Color1]_back.jpg
│   ├── ... (more angles/variations)
│   ├── Pijama [Product] - [Color2].jpg
│   └── ...
```

**Steps:**
1. Look for photos with the model wearing the **complete outfit**
2. Right-click → Share → Anyone with link (get shareable URL)
3. Extract the file ID from the URL
4. Replace old photo ID in `PRODUCT_CORES` array

### Phase 3: Photo Array Reordering (PRIORITY 3)

Once verified, organize each color's photo array:
1. **Position 1**: Best complete product shot (full outfit)
2. **Positions 2-3**: Detailed views/angles
3. **Positions 4-5**: Close-ups/specific pieces

## Detailed Audit by Product

### ZARA (Trio Americano)

**What Should Show:** Woman wearing calça + blusa + robe (3 pieces)

**Current Photos:**
- bordô: 5 photos - ❌ FIRST PHOTO shows only 2 pieces (blusa + shorts)
- preto: 14 photos - ❌ Status unknown, needs audit
- cinza: 5 photos - ❌ Status unknown, needs audit  
- marinho: 4 photos - ❌ Only 4 photos, needs more

**Action Required:**
- [ ] Check ZARA > FOTOS folder for photos showing complete trio
- [ ] Find photos with robe/calça visible
- [ ] Reorder arrays to put complete outfit photos first

### ANNE (Pijama Longo Americano)

**What Should Show:** Woman wearing blusa + calça longa (2 pieces)

**Current Status:** Mostly looks OK but needs verification

**Action Required:**
- [ ] Verify all 6 colors show complete outfit
- [ ] Check if photos show full length (including feet/feet area)

### NUBIA (Trio Longo Cardigan)

**What Should Show:** Woman wearing calça + blusa + cardigan (3 pieces)

**Current Status:** Some colors have very few photos (verde mint = 1 photo!)

**Action Required:**
- [ ] Audit all colors - verde mint, preto com bege only have 3 photos each
- [ ] Find complete product shots for all colors

### LIA (Conjunto Longo)

**What Should Show:** Woman wearing blusa manga longa + calça longa (2 pieces)

**Action Required:**
- [ ] Verify all 5 colors show complete long outfit

### MIA (Conjunto Pijama Alcinha)

**What Should Show:** Woman wearing blusa alcinha + shorts (2 pieces)

**Action Required:**
- [ ] Verify photos show complete alcinha set
- [ ] Preto shows NULL - needs photos!

### LIVIA (Camisola Americana)

**What Should Show:** Camisola/blusa (can show 1-2 pieces)

**Action Required:**
- [ ] Verify camisola styling is clear
- [ ] Only 3 colors - add more if available

### BEATRIZ (Conjunto Feminino)

**What Should Show:** Blusa + shorts/calça (2 pieces)

**Action Required:**
- [ ] Verify all colors show complete set
- [ ] Check for adequate photo variety

## Implementation Checklist

### Before Making Changes:
- [ ] Back up current `index.html`
- [ ] Document current photo IDs
- [ ] Take screenshots of current website display

### During Fix:
- [ ] Edit `PRODUCT_CORES` in `index.html`
- [ ] Reorder photo arrays
- [ ] Test website locally at http://localhost:30001

### Testing:
- [ ] Open each product detail view
- [ ] Verify cover image shows complete product
- [ ] Check photo gallery displays correctly
- [ ] Test on mobile view if possible

## File Locations

- **Website Code:** `/src/public/store/index.html` (lines 413-461: PRODUCT_CORES)
- **Google Drive:** Compartilhados comigo > PIJAMA [PRODUCT] > FOTOS
- **Running Server:** http://localhost:30001

## How to Extract Photo IDs from Google Drive

1. Open photo in Google Drive
2. Note the URL: `https://drive.google.com/file/d/**PHOTO_ID**/view`
3. Extract the **PHOTO_ID** between `/d/` and `/view`
4. Use this ID in `PRODUCT_CORES` array

Example:
```
URL: https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz12345/view
ID:  1AbCdEfGhIjKlMnOpQrStUvWxYz12345
```

## Next Steps

1. **Complete Phase 1:** Audit first photo of each product/color
2. **Complete Phase 2:** Replace any incomplete cover photos
3. **Complete Phase 3:** Optimize photo array order
4. **Test & Deploy:** Verify all changes work correctly

---
*Last Updated: 2026-05-19*
*Status: Audit in progress*
