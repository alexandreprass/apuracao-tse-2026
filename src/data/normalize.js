// Converts the raw JSON files published by the TSE at resultados.tse.jus.br into a compact,
// readable shape. Used by the browser (live data) and by scripts/fetch-tse.mjs (bundled copy),
// so both paths produce exactly the same structure.

/** "47,027772356" → 47.027772356 */
export const num = value => {
  if (value == null || value === '') return 0;
  const n = Number(String(value).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const int = value => Math.round(num(value));

/** Status text the TSE gives to a candidate, simplified for badges. */
export function statusKind(status = '', elected = false) {
  const s = status.toLowerCase();
  if (s.includes('2º turno') || s.includes('2o turno')) return 'segundo-turno';
  if (s.startsWith('eleito') || s.includes('média') || s.includes('qp')) return 'eleito';
  if (s.includes('suplente')) return 'suplente';
  if (s.includes('não eleito') || s.includes('nao eleito')) return 'nao-eleito';
  if (elected) return 'eleito';
  return status ? 'outro' : 'pendente';
}

/**
 * Normalizes one "-u.json" results file (one office, one place).
 * `options.compact` drops long fields (full name, coalition) for offices with hundreds of candidates.
 */
export function normalizeResult(raw, { compact = false } = {}) {
  if (!raw || !Array.isArray(raw.carg) || !raw.carg.length) throw new Error('Arquivo do TSE sem resultados.');
  const office = raw.carg[0];
  const s = raw.s || {}, e = raw.e || {}, v = raw.v || {};
  const candidates = [];
  const parties = [];
  for (const group of office.agr || []) {
    const coalition = group.tp === 'c' ? group.nm : '';
    for (const party of group.par || []) {
      parties.push({ party: party.sg, number: party.n, votes: int(party.tvtn), legend: int(party.tvtl), name: party.nm });
      for (const c of party.cand || []) {
        const elected = c.e === 's';
        const candidate = {
          n: c.n,
          name: c.nmu || c.nm,
          party: party.sg,
          votes: int(c.vap),
          pct: num(c.pvapn ?? c.pvap),
          status: c.st || '',
          kind: statusKind(c.st, elected),
          elected,
          sq: c.sqcand,
        };
        if (c.dvt && c.dvt !== 'Válido') candidate.validity = c.dvt;
        if (!compact) {
          candidate.fullName = c.nm;
          if (coalition) candidate.coalition = coalition;
          if (group.com) candidate.composition = group.com;
          const vice = (c.vs || []).filter(x => x.tp === 'v').map(x => x.nmu || x.nm);
          if (vice.length) candidate.vice = vice[0];
          if (c.dt) candidate.birth = c.dt;
        }
        candidates.push(candidate);
      }
    }
  }
  candidates.sort((a, b) => b.votes - a.votes || (a.name > b.name ? 1 : -1));
  parties.sort((a, b) => b.votes - a.votes);
  return {
    election: raw.ele,
    round: Number(raw.t) || 1,
    office: office.cd,
    officeName: office.nmn,
    seats: Number(office.nv) || 1,
    quotient: int(office.qe),
    scope: raw.cdabr,
    scopeType: raw.tpabr,
    // "dt/ht" is when the TSE last totalized this place; "dg/hg" is when the file was generated.
    updated: [raw.dt, raw.ht].filter(Boolean).join(' '),
    generated: [raw.dg, raw.hg].filter(Boolean).join(' '),
    finished: raw.tf === 's',
    official: raw.f === 'o',
    sections: { total: int(s.ts), counted: int(s.st), pct: num(s.pstn ?? s.pst) },
    electorate: int(e.te),
    turnout: int(e.c),
    turnoutPct: num(e.pcn ?? e.pc),
    abstention: int(e.a),
    abstentionPct: num(e.pan ?? e.pa),
    totalVotes: int(v.tv),
    valid: int(v.vv),
    validPct: num(v.pvvcn ?? v.pvvc),
    blank: int(v.vb),
    blankPct: num(v.pvbn ?? v.pvb),
    null: int(v.tvn),
    nullPct: num(v.ptvnn ?? v.ptvn),
    annulled: int(v.van),
    legend: int(v.vl ?? 0),
    candidates,
    parties: compact ? parties.filter(p => p.votes > 0).map(({ party, votes, legend }) => ({ party, votes, legend })) : parties,
  };
}

/** Normalizes a "-ab.json" progress file: counting status per state or per municipality. */
export function normalizeProgress(raw) {
  const places = {};
  for (const a of raw.abr || []) {
    const s = a.s || {}, e = a.e || {};
    places[a.cdabr] = {
      updated: [a.dt, a.ht].filter(Boolean).join(' '),
      finished: a.and === 'f',
      sections: { total: int(s.ts), counted: int(s.st), pct: num(s.pstn ?? s.pst) },
      electorate: int(e.te),
      turnout: int(e.c),
      turnoutPct: num(e.pcn ?? e.pc),
      abstention: int(e.a),
      abstentionPct: num(e.pan ?? e.pa),
    };
  }
  return { generated: [raw.dg, raw.hg].filter(Boolean).join(' '), places };
}

/** "05/10/2026 12:51:05" (Brasília time) → Date */
export function parseTseDate(text) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}):(\d{2}))?/.exec(text || '');
  if (!m) return null;
  const [, d, mo, y, h = '00', mi = '00', se = '00'] = m;
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${se}-03:00`);
}
