export const IMPLEMENTED_PAID_SURFACES = Object.freeze([
  Object.freeze({ key: "planner-calendar", route: "app/api/planner/calendar/route.ts", featureKey: "advanced_planner_calendar", scope: "all_mutations" }),
  Object.freeze({ key: "planner-goals", route: "app/api/planner/goals/route.ts", featureKey: "detailed_goals_reports", scope: "all_mutations" }),
  Object.freeze({ key: "notification-preferences", route: "app/api/planner/notifications/route.ts", featureKey: "customisation_reminders", scope: "preferences_only" }),
  Object.freeze({ key: "expanded-study-buddy", route: "app/api/study-buddy/route.ts", featureKey: "expanded_study_buddy", scope: "advanced_actions_only" }),
  Object.freeze({ key: "study-csv", route: "app/api/exports/study/route.ts", featureKey: "study_csv", scope: "download" }),
  Object.freeze({ key: "test-history-csv", route: "app/api/exports/tests/route.ts", featureKey: "test_history_csv", scope: "download" }),
  Object.freeze({ key: "full-backup", route: "app/api/exports/backup/route.ts", featureKey: "full_backup", scope: "download" }),
]);

export const NOT_YET_IMPLEMENTED_PAID_FEATURES = Object.freeze([
  "streak_freeze",
  "richer_notes",
  "larger_test_archive",
  "advanced_preparation",
  "advanced_forecasts_insights",
  "full_historical_insights",
  "advanced_recovery_planning",
]);
