import type {StudyBuddyDashboard} from './study-buddy-workspace';
import type {StudyBuddyComparisonItem,StudyBuddyOwnerSummary} from '@/lib/study-buddy/comparison';
const sharing={shareProfile:true,shareProgress:true,shareStreak:false,shareGoals:true,shareStudyStatus:false};
export const sampleBuddyDashboard:StudyBuddyDashboard={
  buddies:[
    {relationshipId:'sample-relationship-a',userId:'sample-ayesha',displayName:'Ayesha Khan',mySharing:sharing,buddySharing:sharing,muted:false,accountability:{caLevel:'intermediate',attemptKey:'2027-05',weekStudyMinutes:620},studyTogether:null,goals:[{id:'sample-goal',title:'Build consistency',week_start:'2026-10-12',target_minutes_per_person:900,status:'active',contributions:{'preview-owner':750,'sample-ayesha':620}}]},
    {relationshipId:'sample-relationship-b',userId:'sample-saad',displayName:'Saad Malik',mySharing:sharing,buddySharing:sharing,muted:false,accountability:{caLevel:'final',attemptKey:'2027-05',weekStudyMinutes:430},studyTogether:null,goals:[]},
  ],
  incomingRequests:[{relationshipId:'sample-request',userId:'sample-riya',displayName:'Riya Sharma',requestedAt:'2026-10-14T03:00:00Z'}],
  outgoingRequests:[],
  recentNudges:[{id:'sample-nudge',sender_user_id:'sample-ayesha',sender_display_name:'Ayesha Khan',message:'Keep going — one session at a time.',created_at:'2026-10-14T03:50:00Z'}],
  nudgeLimitPer24Hours:3,
};
export const sampleBuddyComparison:StudyBuddyComparisonItem[]=[
  {relationshipId:'sample-relationship-a',userId:'sample-ayesha',displayName:'Ayesha Khan',todayStudyMinutes:105,weekStudyMinutes:620,weeklyTargetMinutes:900,currentStreakDays:null},
  {relationshipId:'sample-relationship-b',userId:'sample-saad',displayName:'Saad Malik',todayStudyMinutes:50,weekStudyMinutes:430,weeklyTargetMinutes:null,currentStreakDays:null},
];
export const sampleOwnerSummary:StudyBuddyOwnerSummary={todayStudyMinutes:130,weekStudyMinutes:750,currentStreakDays:42};
