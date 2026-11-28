// Tablet rendering checks: iPad Pro 11" (834pt portrait / landscape) and
// Galaxy Tab S10 family (10.9"-12.4"). Run: node test-tablet.mjs
import { readFileSync } from "node:fs";
import assert from "node:assert";
const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

assert.ok(html.includes('name="viewport"') && html.includes("viewport-fit=cover"), "viewport-fit=cover required for edge-to-edge tablets");
assert.ok(html.includes("env(safe-area-inset-top)") && html.includes("env(safe-area-inset-bottom)"), "safe-area insets required (iPad home bar / Tab nav bar)");
assert.ok(html.includes("@media (min-width:700px)"), "tablet breakpoint missing");
assert.ok(html.includes("orientation:portrait") && html.includes("orientation:landscape"), "both tablet orientations must be handled");
assert.ok(html.includes("@media (hover:none)"), "touch devices must not keep sticky hover");
assert.ok(html.includes("min-height:44px"), "44px touch targets (Apple HIG) required");
assert.ok(/input\{font-size:16px;?\}/.test(html), "16px input stops iPad focus auto-zoom");
assert.ok(html.includes("grid-template-columns:repeat(3,1fr)") && html.includes("grid-template-columns:repeat(4,1fr)"), "tablet grid columns missing");
assert.ok(html.includes("max-width:920px") || html.includes("max-width:980px"), "focus view must not stretch full-bleed on tablets");
assert.ok(html.includes('id="handSeg"') && html.includes(".seg button,.pill,.ghost,.roundbtn{min-height:44px;}"), "#handSeg buttons must inherit 44px touch targets");
assert.ok(html.includes(".nline.twohands .ncols{display:flex; flex-wrap:wrap;"), "two-hand onset columns must wrap cleanly on mobile/tablet");
console.log("tablet ok");
