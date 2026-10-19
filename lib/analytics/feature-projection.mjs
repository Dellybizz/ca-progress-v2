// Basic summaries and the baseline forecast remain available to every plan.
export function analyticsForAccess(model,allowed){
 if(model.mode!=='ready')return model;
 if(allowed===true)return {...model,advancedAccess:true};
 return {...model,advancedAccess:false,consistency:[],lowestUnderstanding:null,highestTest:null,recentTest:null,mostOverdueRevision:null,readiness:[]};
}
