"use strict";

/* ------------------------------------------------------------------
 * 婚活市場価値診断（エンタメ版）
 * ネット上でよく言われる「婚活市場での傾向」を元にした簡易スコアリング。
 * 統計的・科学的根拠はなく、人の価値を測るものではありません。
 * ------------------------------------------------------------------ */

const APPEARANCE_LABELS = [
  "かなり控えめ",
  "控えめ",
  "普通",
  "整っている方",
  "かなり整っている",
];

const BODY_LABELS = [
  "ふくよか",
  "ややふくよか",
  "普通体型",
  "引き締まっている",
  "スレンダー・スタイル良い",
];

const PERSONALITY_LABELS = [
  "かなり要努力",
  "やや要努力",
  "普通",
  "良好",
  "かなり良好",
];

const MALE_JOB_TIERS = [
  { value: "student", label: "学生・無職・その他", points: 1 },
  { value: "nonregular", label: "契約・派遣・非正規", points: 3 },
  { value: "freelance", label: "自営業・フリーランス", points: 5 },
  { value: "sme", label: "中小企業正社員（一般職）", points: 6 },
  { value: "corporate", label: "大手・中堅企業（総合職）", points: 7 },
  { value: "public", label: "公務員・教員", points: 8 },
  { value: "specialist", label: "医師・士業（弁護士・会計士等）", points: 10 },
];

const FEMALE_JOB_TIERS = [
  { value: "student", label: "学生・無職・その他", points: 2 },
  { value: "nonregular", label: "契約・派遣・非正規（事務・販売等）", points: 4 },
  { value: "sme", label: "中小企業正社員（一般事務等）", points: 5 },
  { value: "corporate", label: "大手企業総合職・公務員・教員", points: 7 },
  { value: "specialist", label: "看護師・薬剤師などの専門職", points: 8 },
  { value: "glamour", label: "客室乗務員（CA）・アナウンサー・医師/士業", points: 10 },
];

// 婚活市場で「学歴フィルター」としてよく言及される大学の序列（日東駒専・成成明学獨國武・
// MARCH/関関同立・早慶/旧帝大等）を踏まえた男性のみの学歴ティア。
const MALE_EDUCATION_TIERS = [
  { value: "middle", label: "中卒・高校中退", points: 1 },
  { value: "highschool", label: "高校卒", points: 2 },
  { value: "vocational", label: "専門学校・短大卒", points: 3 },
  { value: "university_low", label: "大学卒（日東駒専未満）", points: 4 },
  { value: "university_nittokomasen", label: "大学卒（日東駒専）", points: 5 },
  { value: "university_seimarch", label: "大学卒（成成明学獨國武）", points: 6 },
  { value: "university_march", label: "大学卒（MARCH・関関同立）", points: 8 },
  { value: "university_top", label: "大学卒（早慶・旧帝大等の最難関）・大学院卒", points: 10 },
];

// 婚姻歴・子供の有無。男女共通の項目として扱う。
const MARITAL_TIERS = [
  { value: "remarried_with_children_living", label: "再婚・子供あり（同居）", points: 2 },
  { value: "remarried_with_children_apart", label: "再婚・子供あり（別居）", points: 4 },
  { value: "remarried_no_children", label: "再婚・子供なし", points: 7 },
  { value: "first_marriage_no_children", label: "初婚・子供なし", points: 10 },
];

// 年齢は加点ではなく、最終スコア全体への倍率としてのみ効かせる。
// 「他の項目がどれだけ高くても、理想的な年齢層から離れるほど頭打ちになる」という
// 婚活市場でよく言われる傾向を、単峰（山なり）の連続カーブで表現する。
// ピーク年齢を中心に、ピークより若い側はsigmaLo、上の側はsigmaHiで減衰する。
const AGE_MULTIPLIER = {
  male: { peak: 31, sigmaLo: 16, sigmaHi: 8, floor: 0.25 },
  female: { peak: 25.5, sigmaLo: 20, sigmaHi: 7, floor: 0.2 },
};

// 「女性は年齢がほぼ絶対条件、男性は年収が高ければ年齢の高さをある程度
// カバーできる」という非対称な傾向を反映し、男性のみ年収に応じて
// 倍率カーブのピーク年齢とフロアを引き上げる。女性側は年収による
// 補正を行わない。
const MALE_AGE_INCOME_RESCUE = {
  yearsPerManYen: 250, // 年収250万円ごとにピーク年齢+1歳
  maxBonusYears: 12,
  floorPerManYen: 15000, // 年収が高いほどフロアも底上げ
  floorCap: 0.6,
};

// 男性の年収レスキューと対になる仕組み。「美人は年齢を重ねても市場価値が
// 保たれやすい」という傾向を反映し、顔立ちスコアが高い女性ほど倍率カーブの
// ピーク年齢とフロアが引き上がる。外見が平均的な女性は今まで通り厳しいまま。
const FEMALE_AGE_APPEARANCE_RESCUE = {
  pointsPerYear: 4, // 顔立ちスコア4点ごとにピーク年齢+1歳
  maxBonusYears: 5,
  floorPerPoint: 0.006,
  floorCap: 0.3,
};

// 単峰の年齢倍率カーブ。ピーク年齢で倍率1、そこから離れるほど（下側はsigmaLo、
// 上側はsigmaHiで）滑らかに減衰し、floorに漸近する。「安全窓」のような
// 平坦区間は設けず、常にグラデーションがつく設計。
function ageMultiplier(genderKey, age, rescueValue) {
  const cfg = AGE_MULTIPLIER[genderKey];
  const a = Number(age) || 0;
  let effectivePeak = cfg.peak;
  let floor = cfg.floor;
  if (genderKey === "male") {
    const inc = Math.max(0, Number(rescueValue) || 0);
    const r = MALE_AGE_INCOME_RESCUE;
    effectivePeak += Math.min(r.maxBonusYears, inc / r.yearsPerManYen);
    floor = Math.min(r.floorCap, cfg.floor + inc / r.floorPerManYen);
  } else if (genderKey === "female") {
    const app = Math.max(0, Number(rescueValue) || 0);
    const r = FEMALE_AGE_APPEARANCE_RESCUE;
    effectivePeak += Math.min(r.maxBonusYears, app / r.pointsPerYear);
    floor = Math.min(r.floorCap, cfg.floor + app * r.floorPerPoint);
  }
  const sigma = a < effectivePeak ? cfg.sigmaLo : cfg.sigmaHi;
  return floor + (1 - floor) * Math.exp(-((a - effectivePeak) ** 2) / (2 * sigma * sigma));
}

const CATEGORIES = {
  male: [
    { key: "income", label: "年収", type: "income", cap: 35, max: 35, k: 700, unit: "万円", plausible: [0, 10000] },
    { key: "height", label: "身長", type: "gaussian", max: 15, floor: 3, peak: 178, sigma: 10, unit: "cm", plausible: [150, 200] },
    { key: "job", label: "職業・雇用形態", type: "discrete", max: 10, tiers: MALE_JOB_TIERS },
    { key: "education", label: "学歴", type: "discrete", max: 10, tiers: MALE_EDUCATION_TIERS },
    { key: "marital", label: "婚姻歴・子供の有無", type: "discrete", max: 10, tiers: MARITAL_TIERS },
    { key: "appearance", label: "顔立ち", type: "slider", max: 10, labels: APPEARANCE_LABELS },
    { key: "body", label: "体型", type: "slider", max: 5, labels: BODY_LABELS },
    { key: "personality", label: "性格・コミュ力", type: "slider", max: 5, labels: PERSONALITY_LABELS },
  ],
  female: [
    { key: "appearance", label: "顔立ち", type: "slider", max: 30, labels: APPEARANCE_LABELS },
    { key: "body", label: "体型", type: "slider", max: 15, labels: BODY_LABELS },
    { key: "height", label: "身長", type: "gaussian", max: 10, floor: 4, peak: 162, sigma: 12, unit: "cm", plausible: [140, 185] },
    { key: "income", label: "年収", type: "income", cap: 10, max: 10, k: 500, unit: "万円", plausible: [0, 10000] },
    { key: "job", label: "職業・雇用形態", type: "discrete", max: 10, tiers: FEMALE_JOB_TIERS },
    { key: "marital", label: "婚姻歴・子供の有無", type: "discrete", max: 10, tiers: MARITAL_TIERS },
    { key: "personality", label: "性格・家庭的な面", type: "slider", max: 15, labels: PERSONALITY_LABELS },
  ],
};

function scoreCategory(cat, rawValue) {
  switch (cat.type) {
    case "income": {
      const v = Math.max(0, Number(rawValue) || 0);
      return cat.cap * (1 - Math.exp(-v / cat.k));
    }
    case "gaussian": {
      const v = Number(rawValue) || 0;
      return cat.floor + (cat.max - cat.floor) * Math.exp(-((v - cat.peak) ** 2) / (2 * cat.sigma * cat.sigma));
    }
    case "discrete": {
      const tier = cat.tiers.find((t) => t.value === rawValue) || cat.tiers[0];
      return tier.points;
    }
    case "slider": {
      const v = Math.min(5, Math.max(1, Number(rawValue) || 1));
      return (v / 5) * cat.max;
    }
    default:
      return 0;
  }
}

function scoreProfile(genderKey, values) {
  const cats = CATEGORIES[genderKey];
  let rawTotal = 0;
  let appearancePoints = 0;
  const breakdown = [];
  cats.forEach((cat) => {
    const points = scoreCategory(cat, values[cat.key]);
    rawTotal += points;
    if (cat.key === "appearance") {
      appearancePoints = points;
    }
    breakdown.push({ ...cat, points, ratio: points / cat.max });
  });
  const ageRescueValue = genderKey === "male" ? values.income : appearancePoints;
  const multiplier = ageMultiplier(genderKey, values.age, ageRescueValue);
  // 年齢は加点を持たず、年齢以外の項目の合計に対する倍率としてのみ効く。
  const total = Math.round(rawTotal * multiplier * 10) / 10;
  return {
    total,
    rawTotal: Math.round(rawTotal * 10) / 10,
    multiplier,
    breakdown,
  };
}

// 偏差値換算はあくまで参考値。実際の受験者集団のような統計データは存在しないため、
// 「典型的な入力値（普通レベルの自己評価など）でおよそ65点前後になる」という
// このツール自身の設計上の目安を平均とみなし、標準偏差15を仮定して算出している。
const HENSACHI_ASSUMED_MEAN = 65;
const HENSACHI_ASSUMED_SD = 15;

function toHensachi(score) {
  const raw = 50 + (10 * (score - HENSACHI_ASSUMED_MEAN)) / HENSACHI_ASSUMED_SD;
  return Math.round(Math.max(20, Math.min(90, raw)) * 10) / 10;
}

// 標準正規分布の累積分布関数（Abramowitz and Stegun近似）。
// 偏差値50・SD10の正規分布を仮定した「上位何%」の参考値の算出に使う。
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

function toTopPercent(hensachi) {
  const z = (hensachi - 50) / 10;
  const topRatio = 1 - normalCdf(z);
  const pct = topRatio * 100;
  if (pct < 0.1) return "0.1";
  if (pct > 99.9) return "99.9";
  return pct.toFixed(1);
}

function rankOf(score) {
  if (score >= 90) return { label: "SS", desc: "市場でごく少数の、超ハイスペック層" };
  if (score >= 80) return { label: "S", desc: "誰から見ても好条件、モテる層" };
  if (score >= 70) return { label: "A", desc: "条件面で優位に立てる層" };
  if (score >= 60) return { label: "B", desc: "平均よりやや高めの層" };
  if (score >= 50) return { label: "C", desc: "標準的な市場価値の層" };
  if (score >= 40) return { label: "D", desc: "やや控えめ、工夫でカバーできる層" };
  return { label: "E", desc: "市場では厳しめ、条件の見直しや強みの発見がおすすめ" };
}

function verdictOf(diff) {
  if (diff >= 15) {
    return { tone: "good", text: "あなたの市場価値なら十分狙える、むしろ相手にとってお得まである組み合わせです。" };
  }
  if (diff >= 0) {
    return { tone: "good", text: "釣り合いが取れている、現実的な組み合わせです。" };
  }
  if (diff >= -15) {
    return { tone: "warn", text: "やや背伸びした条件です。可能性はゼロではありませんが、競争率はかなり高めと考えましょう。" };
  }
  return { tone: "bad", text: "現状の市場価値とはギャップが大きい組み合わせです。条件を見直すか、自分の市場価値を高める努力が必要そうです。" };
}

function invertCategory(cat, ratio) {
  const r = Math.min(0.985, Math.max(0, ratio));
  switch (cat.type) {
    case "income": {
      if (r <= 0) return "こだわらなくてもOK";
      const target = r * cat.cap;
      const minIncome = -cat.k * Math.log(1 - target / cat.cap);
      return `${Math.max(0, Math.round(minIncome))}万円以上が目安`;
    }
    case "gaussian": {
      const target = r * cat.max;
      if (target <= cat.floor) {
        return "特にこだわらなくても対象になりやすい範囲";
      }
      const inner = (target - cat.floor) / (cat.max - cat.floor);
      const delta = cat.sigma * Math.sqrt(-2 * Math.log(inner));
      let lo = Math.round(cat.peak - delta);
      let hi = Math.round(cat.peak + delta);
      lo = Math.max(cat.plausible[0], lo);
      hi = Math.min(cat.plausible[1], hi);
      return `${lo}〜${hi}${cat.unit}`;
    }
    case "discrete": {
      const target = r * cat.max;
      let best = cat.tiers[0];
      let bestDiff = Infinity;
      cat.tiers.forEach((t) => {
        const d = Math.abs(t.points - target);
        if (d < bestDiff) {
          bestDiff = d;
          best = t;
        }
      });
      return `${best.label} 程度`;
    }
    case "slider": {
      const target = r * cat.max;
      const level = Math.min(5, Math.max(1, Math.round((target / cat.max) * 5)));
      return `${cat.labels[level - 1]}（レベル${level}/5）`;
    }
    default:
      return "-";
  }
}

// 年齢倍率カーブを逆算し、「これくらいの釣り合い(倍率)になりやすい年齢範囲」を出す。
// レスキュー加点（男性の年収・女性の顔立ち）は加味せず、基準カーブでの目安とする。
function invertAgeMultiplier(genderKey, ratio) {
  const cfg = AGE_MULTIPLIER[genderKey];
  const r = Math.min(0.985, Math.max(0, ratio));
  if (r <= cfg.floor) {
    return "特にこだわらなくても対象になりやすい範囲";
  }
  const inner = (r - cfg.floor) / (1 - cfg.floor);
  const deltaLo = cfg.sigmaLo * Math.sqrt(-2 * Math.log(inner));
  const deltaHi = cfg.sigmaHi * Math.sqrt(-2 * Math.log(inner));
  const lo = Math.max(18, Math.round(cfg.peak - deltaLo));
  const hi = Math.min(70, Math.round(cfg.peak + deltaHi));
  return `${lo}〜${hi}歳`;
}

function suggestPartnerProfile(partnerGenderKey, ownScore) {
  const r = ownScore / 100;
  const ageSuggestion = { label: "年齢", suggestion: invertAgeMultiplier(partnerGenderKey, r) };
  const categorySuggestions = CATEGORIES[partnerGenderKey].map((cat) => ({
    label: cat.label,
    suggestion: invertCategory(cat, r),
  }));
  return [ageSuggestion, ...categorySuggestions];
}

/* ------------------------------- DOM ------------------------------- */

function opposite(gender) {
  return gender === "male" ? "female" : "male";
}

function readForm(prefix) {
  const gender = document.querySelector(`input[name="${prefix}-gender"]:checked`).value;
  return {
    gender,
    values: {
      income: document.getElementById(`${prefix}-income`).value,
      age: document.getElementById(`${prefix}-age`).value,
      height: document.getElementById(`${prefix}-height`).value,
      job: document.getElementById(`${prefix}-job`).value,
      education: document.getElementById(`${prefix}-education`).value,
      marital: document.getElementById(`${prefix}-marital`).value,
      appearance: document.getElementById(`${prefix}-appearance`).value,
      body: document.getElementById(`${prefix}-body`).value,
      personality: document.getElementById(`${prefix}-personality`).value,
    },
  };
}

function populateJobOptions(prefix) {
  const gender = document.querySelector(`input[name="${prefix}-gender"]:checked`).value;
  const select = document.getElementById(`${prefix}-job`);
  const tiers = CATEGORIES[gender].find((cat) => cat.key === "job").tiers;
  const previousValue = select.value;
  select.innerHTML = tiers.map((t) => `<option value="${t.value}">${t.label}</option>`).join("");
  select.value = tiers.some((t) => t.value === previousValue)
    ? previousValue
    : tiers[Math.floor(tiers.length / 2)].value;
}

function toggleEducationRow(prefix) {
  const gender = document.querySelector(`input[name="${prefix}-gender"]:checked`).value;
  const row = document.getElementById(`${prefix}-education-row`);
  row.hidden = gender !== "male";
}

function updateWeightBadges(prefix) {
  const gender = document.querySelector(`input[name="${prefix}-gender"]:checked`).value;
  const weightByKey = {};
  CATEGORIES[gender].forEach((cat) => {
    weightByKey[cat.key] = cat.max;
  });
  const ageBadge = document.getElementById(`${prefix}-age-weight`);
  if (ageBadge) ageBadge.textContent = "倍率のみ（配点なし）";
  ["height", "income", "job", "education", "marital", "appearance", "body", "personality"].forEach((key) => {
    const badge = document.getElementById(`${prefix}-${key}-weight`);
    if (!badge) return;
    if (weightByKey[key] !== undefined) {
      badge.textContent = `配点 ${weightByKey[key]}点`;
    } else {
      badge.textContent = "";
    }
  });
}

function renderBreakdown(container, breakdown) {
  container.innerHTML = "";
  breakdown.forEach((cat) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    const pct = Math.round((cat.points / cat.max) * 100);
    row.innerHTML = `
      <div class="bar-label">
        <span>${cat.label}</span>
        <span class="bar-points">${cat.points.toFixed(1)} / ${cat.max}</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
    `;
    container.appendChild(row);
  });
}

let ownScoreState = null;
let ownGenderState = null;

function updateSelfLiveLabels() {
  document.getElementById("self-appearance-value").textContent =
    APPEARANCE_LABELS[document.getElementById("self-appearance").value - 1];
  document.getElementById("self-body-value").textContent =
    BODY_LABELS[document.getElementById("self-body").value - 1];
  document.getElementById("self-personality-value").textContent =
    PERSONALITY_LABELS[document.getElementById("self-personality").value - 1];
}

function updatePartnerLiveLabels() {
  document.getElementById("partner-appearance-value").textContent =
    APPEARANCE_LABELS[document.getElementById("partner-appearance").value - 1];
  document.getElementById("partner-body-value").textContent =
    BODY_LABELS[document.getElementById("partner-body").value - 1];
  document.getElementById("partner-personality-value").textContent =
    PERSONALITY_LABELS[document.getElementById("partner-personality").value - 1];
}

function renderMultiplierNote(elementId, rawTotal, multiplier, total) {
  const el = document.getElementById(elementId);
  el.textContent =
    `年齢以外の項目の合計 ${rawTotal.toFixed(1)}点 × 年齢倍率 ${multiplier.toFixed(2)} ＝ 最終 ${total.toFixed(1)}点`;
}

function handleSelfSubmit(e) {
  e.preventDefault();
  const { gender, values } = readForm("self");
  const { total, rawTotal, multiplier, breakdown } = scoreProfile(gender, values);
  ownScoreState = total;
  ownGenderState = gender;

  const rank = rankOf(total);
  document.getElementById("self-score-value").textContent = total.toFixed(1);
  document.getElementById("self-rank-label").textContent = rank.label;
  document.getElementById("self-rank-desc").textContent = rank.desc;
  const selfHensachi = toHensachi(total);
  document.getElementById("self-hensachi-note").textContent =
    `偏差値目安 ${selfHensachi.toFixed(1)}（同性の中でおよそ上位 ${toTopPercent(selfHensachi)}%相当）`;
  renderBreakdown(document.getElementById("self-breakdown"), breakdown);
  renderMultiplierNote("self-multiplier-note", rawTotal, multiplier, total);
  document.getElementById("self-result").hidden = false;

  // 相手の性別デフォルトを異性に、パートナーフォームを表示
  const partnerGenderInput = document.querySelector(
    `input[name="partner-gender"][value="${opposite(gender)}"]`
  );
  if (partnerGenderInput) {
    partnerGenderInput.checked = true;
    populateJobOptions("partner");
    toggleEducationRow("partner");
    updateWeightBadges("partner");
  }
  document.getElementById("partner-section").hidden = false;

  renderSuggestion();
  document.getElementById("self-result").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function handlePartnerSubmit(e) {
  e.preventDefault();
  if (ownScoreState === null) return;
  const { gender, values } = readForm("partner");
  const { total, rawTotal, multiplier, breakdown } = scoreProfile(gender, values);

  const rank = rankOf(total);
  document.getElementById("partner-score-value").textContent = total.toFixed(1);
  document.getElementById("partner-rank-label").textContent = rank.label;
  document.getElementById("partner-rank-desc").textContent = rank.desc;
  const partnerHensachi = toHensachi(total);
  document.getElementById("partner-hensachi-note").textContent =
    `偏差値目安 ${partnerHensachi.toFixed(1)}（同性の中でおよそ上位 ${toTopPercent(partnerHensachi)}%相当）`;
  renderBreakdown(document.getElementById("partner-breakdown"), breakdown);
  renderMultiplierNote("partner-multiplier-note", rawTotal, multiplier, total);

  const diff = Math.round((ownScoreState - total) * 10) / 10;
  const v = verdictOf(diff);
  const verdictEl = document.getElementById("verdict-box");
  verdictEl.className = `verdict verdict-${v.tone}`;
  verdictEl.innerHTML = `
    <div class="verdict-diff">あなた: ${ownScoreState.toFixed(1)}点 － 求める条件: ${total.toFixed(1)}点 ＝ 差 ${diff > 0 ? "+" : ""}${diff.toFixed(1)}点</div>
    <div class="verdict-text">${v.text}</div>
  `;

  document.getElementById("partner-result").hidden = false;
  document.getElementById("partner-result").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderSuggestion() {
  if (ownScoreState === null || ownGenderState === null) return;
  const partnerGender = opposite(ownGenderState);
  const suggestions = suggestPartnerProfile(partnerGender, ownScoreState);
  const list = document.getElementById("suggestion-list");
  list.innerHTML = "";
  suggestions.forEach((s) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="suggestion-label">${s.label}</span><span class="suggestion-value">${s.suggestion}</span>`;
    list.appendChild(li);
  });
  document.getElementById("suggestion-score").textContent = ownScoreState.toFixed(1);
  document.getElementById("suggestion-result").hidden = false;
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll('input[name="self-gender"]').forEach((el) =>
    el.addEventListener("change", () => {
      populateJobOptions("self");
      toggleEducationRow("self");
      updateWeightBadges("self");
    })
  );
  document.querySelectorAll('input[name="partner-gender"]').forEach((el) =>
    el.addEventListener("change", () => {
      populateJobOptions("partner");
      toggleEducationRow("partner");
      updateWeightBadges("partner");
    })
  );
  document.getElementById("self-appearance").addEventListener("input", updateSelfLiveLabels);
  document.getElementById("self-body").addEventListener("input", updateSelfLiveLabels);
  document.getElementById("self-personality").addEventListener("input", updateSelfLiveLabels);
  document.getElementById("partner-appearance").addEventListener("input", updatePartnerLiveLabels);
  document.getElementById("partner-body").addEventListener("input", updatePartnerLiveLabels);
  document.getElementById("partner-personality").addEventListener("input", updatePartnerLiveLabels);

  document.getElementById("self-form").addEventListener("submit", handleSelfSubmit);
  document.getElementById("partner-form").addEventListener("submit", handlePartnerSubmit);

  populateJobOptions("self");
  populateJobOptions("partner");
  toggleEducationRow("self");
  toggleEducationRow("partner");
  updateWeightBadges("self");
  updateWeightBadges("partner");
  updateSelfLiveLabels();
  updatePartnerLiveLabels();
});
