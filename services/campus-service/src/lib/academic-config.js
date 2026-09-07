

const DAY_MS = 24 * 60 * 60 * 1000;

const JWXS_ORIGIN = "https://newjwxs.hgu.edu.cn";

const JWXS_TIMETABLE_URL = `${JWXS_ORIGIN}/student/courseSelect/courseSelectResult/index`;

const JWXS_CURRICULUM_URL = `${JWXS_ORIGIN}/student/courseSelect/thisSemesterCurriculum/callback`;

const JWXS_CURRENT_TIMETABLE_URL = `${JWXS_ORIGIN}/student/courseSelect/thisSemesterCurriculum/index`;

const JWXS_CURRENT_SCHEDULE_URL = `${JWXS_ORIGIN}/student/courseSelect/thisSemesterCurriculum/ajaxStudentSchedule/callback`;

const JWXS_SCHOOL_CALENDAR_URL = `${JWXS_ORIGIN}/indexCalendar`;

const JWXS_ACADEMIC_STATUS_URL = `${JWXS_ORIGIN}/main/checkSelectCourseStatus`;

const JWXS_GPA_HOME_URL = `${JWXS_ORIGIN}/`;

const JWXS_GPA_MORE_URL = `${JWXS_ORIGIN}/main/showMoreGPA`;

const ACADEMIC_TIMETABLE_SOURCES = {
  current: {
    key: "current",
    label: "本学期课表",
    pageUrl: JWXS_CURRENT_TIMETABLE_URL,
    payloadUrl: JWXS_CURRENT_SCHEDULE_URL,
    cacheFile: "academic-timetable-current-cache.json"
  },
  selection: {
    key: "selection",
    label: "选课结果",
    pageUrl: JWXS_TIMETABLE_URL,
    payloadUrl: JWXS_CURRICULUM_URL,
    cacheFile: "academic-timetable-cache.json"
  }
};

const JWXS_FREE_CLASSROOM_INDEX_URL = `${JWXS_ORIGIN}/student/teachingResources/freeClassroom/index`;

const JWXS_FREE_CLASSROOM_TODAY_URL = `${JWXS_ORIGIN}/student/teachingResources/freeClassroom/today`;

const JWXS_EVALUATION_INDEX_URL = `${JWXS_ORIGIN}/student/teachingEvaluation/newEvaluation/index`;

const JWXS_EVALUATION_LIST_URL = `${JWXS_ORIGIN}/student/teachingAssessment/evaluation/queryAll`;

const JWXS_EVALUATION_SAVE_URL = `${JWXS_ORIGIN}/student/teachingAssessment/baseInformation/questionsAdd/doSave`;

const JWXS_LOGIN_URL = `${JWXS_ORIGIN}/login`;

export { DAY_MS, JWXS_ORIGIN, JWXS_TIMETABLE_URL, JWXS_CURRICULUM_URL, JWXS_SCHOOL_CALENDAR_URL, JWXS_ACADEMIC_STATUS_URL, JWXS_GPA_HOME_URL, JWXS_GPA_MORE_URL, ACADEMIC_TIMETABLE_SOURCES, JWXS_FREE_CLASSROOM_INDEX_URL, JWXS_FREE_CLASSROOM_TODAY_URL, JWXS_EVALUATION_INDEX_URL, JWXS_EVALUATION_LIST_URL, JWXS_EVALUATION_SAVE_URL, JWXS_LOGIN_URL };
