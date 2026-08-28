/* 무대(stage) — 발표용 화면의 배선. `stage.html`이 껍데기고 여기가 값이다.
 *
 * 콘솔(index.html)과 **같은 WS 하나**를 본다. 서버는 한 줄도 안 고쳤다 —
 * `console.py`가 static을 "/"에 걸어 두었으므로 이 파일 둘을 놓기만 하면 뜬다.
 *
 * ── 콘솔이 보내는 것 세 가지, 박자가 다르다 ──────────────────────────────
 *   1. 2Hz 병합 스냅샷  `{t, up, hub, motor, drowsy, health, local}`   (type 없음)
 *   2. 책 카메라       `{type:"preview_meta", from, boxes, zone, person, hands}`
 *                      **바로 다음** 바이너리 JPEG — 짝은 순서가 만든다
 *   3. 얼굴 카메라     `{type:"drowsy", drowsy:{… jpeg가 base64로 들어 있다}}` 10Hz
 * 셋을 하나로 정규화하지 않는다 (콘솔의 merge()가 일부러 그렇게 둔 것과 같은 이유).
 * 여기서 하는 일은 그 셋을 **화면이 그릴 수 있는 모양**으로 옮기는 것까지다.
 *
 * ── 이 파일이 지키는 것 ──────────────────────────────────────────────────
 * **없는 값을 만들지 않는다.** 원안(.orca/drops/lumo-dashboard_2.html)에는 mAP50·
 * 판정 정확도·집중도 점수·CPU/GPU/메모리가 있었는데 이 저장소에 그것을 만드는
 * 곳이 **하나도 없다** (README: "라벨이 없어 mAP를 못 잰다"). 그 자리는 같은 크기의
 * 실측값으로 바꿨고, 원안에 있던 데모 시뮬레이터는 지웠다 — 하드웨어가 꺼져 있을 때
 * 그럴듯한 숫자가 도는 것이 발표 화면에서 제일 위험한 물건이다.
 *
 * **모르면 「—」다.** `0`도 빈칸도 아니다. 특히 `rtt_ms == 0`은 0ms가 아니라
 * "아직 못 쟀다"이고(「건드리면 터지는 것」 5번), `volt == 0`은 0V가 아니라 무응답이다.
 *
 * **판정을 브라우저가 다시 만들지 않는다.** 졸음 상태는 drowsiness의 `state`를,
 * 장치 상태는 콘솔의 `health` 행을 그대로 쓴다. 같은 사실을 두 곳이 다르게 말하면
 * 발표 자리에서 어느 쪽을 믿을지 모르게 된다.
 * ──────────────────────────────────────────────────────────────────────── */

/* ══ 순수 함수 — tests/test_stage.py가 node로 직접 부른다 ══════════════════ */

export const DASH = '—';

/** 얼굴을 이만큼 연속으로 못 찾으면 「자리 비움」. **`console/health.py`의
 *  `MISS_WARN_FRAMES`와 같은 값이어야 한다** — 같은 사실을 두 화면이 다른
 *  프레임 수로 말하면 안 된다. 10fps 기준 3초. */
export const MISS_AWAY_FRAMES = 30;

/* ══ 집중 단계 사다리 (2026-08-27 사용자 스펙) ═══════════════════════════
 *
 * 원래 4단계(몰입·안정·산만·졸림)를 7칸으로 세분화했다. **트리거도 조명도 실물에서
 * 돈다** — 판정은 `drowsiness/states.py`, 색·밝기·페이드·파형은 램프 보드의
 * `levelTick()`이 만든다. 노트북은 `GET /state?s=..&band=..`로 **숫자 둘만** 보낸다
 * (S5의 1Hz 사인 파형을 네트워크로 밀면 지터가 눈에 보여서 그렇게 갈랐다).
 * 그래서 이 표의 조명 열은 **스펙이자 지금 도는 동작**이고, 실제로 나가는 색은
 * 보드가 보고하는 `out`으로 카드 아래에 따로 찍는다.
 *
 * ── 지금 평가할 수 없는 조건 ──────────────────────────────────────────
 * 스펙에 있지만 이 저장소에 신호가 없는 것들이다. **조용히 빼지 않고** 화면에
 * 「평가 안 함」으로 적는다 — 안 적으면 조건이 걸린 줄 알고 기다리게 된다.
 *   · 휴대폰 든 채 3초  → 손 좌표가 있어야 하는데 GPU 서버가 `--hands` 없이 돈다
 *                        (contact가 항상 0). 책상캠 쪽 데이터라 얼굴 탭에도 없다
 *   · 감김 속도 느림    → 눈꺼풀 속도를 아무도 안 잰다
 *   · 고개 급락        → head_pitch는 있으나 "급락"의 기준이 스펙에 없다
 *
 * ── 하품 기준이 스펙과 다르다 ─────────────────────────────────────────
 * 스펙은 "MAR > 0.5 × **1초**"인데 지금 `config.toml`은 `yawn_frames=30` =
 * **3초**다 (오늘 바뀐 값). 여기서 1초를 박아 두면 화면과 판정기가 갈리므로
 * **판정기가 보내온 `yawn_sec`을 그대로 쓴다.** 1초로 되돌리려면 config를 고친다.
 * (MAR와 jawOpen은 이름만 다르고 같은 것을 잰다 — MediaPipe blendshape) */
export const FOCUS = {
  yawnWindowS: 600,      // 하품 집계 창 10분
  s2HoldS: 300,          // S2 발동 후 5분 유지
  s2RefractoryS: 600,    // S2 해제 후 10분 재발동 금지
  s2plusHoldS: 600,      // S2+ 발동 후 10분 유지
  gazeYawDeg: 35,        // 고개 이탈 각도
  gazeHoldS: 5,          // 그 각도가 이만큼 지속돼야 1회
  gazeWindowS: 120,      // 2분 창
  gazeCount: 3,          // 그 안에 3회
  perclosHigh: 0.15,     // S4 진입 (판정기의 perclos_threshold와 같은 값이어야 한다)
  perclosLow: 0.10,      // 해제 문턱
  s4ClearS: 300,         // PERCLOS<10%가 5분 유지되면 S4 해제
  msSoloS: 2.0,          // 감김 ≥2초 단독으로 마이크로슬립 후보
  msAssistS: 1.0,        // 감김 ≥1초 + 보조 조건
  s5HoldS: 3.0,          // S5는 3초 뒤 S4로 안착
  s5CooldownS: 60,       // 재발동 쿨다운
  s5WindowS: 1800,       // 30분 창
  s5Count: 3,            // 그 안에 3회면 S6
  s6ClearS: 600,         // PERCLOS<10% 10분
  s6AwayS: 900,          // 또는 15분 이상 이탈
};

/** 사다리 한 칸씩. 화면이 이 표를 그대로 그린다 — 코드와 화면이 갈릴 자리를 없앤다. */
export const LADDER = [
  { id: 'S1', name: '기준', color: '#5e9c7a',
    trigger: '아래 조건이 하나도 안 걸린 상태',
    day: 'L0 기준값 (band 기준색)', night: 'L0 기준값' },
  // 원래 스펙은 «밝기 ×1.25 · 2초 페이드»였는데 **사람이 바뀐 것을 바로 못 알아봤다**
  // — 시연에서 확인에 몇 초 걸리면 그 단계는 없는 것과 같다. 3회 깜박임으로 바꿨다
  // (사용자 결정 2026-08-27). 1.5Hz는 광과민성 위험대역 3Hz 아래를 지킨 값이다.
  { id: 'S2', name: '예열', color: '#a99a63',
    trigger: '10분 내 하품 1회',
    day: '3회 깜박임 (1.5Hz · 100%↔50%) → 255,250,240 · 밝기 ×1.25로 안착',
    night: '3회 깜박임 → 색 그대로 · 밝기 ×1.25 (상한 128)',
    clear: '5분 후 L0 · 10분 내 재발동 금지' },
  { id: 'S2+', name: '예열 연장', color: '#c99a5b',
    trigger: '10분 내 하품 2회 이상',
    day: 'S2와 동일 (3회 깜박임 후 안착)', night: 'S2와 동일', clear: '10분 후 L0' },
  { id: 'S3', name: '산만', color: '#d98b4a',
    trigger: `PERCLOS < 15% 이면서 2분 내 고개 이탈(yaw > 35° × 5초) 3회`,
    partial: '또는 휴대폰 든 채 3초 — 손 좌표가 없어 평가 안 함',
    day: '변화 없음 — 램프는 마지막 책·노트북 위에 머묾', night: '동일',
    clear: '2분 무발생 시 S1' },
  { id: 'S4', name: '각성 유도', color: '#5a88b5',
    trigger: 'PERCLOS > 15%',
    day: '210,225,255 (~6500K) · 밝기 255 (어두운 방 180) · 3초 페이드',
    night: '255,214,170 웜 · 밝기 128 · 3초 페이드 (청색 없음, 알림 역할)',
    clear: 'PERCLOS < 10% 5분 유지 → 60초 페이드로 L0' },
  { id: 'S5', name: '개입', color: '#7a6bc4',
    trigger: '감김 ≥ 2초 단독, 또는 감김 ≥ 1초 + 직전 60초 PERCLOS > 10%',
    partial: '보조 조건 중 「감김 속도 느림」·「고개 급락」은 신호가 없어 평가 안 함',
    day: '170,200,255 · 밝기 100↔60% 사인파 1Hz × 3회 → S4 안착 · 팬 ±10° 1왕복',
    night: 'S4 야간색 유지 · 밝기 128↔77 사인파 × 3회 · 팬 동일',
    clear: '3초 후 자동 S4 · 재발동 쿨다운 60초' },
  { id: 'S6', name: '휴식 권유', color: '#c96a6a',
    trigger: '30분 내 S5 3회',
    day: '255,179,71 앰버 · 밝기는 S4 값 유지 · 60초 페이드인',
    night: '동일 (밝기 128)',
    clear: '사용자 확인 / PERCLOS < 10% 10분 / 15분 이상 이탈' },
];

const LADDER_BY_ID = Object.fromEntries(LADDER.map((r) => [r.id, r]));
export const stageColor = (id) => (LADDER_BY_ID[id] || {}).color || '#a4a29a';

/** **상류가 보낸 판정이 정본이다.** `drowsiness/states.py`가 A0·S1~S6 상태기계를
 *  들고 있고 `main.py`가 `msg["state"]`로 실어 보낸다 — 그게 오면 화면은 그걸 그린다.
 *
 *  아래 `focusStep`은 **그게 안 올 때만** 쓰는 대체 경로다. 같은 사실을 두 곳이
 *  다르게 말하면 발표 자리에서 어느 쪽을 믿을지 모르게 되므로, 어느 쪽을 그리고
 *  있는지 화면에 항상 적는다.
 *
 *  상류에는 `S2+`가 없다(하품 횟수를 `yawns`로 따로 낸다). 사다리 표시를 위해
 *  2회 이상이면 S2+ 칸으로 옮긴다 — 판정을 바꾸는 게 아니라 같은 상태를 더 자세히
 *  보여 주는 것이다. `A0`(부재)는 이 화면의 `AWAY`와 같은 뜻이다. */
export function stageFrom(d) {
  const up = d && d.state;
  if (!up || !up.state) return null;
  const id = up.state === 'A0' ? 'AWAY'
    : up.state === 'S2' && (up.yawns ?? 0) >= 2 ? 'S2+'
    : up.state;
  return { stage: id, why: up.why || '', src: 'up' };
}

/** 화면이 모으는 사건 창. **`drowsiness`가 창 집계를 안 보내므로 화면이 센다** —
 *  그래서 새로고침하면 0에서 다시 시작하고, 카드에도 그렇게 적는다. 이 판정이
 *  오래 살아야 하면 있을 곳은 `drowsiness/drowsy.py`지 브라우저가 아니다. */
export function newFocus() {
  return { yawns: [], gazes: [], s5s: [], gazeSince: null, lastYawn: null,
           stage: 'S1', s2At: null, s2ClearAt: null, s2plusAt: null,
           s4At: null, s4LowSince: null, s5At: null, s6At: null, s6LowSince: null,
           t: 0 };
}

const within = (list, now, win) => list.filter((t) => now - t <= win).length;

/** 사건 창 + 래치를 한 틱 굴린다. **순수 함수다** — `st`를 안 고치고 새로 만든다.
 *  `d`는 drowsiness 메시지 원문, 반환은 `{stage, why, st}`.
 *
 *  단계는 **위에서부터 본다**(S6 → S1). 사다리는 심각도 순서이고, 아래 칸이
 *  걸려 있다고 위 칸을 가릴 수는 없기 때문이다. */
export function focusStep(prev, d) {
  const st = { ...prev, yawns: [...prev.yawns], gazes: [...prev.gazes], s5s: [...prev.s5s] };
  if (!d) return { stage: null, why: 'drowsiness(:8100)가 안 붙었다', st };

  const z = d.drowsy || {}, sig = d.signals || {};
  const now = num(d.elapsed) ?? st.t;
  st.t = now;
  const per = num(z.perclos);
  const miss = d.miss_streak ?? 0;
  const closed = num(z.closed_run_sec) ?? 0;

  /* ── 사건 수집 ── */
  // 하품: 판정기의 누적 카운트가 오르는 순간이 곧 "1회 완료"다. 화면이 jawOpen을
  // 다시 세지 않는다 — 두 곳이 다른 답을 내면 안 된다.
  const yc = (d.counts || {}).yawn ?? 0;
  if (st.lastYawn !== null && yc > st.lastYawn) st.yawns.push(now);
  st.lastYawn = yc;

  // 고개 이탈: yaw가 문턱을 **넘긴 채 gazeHoldS초 지속**되면 1회. 넘나드는 것마다
  // 세면 고개를 한 번 돌릴 때 여러 번 세어진다.
  const yaw = Math.abs(num(sig.head_yaw) ?? 0);
  const seeing = z.blind !== 'no_face' && miss === 0;
  if (seeing && yaw > FOCUS.gazeYawDeg) {
    if (st.gazeSince === null) st.gazeSince = now;
    else if (now - st.gazeSince >= FOCUS.gazeHoldS) { st.gazes.push(now); st.gazeSince = null; }
  } else st.gazeSince = null;

  // 창 밖으로 나간 사건은 버린다 (메모리 + 집계가 곧 창의 정의다)
  st.yawns = st.yawns.filter((t) => now - t <= FOCUS.yawnWindowS);
  st.gazes = st.gazes.filter((t) => now - t <= FOCUS.gazeWindowS);
  st.s5s = st.s5s.filter((t) => now - t <= FOCUS.s5WindowS);

  /* ── 판정 불가가 먼저다 ── */
  if (d.warming) return done(null, '워밍업 중 — 노출이 잡힐 때까지 안 센다');
  if (z.state === 'no_cal') return done(null, '캘리브레이션이 없다 — 판정 입력이 없다');
  if (z.state === 'warming') return done(null, `표본 모으는 중 (창 ${z.window_sec ?? DASH}초)`);
  if (miss >= MISS_AWAY_FRAMES) {
    return done('AWAY', `자리 비움 — ${miss}프레임 연속 얼굴 미검출`);
  }

  /* ── 마이크로슬립 후보 (S5) ── */
  const msSolo = closed >= FOCUS.msSoloS;
  const msAssist = closed >= FOCUS.msAssistS && per !== null && per > FOCUS.perclosLow;
  const coolOk = st.s5At === null || now - st.s5At >= FOCUS.s5CooldownS;
  if ((msSolo || msAssist) && coolOk) { st.s5s.push(now); st.s5At = now; }

  /* ── S6: 30분 내 S5 3회 ── */
  if (within(st.s5s, now, FOCUS.s5WindowS) >= FOCUS.s5Count) {
    if (st.s6At === null) st.s6At = now;
  }
  if (st.s6At !== null) {
    // 해제: PERCLOS<10%가 10분 유지되거나 15분 이상 이탈. 사용자 확인 경로는 없다.
    if (per !== null && per < FOCUS.perclosLow) {
      if (st.s6LowSince === null) st.s6LowSince = now;
    } else st.s6LowSince = null;
    const cleared = st.s6LowSince !== null && now - st.s6LowSince >= FOCUS.s6ClearS;
    if (cleared) { st.s6At = null; st.s6LowSince = null; st.s5s = []; }
    else return done('S6', `30분 내 S5 ${within(st.s5s, now, FOCUS.s5WindowS)}회 — 휴식 권유`);
  }

  /* ── S5: 발동 후 3초 유지, 그다음 S4로 안착 ── */
  if (st.s5At !== null && now - st.s5At < FOCUS.s5HoldS) {
    return done('S5', msSolo ? `눈 감김 ${closed.toFixed(1)}초 ≥ ${FOCUS.msSoloS}초 (단독)`
      : `눈 감김 ${closed.toFixed(1)}초 + 직전 60초 PERCLOS ${((per || 0) * 100).toFixed(0)}% > 10%`);
  }

  /* ── S4: PERCLOS > 15% ── */
  const hi = num(z.perclos_threshold) ?? FOCUS.perclosHigh;
  if (per !== null && per > hi) { st.s4At = st.s4At ?? now; st.s4LowSince = null; }
  if (st.s4At !== null) {
    if (per !== null && per < FOCUS.perclosLow) {
      if (st.s4LowSince === null) st.s4LowSince = now;
    } else st.s4LowSince = null;
    if (st.s4LowSince !== null && now - st.s4LowSince >= FOCUS.s4ClearS) {
      st.s4At = null; st.s4LowSince = null;
    } else {
      return done('S4', `PERCLOS ${((per || 0) * 100).toFixed(0)}% > 임계 ${(hi * 100).toFixed(0)}%`);
    }
  }

  /* ── S3: PERCLOS 낮은데 고개가 자꾸 벗어난다 ── */
  const gaze = within(st.gazes, now, FOCUS.gazeWindowS);
  if (gaze >= FOCUS.gazeCount && per !== null && per < hi) {
    return done('S3', `2분 내 고개 이탈 ${gaze}회 (yaw > ${FOCUS.gazeYawDeg}° × ${FOCUS.gazeHoldS}초)`);
  }

  /* ── S2 / S2+: 하품 창 ── */
  const yawn = within(st.yawns, now, FOCUS.yawnWindowS);
  if (yawn >= 2) {
    st.s2plusAt = st.s2plusAt ?? now;
    if (now - st.s2plusAt < FOCUS.s2plusHoldS) {
      return done('S2+', `10분 내 하품 ${yawn}회 — 예열 연장`);
    }
    st.s2plusAt = null;
  } else st.s2plusAt = null;

  if (yawn >= 1) {
    const refractory = st.s2ClearAt !== null && now - st.s2ClearAt < FOCUS.s2RefractoryS;
    if (st.s2At === null && !refractory) st.s2At = now;
    if (st.s2At !== null) {
      if (now - st.s2At < FOCUS.s2HoldS) {
        return done('S2', `10분 내 하품 ${yawn}회 (기준 jawOpen > ${f(z.yawn_jaw_open, 2)} `
          + `× ${f(z.yawn_sec, 1)}초)`);
      }
      st.s2ClearAt = now; st.s2At = null;      // 5분 다 썼다 → 10분 재발동 금지 시작
    }
  }

  return done('S1', '걸린 조건이 없다 — 기준 상태');

  function done(stage, why) {
    st.stage = stage;
    return { stage, why, st };
  }
}

/* 상태 슬러그 → 사람이 읽는 말. health.py의 STATE_KO와 같은 표다. */
const STATE_KO = {
  awake: '깨어 있음', drowsy: '졸음', no_cal: '캘리브레이션 없음',
  no_face: '얼굴 없음', turned: '고개 돌림', warming: '표본 모으는 중',
};

export const CLS_KO = { person: '사람', laptop: '노트북', book: '책', 'cell phone': '휴대폰' };
export const CLS_ICON = { person: '🧑', laptop: '💻', book: '📖', 'cell phone': '📱' };

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
export const f = (v, d = 3) => (num(v) === null ? DASH : Number(v).toFixed(d));
const pad = (n) => String(n).padStart(2, '0');
export const hms = (s) => (num(s) === null ? '--:--:--'
  : `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s % 3600 / 60))}:${pad(Math.floor(s % 60))}`);

/** 밀리초. **0은 기본적으로 "아직 못 쟀다"** — 「건드리면 터지는 것」 5번. */
export function ms(v, zeroIsUnknown = true) {
  const n = num(v);
  if (n === null || (n === 0 && zeroIsUnknown)) return DASH;
  return `${Math.round(n)} ms`;
}

/** hub의 `tracking`에서 손잡이 값만 꺼낸다.
 *  **모양이 `{live, knobs, fixed}`다** — 평평한 dict가 아니다(`local_track.knobs()`).
 *  그대로 `t.head_anchor`로 읽으면 항상 undefined라 경고가 **영원히 조용히** 안 뜬다.
 *  상류 모양을 아는 곳을 여기 한 군데로 둔다. */
export function knobsOf(tracking) {
  return (tracking && tracking.knobs) || {};
}

/** 조준 오차 −0.5(왼쪽)~+0.5(오른쪽). `console.py`의 `aim_err_xy`와 같은 식이다.
 *  좌표는 이미 정규화돼 있으므로 픽셀 나누기를 다시 하지 않는다.
 *  **pick이 없으면 null이다** — 0.0은 "이미 정중앙"이라는 적극적인 거짓말이다. */
export function aimErr(meta) {
  for (const b of (meta && meta.boxes) || []) {
    if (b.pick) {
      const x = b.x + b.w / 2 - 0.5;
      const y = (b.y == null || b.h == null) ? null : b.y + b.h / 2 - 0.5;
      return { x: +x.toFixed(4), y: y == null ? null : +y.toFixed(4) };
    }
  }
  return null;
}

/** 미리보기 메타에서 이 프레임의 보드를 고른다.
 *  **`preview_from`을 안 쓴다** — 그건 2Hz 스냅샷에 실려 사진보다 늦고, 카메라가
 *  둘이면 이미 다른 보드를 가리키고 있다. 그걸로 고르면 A사진에 B숫자가 붙는다. */
export function pickBoard(hub, meta) {
  const boards = (hub && hub.boards) || [];
  const from = meta && meta.from;
  return boards.find((b) => b.id === from) || boards.find((b) => b.online) || boards[0] || null;
}

export const SEGS = ['encode', 'wifi', 'net', 'server'];

/** 지연 리본 — **폭이 곧 구간 비율이다.** 숫자 넷을 나란히 읽어서는 "net이 나머지
 *  전부보다 크다"가 안 보인다. rtt를 못 쟀으면 분해가 성립하지 않으므로 sum 0이다
 *  (`wifi_ms`는 그때 **정확히 0**으로 오는데, 그 0을 그리면 재지도 않은 구간이
 *  화면에 생긴다). */
export function ribbon(b) {
  const val = {};
  let sum = 0;
  for (const k of SEGS) {
    const n = num(b && b[k + '_ms']);
    val[k] = n;
    if (n !== null && b && b.rtt_ms) sum += n;
  }
  if (!(b && b.rtt_ms)) val.wifi = null;
  const pct = {};
  for (const k of SEGS) pct[k] = sum > 0 ? ((val[k] || 0) / sum) * 100 : 0;
  return { sum, val, pct };
}

/** 랜드마크 478점 → 얼굴 상자. **drowsiness는 상자를 안 보낸다** — 점만 온다.
 *  그래서 점의 최소·최대로 만든다. 지어낸 값이 아니라 "랜드마크가 차지한 범위"이고,
 *  화면의 라벨도 그렇게 쓴다. 점이 없으면 null이다. */
export function faceBox(points) {
  if (!points || !points.length) return null;
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const [x, y] of points) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x: +x0.toFixed(4), y: +y0.toFixed(4),
           w: +(x1 - x0).toFixed(4), h: +(y1 - y0).toFixed(4) };
}

/** 얼굴 상태 셋 — **하품 · 눈 감음 · 자리 이탈.** 원안의 「핵심 지표」(속도·정확도)
 *  자리에 들어간다: 발표에서 보여줄 것은 파이프 성능이 아니라 *무엇을 인식하고
 *  있는가*다. 속도·검출률은 검증용 「파이프」에 그대로 있다.
 *
 *  각 줄이 답하는 것은 "사람이 졸린가"가 아니라 **"이 기능이 지금 발화 중인가"**다
 *  (health.py의 `_judge`와 같은 규율 — 졸림은 고장이 아니라 정상 동작이다). 그래서:
 *      ok   감시 중(정상)        warn 감지됨
 *      busy 문턱으로 차오르는 중  na   판정 불가
 *  `ratio`는 **문턱까지 얼마나 찼는지**다. 숫자만 있으면 "0.3초"가 큰지 작은지를
 *  청중이 모른다 — 기준을 옆에 붙여야 그 줄이 뜻을 갖는다.
 *
 *  **관측이 안 되는 동안은 회색이다.** 얼굴이 없으면 입도 눈도 못 보므로 하품·눈
 *  감음은 "없음"이 아니라 "판정 불가"다. 그때 초록을 그리면 카메라가 아무것도 안
 *  보는데 화면은 "정상"이라고 말한다. */
export function faceStates(d) {
  const mk = (k, name, s, word, why, o = {}) =>
    ({ k, name, s, word, why: why || '', on: !!o.on,
       ratio: o.ratio == null ? null : Math.max(0, Math.min(1, o.ratio)),
       meter: o.meter || DASH, count: o.count == null ? null : o.count });
  const DEFS = [['yawn', '하품'], ['closed', '눈 감음'], ['away', '자리 이탈']];
  if (!d) {
    return DEFS.map(([k, n]) => mk(k, n, 'na', '모름',
      'drowsiness(:8100)가 안 붙었다 — 얼굴은 이 경로로만 온다'));
  }
  const z = d.drowsy || {}, sig = d.signals || {}, cnt = d.counts || {};
  const fps = d.fps || 10;
  const blind = z.blind;                       // 'no_face' | 'yaw' | null
  // 판정기 전체가 못 도는 상태. 눈·입 두 줄이 같이 눕는다.
  const dead = d.warming ? '워밍업 중 — 노출이 잡힐 때까지 안 센다'
    : z.state === 'no_cal' ? '캘리브레이션이 없다 — 판정 입력이 없다'
    : z.state === 'warming' ? `표본 모으는 중 (창 ${z.window_sec ?? DASH}초)` : '';
  const blindWhy = blind === 'yaw'
    ? `고개 ${f(sig.head_yaw, 1)}° — 눈이 비스듬해 EAR을 못 믿는다`
    : '얼굴이 안 잡혀 눈·입을 못 본다';

  /* ── 하품 ── */
  const yr = num(z.yawn_run_sec) ?? 0, yn = num(z.yawn_sec) ?? 0;
  const c1 = dead ? mk('yawn', '하품', 'na', '판정 불가', dead)
    : blind ? mk('yawn', '하품', 'na', '판정 불가', blindWhy)
    : z.yawning
      ? mk('yawn', '하품', 'warn', '감지됨', `입 벌림 ${f(yr, 1)}초 ≥ 기준 ${f(yn, 1)}초`, { on: true })
      : yr > 0
        ? mk('yawn', '하품', 'busy', '입 벌림',
             `jawOpen ${f(sig.jaw_open)} > ${f(z.yawn_jaw_open)} · ${f(yr, 1)}초째`, { on: true })
        : mk('yawn', '하품', 'ok', '없음',
             `jawOpen ${f(sig.jaw_open)} · 기준 ${f(z.yawn_jaw_open)}`);
  c1.ratio = yn ? Math.min(1, yr / yn) : null;
  c1.meter = `${f(yr, 1)} / ${f(yn, 1)}초`;
  c1.count = cnt.yawn ?? 0;

  /* ── 눈 감음 ── */
  const run = num(z.closed_run_sec) ?? 0, need = num(z.microsleep_sec) ?? 0;
  const c2 = dead ? mk('closed', '눈 감음', 'na', '판정 불가', dead)
    : blind ? mk('closed', '눈 감음', 'na', '판정 불가', blindWhy)
    : (need > 0 && run >= need)
      ? mk('closed', '눈 감음', 'warn', '마이크로슬립',
           `눈 감김 ${f(run, 1)}초 ≥ 기준 ${f(need, 1)}초`, { on: true })
      : z.eyes_closed
        ? mk('closed', '눈 감음', 'busy', '감김',
             `눈 감김 ${f(run, 1)}초 · 마이크로슬립 기준 ${f(need, 1)}초`, { on: true })
        : mk('closed', '눈 감음', 'ok', '뜸',
             `eyeBlink ${f(sig.eye_blink)} · EAR ${f(sig.ear_mean)}`);
  c2.ratio = need ? Math.min(1, run / need) : null;
  c2.meter = `${f(run, 1)} / ${f(need, 1)}초`;
  c2.count = cnt.microsleep ?? 0;

  /* ── 자리 이탈. **한 프레임 놓친 것과 자리를 비운 것을 가른다** — 탐지는 원래
       한두 프레임씩 끊기고(고개를 숙이거나 팔로 가리면), 그때마다 이 줄이 켜지면
       카드가 발작한다. 발작하는 카드는 아무도 안 믿는다. ── */
  const miss = d.miss_streak ?? 0;
  const c3 = d.warming
    ? mk('away', '자리 이탈', 'na', '판정 불가', '워밍업 중이라 검출률을 안 센다')
    : miss >= MISS_AWAY_FRAMES
      ? mk('away', '자리 이탈', 'warn', '자리 비움',
           `${miss}프레임(${(miss / fps).toFixed(1)}초) 연속 얼굴 미검출`, { on: true })
      : blind === 'no_face'
        ? mk('away', '자리 이탈', 'busy', '얼굴 놓침',
             `이번 프레임에 얼굴이 없다 — ${miss}프레임째. `
             + `${MISS_AWAY_FRAMES}프레임을 넘기면 자리 비움으로 본다`, { on: true })
        : blind === 'yaw'
          ? mk('away', '자리 이탈', 'busy', '고개 돌림',
               `고개 ${f(sig.head_yaw, 1)}° — 자리에는 있다. 판정에서만 뺀다`, { on: true })
          : mk('away', '자리 이탈', 'ok', '착석',
               `검출률 ${d.rate == null ? DASH : (d.rate * 100).toFixed(0) + '%'} `
               + `(${d.detected ?? 0}/${d.counted ?? 0})`);
  c3.ratio = Math.min(1, miss / MISS_AWAY_FRAMES);
  c3.meter = `미검출 ${miss} / ${MISS_AWAY_FRAMES}프레임`;

  return [c1, c2, c3];
}


/** health 행 하나를 키로 찾는다. 없으면 undefined — 화면이 「모름」으로 그린다. */
export function healthRow(health, k) {
  return (health || []).find((r) => r.k === k);
}

/* ══ 여기부터 브라우저 전용 ═══════════════════════════════════════════════
   node가 위의 순수 함수를 import할 수 있어야 하므로 DOM은 최상위에서 안 만진다. */

const STALE_MS = 3000;      // 이보다 오래 프레임이 없으면 마지막 사진은 생중계가 아니다
const TL_N = 240;           // 단계 타임라인 표본 수

const $ = (id) => document.getElementById(id);

const S = {
  view: 'desk',
  snap: null,               // 2Hz 병합 스냅샷
  drowsy: null,             // 10Hz 얼굴 메시지 원문 (그림과 판정의 정본)
  meta: null,               // 마지막 preview_meta (책상 상자·구역의 정본)
  pendingMeta: null,
  deskAt: 0, faceAt: 0,     // 마지막 프레임 도착 시각
  deskUrl: null,            // objectURL — 안 놓으면 탭 메모리가 샌다
  tlHist: [],               // 단계 추이 (화면이 모은 것)
  focus: null,              // focusStep의 래치 + 사건 창 (newFocus())
  stage: null, stageWhy: '', stageSrc: 'browser',   // 지금 그리는 단계와 그 출처
  lastStage: null, lastState: null, lastCounts: {},
  hubLogN: 0, motorLogN: 0,
  ws: null,
};

/* ───────── 터미널 ───────── */
class Term {
  constructor(root) {
    this.root = root; this.pre = root.querySelector('pre'); this.paused = false;
    root.querySelectorAll('[data-lv]').forEach((b) => b.onclick = () => {
      root.querySelectorAll('[data-lv]').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      root.className = 'term' + (b.dataset.lv ? ' f-' + b.dataset.lv : '');
    });
    root.querySelector('[data-pause]').onclick = (e) => {
      this.paused = !this.paused;
      e.target.textContent = this.paused ? '재개' : '일시정지';
      e.target.classList.toggle('on', this.paused);
    };
    root.querySelector('[data-clear]').onclick = () => { this.pre.innerHTML = ''; };
  }
  /** `t`를 주면 그 시각을 쓴다 — hub 로그는 **hub가 찍은 시각**이지 지금이 아니다. */
  log(lv, m, t) {
    if (this.paused) return;
    const d = document.createElement('div');
    d.className = 'ln ' + lv;
    d.append(el('span', 't', t || clockStr()), el('span', 'k ' + lv, lv), el('span', 'm', m));
    this.pre.appendChild(d);
    while (this.pre.children.length > 300) this.pre.firstChild.remove();
    this.pre.scrollTop = this.pre.scrollHeight;
  }
  togglePause() { this.root.querySelector('[data-pause]').click(); }
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;      // textContent — 로그는 상류가 만든 문자열이다
  return n;
}

/** 조건부 자식을 붙인다. **네이티브 `append(null)`은 "null"을 글자로 찍는다** —
 *  `cond ? node : null`을 그대로 넘기면 화면에 «기준 null»이 뜬다 (2026-08-27 실측).
 *  `ui.mjs`의 `add()`가 같은 이유로 같은 일을 한다. */
function add(parent, ...kids) {
  for (const k of kids) if (k != null && k !== false) parent.append(k);
  return parent;
}

function clockStr() {
  const t = new Date();
  return `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
}

let termDesk, termFace;

/** dl 채우기. rows = [[key, value, cls?] | '—'(구분선)]. null 행은 건너뛴다. */
function kv(node, rows) {
  node.replaceChildren();
  for (const r of rows) {
    if (!r) continue;
    if (r === '—') { node.append(el('div', 'sep')); continue; }
    const [k, v, cls] = r;
    node.append(el('dt', null, k), el('dd', cls || null, v == null || v === '' ? DASH : String(v)));
  }
}

/* ───────── 탭 / 캡처 모드 ───────── */
function showView(v) {
  S.view = v;
  document.querySelectorAll('.tab').forEach((t) => {
    const on = t.dataset.view === v;
    t.classList.toggle('on', on);
    t.setAttribute('aria-selected', on);
  });
  document.querySelectorAll('.view').forEach((s) => s.classList.toggle('on', s.id === 'view-' + v));
  if (location.hash.slice(1) !== v) location.hash = v;
  render();
}

function toggleCapture() {
  document.body.classList.toggle('capture');
  const on = document.body.classList.contains('capture');
  document.querySelectorAll('[data-hide]').forEach((b) => {
    b.textContent = on ? '검증값 보이기' : '검증값 숨기기 (캡처용)';
  });
}

/* ───────── 그리기: 팬 다이얼 ───────── */
function drawDial(deg) {
  const c = $('dial'), x = c.getContext('2d'), r = 40, cx = 48, cy = 48;
  x.clearRect(0, 0, 96, 96);
  x.lineWidth = 6; x.strokeStyle = '#e9e7e0';
  x.beginPath(); x.arc(cx, cy, r, Math.PI * .75, Math.PI * 2.25); x.stroke();
  x.fillStyle = '#a4a29a'; x.font = '10px JetBrains Mono'; x.textAlign = 'center';
  x.fillText('0°', 14, 84); x.fillText('180°', 82, 84);
  if (num(deg) === null) return;      // 각도를 모르면 **바늘을 안 그린다**
  const a = Math.PI * .75 + (Math.max(0, Math.min(180, deg)) / 180) * Math.PI * 1.5;
  x.strokeStyle = '#c99a5b'; x.beginPath(); x.arc(cx, cy, r, Math.PI * .75, a); x.stroke();
  x.fillStyle = '#c99a5b'; x.shadowColor = 'rgba(201,154,91,.5)'; x.shadowBlur = 8;
  x.beginPath(); x.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 5, 0, 7); x.fill();
  x.shadowBlur = 0;
}

function drawTimeline(c, hist) {
  const dpr = devicePixelRatio || 1;
  const w = c.width = Math.max(1, c.clientWidth * dpr);
  const h = c.height = c.getAttribute('height') * dpr;
  const x = c.getContext('2d');
  x.clearRect(0, 0, w, h);
  if (!hist.length) return;
  const sw = w / TL_N;
  // 칸 높이는 사다리 순서다 — S1이 제일 낮고 S6이 제일 높다. 색만으로는 심각도가
  // 안 읽히므로(색맹·프로젝터) 높이를 같이 쓴다.
  const rank = { S1: 1, S2: 2, 'S2+': 3, S3: 4, S4: 5, S5: 6, S6: 7, AWAY: 2 };
  hist.forEach((v, i) => {
    // null = 판정 불가. **빈칸으로 둔다** — 회색 막대로 채우면 판정한 것처럼 보인다.
    if (!v) return;
    x.fillStyle = v === 'AWAY' ? '#b3b1a9' : stageColor(v);
    const hh = h * (0.18 + (rank[v] || 1) / 7 * 0.8);
    x.fillRect(i * sw, h - hh, Math.ceil(sw), hh);
  });
}

/* ───────── 카메라 공통 ───────── */
function setLive(live, recEl, fpsEl, fps, ageEl, ageTxt, camEl, msgEl, msg) {
  recEl.className = 'rec' + (live ? '' : ' off');
  recEl.replaceChildren(el('i'), document.createTextNode(live ? 'LIVE' : 'NO SIGNAL'));
  fpsEl.textContent = num(fps) === null || fps === 0 ? `${DASH} fps` : `${fps.toFixed(1)} fps`;
  ageEl.textContent = ageTxt;
  msgEl.textContent = msg;
  camEl.querySelector('.empty').style.display = msg ? '' : 'none';
}

/** 칸을 **사진 비율에 맞춘다.** 16/9 고정 + cover로 두면 4:3 프레임의 위아래가
 *  잘려 나가고 %로 놓는 오버레이가 사진과 어긋난다 — 상자가 물체 옆에 뜬다. */
function fitBox(img, camId) {
  const nw = img.naturalWidth, nh = img.naturalHeight;
  if (nw && nh) $(camId).style.setProperty('--ar', `${nw} / ${nh}`);
  return { nw, nh };
}

const pctS = (v) => (v * 100).toFixed(3) + '%';

/* ───────── DESK ───────── */

function renderDesk() {
  const snap = S.snap;
  const hub = (snap && snap.hub) || null;
  const mot = (snap && snap.motor) || null;
  const m = S.meta;
  const b = pickBoard(hub, m);
  const bd = b || {};
  const tracking = hub && hub.tracking;
  const knobs = knobsOf(tracking);
  const head = !!knobs.head_anchor;
  const t = bd.target || {};
  const guard = bd.guard || {};
  const boxes = (m && m.boxes) || [];
  const objs = boxes.filter((x) => x.cls !== 'person');
  const lit = boxes.find((x) => x.pick) || null;
  const err = aimErr(m);

  /* ── 카메라 ── */
  const age = S.deskAt ? performance.now() - S.deskAt : Infinity;
  const live = age <= STALE_MS;
  const msg = !snap ? '콘솔(:8020)에 붙는 중'
    : !b ? 'hub에 이 보드가 없다 — 이번 세션에 한 번도 안 붙었다 (전원? SSID? id?)'
    : !b.online ? `보드가 끊겼다 — ${bd.last_seen_ms == null ? '무응답' : (bd.last_seen_ms / 1000).toFixed(0) + '초째 무응답'}`
    : !S.deskAt ? '프레임 대기 중'
    : age > STALE_MS ? `${(age / 1000).toFixed(0)}초째 프레임 없음 — 아래 사진은 과거다` : '';
  setLive(live, $('deskRec'), $('deskFps'), num(bd.fps), $('deskFrameAge'),
          bd.last_seen_ms == null ? `마지막 프레임 ${DASH}` : `마지막 프레임 ${bd.last_seen_ms} ms 전`,
          $('deskCam'), $('deskEmptyMsg'), msg);
  $('deskModel').textContent = bd.model || DASH;
  $('deskCamSrc').textContent = b
    ? `${b.id} · ESP32-S3 → hub → ${hub ? hub.mode : DASH}`
    : 'ESP32-S3 → hub → GPU 서버';

  /* ── 오버레이. 좌표는 0~1 정규화이고 칸이 사진 비율이라 %가 곧 픽셀이다 ── */
  const z = m && m.zone;
  const zb = $('zoneBox');
  zb.style.display = z ? '' : 'none';
  if (z) Object.assign(zb.style, { left: pctS(z.x), top: pctS(z.y), width: pctS(z.w), height: pctS(z.h) });
  zb.querySelector('span').textContent = head ? 'head_anchor · 화면 전체' : 'front zone';

  const ax = $('aim');
  ax.style.display = lit ? '' : 'none';
  if (lit) Object.assign(ax.style, { left: pctS(lit.x + lit.w / 2), top: pctS(lit.y + lit.h / 2) });

  const bx = $('deskBoxes');
  bx.replaceChildren();
  for (const o of boxes) {
    const cls = o.pick ? '' : o.cls === 'person' ? 'person'
      : o.lightable === false ? 'nolight' : 'sec';
    const d = el('div', 'bx ' + cls);
    Object.assign(d.style, { left: pctS(o.x), top: pctS(o.y), width: pctS(o.w), height: pctS(o.h) });
    d.append(el('label', null, `${CLS_KO[o.cls] || o.cls} ${f(o.c, 2)}`
      + (o.pick ? ' · 조명' : o.lightable === false ? ' · 조명 제외' : '')));
    bx.append(d);
  }
  if (m && m.person && !head) {
    const p = el('div', 'anchor');
    Object.assign(p.style, { left: pctS(m.person.x), top: pctS(m.person.y) });
    bx.append(p);
  }
  for (const [hx, hy] of (m && m.hands) || []) {
    const h = el('div', 'hand');
    Object.assign(h.style, { left: pctS(hx), top: pctS(hy) });
    bx.append(h);
  }

  /* ── 지금 조명이 보는 것 ── */
  // **이 프레임에 상자가 있을 때만 id를 쓴다.** `target.id`는 트랙이 잠깐 사라져도
  // 남아 있어서, 그대로 그리면 「조명 대상 없음」 옆에 «#511»이 붙는다 — 한 카드가
  // 두 가지를 동시에 말하는 셈이다.
  $('deskTrackId').textContent = (lit || t.cls) && t.id != null ? '#' + t.id : '#—';
  $('tIcon').textContent = t.cls ? (CLS_ICON[t.cls] || '◌') : '◌';
  $('tName').textContent = t.cls ? (CLS_KO[t.cls] || t.cls) : '조명 대상 없음';
  $('tSub').textContent = lit
    ? `conf ${f(lit.c, 2)} · ${lit.zone === false ? '구역 밖' : '구역 안'} · 연속 이동 ${f(lit.move_s, 1)}초`
    : (bd.reason || '트래커가 아무것도 안 골랐다');
  const fr = num(t.follow_ratio);
  $('followBar').style.width = fr === null ? '0%' : (fr * 100) + '%';
  $('followTxt').textContent = f(t.follow_ratio, 3);

  /* ── 램프 조준 ── */
  $('panDeg').textContent = num(bd.pan_deg) === null ? DASH : f(bd.pan_deg, 1) + '°';
  $('aimErr').textContent = err ? `x ${f(err.x)}${err.y == null ? '' : ' y ' + f(err.y)}` : DASH;
  $('motorMode').textContent = (mot && mot.mode) || DASH;
  drawDial(num(bd.pan_deg));
  const mb = $('motorBars');
  mb.replaceChildren();
  for (const x of (mot && mot.motors) || []) {
    const row = el('div', 'mrow');
    const bar = el('div', 'bar');
    const i = el('i');
    // pos가 없으면 **막대를 0으로 둔다** — 버스에서 조용한 축을 0틱으로 그리면
    // "정면을 보고 있다"로 읽힌다. 오른쪽 글자가 무응답이라고 말한다.
    i.style.width = num(x.pos) === null ? '0%' : (x.pos / 4096 * 100) + '%';
    bar.append(i);
    row.append(el('span', null, `ID ${x.id}`), bar,
      el('span', 'r', num(x.pos) === null ? '무응답'
        : `${x.pos}틱 · ${x.torque ? 'tq on' : 'tq off'}`));
    mb.append(row);
  }
  if (!mb.childElementCount) mb.append(el('div', 'objs', ''), el('div', null, 'bringup(:8790)이 안 붙었다'));

  /* ── front zone 물체 ──
     **앞 구역 안의 물체만 싣는다.** 카드 이름이 그것이고, 조명 후보가 되는 것도
     그것뿐이다 (target_logic은 구역 안에서만 고른다). 다만 걸러낸 것을 **조용히
     버리지 않는다** — 구역 밖에 물체가 있는데 카드가 비어 있으면 "탐지가 안 된다"로
     오진하게 되므로, 몇 개를 왜 뺐는지 아래에 한 줄로 남긴다.

     `zone`은 트래커의 게이트 판정(`in_zone_ids`)이지 생 좌표 비교가 아니다 —
     화면에 보이는 안/밖이 로직의 판단과 같아야 한다 (desk_tracker의 주석). */
  const inZone = objs.filter((o) => o.zone !== false);
  const outZone = objs.length - inZone.length;
  const nPerson = boxes.length - objs.length;
  $('objCnt').textContent = boxes.length ? `${inZone.length}개` : DASH;
  const ol = $('objList');
  ol.replaceChildren();
  if (!inZone.length) {
    ol.append(el('div', 'none', !b || !b.online ? '보드가 안 붙어 프레임이 없다'
      : objs.length ? '앞 구역 안에 물체가 없다 — 밖에는 있다 (아래)'
      : '물체가 하나도 안 잡힌다 — 추론이 도는지, conf 문턱이 너무 높은지 본다'));
  }
  for (const o of inZone) {
    const row = el('div', 'obj' + (o.pick ? ' lit' : ''));
    row.append(el('div', 'ic', CLS_ICON[o.cls] || '◌'));
    const nm = el('div', 'nm', CLS_KO[o.cls] || o.cls);
    nm.append(el('small', null, `#${o.id}`));
    row.append(nm);
    const mt = el('div', 'mt');
    mt.append(el('b', null, o.pick ? '조명 중'
      : o.lightable === false ? '조명 제외' : '대기'),
      el('br'), document.createTextNode(`conf ${f(o.c, 2)}`));
    row.append(mt);
    ol.append(row);
  }
  // 걸러낸 것 알리기. 없으면 줄 자체를 감춘다 — 늘 떠 있는 회색 줄은 안 읽힌다.
  const note = $('objNote');
  const bits = [];
  if (outZone) bits.push(`구역 밖 ${outZone}개`);
  if (nPerson) bits.push(`사람 ${nPerson}명(기준점)`);
  note.hidden = !bits.length;
  if (bits.length) note.querySelector('span').textContent = bits.join(' · ') + ' 은 이 목록에서 뺐다';

  /* ── 검증 ── */
  kv($('dPipe'), [
    ['추론 위치', hub ? hub.mode : null],
    ['모델', bd.model],
    ['추론', ms(bd.infer_ms)],
    ['보드 fps', num(bd.fps) ? bd.fps.toFixed(1) + ' fps' : null],
    ['마지막 프레임', bd.last_seen_ms == null ? null : bd.last_seen_ms + ' ms 전'],
    ['GPU 서버', hub && hub.server
      ? `${hub.server.reachable ? '닿음' : '안 닿음'} · 소켓 ${hub.server.ws ? '연결' : '없음'}`
      : null, hub && hub.server && hub.server.reachable ? '' : 'dim'],
  ]);
  const R = ribbon(b);
  const lb = $('dLatBar').children;
  SEGS.forEach((k, i) => { lb[i].style.width = R.pct[k].toFixed(2) + '%'; });
  kv($('dLat'), [
    ['인코딩 (보드)', ms(bd.encode_ms)],
    ['WiFi', bd.rtt_ms ? ms(bd.wifi_ms, false) : null],
    ['네트워크 (hub↔서버)', bd.net_ms == null ? null : ms(bd.net_ms, false)],
    ['서버', ms(bd.server_ms)],
    '—',
    ['왕복 rtt', ms(bd.rtt_ms)],
    ['유리→모터', bd.rtt_ms ? ms(bd.glass_to_motor_ms) : null],
  ]);
  kv($('dPos'), [
    ['사람 기준점', m && m.person ? `x ${f(m.person.x)} · y ${f(m.person.y)}` : null],
    ['앞 구역', z ? `x ${f(z.x)} y ${f(z.y)} w ${f(z.w)} h ${f(z.h)}` : null],
    ['조준 오차 x', err ? f(err.x) : null],
    ['조준 오차 y', err && err.y != null ? f(err.y) : null],
    ['팬 목표각', num(bd.pan_deg) === null ? '안 보냄 (현재 각도 유지)' : f(bd.pan_deg, 1) + '°'],
    ['손 좌표', ((m && m.hands) || []).map(([x, y]) => `${f(x)},${f(y)}`).join('  ')],
  ]);
  kv($('dSM'), [
    ['상태', t.state],
    ['타깃 id / 클래스', t.id == null ? null : `#${t.id} ${t.cls ?? 'null'}`],
    ['따라감 비율', f(t.follow_ratio)],
    ['사람 상태', bd.presence, bd.presence === 'AWAY' ? 'warn' : bd.presence ? 'ok' : ''],
    ['이유', bd.reason, 'sub'],
    '—',
    ['쿨다운이 막은 전환', guard.cooldown_blocks == null ? null
      : `${guard.cooldown_blocks}회 (${guard.cooldown_s}초)`],
    ['손이 막은 전환', guard.hand_blocks == null ? null
      : `${guard.hand_blocks}회${guard.held_by_hand ? ' · 지금 쥐고 있다' : ''}`],
  ]);
  kv($('dFixed'), Object.entries((tracking && tracking.fixed) || {})
    .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]));
  // **`live`가 핵심이다** — false면 "다음에 모델이 올라올 때 쓸 값"이지 지금 도는 값이 아니다.
  $('dKnobLive').textContent = !tracking ? DASH
    : hub && hub.mode === 'remote' ? 'local 값 · remote는 서버가 따로'
    : tracking.live === false ? '아직 안 먹었다' : '적용 중';
  kv($('dKnobs'), Object.entries(knobs).map(([k, v]) =>
    [k, typeof v === 'boolean' ? (v ? '켜짐' : '꺼짐') : v,
     k === 'head_anchor' && v ? 'warn' : '']));
  $('dMotorPort').textContent = (mot && mot.port) || DASH;
  const fol = mot && mot.follow;
  kv($('dMotor'), mot ? [
    ['모드', mot.mode],
    ...(mot.motors || []).map((x) => [`ID ${x.id}`,
      // pos가 없으면 **"위치 응답 없음"이지 0틱이 아니다.** 0틱을 그리면 버스에서
      // 조용한 축이 "정면을 보고 있다"로 읽힌다.
      num(x.pos) === null ? '위치 응답 없음'
        : `${x.pos}틱 · 부하 ${x.load ?? DASH} · ${x.volt ? x.volt.toFixed(1) + 'V' : DASH}`
          + ` · ${x.temp ?? DASH}°C · tq ${x.torque ? 'on' : 'off'}`,
      num(x.pos) === null ? 'bad' : '']),
    fol ? '—' : null,
    fol ? ['따라가는 축', `ID ${fol.axis} · gain ${fol.gain}`] : null,
    fol ? ['오차 (원본/유효)', `${fol.err ?? DASH} / ${fol.err_eff ?? DASH}`] : null,
    fol ? ['목표 / 보낸 값', `${fol.goal ?? DASH} / ${fol.cmd ?? DASH}`] : null,
    fol ? ['오차 나이', `${fol.age}초`] : null,
  ] : [['bringup :8790', '안 붙는다', 'bad']]);
  kv($('dHealth'), ((snap && snap.health) || [])
    .filter((r) => /^(up\.|cam\.|lat\.|infer|motor\.)/.test(r.k))
    .map((r) => [r.k, r.v, r.s === 'ok' ? 'ok' : r.s === 'warn' ? 'warn' : r.s === 'bad' ? 'bad' : 'dim']));

  $('dBoxCnt').textContent = boxes.length;
  const tb = $('dBoxes');
  tb.replaceChildren();
  if (!boxes.length) {
    const tr = el('tr'), td = el('td', 'emptyrow', '상자가 없다 — 추론이 도는지, conf가 너무 높은지 본다');
    td.setAttribute('colspan', '11'); tr.append(td); tb.append(tr);
  }
  for (const o of boxes) {
    const tr = el('tr', o.pick ? 'lit' : null);
    for (const c of [o.cls, o.id, f(o.c, 2), f(o.x), f(o.y), f(o.w), f(o.h),
                     o.cls === 'person' ? DASH : (o.zone ? '안' : '밖'),
                     o.pick ? '●' : DASH,
                     o.cls === 'person' ? DASH : f(o.move_s, 1),
                     o.contact ? '●' : DASH]) {
      tr.append(el('td', null, c == null ? DASH : String(c)));
    }
    tb.append(tr);
  }
}

/* ───────── FACE ───────── */

function renderFace() {
  const snap = S.snap;
  const d = S.drowsy;
  const z = (d && d.drowsy) || {};
  const sig = (d && d.signals) || {};
  const cal = (d && d.cal) || {};
  const cnt = (d && d.counts) || {};
  const alert = (d && d.alert) || {};
  const health = (snap && snap.health) || [];
  // **판정은 collectFace가 프레임마다 굴린 결과를 그대로 쓴다.** 여기서 다시
  // focusStep을 부르면 사건이 두 번 세어진다 (창 집계가 곧 단계다).
  const stage = S.stage ?? null;
  const why = S.stageWhy || '';
  const rung = LADDER.find((r) => r.id === stage) || null;

  /* ── 카메라 ── */
  const age = S.faceAt ? performance.now() - S.faceAt : Infinity;
  const live = age <= STALE_MS;
  const down = snap && snap.up && snap.up.drowsy !== 'ok';
  const msg = !snap ? '콘솔(:8020)에 붙는 중'
    : down ? '졸음 프로세스(:8100)가 안 붙는다 — 얼굴 카메라는 이 경로로만 온다'
    : !S.faceAt ? '프레임 대기 중'
    // **프레임이 비는 것은 고장이 아니다.** 캡처 계층은 멈췄을 때 마지막 프레임을
    // 되풀이하지 않고 "없음"을 돌려준다 — 깜빡임 프레임을 반복하면 PERCLOS가
    // 100%로 올라가 **없는 졸음을 만들어 낸다.**
    : age > STALE_MS ? `${(age / 1000).toFixed(0)}초째 프레임 없음 (반복 재생 안 한다)` : '';
  setLive(live, $('faceRec'), $('faceFps'), num(d && d.fps), $('faceFrameAge'),
          `작업 ${ms(d && d.work_p50)} / ${ms(d && d.work_p90)} p50·p90`,
          $('faceCam'), $('faceEmptyMsg'), msg);
  $('faceEarMar').textContent = `EAR ${f(sig.ear_mean, 2)} · jawOpen ${f(sig.jaw_open, 2)}`;

  /* ── 오버레이: 랜드마크 + 눈 6점 + 상자 ── */
  const pts = (d && d.points) || [];
  const box = faceBox(pts);
  const eye = new Set((d && d.eye_idx) || []);
  const shut = !!z.eyes_closed;
  const fb = $('faceBoxes');
  fb.replaceChildren();
  if (box) {
    const bxe = el('div', 'bx face');
    Object.assign(bxe.style, { left: pctS(box.x), top: pctS(box.y), width: pctS(box.w), height: pctS(box.h) });
    bxe.append(el('label', null, `랜드마크 ${pts.length}점 · ${STATE_KO[z.state] || DASH}`));
    fb.append(bxe);
  }
  pts.forEach((p, i) => {
    const n = el('div', 'lm' + (eye.has(i) ? (shut ? ' eye shut' : ' eye') : ''));
    Object.assign(n.style, { left: pctS(p[0]), top: pctS(p[1]) });
    fb.append(n);
  });

  /* ── 집중 단계 사다리 ──
     **조명 열은 스펙이지 지금 도는 동작이 아니다.** 배선된 연동은 경고 시
     빨강+manual 하나뿐이라, 칸마다 「미구현」을 박아 둔다. 안 박으면 발표에서
     "지금 저 색으로 바뀐다"로 읽힌다. */
  const ledCmd = healthRow(health, 'led.cmd');
  const ledNode = healthRow(health, 'led.node');
  const ledSensor = healthRow(health, 'led.sensor');
  // **보드가 실제로 어느 상태인지.** 화면 판정(위)과 다른 값일 수 있고, 그 차이가
  // 곧 "명령이 안 닿았다"는 신호다. `S4 · 주간 · #D2E1FF 128/255` 모양으로 온다.
  const ledState = healthRow(health, 'led.state');
  const lampId = ledState && /^(A0|S[1-6])/.test(ledState.v)
    ? ledState.v.split(' ')[0] : null;
  // 주간/야간은 조도센서가 정한다 (펌웨어의 `dark`). 모르면 둘 다 보여준다.
  const night = ledSensor && /DARK/.test(ledSensor.v) ? true
    : ledSensor && /LIGHT/.test(ledSensor.v) ? false : null;

  const lad = $('ladder');
  lad.replaceChildren();
  for (const r of LADDER) {
    const on = r.id === stage;
    // S6은 마지막 줄을 통째로 쓴다 — 3×3에서 일곱 번째 칸이라 혼자 남는다.
    const t = el('div', 'tile' + (r.id === 'S6' ? ' wide' : ''));
    t.dataset.on = on ? '1' : '';
    t.style.setProperty('--c', r.color);
    t.append(el('span', 'tile-id', r.id), el('div', 'tile-n', r.name),
             el('div', 'tile-t', r.trigger));
    if (on) t.append(el('span', 'tile-now'));
    // 보드가 이 칸이라고 말하면 표시한다. **화면 판정과 갈리는 순간이 실제로 있다** —
    // 노트북 명령이 워치독(5초)을 넘기면 보드가 자기 판단으로 S1로 내려간다.
    if (lampId === r.id) t.append(el('span', 'tile-board', '보드'));
    lad.append(t);
  }
  // 자세한 조건·조명·해제는 **지금 칸에만** 한 줄로. 일곱 칸에 다 적으면 아무도
  // 안 읽고, 지금 어느 칸인지가 오히려 안 보인다.
  const why1 = $('tileWhy');
  why1.replaceChildren();
  if (rung) {
    why1.append(el('b', null, `${rung.id} ${rung.name}`),
      document.createTextNode(` — ${why}`));
    const lit = night === true ? rung.night : rung.day;
    why1.append(el('div', null, `조명 ${night === true ? '야간' : '주간'} · ${lit}`
      + (rung.clear ? ` · 해제 ${rung.clear}` : '')));
    if (rung.partial) why1.append(el('div', null, '※ ' + rung.partial));
  } else {
    why1.append(document.createTextNode(
      stage === 'AWAY' ? '자리 비움 — 사람이 없으면 각성 시도는 의미가 없다'
        : (why || '판정 불가')));
  }

  // 카드 제목 옆은 **출처만** 쓴다 — 근거 문장은 아래 tileWhy 한 줄이 맡는다.
  // 둘 다 같은 말을 적으면 정사각형 타일로 줄인 의미가 없어진다.
  $('stageRule').textContent = S.stageSrc === 'up'
    ? '판정기 상태에서 그대로 온다'
    : '화면이 센 것 — drowsiness 상태기계가 오면 그쪽을 쓴다';

  const strip = $('ledStrip');
  strip.style.setProperty('--c', rung ? rung.color : '#4a4944');
  strip.style.opacity = rung ? .95 : .25;
  // **`led.cmd`(기준색)가 아니라 `led.state`(나가는 색)를 앞세운다.** 상태 조명이
  // 기준색 위에 얹히므로 «#FFFFFF»라고 적으면 파랗게 빛나는 램프를 흰색이라고
  // 말하게 된다.
  $('ledCap').textContent = ledState && ledState.s !== 'na'
    ? `실제 램프 — ${ledState.v} · ${ledState.why}`
    : ledNode && ledNode.s !== 'ok'
      ? `실제 램프 — 노드 ${ledNode.v}`
      : ledState
        ? `실제 램프 — ${ledState.v} (${ledState.why})`
        : '실제 램프 — 모름 (콘솔이 LED 행을 안 보냈다)';

  /* ── 졸음 판정 ── */
  const per = num(z.perclos), thr = num(z.perclos_threshold);
  $('scoreNow').textContent = per === null ? DASH : (per * 100).toFixed(0);
  $('scoreNow').style.color = rung ? rung.color : 'var(--dim)';
  $('scoreMeta').textContent = thr === null ? '판정 입력이 없다'
    : `임계 ${(thr * 100).toFixed(0)}% · 창 ${z.window_sec ?? DASH}초 · 커버리지 ${per === null ? DASH : ((z.coverage ?? 0) * 100).toFixed(0) + '%'}`;
  $('stageTag').textContent = rung ? `${rung.id} · ${rung.name}`
    : stage === 'AWAY' ? '자리 비움' : '판정 불가';

  drawTimeline($('stageTl'), S.tlHist);
  $('tlNote').textContent = `단계 변화 — 화면이 붙어 있는 동안 (${S.tlHist.length}/${TL_N})`;

  /* ── 얼굴 상태 셋 ── */
  const fs = $('fStates');
  fs.replaceChildren();
  for (const c of faceStates(d)) {
    const row = el('div', 'fs');
    row.dataset.s = c.s;
    row.dataset.on = c.on ? '1' : '';
    const top = el('div', 'fs-top');
    top.append(el('div', 'fs-n', c.name), el('span', 'fs-w', c.word));
    row.append(top, el('div', 'fs-y', c.why));
    if (c.ratio != null) {
      const g = el('div', 'fs-g'), i2 = el('i');
      i2.style.width = (c.ratio * 100) + '%';
      g.append(i2);
      row.append(g);
    }
    const foot = el('div', 'fs-f');
    foot.append(el('span', null, c.meter),
                el('span', null, c.count == null ? '' : `누적 ${c.count}회`));
    row.append(foot);
    fs.append(row);
  }
  $('fsTag').textContent = d ? '판정기가 내놓은 그대로' : '상류 없음';

  /* ── 검증 ── */
  kv($('fPipe'), [
    ['추론 위치', d ? '노트북 (drowsiness :8100)' : null],
    ['모델', d ? 'MediaPipe FaceLandmarker · 478pt' : null],
    ['랜드마커 p50', ms(d && d.infer_p50)],
    ['틱 간격 fps', num(d && d.fps) ? d.fps.toFixed(1) : null],
    ['작업 p50 / p90', d ? `${ms(d.work_p50)} / ${ms(d.work_p90)}` : null],
    ['이 틱 프레임', d ? (d.camera_ok === false ? '없음 (정상 — 반복 재생 안 한다)' : '있음') : null],
    ['DB 행', d ? d.rows : null],
  ]);
  // **두 칸만 잰다.** 원안의 캡처/규칙/LED 구간은 상류가 보고하지 않는다 —
  // 없는 구간에 숫자를 채우면 재지도 않은 것을 잰 것처럼 보인다.
  const mesh = num(d && d.infer_p50) ?? 0, work = num(d && d.work_p50) ?? 0;
  const rest = Math.max(0, work - mesh), tot = Math.max(1, work);
  const fb2 = $('fLatBar').children;
  [rest, mesh, 0, 0].forEach((v, i) => { fb2[i].style.width = (d ? v / tot * 100 : 0) + '%'; });
  kv($('fLat'), [
    ['프레임 읽기 + 인코딩', d ? ms(rest, false) : null],
    ['랜드마커 추론 p50', ms(d && d.infer_p50)],
    '—',
    ['루프 작업 p50', ms(d && d.work_p50)],
    ['규칙 판정', '측정 안 함', 'dim'],
    ['LED 전송·반영', '측정 안 함', 'dim'],
    ['판정 → LED', '측정 안 함 — 왕복 확인 경로가 없다', 'dim'],
  ]);
  kv($('fMeas'), [
    ['EAR L / R', d ? `${f(sig.ear_left)} / ${f(sig.ear_right)}` : null,
     cal.threshold && sig.ear_mean < cal.threshold ? 'warn' : ''],
    ['EAR 평균', f(sig.ear_mean)],
    ['eyeBlink (max)', f(sig.eye_blink), z.eyes_closed ? 'warn' : ''],
    ['eyeBlink L / R', d ? `${f(sig.eye_blink_left)} / ${f(sig.eye_blink_right)}` : null],
    ['eyeSquint', f(sig.eye_squint)],
    ['jawOpen', f(sig.jaw_open), z.yawning ? 'warn' : ''],
    ['머리 pitch / yaw / roll', d ? `${f(sig.head_pitch, 1)} / ${f(sig.head_yaw, 1)} / ${f(sig.head_roll, 1)}` : null],
    '—',
    ['눈 감김 연속', d ? `${z.closed_run ?? 0}프레임 · ${f(z.closed_run_sec, 1)}초` : null],
    ['하품 연속', d ? `${f(z.yawn_run_sec, 1)} / ${f(z.yawn_sec, 1)}초` : null],
  ]);
  kv($('fSM'), [
    ['state', d ? `${z.state} (${STATE_KO[z.state] || DASH})` : null],
    ['why', z.why, 'sub'],
    ['단계', rung ? `${rung.id} · ${rung.name}` : stage === 'AWAY' ? '자리 비움' : '판정 불가'],
    ['단계 근거', why, 'sub'],
    ['PERCLOS', per === null ? null : (per * 100).toFixed(1) + ' %'],
    ['커버리지', d ? `${((z.coverage ?? 0) * 100).toFixed(0)}% ${z.judging ? '(판정 중)' : '(판정 보류)'}` : null],
    ['관측 불가 사유', d ? (z.blind || '없음') : null],
    '—',
    ['알림', d ? `${alert.enabled ? '소리 켜짐' : '무음 — 사건은 기록된다'} · ${alert.count ?? 0}회` : null],
    ['쿨다운 남음', alert.cooldown_left == null ? null : alert.cooldown_left + '초'],
  ]);
  kv($('fFixed'), d ? [
    ['PERCLOS 임계', thr === null ? null : (thr * 100).toFixed(0) + ' %'],
    ['PERCLOS 창', (z.window_sec ?? DASH) + ' 초'],
    ['마이크로슬립 기준', f(z.microsleep_sec, 1) + ' 초'],
    ['하품 기준', `jawOpen > ${f(z.yawn_jaw_open, 2)} · ${f(z.yawn_sec, 1)}초`],
    '—',
    ['캘리브레이션 baseline', f(cal.baseline)],
    ['EAR 임계 (baseline×비율)', f(cal.threshold)],
    ['비율 / 표본', `${cal.ratio ?? DASH} / ${cal.samples ?? DASH}`],
    ['측정 시각', cal.measured_at],
    ['해상도 바뀜', cal.stale ? '그렇다 — 다시 재야 한다' : '아니다', cal.stale ? 'warn' : 'ok'],
  ] : [['drowsiness :8100', '안 붙는다', 'bad']]);
  $('fLedPort').textContent = ledNode ? (ledNode.why || ledNode.v) : DASH;
  kv($('fLed'), [
    ['노드', ledNode ? ledNode.v : null, ledNode ? cls4(ledNode.s) : ''],
    ['상태 · 나가는 색', ledState ? ledState.v : null, ledState ? cls4(ledState.s) : ''],
    ['상태 근거', ledState ? ledState.why : null, 'sub'],
    ['기준색', ledCmd ? ledCmd.v : null, ledCmd ? cls4(ledCmd.s) : ''],
    ['조도센서', ledSensor ? ledSensor.v : null, ledSensor ? cls4(ledSensor.s) : ''],
    ['왜', ledCmd ? ledCmd.why : null, 'sub'],
  ]);
  kv($('fCnt'), d ? [
    ...Object.entries(cnt).map(([k, v]) => [k, v]),
    ['「지금 졸림」 표시', (d.marks || []).length],
    '—',
    ['검출 / 표본', `${d.detected ?? 0} / ${d.counted ?? 0}`],
    ['연속 미검출 (현재/최장)', `${d.miss_streak ?? 0} / ${d.worst_streak ?? 0}프레임`],
    ['세션 경과', hms(d.elapsed)],
  ] : [['drowsiness :8100', '안 붙는다', 'bad']]);
  kv($('fHealth'), health.filter((r) => /^(up\.drowsy|cam\.face|drowsy\.|led\.)/.test(r.k))
    .map((r) => [r.k, r.v, cls4(r.s)]));

  $('fBoxCnt').textContent = box ? 1 : 0;
  const tb = $('fBoxes');
  tb.replaceChildren();
  if (!box) {
    const tr = el('tr'), td = el('td', 'emptyrow',
      '얼굴이 없다 — 카메라 각도, 조도, 안경 반사를 본다');
    td.setAttribute('colspan', '13'); tr.append(td); tb.append(tr);
  } else {
    const verdict = z.yawning ? '하품'
      : z.eyes_closed ? '눈 감김'
      : z.state === 'turned' ? '고개 돌림'
      : z.state === 'drowsy' ? '졸음' : '정상';
    const tr = el('tr');
    for (const c of ['랜드마크 범위', f(box.x), f(box.y), f(box.w), f(box.h),
                     f(sig.ear_left), f(sig.ear_right), f(sig.eye_blink), f(sig.jaw_open),
                     f(sig.head_pitch, 1), f(sig.head_yaw, 1), f(sig.head_roll, 1), verdict]) {
      tr.append(el('td', null, c));
    }
    tb.append(tr);
  }
}

function cls4(s) {
  return s === 'ok' ? 'ok' : s === 'warn' ? 'warn' : s === 'bad' ? 'bad' : 'dim';
}

/* ───────── 렌더 ───────── */
function render() {
  try {
    if (S.view === 'desk') renderDesk(); else renderFace();
    if (S.drawErr) { S.drawErr = null; setFeed(!!S.ws, S.feedText || '실시간'); }
  } catch (e) {
    // **조용히 넘어가지 않는다.** 예전에는 console.error만 찍었는데, 그러면 카드가
    // 빈 채로 남고 발표 중에는 아무도 개발자 도구를 안 본다 — 화면이 "값이 없다"고
    // 말하는 것과 "그리다 터졌다"가 구별이 안 됐다 (2026-08-27, `st` 미정의로 179회).
    // 계속 도는 것은 그대로 둔다: 한 탭이 터져도 WS와 나머지는 살아 있어야 한다.
    if (S.drawErr !== String(e)) console.error('[stage] 그리기 실패', e);
    S.drawErr = String(e);
    setFeed(false, `그리기 실패 — ${e.name}: ${e.message}`);
  }
}

/* ───────── 스냅샷이 올 때마다 모으는 것 ───────── */

function collectFace(d) {
  // **사건 창은 프레임마다 굴려야 한다** — 보이는 탭에서만 굴리면 책상 탭에 있는
  // 동안의 하품·고개 이탈이 통째로 빠진다. 그래서 render가 아니라 여기서 부른다.
  // **한 번만 부른다.** focusStep은 사건을 세므로 두 번 부르면 하품·고개 이탈이
  // 두 배로 잡힌다 — 창 집계가 곧 단계라서 그대로 오판이 된다.
  //
  // 상류 판정이 있으면 그것이 정본이다. 그래도 창은 계속 굴린다 — 상류가 잠깐
  // 끊겼다 붙을 때 대체 경로가 0에서 다시 시작하면 화면이 그 순간 S1로 튄다.
  const step = focusStep(S.focus || newFocus(), d);
  S.focus = step.st;
  const up = stageFrom(d);
  S.stage = up ? up.stage : step.stage;
  S.stageWhy = up ? up.why : step.why;
  S.stageSrc = up ? 'up' : 'browser';
  S.tlHist.push(S.stage);
  if (S.tlHist.length > TL_N) S.tlHist.shift();

  const at = `${(d.elapsed ?? 0).toFixed(1)}s`;
  const z = d.drowsy || {};
  if (z.state && z.state !== S.lastState) {
    if (S.lastState === null) {
      // **첫 상태도 한 줄 남긴다.** 전이만 찍으면 상태가 안 바뀌는 동안 터미널이
      // 통째로 비어서, 로그가 안 흐르는 것인지 판정이 멈춘 것인지 구별이 안 된다.
      termFace.log('INF', `${at}  붙었을 때 상태 ${STATE_KO[z.state] || z.state}`
        + (z.why ? ` (${z.why})` : ''));
    } else {
      termFace.log(z.state === 'drowsy' ? 'WRN' : z.state === 'awake' ? 'OK' : 'INF',
        `${at}  상태 ${STATE_KO[S.lastState] || S.lastState} → ${STATE_KO[z.state] || z.state}`
        + (z.why ? ` (${z.why})` : ''));
    }
    S.lastState = z.state;
  }
  if (S.stage !== S.lastStage) {
    if (S.lastStage != null && S.stage != null) {
      const to = LADDER.find((r) => r.id === S.stage);
      termFace.log(S.stage === 'S1' ? 'OK' : S.stage === 'AWAY' ? 'INF' : 'EVT',
        `${at}  단계 ${S.lastStage} → ${S.stage}`
        + (to ? ` ${to.name} — ${S.stageWhy}` : ` (${S.stageWhy})`)
        + (S.stageSrc === 'up' ? '' : ' [화면 판정]'));
    }
    S.lastStage = S.stage;
  }
  for (const [k, v] of Object.entries(d.counts || {})) {
    const was = S.lastCounts[k] ?? v;      // 첫 스냅샷은 누적분이라 사건이 아니다
    if (v > was) termFace.log('EVT', `${at}  ${k} ${v}회째`);
    S.lastCounts[k] = v;
  }
}

/** hub·bringup 로그를 **새로 생긴 줄만** 흘린다. 스냅샷마다 통째로 오므로
 *  길이 차이로 센다. 이게 진짜 터미널 로그다 — 상태 전이 문장이 여기로 흐른다. */
function collectLogs(snap) {
  const hl = (snap.hub && snap.hub.log) || [];
  if (hl.length < S.hubLogN) S.hubLogN = 0;          // hub가 재시작했다
  for (const r of hl.slice(S.hubLogN)) {
    termDesk.log(r.level === 'warn' ? 'WRN' : r.level === 'error' ? 'ERR' : 'INF', r.msg, r.t);
  }
  S.hubLogN = hl.length;

  const ml = (snap.motor && snap.motor.log) || [];
  if (ml.length < S.motorLogN) S.motorLogN = 0;
  for (const s of ml.slice(S.motorLogN)) termDesk.log('INF', '[motor] ' + s);
  S.motorLogN = ml.length;
}

/* ───────── WS ───────── */
function setUp(id, state) {
  const e = $(id);
  if (e) e.dataset.s = state;
}

function setFeed(ok, text) {
  $('feedPill').className = 'pill ' + (ok ? 'live' : 'down');
  $('feedLabel').textContent = text;
}

function connect() {
  // **콘솔의 WS다** (`/ws`). 원안의 `ws://localhost:8765`는 hub의 **보드용** 포트라
  // 여기로 붙으면 보드 프로토콜을 말하게 되고 아무것도 안 온다.
  const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  const ws = new WebSocket(url);
  S.ws = ws;
  ws.binaryType = 'blob';
  ws.onopen = () => { S.feedText = '실시간 · ' + url; setFeed(true, S.feedText); termDesk.log('OK', 'console ws 연결 ' + url); };
  ws.onerror = () => ws.close();
  ws.onclose = () => {
    setFeed(false, '콘솔 끊김 — 다시 붙는 중');
    setUp('upHub', 'down'); setUp('upMotor', 'down'); setUp('upDrowsy', 'down');
    S.snap = null; S.drowsy = null;    // 끊긴 순간부터 옛 값은 거짓말이다
    render();
    setTimeout(connect, 1000);         // 콘솔을 껐다 켜는 것이 정상 작업이다
  };
  ws.onmessage = (ev) => {
    if (typeof ev.data !== 'string') {
      // 바이너리 = 책 카메라 JPEG. **직전 텍스트가 그 사진의 메타다** —
      // 짝은 순서가 만든다. 사이에 낀 2Hz 스냅샷은 type이 없어서 안 건드린다.
      const meta = S.pendingMeta;
      S.pendingMeta = null;
      if (!meta) return;               // 짝이 깨진 프레임. 어디에 그릴지 모른다
      S.meta = meta;
      S.deskAt = performance.now();
      if (S.view !== 'desk') return;
      const url2 = URL.createObjectURL(ev.data);
      if (S.deskUrl) URL.revokeObjectURL(S.deskUrl);
      S.deskUrl = url2;
      const img = deskImg();
      img.onload = () => { fitBox(img, 'deskCam'); render(); };
      img.src = url2;
      return;
    }
    const m = JSON.parse(ev.data);
    if (m.type === 'preview_meta') { S.pendingMeta = m; return; }
    if (m.type === 'drowsy') {
      const d = m.drowsy || {};
      S.drowsy = d;
      collectFace(d);
      if (S.view !== 'face') return;
      if (d.jpeg) {
        S.faceAt = performance.now();
        const img = faceImg();
        img.onload = () => { fitBox(img, 'faceCam'); render(); };
        img.src = 'data:image/jpeg;base64,' + d.jpeg;
      }
      render();                        // 프레임이 빈 틱에도 판정은 갱신한다
      return;
    }
    if (m.type) return;                // 이 화면에 받을 자리가 없는 상류 메시지
    S.snap = m;
    setUp('upHub', m.up.hub); setUp('upMotor', m.up.motor); setUp('upDrowsy', m.up.drowsy);
    collectLogs(m);
    render();
  };
}

function imgIn(camId) {
  const c = $(camId);
  let img = c.querySelector('img');
  if (!img) { img = document.createElement('img'); img.alt = ''; c.prepend(img); }
  return img;
}
const deskImg = () => imgIn('deskCam');
const faceImg = () => imgIn('faceCam');

/* ───────── 부팅. **node에서 import될 때는 아무 일도 안 한다** ───────── */
if (typeof document !== 'undefined' && document.getElementById('view-desk')) {
  termDesk = new Term($('deskTerm'));
  termFace = new Term($('faceTerm'));
  document.querySelectorAll('.tab').forEach((t) => t.onclick = () => showView(t.dataset.view));
  document.querySelectorAll('[data-hide]').forEach((b) => b.onclick = toggleCapture);
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === '1') showView('desk');
    if (e.key === '2') showView('face');
    if (e.key === 'h' || e.key === 'H') toggleCapture();
    if (e.key === 'l' || e.key === 'L') (S.view === 'desk' ? termDesk : termFace).togglePause();
  });
  window.addEventListener('hashchange', () => showView(location.hash.slice(1) || 'desk'));
  window.addEventListener('resize', render);
  setInterval(() => { $('clock').textContent = clockStr(); }, 500);
  // **`?slide=1` — 발표 슬라이드에 iframe으로 끼울 때.** 검증값을 접고(캡처 모드)
  // 브랜드·탭·단축키 안내를 숨긴다. 슬라이드가 이미 제목을 달고 있어서 두 번
  // 읽히기 때문이다. 오른쪽의 상류 점·LIVE 배지·시계는 **남긴다** — 발표자가
  // 무대에서 알아야 하는 단 하나가 "지금 진짜 살아 있나"다.
  if (new URLSearchParams(location.search).get('slide') === '1') {
    document.body.classList.add('slide-embed', 'capture');
  }
  showView(location.hash.slice(1) === 'face' ? 'face' : 'desk');
  connect();
}
