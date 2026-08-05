'use strict';

const { BSI_COURSE_PROFILE_CARDS } = require('./bsi-course/course-profile');
const { BSI_CURRICULUM_CARDS } = require('./bsi-course/curriculum');
const { BSI_INFRASTRUCTURE_AND_COMMUNITY_CARDS } = require('./bsi-course/infrastructure-and-community');
const { BSI_ACADEMIC_PROCESSES_CARDS } = require('./bsi-course/academic-processes');

const BSI_COURSE_CARDS = Object.freeze([
  ...BSI_COURSE_PROFILE_CARDS,
  ...BSI_CURRICULUM_CARDS,
  ...BSI_INFRASTRUCTURE_AND_COMMUNITY_CARDS,
  ...BSI_ACADEMIC_PROCESSES_CARDS
]);

module.exports = { BSI_COURSE_CARDS };
