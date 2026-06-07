import type { CompletedMatch } from 'src/services/matchmaking';

function csvEscape(value: string | number | undefined): string {
  const str = value === undefined || value === null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

interface BuildDuprCsvOptions {
  eventName: string;
  scoreType: 'RALLY' | 'SIDEOUT';
}

export function buildDuprCsv(
  matches: CompletedMatch[],
  options: BuildDuprCsvOptions,
): string {
  const header = [
    'matchType',
    'scoreType',
    'event',
    'date',
    'playerA1',
    'playerA1DuprId',
    'playerA2',
    'playerA2DuprId',
    'playerB1',
    'playerB1DuprId',
    'playerB2',
    'playerB2DuprId',
    'teamAGame1',
    'teamBGame1',
    'teamAGame2',
    'teamBGame2',
    'teamAGame3',
    'teamBGame3',
    'teamAGame4',
    'teamBGame4',
    'teamAGame5',
    'teamBGame5',
  ].join(',');

  const rows = matches.map((m) => {
    const dateStr = new Date(m.completedAt).toISOString().split('T')[0];
    const matchType = m.matchType === 'singles' ? 'S' : 'D';
    const a1 = m.teamA[0];
    const a2 = m.teamA[1];
    const b1 = m.teamB[0];
    const b2 = m.teamB[1];

    return [
      csvEscape(matchType),
      csvEscape(options.scoreType),
      csvEscape(options.eventName),
      csvEscape(dateStr),
      csvEscape(a1?.name || a1?.username || ''),
      csvEscape(a1?.duprId || ''),
      csvEscape(a2?.name || a2?.username || ''),
      csvEscape(a2?.duprId || ''),
      csvEscape(b1?.name || b1?.username || ''),
      csvEscape(b1?.duprId || ''),
      csvEscape(b2?.name || b2?.username || ''),
      csvEscape(b2?.duprId || ''),
      csvEscape(m.teamAScore),
      csvEscape(m.teamBScore),
      '', '', '', '', '', '', '', '', // games 2-5 blank
    ].join(',');
  });

  return [header, ...rows].join('\r\n');
}

export function downloadDuprCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
