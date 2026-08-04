'use strict';
const { isProfessorAttendanceConfirmation } = require('../message-analysis');
function shouldBlockAttendanceQuestion(input) {
  if (input?.prepared?.intent === 'professor-attendance-confirmation') return true;
  return isProfessorAttendanceConfirmation(input);
}
module.exports = { shouldBlockAttendanceQuestion };
