'use strict';
const { classifyProfessorLocationRequest } = require('../professor-location');
const { classifySectorRequest, classifySectorFollowUp } = require('../sector-directory');
const { classifyGuidedFlow } = require('../guided-flows');
const { classifySemesterScheduleRequest } = require('../semester-schedule');
function classifyIntent(text, context = {}) {
  return {
    professor_location: classifyProfessorLocationRequest(text),
    sector: classifySectorRequest(text) || classifySectorFollowUp(text, context),
    guided_flow: classifyGuidedFlow(text),
    semester_schedule: classifySemesterScheduleRequest(text)
  };
}
module.exports = { classifyIntent };
