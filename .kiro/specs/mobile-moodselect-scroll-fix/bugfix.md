# Bugfix Requirements Document

## Introduction

The MoodSelect page is completely broken on mobile devices (viewport width ≤ 768px) - users cannot scroll the page to view all mood options. This is a critical production bug that blocks mobile users from accessing the mood selection functionality, preventing them from using the app.

The bug was introduced in commit ddadd89 which added `overflow: hidden !important` to the `.mood-wrap` container on mobile, locking the page at 100dvh height and preventing any scrolling.

**Impact**: Critical - mobile users cannot access mood selection, blocking core app functionality.

**Affected Component**: MoodSelect page (`client/src/pages/MoodSelect.jsx`)

---

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the viewport width is ≤ 768px (mobile devices) THEN the MoodSelect page is locked at 100dvh height with `overflow: hidden`, preventing any scrolling

1.2 WHEN a mobile user attempts to scroll the MoodSelect page THEN the page does not scroll and mood options below the fold are inaccessible

1.3 WHEN the MoodSelect page is viewed on small screens (e.g., iPhone SE 375×667) THEN users cannot see all mood options or interact with content below the visible area

1.4 WHEN the `.mood-wrap` container has `height: 100dvh !important` and `overflow: hidden !important` on mobile THEN the entire page becomes non-scrollable

### Expected Behavior (Correct)

2.1 WHEN the viewport width is ≤ 768px (mobile devices) THEN the MoodSelect page SHALL allow vertical scrolling to access all content

2.2 WHEN a mobile user scrolls the MoodSelect page THEN the page SHALL scroll smoothly and reveal all mood options and content

2.3 WHEN the MoodSelect page is viewed on small screens (e.g., iPhone SE 375×667) THEN users SHALL be able to scroll to see all mood options and the Start button SHALL remain visible at the bottom

2.4 WHEN the `.mood-wrap` container uses `min-height: 100dvh` instead of `height: 100dvh` and allows overflow on mobile THEN the page SHALL be scrollable while maintaining the full-height layout

2.5 WHEN the `.mood-grid-section` (scrollable content area) uses `flex: 1` and `overflow-y: auto` THEN the content area SHALL scroll independently within the flex layout

2.6 WHEN the `.mood-cta-wrap` (button container) uses `flex-shrink: 0` THEN the Start button SHALL remain sticky at the bottom of the viewport

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the viewport width is > 768px (desktop) THEN the MoodSelect page SHALL CONTINUE TO use the original scrollable layout with `min-height: 100vh` and `overflow: visible`

3.2 WHEN users interact with the Home page on any device THEN the Home page SHALL CONTINUE TO scroll normally without any changes

3.3 WHEN users interact with the ChatRoom page on any device THEN the ChatRoom page SHALL CONTINUE TO function normally without any changes

3.4 WHEN users select a mood or chat mode on mobile THEN the selection interaction SHALL CONTINUE TO work as expected

3.5 WHEN the theme toggle, back button, or Start button are clicked on mobile THEN these interactive elements SHALL CONTINUE TO function normally

3.6 WHEN the MoodSelect page is rendered THEN all visual styling (colors, spacing, typography, borders) SHALL CONTINUE TO match the current design

3.7 WHEN the page transitions or animations occur THEN they SHALL CONTINUE TO work as currently implemented

---

## Bug Condition Derivation

### Bug Condition Function

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type ViewportContext
  OUTPUT: boolean
  
  // Returns true when the bug condition is met
  RETURN (X.viewportWidth <= 768) AND 
         (X.currentPage = "MoodSelect") AND
         (X.cssRule[".mood-wrap"]["overflow"] = "hidden") AND
         (X.cssRule[".mood-wrap"]["height"] = "100dvh")
END FUNCTION
```

**Explanation**: The bug occurs when viewing the MoodSelect page on mobile devices (≤768px width) where the `.mood-wrap` container has `overflow: hidden` and fixed `height: 100dvh`, preventing scrolling.

### Property Specification - Fix Checking

```pascal
// Property: Fix Checking - Mobile Scroll Functionality
FOR ALL X WHERE isBugCondition(X) DO
  result ← renderMoodSelectPage'(X)
  ASSERT result.canScroll = true AND
         result.allContentAccessible = true AND
         result.buttonVisible = true AND
         result.noOverflowHidden = true
END FOR
```

**Explanation**: For all mobile viewport contexts where the bug occurs, the fixed MoodSelect page must:
- Allow vertical scrolling (`canScroll = true`)
- Make all mood options accessible (`allContentAccessible = true`)
- Keep the Start button visible (`buttonVisible = true`)
- Not use `overflow: hidden` on the main wrapper (`noOverflowHidden = true`)

### Property Specification - Preservation Checking

```pascal
// Property: Preservation Checking - Desktop and Other Pages
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT renderPage(X) = renderPage'(X)
END FOR
```

**Explanation**: For all contexts that don't trigger the bug (desktop MoodSelect, or any other page), the behavior must remain identical before and after the fix.

**Key Definitions:**
- **F**: The original (unfixed) function - MoodSelect.jsx with `overflow: hidden` on mobile
- **F'**: The fixed function - MoodSelect.jsx with scrollable mobile layout

---

## Proposed Fix Strategy

1. **Change `.mood-wrap` mobile styles**:
   - Replace `height: 100dvh !important` with `min-height: 100dvh`
   - Remove `overflow: hidden !important` or change to `overflow-y: auto`

2. **Make `.mood-grid-section` scrollable**:
   - Use `flex: 1` to fill available space
   - Add `overflow-y: auto` for independent scrolling
   - Add `-webkit-overflow-scrolling: touch` for smooth iOS scrolling

3. **Keep button sticky at bottom**:
   - Use `flex-shrink: 0` on `.mood-cta-wrap`
   - Ensure proper padding-bottom on scrollable section

4. **Preserve desktop layout**:
   - Keep desktop media query (`min-width: 769px`) unchanged
   - Maintain `min-height: 100vh` and `overflow: visible` for desktop

---

## Testing Requirements

### Fix Verification (Bug Condition Testing)

- **Test 1.1**: Open MoodSelect page on iPhone SE (375×667) in Chrome DevTools → Page MUST scroll vertically
- **Test 1.2**: Scroll to bottom of MoodSelect page on mobile → All mood options MUST be visible and accessible
- **Test 1.3**: Verify Start button on mobile → Button MUST remain visible at bottom (sticky)
- **Test 1.4**: Inspect `.mood-wrap` CSS on mobile → MUST NOT have `overflow: hidden`, MUST use `min-height` instead of `height`

### Preservation Verification (Regression Testing)

- **Test 3.1**: Open MoodSelect page on desktop (>768px) → Page MUST scroll normally with original layout
- **Test 3.2**: Open Home page on mobile → Page MUST scroll normally (unchanged)
- **Test 3.3**: Open Home page on desktop → Page MUST scroll normally (unchanged)
- **Test 3.4**: Select mood and chat mode on mobile → Interactions MUST work as before
- **Test 3.5**: Click theme toggle, back button, Start button on mobile → All buttons MUST function normally
- **Test 3.6**: Verify visual styling on mobile and desktop → All colors, spacing, typography MUST match current design

### Counterexample (Concrete Bug Demonstration)

**Before Fix**:
```
Device: iPhone SE (375×667)
Page: MoodSelect
Action: Attempt to scroll down
Result: ❌ Page does not scroll, content below fold is inaccessible
CSS: .mood-wrap { height: 100dvh !important; overflow: hidden !important; }
```

**After Fix**:
```
Device: iPhone SE (375×667)
Page: MoodSelect
Action: Attempt to scroll down
Result: ✅ Page scrolls smoothly, all mood options are accessible
CSS: .mood-wrap { min-height: 100dvh; overflow-y: auto; }
```
