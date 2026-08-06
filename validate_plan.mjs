#!/usr/bin/env node
/* TRIZONE Next — validate_plan.mjs
   Del av deploy-ceremonin: körs FÖRE commit av plan.json (planformat §4).
   Användning: node validate_plan.mjs plan.json */
import { readFileSync } from "node:fs";
import { validatePlan, BUILD } from "./core.js";

const file = process.argv[2];
if (!file) { console.error("Användning: node validate_plan.mjs <plan.json>"); process.exit(2); }

let plan;
try { plan = JSON.parse(readFileSync(file, "utf8")); }
catch (e) { console.error(`✗ ${file}: ogiltig JSON — ${e.message}`); process.exit(1); }

const { ok, errors } = validatePlan(plan);
if (ok) {
  const phase = plan.blocks.map(b =>
    `${b.id} ${b.lowShare != null ? Math.round(b.lowShare * 100) + " %" : "profil"}`).join(", ");
  console.log(`✓ ${file} giltig · planVersion ${plan.planVersion} · ${plan.sessions.length} pass, ${plan.weeks.length} veckor, ${plan.blocks.length} block · fasmål: ${phase} · core ${BUILD}`);
  process.exit(0);
}
console.error(`✗ ${file}: ${errors.length} fel — inget når rendering ovaliderat:\n`);
for (const e of errors) console.error(`  ${e.path}\n    → ${e.msg}`);
process.exit(1);
