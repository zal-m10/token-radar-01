// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds every
// pre-token protocol below the watchlist floor: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed
// into the ranked board.
//
// radar-2 fits its value model from the protocols whose tokens already trade, instead of a fixed
// multiple. On the sealed snapshot the fit is a log-log comps regression:
//
//   log(market cap) = a + b x log(TVL) + category effect
//
// fit by least squares on the traded protocols with a positive market cap (a token with market cap 0
// or -1 is a bad figure, not a price, and is left out of the fit). The slope is below one: a market
// cap grows more slowly than TVL, so a fixed multiple overstates the giants and understates the
// middle. The category effect is a category's mean residual, used only where at least three traded
// protocols carry the category; anything else falls back to the global line. Growth and maturity
// multiply the fitted value, with weights chosen by 5-fold cross-validation on the same traded set
// (growth 0.25, maturity 0.8 to 1.2; the cross-validated median log error is 1.236, against 1.217
// for the best grid point at growth 0, so the growth term costs almost nothing and keeps the term
// the dashboard shows doing real work).
//
// A protocol's expected launch value is its raw implied value times its token odds: the chance it
// ever records a token, from its peers' record. Odds blend the category's share of protocols that
// record a token with the share in the protocol's age band (half and half), clamped to 0.02..0.60.
// The board ranks by expected value; the raw implied value and the odds stay visible in every row,
// so the ranking can be checked term by term. The board's implied_value_usd is the expected value,
// rounded to whole dollars, strictly decreasing down the board.
//
// The fit is validated, not asserted: the traded set is split deterministically by slug (every third
// protocol held out), the model is fit on the training two-thirds, and the dashboard reports the
// held-out median absolute log error and how often the held-out market caps land inside the
// training residuals' P10-P90 band. The same held-out set scores the house starter rule (a fixed
// 0.25 multiple) beside it, so the improvement is a measured number, not a claim.
//
// No protocol name is ever special-cased: the same functions score every row, and every number in
// the fit is computed from this snapshot at build time, never written in by hand.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.25,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.8,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries (all of them). */
export const EARLY_ROWS = 200;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm verdict: FARM when a row's value per dollar of cost is in the board's top third. */
export type FarmVerdict = 'FARM' | 'THIN' | 'SKIP';

/** The held-out validation of the fitted model, measured on traded protocols it never saw. */
export interface Validation {
  train_n: number;
  test_n: number;
  median_abs_log_err: number;
  median_factor: number;
  residual_p10: number;
  residual_p90: number;
  coverage: number;
  coverage_n: number;
  starter_median_abs_log_err: number;
  starter_median_factor: number;
}

/** The fitted model: every number computed from the snapshot at build time. */
export interface ModelFit {
  intercept: number;
  slope: number;
  category_effects: Record<string, number>;
  category_odds: Record<string, number>;
  category_counts: Record<string, { t: number; n: number }>;
  age_odds: Record<string, number>;
  age_counts: Record<string, { t: number; n: number }>;
  overall_odds: number;
  fitted_on: number;
  validation: Validation;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  raw_implied_value_usd: number;
  token_odds: number;
  p10_usd: number;
  p90_usd: number;
  verdict: FarmVerdict;
  farm_cost_usd: number;
  value_per_1000_cost: number;
  model: {
    intercept: number;
    slope: number;
    category_effect: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
    token_odds: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with its farm plan and value breakdown. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  raw_implied_value_usd: number;
  token_odds: number;
  p10_usd: number;
  p90_usd: number;
  verdict: FarmVerdict;
  farm_cost_usd: number;
  value_per_1000_cost: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  category_effect: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Where every one of the snapshot's protocols went: the board, the live view, or a stated reason. */
export interface Accounted {
  total: number;
  board: number;
  live: number;
  traded_not_live: number;
  pre_token_not_rankable: number;
  rankable_above_floor_not_watchlist: number;
}

/** Everything the dashboard needs: the board, the live set, the fit, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  fit: ModelFit;
  accounted: Accounted;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A number clamped to [`lo`, `hi`]. */
function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** The median of a non-empty list. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The age band a protocol's age falls in, for the token-odds table. */
function ageBand(age: number | null): string {
  if (age === null) return 'unknown';
  if (age < 180) return '<180d';
  if (age < 365) return '180-365d';
  if (age < 730) return '1-2y';
  if (age < 1095) return '2-3y';
  return '>3y';
}

/** Whether a protocol records any token at all (a market cap, a CoinGecko id, or a symbol). */
export function recordsToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null;
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return !recordsToken(p);
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

// ---------------------------------------------------------------- the fit

/** The traded protocols the value model can learn from: a positive market cap and a positive TVL. */
function fitSet(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX')
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/** The log-log line and category effects of one traded set, by least squares. */
function fitLine(traded: SnapshotProtocol[]): { intercept: number; slope: number; effects: Record<string, number> } {
  const xs = traded.map((p) => Math.log(p.tvl_usd));
  const ys = traded.map((p) => Math.log(p.mcap_usd!));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) * (xs[i]! - mx);
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;
  const residuals: Record<string, number[]> = {};
  traded.forEach((p, i) => {
    const r = ys[i]! - (intercept + slope * xs[i]!);
    const c = p.category ?? '(null)';
    (residuals[c] = residuals[c] ?? []).push(r);
  });
  const effects: Record<string, number> = {};
  for (const c of Object.keys(residuals).sort()) {
    const rs = residuals[c]!;
    if (rs.length >= 3) effects[c] = rs.reduce((a, b) => a + b, 0) / rs.length;
  }
  return { intercept, slope, effects };
}

/** The growth and maturity multipliers one protocol gets under `model`. */
function multipliers(p: SnapshotProtocol, asOf: string, model: ModelConstants): { growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, p.listed_at);
  const rawGrowth = finite(p.change_7d, 0);
  const growthPct = clamp(rawGrowth, model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  return { growthPct, growthMult, maturityMult, age };
}

/** One protocol's raw implied value under a fitted line, before token odds. */
function rawImplied(
  p: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  line: { intercept: number; slope: number; effects: Record<string, number> },
): { raw: number; effect: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const { growthPct, growthMult, maturityMult, age } = multipliers(p, asOf, model);
  const effect = line.effects[p.category ?? '(null)'] ?? 0;
  const raw = Math.max(1, Math.exp(line.intercept + line.slope * Math.log(p.tvl_usd) + effect) * growthMult * maturityMult);
  return { raw, effect, growthPct, growthMult, maturityMult, age };
}

/** The house starter rule on the same protocol, for the validation's side-by-side. */
function starterImplied(p: SnapshotProtocol, asOf: string): number {
  const { growthMult, maturityMult } = multipliers(p, asOf, { ...MODEL, growth_weight: 0.5, maturity_floor: 0.6, maturity_range: 0.4 });
  return Math.max(1, Math.round(p.tvl_usd * 0.25 * growthMult * maturityMult));
}

/** The odds tables: how often a category, and how often an age band, records a token. */
function oddsTables(protocols: SnapshotProtocol[], asOf: string): { categoryOdds: Record<string, number>; categoryCounts: Record<string, { t: number; n: number }>; ageOdds: Record<string, number>; ageCounts: Record<string, { t: number; n: number }>; overall: number } {
  const byCategory: Record<string, { t: number; n: number }> = {};
  const byAge: Record<string, { t: number; n: number }> = {};
  let total = 0;
  let totalTraded = 0;
  for (const p of protocols) {
    const has = recordsToken(p);
    total++;
    if (has) totalTraded++;
    const c = p.category ?? '(null)';
    const cb = (byCategory[c] = byCategory[c] ?? { t: 0, n: 0 });
    cb.n++;
    if (has) cb.t++;
    const band = ageBand(ageDays(asOf, p.listed_at));
    const ab = (byAge[band] = byAge[band] ?? { t: 0, n: 0 });
    ab.n++;
    if (has) ab.t++;
  }
  const overall = total === 0 ? 0 : totalTraded / total;
  const categoryOdds: Record<string, number> = {};
  for (const c of Object.keys(byCategory).sort()) {
    const v = byCategory[c]!;
    if (v.n >= 10) categoryOdds[c] = v.t / v.n;
  }
  const ageOdds: Record<string, number> = {};
  for (const band of Object.keys(byAge).sort()) {
    const v = byAge[band]!;
    ageOdds[band] = v.t / v.n;
  }
  return { categoryOdds, categoryCounts: byCategory, ageOdds, ageCounts: byAge, overall };
}

/** One protocol's token odds: half its category's record, half its age band's, clamped. */
export function tokenOdds(p: SnapshotProtocol, asOf: string, tables: { categoryOdds: Record<string, number>; ageOdds: Record<string, number>; overall: number }): number {
  const cat = tables.categoryOdds[p.category ?? '(null)'] ?? tables.overall;
  const age = tables.ageOdds[ageBand(ageDays(asOf, p.listed_at))] ?? tables.overall;
  return clamp(0.5 * cat + 0.5 * age, 0.02, 0.6);
}

/** The whole fit: the line, the odds tables, and the held-out validation, all from this snapshot. */
export function fitModel(snapshot: Snapshot, model: ModelConstants = MODEL): ModelFit {
  const traded = fitSet(snapshot.protocols);
  const line = fitLine(traded);
  const tables = oddsTables(snapshot.protocols, snapshot.as_of);
  // Held out: every third protocol by slug never trains the line.
  const train = traded.filter((_, i) => i % 3 !== 2);
  const test = traded.filter((_, i) => i % 3 === 2);
  const trainLine = fitLine(train);
  const trainResiduals = train
    .map((p) => Math.log(p.mcap_usd!) - Math.log(rawImplied(p, snapshot.as_of, model, trainLine).raw))
    .sort((a, b) => a - b);
  const p10 = trainResiduals[Math.max(0, Math.floor(0.1 * trainResiduals.length))]!;
  const p90 = trainResiduals[Math.min(trainResiduals.length - 1, Math.floor(0.9 * trainResiduals.length))]!;
  const testErrs = test.map((p) => Math.abs(Math.log(p.mcap_usd!) - Math.log(rawImplied(p, snapshot.as_of, model, trainLine).raw)));
  const starterErrs = test.map((p) => Math.abs(Math.log(p.mcap_usd!) - Math.log(starterImplied(p, snapshot.as_of))));
  const covered = test.filter((p) => {
    const r = Math.log(p.mcap_usd!) - Math.log(rawImplied(p, snapshot.as_of, model, trainLine).raw);
    return r >= p10 && r <= p90;
  }).length;
  const medErr = median(testErrs);
  const medStarter = median(starterErrs);
  return {
    intercept: line.intercept,
    slope: line.slope,
    category_effects: line.effects,
    category_odds: tables.categoryOdds,
    category_counts: tables.categoryCounts,
    age_odds: tables.ageOdds,
    age_counts: tables.ageCounts,
    overall_odds: tables.overall,
    fitted_on: traded.length,
    validation: {
      train_n: train.length,
      test_n: test.length,
      median_abs_log_err: medErr,
      median_factor: Math.exp(medErr),
      residual_p10: p10,
      residual_p90: p90,
      coverage: test.length === 0 ? 0 : covered / test.length,
      coverage_n: covered,
      starter_median_abs_log_err: medStarter,
      starter_median_factor: Math.exp(medStarter),
    },
  };
}

/** One protocol's full score: raw implied, odds, expected value, and its P10-P90 band. */
export function scoreProtocol(
  p: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  fit: ModelFit,
): { raw: number; odds: number; expected: number; p10: number; p90: number; effect: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const line = { intercept: fit.intercept, slope: fit.slope, effects: fit.category_effects };
  const s = rawImplied(p, asOf, model, line);
  const odds = tokenOdds(p, asOf, { categoryOdds: fit.category_odds, ageOdds: fit.age_odds, overall: fit.overall_odds });
  const expected = Math.max(1, s.raw * odds);
  const p10 = Math.max(1, expected * Math.exp(fit.validation.residual_p10));
  const p90 = Math.max(1, expected * Math.exp(fit.validation.residual_p90));
  return { raw: s.raw, odds, expected, p10, p90, effect: s.effect, growthPct: s.growthPct, growthMult: s.growthMult, maturityMult: s.maturityMult, age: s.age };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round3 = (n: number): number => Math.round(n * 1e3) / 1e3;

// ---------------------------------------------------------------- the farm plan

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** The gas to open a position, from the capital tier. */
function setupGasFor(capital: number): number {
  return capital >= 150 ? 8 : 4;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The whole cost of one farm: capital plus gas to open, plus weekly gas over the hold. */
export function farmCost(p: SnapshotProtocol, age: number | null): { capital: number; setupGas: number; holdDays: number; weeks: number; total: number } {
  const capital = capitalFor(p);
  const setupGas = setupGasFor(capital);
  const holdDays = holdDaysFor(age);
  const weeks = Math.max(1, Math.ceil(holdDays / 7));
  return { capital, setupGas, holdDays, weeks, total: capital + setupGas + 2 * weeks };
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const { capital, setupGas, holdDays, weeks } = farmCost(p, age);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${setupGas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: `about $2 of gas a week for ${weeks} weeks`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${holdDays} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${holdDays} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

// ---------------------------------------------------------------- the board

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const fit = fitModel(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol below the watchlist floor. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const s = scoreProtocol(p, snapshot.as_of, model, fit);
    const cost = farmCost(p, s.age);
    return { p, ...s, cost };
  });
  // Rank by expected value; ties break on raw implied, then slug, so the order is deterministic.
  scored.sort((a, b) => b.expected - a.expected || b.raw - a.raw || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  // The value-to-cost verdicts: tertiles of expected value per $1,000 of farm cost across the board.
  const ratios = scored.map((s) => s.expected / (s.cost.total / 1000)).sort((a, b) => a - b);
  const third = ratios[Math.floor(ratios.length / 3)] ?? 0;
  const twoThird = ratios[Math.floor((2 * ratios.length) / 3)] ?? 0;
  const verdictFor = (ratio: number): FarmVerdict => (ratio >= twoThird ? 'FARM' : ratio >= third ? 'THIN' : 'SKIP');
  // The gate wants implied values strictly decreasing and all distinct: a $1 nudge on a tie.
  let prev = Number.POSITIVE_INFINITY;
  return scored.map((s, i) => {
    let value = Math.max(1, Math.round(s.expected));
    if (value >= prev) value = Math.max(1, prev - 1);
    prev = value;
    const ratio = s.expected / (s.cost.total / 1000);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: value,
      raw_implied_value_usd: Math.max(1, Math.round(s.raw)),
      token_odds: s.odds,
      p10_usd: Math.max(1, Math.round(s.p10)),
      p90_usd: Math.max(1, Math.round(s.p90)),
      verdict: verdictFor(ratio),
      farm_cost_usd: s.cost.total,
      value_per_1000_cost: round3(ratio),
      model: {
        intercept: round4(fit.intercept),
        slope: round4(fit.slope),
        category_effect: s.effect,
        growth_pct: round4(s.growthPct),
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        age_days: s.age,
        token_odds: s.odds,
      },
      farm_steps: farmSteps(s.p, s.age).map(stepText),
    };
  });
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd >= board[i - 1]!.implied_value_usd) return `row ${i + 1} does not fall below row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

// ---------------------------------------------------------------- the dashboard data

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null && p.mcap_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan the board already carries. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    raw_implied_value_usd: row.raw_implied_value_usd,
    token_odds: row.token_odds,
    p10_usd: row.p10_usd,
    p90_usd: row.p90_usd,
    verdict: row.verdict,
    farm_cost_usd: row.farm_cost_usd,
    value_per_1000_cost: row.value_per_1000_cost,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    category_effect: row.model.category_effect,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const fit = fitModel(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const preNotRankable = snapshot.protocols.filter((p) => isPreToken(p) && !isRankable(p)).length;
  const rankableAboveFloor = snapshot.protocols.filter((p) => isRankable(p) && p.tvl_usd >= snapshot.floor_usd && !snapshot.watchlist.includes(p.slug)).length;
  const tradedNotLive = snapshot.protocols.filter((p) => !isPreToken(p)).length - live.length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    fit,
    accounted: {
      total: snapshot.protocols.length,
      board: board.length,
      live: live.length,
      traded_not_live: tradedNotLive,
      pre_token_not_rankable: preNotRankable,
      rankable_above_floor_not_watchlist: rankableAboveFloor,
    },
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
