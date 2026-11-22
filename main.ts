// A working token-radar-01 entry (Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>), fits the
// radar-4 model in lib/model.ts from the protocols whose tokens already trade (a log-log comps
// regression with category effects, token odds from the peers' record, a held-out validation, and
// a 4-component leave-one-component-out ablation on held-out), scores every pre-token protocol
// by expected launch value, writes the ranked board to /output/board.json, and copies this
// repository's dashboard/ and screenshots/ to /output. It writes the compact dashboard
// dataset to /output/dashboard/data.js (inside dashboard/, so the dossier's text carries
// the rows, the ablation and the plan for the judge to read). Last, it writes
// /output/dossier.json, the summary the judge reads, with the vendored make.fun library.
//
// The dashboard is a static page, no framework and no network: dashboard/index.html,
// dashboard/app.css and dashboard/app.js read dashboard/data.js, which this program
// writes from the same board. It covers the watchlist, states the model, proves each
// component on held-out, and gives every protocol a farm plan. Change the model, the
// page or the plan; keep the gate's shape.
//
// Deterministic: no clock, no unseeded randomness (the bootstrap uses a fixed seed),
// every sort with a slug tie-break. Two runs on the same snapshot write
// byte-identical outputs.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, compactData, compactDataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
const boardJson = `${JSON.stringify({ rows: board })}\n`;
writeFileSync(join(out, 'board.json'), boardJson);
// The build hash: the first 12 hex characters of the board's SHA-256, so the
// integrity strip can name the exact build it shows. Deterministic: the same
// snapshot always yields the same board, hence the same hash.
const buildHash = createHash('sha256').update(boardJson, 'utf8').digest('hex').slice(0, 12);

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
// The compact dataset lives inside dashboard/, so the dossier's text (which shows
// only dashboard/) carries the rows, the ablation and the plan for the judge to read.
// The page reads data.js from its own directory; nothing sits beside the page.
writeFileSync(join(out, 'dashboard', 'data.js'), compactDataScript(compactData(radar, radar.ablation, buildHash)));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

const ab = radar.ablation;
const abRow = (name: string): string => {
  const r = ab.rows.find((x) => x.model === name);
  return r === undefined ? 'n/a' : `pairwise ${(r.pairwise * 100).toFixed(1)}% (ΔLOCO ${r.delta_pairwise === null ? '—' : `${r.delta_pairwise >= 0 ? '+' : ''}${r.delta_pairwise.toFixed(1)} pts`})`;
};
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: fit log(mcap) = ${radar.fit.intercept.toFixed(3)} + ${radar.fit.slope.toFixed(3)} x log(TVL) on ${radar.fit.fitted_on} traded protocols; ` +
    `held-out median error x${radar.fit.validation.median_factor.toFixed(2)} (starter x${radar.fit.validation.starter_median_factor.toFixed(2)}), ` +
    `P10-P90 covers ${radar.fit.validation.coverage_n}/${radar.fit.validation.test_n} held-out market caps\n` +
    `token radar: ablation (5-fold CV, n=${ab.cv_n}): Full ${abRow('Full (C1+C2+C3)')}; Without C1 ${abRow('Without C1 (scale)')}; Without C2 ${abRow('Without C2 (growth)')}; Without C3 ${abRow('Without C3 (maturity)')}; Baseline ${abRow('Baseline (starter)')}\n` +
    `token radar: odds log-loss ${ab.odds.logistic_log_loss.toFixed(3)} (blend ${ab.odds.blend_log_loss.toFixed(3)}, base ${ab.odds.base_log_loss.toFixed(3)}); per-category slope ${ab.per_category_ratio.toFixed(2)}x the single slope held out; young cohort x${ab.young.median_factor.toFixed(2)} vs rest x${ab.young.rest_median_factor.toFixed(2)}\n` +
    `token radar: top 5: ${board.slice(0, 5).map((r) => `${r.slug} $${r.implied_value_usd.toLocaleString('en-US')}`).join(', ')}\n` +
    `token radar: build ${buildHash}; wrote ${join(out, 'board.json')}, ${join(out, 'dashboard')} (4 files incl. data.js), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
