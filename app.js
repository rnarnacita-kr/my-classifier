// 화면: criteria.json · keywords.json 을 읽고, 채점할 때만 data/answer.json 을 읽는다.
// AI 는 서버 함수 /api/classify 로만 부른다. 열쇠는 브라우저에 없고, 브라우저는 가린 문장만 보낸다.
(function () {
  const $ = (id) => document.getElementById(id);
  let criteria = null;
  let keywords = null;
  let aiReport = null;

  // 로컬 화면(127.0.0.1 / localhost)에서만 ?api=https://….vercel.app 으로 배포된 AI 서버를 부를 수 있다.
  // 배포된 화면은 항상 자기 서버(/api/classify)만 부른다 — 다른 주소로 문장이 새지 않게.
  const API_URL = (() => {
    const local = ["127.0.0.1", "localhost"].includes(location.hostname);
    const base = (new URLSearchParams(location.search).get("api") || "").replace(/\/$/, "");
    return local && /^https:\/\/[a-z0-9.-]+$/i.test(base) ? base + "/api/classify" : "/api/classify";
  })();
  const BATCH = 10;

  async function loadJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`${path} 를 읽지 못했습니다 (${res.status})`);
    return res.json();
  }

  // 가린 문장 목록 → {ok, model, prompt_version, results} 또는 {ok:false, error}
  async function callAI(texts) {
    let res;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts }),
      });
    } catch {
      return { ok: false, error: "[연결 실패] AI 서버에 연결하지 못함" };
    }
    // 오류 코드: 우리 서버 함수의 HTTP 상태를 [서버 500] 처럼 앞에 붙인다.
    // Gemini 쪽 코드는 서버가 돌려준 이유 안에 (HTTP 404) 처럼 들어 있다.
    const code = `[서버 ${res.status}]`;
    let data;
    try {
      data = await res.json();
    } catch {
      return { ok: false, error: `${code} AI 서버 응답이 올바르지 않음` };
    }
    if (!data || !data.ok) return { ok: false, error: `${code} ${(data && data.error) || "실패"}`, model: data && data.model };
    if (!Array.isArray(data.results) || data.results.length !== texts.length) {
      return { ok: false, error: "AI 응답 개수가 문장 수와 다름", model: data.model };
    }
    return data;
  }

  function setText(el, text) { el.textContent = text; }

  // ── 탭
  const tabs = [
    { tab: $("tab-classify"), panel: $("panel-classify") },
    { tab: $("tab-score"), panel: $("panel-score") },
  ];
  tabs.forEach(({ tab }) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        const on = t.tab === tab;
        t.tab.setAttribute("aria-selected", String(on));
        t.panel.hidden = !on;
      });
    });
  });

  function definition(list, name) {
    const item = list.find((x) => x.이름 === name);
    return item ? item.정의 : "";
  }

  // ── 분류
  async function runClassify() {
    const raw = $("input").value.trim();
    if (!raw || !criteria || !keywords) return;
    const masked = window.maskText(raw);
    const btn = $("run");
    btn.disabled = true;
    setText($("r-masked"), masked);
    const src = $("r-source");
    src.className = "source";
    setText(src, "AI가 판단하는 중…");
    ["r-kan", "r-kan-def", "r-urg", "r-urg-def", "r-reason"].forEach((id) => setText($(id), ""));
    $("r-er").hidden = true;
    $("result").hidden = false;

    const ai = await callAI([masked]);
    let r;
    if (ai.ok && ai.results[0].ok) {
      r = ai.results[0];
      setText(src, `AI 판정 (${ai.model})`);
    } else {
      r = window.classifyByRules(masked, criteria, keywords);
      const why = ai.ok ? ai.results[0].이유 : ai.error;
      src.className = "source fallback";
      setText(src, `AI 없이 규칙으로 갈랐습니다 (${why})`);
    }

    setText($("r-kan"), r.칸);
    setText($("r-kan-def"), definition(criteria.칸, r.칸));
    setText($("r-urg"), r.긴급도);
    setText($("r-urg-def"), definition(criteria.긴급도, r.긴급도));
    setText($("r-reason"), r.이유);
    const highest = criteria.긴급도[0].이름;
    const er = $("r-er");
    er.hidden = r.긴급도 !== highest;
    if (!er.hidden) setText(er, `긴급도 ${highest}: ${r.칸}보다 응급실 평가가 우선입니다. 응급이 의심되면 119에 신고하세요.`);
    btn.disabled = false;
  }
  $("run").addEventListener("click", runClassify);
  $("input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); runClassify(); }
  });

  // ── 채점 공통
  function stat(value, label) {
    const div = document.createElement("div");
    div.className = "stat";
    const b = document.createElement("b"); b.textContent = value;
    const s = document.createElement("span"); s.textContent = label;
    div.append(b, s);
    return div;
  }
  function pct(n, total) { return `${n}/${total} (${Math.round((n / total) * 100)}%)`; }

  // answers 와 판정 목록(없으면 null)을 견준다. 답을 못 받은 문장(null)은 오답으로 센다.
  function tally(answers, preds) {
    const high = criteria.긴급도[0].이름;
    const s = { 문장수: answers.length, 칸_맞음: 0, 긴급도_맞음: 0, 둘다_맞음: 0, 높음_놓침: 0, 답_못받음: 0 };
    answers.forEach((a, i) => {
      const p = preds[i];
      if (!p) { s.답_못받음++; if (a.긴급도 === high) s.높음_놓침++; return; }
      const k = p.칸 === a.칸, u = p.긴급도 === a.긴급도;
      if (k) s.칸_맞음++;
      if (u) s.긴급도_맞음++;
      if (k && u) s.둘다_맞음++;
      if (a.긴급도 === high && p.긴급도 !== high) s.높음_놓침++;
    });
    return s;
  }

  function busy(on) {
    $("score").disabled = on;
    $("score-ai").disabled = on;
  }

  // ── 규칙으로 채점
  async function runScore() {
    busy(true);
    try {
      const answers = await loadJson("data/answer.json");
      const high = criteria.긴급도[0].이름;
      const preds = answers.map((a) => window.classifyByRules(window.maskText(a.문장), criteria, keywords));
      const s = tally(answers, preds);
      const n = s.문장수;
      $("stats").replaceChildren(
        stat(pct(s.칸_맞음, n), "칸 정확도"),
        stat(pct(s.긴급도_맞음, n), "긴급도 정확도"),
        stat(`${s.둘다_맞음}/${n}`, "둘 다 맞음"),
      );
      const missed = document.createElement("span");
      missed.className = s.높음_놓침 ? "warn" : "";
      missed.textContent = `정답이 ${high}인데 ${high}로 판정하지 못한 문장: ${s.높음_놓침}개`;
      $("cond").replaceChildren(
        document.createTextNode(
          `잰 조건: 규칙만 (keywords.json v${keywords.version}, criteria.json v${criteria.version}) · data/answer.json ${n}문장 · 가린 문장으로 분류 · ${new Date().toLocaleString("ko-KR")}. 규칙은 매번 같은 결과를 냅니다. `
        ),
        missed,
      );

      const wrong = [];
      answers.forEach((a, i) => {
        const r = preds[i];
        const k = r.칸 === a.칸, u = r.긴급도 === a.긴급도;
        if (!(k && u)) wrong.push({ a, r, k, u });
      });
      setText($("wrong-count"), `(${wrong.length}개)`);
      $("wrong").replaceChildren(...wrong.map(({ a, r, k, u }) => {
        const li = document.createElement("li");
        const sEl = document.createElement("span"); sEl.className = "s";
        sEl.textContent = `${a.id} · ${window.maskText(a.문장)}`;
        const cmp = document.createElement("span"); cmp.className = "cmp";
        const kanEl = document.createElement("span");
        kanEl.textContent = `칸 ${a.칸} → ${r.칸}`; if (!k) kanEl.className = "bad";
        const urgEl = document.createElement("span");
        urgEl.textContent = `긴급도 ${a.긴급도} → ${r.긴급도}`; if (!u) urgEl.className = "bad";
        cmp.append(kanEl, document.createTextNode(" · "), urgEl);
        li.append(sEl, cmp);
        return li;
      }));
      $("score-out").hidden = false;
    } catch (err) {
      alert(err.message);
    } finally {
      busy(false);
    }
  }
  $("score").addEventListener("click", runScore);

  // ── AI로 채점: 10개씩 나눠 보낸다
  function renderCompare(rule, ai) {
    const high = criteria.긴급도[0].이름;
    const n = rule.문장수;
    const rows = [
      ["칸 정확도", pct(rule.칸_맞음, n), pct(ai.칸_맞음, n)],
      ["긴급도 정확도", pct(rule.긴급도_맞음, n), pct(ai.긴급도_맞음, n)],
      ["둘 다 맞음", `${rule.둘다_맞음}/${n}`, `${ai.둘다_맞음}/${n}`],
      [`${high}을 놓침`, `${rule.높음_놓침}개`, `${ai.높음_놓침}개`],
      ["답 못 받음", "—", `${ai.답_못받음}개`],
    ];
    const table = $("compare");
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    ["항목", "규칙", "AI"].forEach((t) => { const th = document.createElement("th"); th.textContent = t; hr.append(th); });
    thead.append(hr);
    const tbody = document.createElement("tbody");
    rows.forEach(([label, a, b]) => {
      const tr = document.createElement("tr");
      const th = document.createElement("th"); th.textContent = label;
      const td1 = document.createElement("td"); td1.textContent = a;
      const td2 = document.createElement("td"); td2.textContent = b;
      tr.append(th, td1, td2);
      tbody.append(tr);
    });
    table.replaceChildren(thead, tbody);
  }

  async function runAiScore() {
    busy(true);
    $("ai-out").hidden = true;
    const prog = $("ai-progress");
    prog.hidden = false;
    try {
      const answers = await loadJson("data/answer.json");
      const n = answers.length;
      const masked = answers.map((a) => window.maskText(a.문장));
      const aiPreds = new Array(n).fill(null);
      const aiRaw = new Array(n).fill(null);
      let model = null, promptVersion = null;
      const batchErrors = [];

      setText(prog, `AI 채점 중… 0/${n}`);
      for (let start = 0; start < n; start += BATCH) {
        const end = Math.min(start + BATCH, n);
        const res = await callAI(masked.slice(start, end));
        if (res.model) model = res.model;
        if (res.prompt_version) promptVersion = res.prompt_version;
        if (res.ok) {
          res.results.forEach((r, j) => {
            aiRaw[start + j] = r;
            if (r.ok) aiPreds[start + j] = r;
          });
        } else {
          batchErrors.push({ 범위: `${start + 1}~${end}`, 이유: res.error });
          for (let i = start; i < end; i++) aiRaw[i] = { ok: false, 이유: res.error };
        }
        setText(prog, `AI 채점 중… ${end}/${n}`);
      }

      const rulePreds = masked.map((m) => window.classifyByRules(m, criteria, keywords));
      const ruleS = tally(answers, rulePreds);
      const aiS = tally(answers, aiPreds);
      renderCompare(ruleS, aiS);

      const when = new Date();
      setText($("ai-cond"),
        `잰 조건: AI ${model || "모델 정보 없음"} · 지시문 ${promptVersion || "?"} · criteria.json v${criteria.version} · ` +
        `data/answer.json ${n}문장을 ${BATCH}개씩 ${Math.ceil(n / BATCH)}번 · 가린 문장으로 분류 · ${when.toLocaleString("ko-KR")}. ` +
        `답을 못 받은 문장 ${aiS.답_못받음}개는 오답으로 셌습니다. 규칙은 keywords.json v${keywords.version}. ` +
        `AI는 같은 문장도 매번 다를 수 있어, 한 번 잰 점수입니다.`);
      setText(prog, batchErrors.length
        ? `AI 채점 끝 — ${batchErrors.length}번 실패 (${batchErrors.map((e) => e.범위 + ": " + e.이유).join(" / ")})`
        : `AI 채점 끝 — ${n}/${n}`);

      aiReport = {
        종류: "AI 채점",
        시각: when.toISOString(),
        잰_조건: {
          AI_모델: model,
          지시문_버전: promptVersion,
          AI_서버: API_URL,
          criteria_version: criteria.version,
          keywords_version: keywords.version,
          문장수: n,
          묶음_크기: BATCH,
          답_못받은_문장: "오답으로 셈",
        },
        요약: { 규칙: ruleS, AI: aiS },
        실패한_묶음: batchErrors,
        문장별: answers.map((a, i) => ({
          id: a.id,
          가린_문장: masked[i],
          정답: { 칸: a.칸, 긴급도: a.긴급도 },
          규칙: { 칸: rulePreds[i].칸, 긴급도: rulePreds[i].긴급도, 이유: rulePreds[i].이유 },
          AI: aiRaw[i],
        })),
      };
      $("ai-out").hidden = false;
    } catch (err) {
      setText(prog, `AI 채점 실패 — ${err.message}`);
    } finally {
      busy(false);
    }
  }
  $("score-ai").addEventListener("click", runAiScore);

  $("ai-download").addEventListener("click", () => {
    if (!aiReport) return;
    const blob = new Blob([JSON.stringify(aiReport, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ai_채점결과.json";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // ── 시작
  (async () => {
    try {
      [criteria, keywords] = await Promise.all([loadJson("criteria.json"), loadJson("keywords.json")]);
      let note = `${criteria.owner} · 기준 v${criteria.version} · 낱말 v${keywords.version}`;
      if (API_URL !== "/api/classify") note += ` · AI 서버: ${API_URL}`;
      setText($("owner"), note);
    } catch (err) {
      setText($("owner"), `${err.message} — 파일을 직접 열지 말고 서버로 띄워 주세요.`);
      $("run").disabled = true;
      $("score").disabled = true;
      $("score-ai").disabled = true;
    }
  })();
})();
