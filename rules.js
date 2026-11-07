// 규칙 분류기 — keywords.json 의 낱말과 criteria.json 의 칸 · 긴급도만 쓴다.
// 낱말이나 정답을 여기에 직접 적지 않는다.
(function (global) {
  function found(text, words) {
    return (words || []).filter((w) => text.includes(w));
  }

  function show(words) {
    return words.map((w) => `'${w.trim()}'`).join(", ");
  }

  function classify(maskedText, criteria, keywords) {
    const text = String(maskedText || "");

    // ── 칸: 낱말이 가장 많이 맞은 칸. 겹치거나 하나도 없으면 첫 칸(기본 진료과)
    const kanNames = criteria.칸.map((k) => k.이름);
    const defaultKan = kanNames[0];
    const kanHits = kanNames.map((name) => ({
      name,
      words: found(text, keywords.칸[name] && keywords.칸[name].낱말),
    }));
    const best = Math.max(...kanHits.map((h) => h.words.length));
    const top = kanHits.filter((h) => h.words.length === best);
    let kan, kanReason;
    if (best === 0) {
      kan = defaultKan;
      kanReason = `맞는 낱말이 없어 ${defaultKan}`;
    } else if (top.length > 1) {
      kan = defaultKan;
      kanReason = `${top.map((h) => h.name).join("·")}에 걸쳐 ${defaultKan}`;
    } else {
      kan = top[0].name;
      kanReason = `${show(top[0].words)} → ${kan}`;
    }

    // ── 긴급도: criteria.json 순서대로 [가장 급함, 중간, 가장 덜 급함]
    const [high, mid, low] = criteria.긴급도.map((u) => u.이름);
    const hw = found(text, keywords.긴급도[high] && keywords.긴급도[high].낱말);
    const mw = found(text, keywords.긴급도[mid] && keywords.긴급도[mid].낱말);
    const lw = found(text, keywords.긴급도[low] && keywords.긴급도[low].낱말);
    let urg, urgReason;
    if (hw.length > 0) {
      urg = high;
      urgReason = `${show(hw)} → ${high}`;
    } else if (lw.length > mw.length) {
      urg = low;
      urgReason = `${show(lw)} → ${low}`;
    } else {
      urg = mid;
      urgReason = mw.length ? `${show(mw)} → ${mid}` : `안정 정보가 부족해 ${mid}`;
    }

    return {
      칸: kan,
      긴급도: urg,
      이유: `칸: ${kanReason} / 긴급도: ${urgReason}`,
    };
  }

  global.classifyByRules = classify;
})(typeof window !== "undefined" ? window : globalThis);
