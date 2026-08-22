"use strict";

/* ------------------------------------------------------------------
 * 理想の相手、実際どれくらいいる？（エンタメ版）
 * 年齢・年収・身長・職業・外見等の「人口分布の目安」を仮定し、
 * すべての条件を満たす人が独立事象として重なる確率を掛け合わせて
 * 推定する簡易ツール。統計調査ではなく、あくまで概算の参考値。
 * ------------------------------------------------------------------ */

const POPULATION_BASE = { male: 15000000, female: 14000000 };

const HEIGHT_DIST = {
  male: { mean: 171, sd: 5.5 },
  female: { mean: 158, sd: 5.3 },
};

// [年収の下限(万円), その額以上を稼ぐ人口割合] のポイント列。区間は対数線形補間、
// 最後尾を超える場合は最終区間の減衰率で外挿する。
const MALE_INCOME_POINTS = [
  [0, 1.0],
  [200, 0.85],
  [300, 0.7],
  [400, 0.55],
  [500, 0.4],
  [600, 0.29],
  [700, 0.21],
  [800, 0.15],
  [1000, 0.085],
  [1200, 0.055],
  [1500, 0.032],
  [2000, 0.016],
  [3000, 0.006],
  [5000, 0.0015],
  [10000, 0.0002],
];

const FEMALE_INCOME_POINTS = [
  [0, 1.0],
  [150, 0.8],
  [200, 0.65],
  [300, 0.45],
  [400, 0.28],
  [500, 0.16],
  [600, 0.095],
  [700, 0.055],
  [800, 0.033],
  [1000, 0.016],
  [1200, 0.009],
  [1500, 0.004],
  [2000, 0.0015],
  [3000, 0.0004],
  [5000, 0.00005],
];

const MALE_JOB_TIERS = [
  { value: "student", label: "学生・無職・その他", share: 0.15 },
  { value: "nonregular", label: "契約・派遣・パート等", share: 0.18 },
  { value: "freelance", label: "自営業・フリーランス", share: 0.06 },
  { value: "sme", label: "中小企業正社員（一般職）", share: 0.2 },
  { value: "corporate_general", label: "大手・中堅企業正社員（一般職）", share: 0.12 },
  { value: "engineer", label: "ITエンジニアなどの専門職", share: 0.1 },
  { value: "corporate", label: "大手・中堅企業（総合職）", share: 0.08 },
  { value: "public", label: "公務員・教員", share: 0.06 },
  { value: "executive", label: "経営者・会社役員", share: 0.03 },
  { value: "specialist", label: "医師・士業（弁護士・会計士等）", share: 0.02 },
];

const FEMALE_JOB_TIERS = [
  { value: "student", label: "学生・無職・その他", share: 0.15 },
  { value: "nonregular", label: "契約・派遣・パート等（事務・販売等）", share: 0.2 },
  { value: "freelance", label: "自営業・フリーランス", share: 0.05 },
  { value: "sme", label: "中小企業正社員（一般事務等）", share: 0.27 },
  { value: "corporate", label: "大手企業総合職・公務員・教員", share: 0.12 },
  { value: "engineer", label: "ITエンジニアなどの専門職", share: 0.05 },
  { value: "specialist", label: "看護師・薬剤師などの専門職", share: 0.08 },
  { value: "executive", label: "経営者・会社役員", share: 0.02 },
  { value: "glamour", label: "客室乗務員（CA）・アナウンサー", share: 0.03 },
  { value: "doctor", label: "医師・士業（弁護士・会計士等）", share: 0.03 },
];

// レベル1〜7の人口分布（4=普通を中心とした山型を仮定）
const LEVEL_SHARE = { 1: 0.03, 2: 0.09, 3: 0.2, 4: 0.36, 5: 0.2, 6: 0.09, 7: 0.03 };

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function ageFraction(lo, hi) {
  const a = Math.max(20, Math.min(59, Number(lo) || 20));
  const b = Math.max(20, Math.min(59, Number(hi) || 59));
  if (b < a) return 0;
  return Math.max(0, Math.min(1, (b - a) / 40));
}

function heightFraction(genderKey, thresholdCm) {
  const cfg = HEIGHT_DIST[genderKey];
  const z = ((Number(thresholdCm) || 0) - cfg.mean) / cfg.sd;
  return 1 - normalCdf(z);
}

function incomeFraction(genderKey, thresholdManYen) {
  const points = genderKey === "male" ? MALE_INCOME_POINTS : FEMALE_INCOME_POINTS;
  const x = Math.max(0, Number(thresholdManYen) || 0);
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      const t = (x - x0) / (x1 - x0);
      const logY = Math.log(y0) + t * (Math.log(y1) - Math.log(y0));
      return Math.exp(logY);
    }
  }
  const [x0, y0] = points[points.length - 2];
  const [x1, y1] = points[points.length - 1];
  const rate = Math.log(y1 / y0) / (x1 - x0);
  return Math.max(0.00001, y1 * Math.exp(rate * (x - x1)));
}

function jobFraction(genderKey, tierValue) {
  const tiers = genderKey === "male" ? MALE_JOB_TIERS : FEMALE_JOB_TIERS;
  const idx = tiers.findIndex((t) => t.value === tierValue);
  if (idx < 0) return 1;
  let sum = 0;
  for (let i = idx; i < tiers.length; i++) sum += tiers[i].share;
  return sum;
}

function levelFraction(level) {
  const lv = Math.max(1, Math.min(7, Number(level) || 1));
  let sum = 0;
  for (let i = lv; i <= 7; i++) sum += LEVEL_SHARE[i];
  return sum;
}

function jobLabel(genderKey, tierValue) {
  const tiers = genderKey === "male" ? MALE_JOB_TIERS : FEMALE_JOB_TIERS;
  const tier = tiers.find((t) => t.value === tierValue);
  return tier ? tier.label : "-";
}

function populateJobSelect() {
  const gender = document.querySelector('input[name="rarity-gender"]:checked').value;
  const select = document.getElementById("job-min");
  const tiers = gender === "male" ? MALE_JOB_TIERS : FEMALE_JOB_TIERS;
  const previousValue = select.value;
  select.innerHTML = tiers.map((t) => `<option value="${t.value}">${t.label} 以上</option>`).join("");
  select.value = tiers.some((t) => t.value === previousValue)
    ? previousValue
    : tiers[Math.floor(tiers.length / 2)].value;
}

function formatPercent(fraction) {
  const pct = fraction * 100;
  if (pct <= 0) return "0%";
  if (pct >= 10) return `${pct.toFixed(1)}%`;
  if (pct >= 1) return `${pct.toFixed(2)}%`;
  if (pct >= 0.01) return `${pct.toFixed(3)}%`;
  // ごく小さい値も指数表記（例: 9.2e-4%）は直感的でないため避け、
  // 有効数字が見える桁まで0埋めした小数表示にする。
  const decimals = Math.min(12, Math.max(3, Math.ceil(-Math.log10(pct)) + 1));
  return `${pct.toFixed(decimals)}%`;
}

function formatCount(n) {
  if (n < 1) return "1人未満";
  if (n < 1000) return `約${Math.round(n)}人`;
  if (n < 10000) return `約${(Math.round(n / 100) * 100).toLocaleString("ja-JP")}人`;
  const man = n / 10000;
  return `約${man >= 100 ? Math.round(man).toLocaleString("ja-JP") : man.toFixed(1)}万人`;
}

function handleSubmit(e) {
  e.preventDefault();
  const gender = document.querySelector('input[name="rarity-gender"]:checked').value;
  const rows = [];
  let combined = 1;

  if (document.getElementById("c-age").checked) {
    const lo = document.getElementById("age-lo").value;
    const hi = document.getElementById("age-hi").value;
    const f = ageFraction(lo, hi);
    combined *= f;
    rows.push({ label: "年齢", desc: `${lo}〜${hi}歳`, fraction: f });
  }
  if (document.getElementById("c-income").checked) {
    const v = document.getElementById("income-min").value;
    const f = incomeFraction(gender, v);
    combined *= f;
    rows.push({ label: "年収", desc: `${v}万円以上`, fraction: f });
  }
  if (document.getElementById("c-height").checked) {
    const v = document.getElementById("height-min").value;
    const f = heightFraction(gender, v);
    combined *= f;
    rows.push({ label: "身長", desc: `${v}cm以上`, fraction: f });
  }
  if (document.getElementById("c-job").checked) {
    const v = document.getElementById("job-min").value;
    const f = jobFraction(gender, v);
    combined *= f;
    rows.push({ label: "職業", desc: `${jobLabel(gender, v)} 以上`, fraction: f });
  }
  if (document.getElementById("c-appearance").checked) {
    const v = document.getElementById("appearance-min").value;
    const f = levelFraction(v);
    combined *= f;
    rows.push({ label: "顔立ち", desc: `レベル${v}以上`, fraction: f });
  }
  if (document.getElementById("c-body").checked) {
    const v = document.getElementById("body-min").value;
    const f = levelFraction(v);
    combined *= f;
    rows.push({ label: "体型", desc: `レベル${v}以上`, fraction: f });
  }
  if (document.getElementById("c-personality").checked) {
    const v = document.getElementById("personality-min").value;
    const f = levelFraction(v);
    combined *= f;
    rows.push({ label: "性格", desc: `レベル${v}以上`, fraction: f });
  }

  const population = POPULATION_BASE[gender];
  const estimatedCount = population * combined;
  const genderLabel = gender === "male" ? "男性" : "女性";

  if (rows.length === 0) {
    document.getElementById("rarity-count").textContent = "全員が該当";
    document.getElementById("rarity-sub").textContent = "条件が選択されていません";
    document.getElementById("rarity-odds").textContent = `推定人数: ${formatCount(estimatedCount)}`;
  } else if (combined <= 0) {
    document.getElementById("rarity-count").textContent = "該当者なし";
    document.getElementById("rarity-sub").textContent = "条件を満たす人がほぼいない設定です";
    document.getElementById("rarity-odds").textContent = "";
  } else {
    // 「○人に1人」という比率表現を主役に。人数は実感が湧きにくいため、
    // 割合ベースの表現（比率・パーセント）を先に、人数は補足として小さく添える。
    document.getElementById("rarity-count").textContent =
      `${Math.round(1 / combined).toLocaleString("ja-JP")}人に1人`;
    document.getElementById("rarity-sub").textContent =
      `${genderLabel}人口のおよそ ${formatPercent(combined)}`;
    document.getElementById("rarity-odds").textContent = `推定人数: ${formatCount(estimatedCount)}`;
  }

  const body = document.getElementById("rarity-breakdown-body");
  body.innerHTML = "";
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<th scope="row">${r.label}</th><td>${r.desc}</td><td>${formatPercent(r.fraction)}</td>`;
    body.appendChild(tr);
  });
  document.getElementById("rarity-combined-desc").textContent = `${rows.length}項目すべて`;
  document.getElementById("rarity-combined-pct").textContent = formatPercent(combined);

  document.getElementById("rarity-result").hidden = false;
  document.getElementById("rarity-result").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

document.addEventListener("DOMContentLoaded", () => {
  populateJobSelect();
  document.querySelectorAll('input[name="rarity-gender"]').forEach((el) =>
    el.addEventListener("change", populateJobSelect)
  );
  document.getElementById("rarity-form").addEventListener("submit", handleSubmit);
});
