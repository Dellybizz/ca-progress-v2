import type { LocalWorkspace } from "../../../packages/mobile-data/src";

// Compiled only in CA_MOBILE_EMULATOR_FIXTURE builds. Never contains account data.
export const emulatorWorkspace: LocalWorkspace = {
  academic: {
    contextKey: "emulator-only",
    level: "Intermediate",
    attempt: "January 2027",
    subjects: [{id:"subject-fixture",slug:"accounting",title:"Accounting"}],
    chapters: [
      {id:"chapter-fixture-1",subjectId:"subject-fixture",number:"1",title:"Accounting standards"},
      {id:"chapter-fixture-2",subjectId:"subject-fixture",number:"2",title:"Company accounts"},
    ],
    attempts: [{key:"January 2027",label:"January 2027",examDate:null,verified:false}],
    lastUpdatedAt:"2026-09-27T00:00:00.000Z",
  },
  dashboard:{today:[],progress:{value:"1/2",hint:"Fixture"},community:[]},
  progress:[
    {localId:"progress-fixture-1",serverId:null,chapterId:"chapter-fixture-1",title:"Accounting standards",stage:"completed",understanding:70,state:"synced",payload:{completedAt:"2026-09-26T00:00:00.000Z"}},
    {localId:"progress-fixture-2",serverId:null,chapterId:"chapter-fixture-2",title:"Company accounts",stage:null,understanding:null,state:"synced",payload:{completedAt:null}},
  ],
  planner:[{localId:"task-fixture",serverId:null,title:"Revise accounting standards",dueAt:"2026-09-28T09:00:00.000Z",completedAt:null,kind:"task",state:"synced"}],
  notes:[{localId:"note-fixture",serverId:null,title:"Revision note",body:"Accounting standards summary",updatedAt:"2026-09-27T00:00:00.000Z",state:"synced"}],
  profile:{displayName:"Layout fixture",level:"Intermediate",group:"Group 1",attempt:"January 2027",timezone:"Asia/Kolkata",dailyTargetMinutes:90},
  activity:[],leaderboard:{rank:null,score:120,category:"overall"},buddies:[],pending:0,conflicts:0,lastSyncedAt:"2026-09-27T00:00:00.000Z",
};
