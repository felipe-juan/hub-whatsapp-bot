'use strict';

const OFFICIAL_SCHEDULE_URL = 'https://ifbaedubr-my.sharepoint.com/:x:/g/personal/rodrigobonfim_ifba_edu_br/IQCqjeOoMcvWQoiikRSUwWOxAZSOwJaih1qWmWFq5Vxa73Y?rtime=aTN-B0Ly3kg';

module.exports = {
  id: '01513-transcription-fragments-source',
  up(db) {
    const table = name => db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
    if (table('professor_schedule_entries')) {
      db.prepare(`UPDATE professor_schedule_entries SET source_title=?
        WHERE academic_period='2026.2' AND (
          source_title LIKE '%Horários Docentes 2026%'
          OR source_title LIKE '%Horarios Docentes 2026%'
          OR source_title LIKE '2026-07-09%'
        )`).run(OFFICIAL_SCHEDULE_URL);
    }
    if (table('academic_data_imports')) {
      db.prepare(`UPDATE academic_data_imports SET source_title=?
        WHERE academic_period='2026.2' AND (
          source_title LIKE '%Horários Docentes 2026%'
          OR source_title LIKE '%Horarios Docentes 2026%'
          OR source_title LIKE '2026-07-09%'
        )`).run(OFFICIAL_SCHEDULE_URL);
    }
  }
};
