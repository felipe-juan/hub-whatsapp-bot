'use strict';

// Exceções verificadas que podem alterar a resposta do quadro semanal.
// Eventos do campus têm precedência sobre referências federais gerais.
const FEDERAL_SOURCE_TITLE = 'Portaria MGI nº 11.460/2025 — feriados e pontos facultativos de 2026';
const FEDERAL_SOURCE_URL = 'https://www.gov.br/gestao/pt-br/assuntos/noticias/2025/dezembro/confira-o-calendario-oficial-de-feriados-nacionais-e-pontos-facultativos-em-2026';

function nationalHoliday(date, title) {
  return {
    key: `feriado-nacional-${date}`, event_type: 'no_classes', start_date: date, end_date: date,
    title, description: 'Feriado nacional; o quadro semanal regular não deve ser exibido como aula normal.',
    course: 'todos', source_title: FEDERAL_SOURCE_TITLE, source_url: FEDERAL_SOURCE_URL, verified_at: '2026-08-03'
  };
}
function federalOptionalDay(date, title, startMinutes = null, endMinutes = null) {
  return {
    key: `ponto-facultativo-${date}-${startMinutes ?? 'dia'}`, event_type: 'warning', start_date: date, end_date: date,
    title, description: 'Ponto facultativo federal. A confirmação de aulas depende do calendário acadêmico ou de comunicado específico do campus.',
    course: 'todos', start_minutes: startMinutes, end_minutes: endMinutes,
    source_title: FEDERAL_SOURCE_TITLE, source_url: FEDERAL_SOURCE_URL, verified_at: '2026-08-03'
  };
}

const ACADEMIC_CALENDAR_EVENTS_2026 = Object.freeze([
  {
    key: 'ifba-vca-2026-03-25-reunioes', event_type: 'no_classes', start_date: '2026-03-25', end_date: '2026-03-25',
    title: 'Reuniões institucionais — sem aulas', description: 'Não haverá aulas em todos os turnos.',
    course: 'todos', source_title: 'Nota à comunidade acadêmica — IFBA Vitória da Conquista',
    source_url: 'https://portal.ifba.edu.br/conquista/nota-a-comunidade-academica', verified_at: '2026-08-03'
  },
  {
    key: 'ifba-vca-2026-06-29-copa', event_type: 'partial_no_classes', start_date: '2026-06-29', end_date: '2026-06-29',
    title: 'Funcionamento especial em 29 de junho', description: 'Atividades acadêmicas encerradas a partir das 11h; turnos vespertino e noturno suspensos. O matutino teve horários ajustados.',
    course: 'todos', start_minutes: 660,
    source_title: 'Nota sobre o funcionamento do campus em 29 de junho — IFBA Vitória da Conquista',
    source_url: 'https://portal.ifba.edu.br/conquista/nota-a-comunidade-divulgada-portaria-sobre-o-funcionamento-do-campus-nesta-segunda-feira-29-de-junho', verified_at: '2026-08-03'
  },
  ...[
    ['2026-01-01', 'Confraternização Universal'],
    ['2026-04-03', 'Paixão de Cristo'],
    ['2026-04-21', 'Tiradentes'],
    ['2026-05-01', 'Dia Mundial do Trabalho'],
    ['2026-09-07', 'Independência do Brasil'],
    ['2026-10-12', 'Nossa Senhora Aparecida'],
    ['2026-11-02', 'Finados'],
    ['2026-11-15', 'Proclamação da República'],
    ['2026-11-20', 'Dia Nacional de Zumbi e da Consciência Negra'],
    ['2026-12-25', 'Natal']
  ].map(([date, title]) => nationalHoliday(date, title)),
  federalOptionalDay('2026-02-16', 'Carnaval — ponto facultativo'),
  federalOptionalDay('2026-02-17', 'Carnaval — ponto facultativo'),
  federalOptionalDay('2026-02-18', 'Quarta-feira de Cinzas — ponto facultativo até as 14h', 0, 840),
  federalOptionalDay('2026-04-20', 'Ponto facultativo federal'),
  federalOptionalDay('2026-06-04', 'Corpus Christi — ponto facultativo'),
  federalOptionalDay('2026-06-05', 'Ponto facultativo federal'),
  federalOptionalDay('2026-10-28', 'Dia do Servidor Público federal'),
  federalOptionalDay('2026-12-24', 'Véspera do Natal — ponto facultativo após as 13h', 780),
  federalOptionalDay('2026-12-31', 'Véspera do Ano Novo — ponto facultativo após as 13h', 780)
]);

module.exports = { ACADEMIC_CALENDAR_EVENTS_2026 };
