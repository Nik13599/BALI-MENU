/* Calendar month range and event state use Minsk (+03:00) time. */
(()=>{"use strict";
const DAY=86400000;
const nowDate=(at=Date.now())=>new Date(at+3*3600000).toISOString().slice(0,10);
const state=(event,at=Date.now())=>{
 const d=event?.date||"",s=event?.startTime||"",e=event?.endTime||"";
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return "upcoming";
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(e))
   return d<nowDate(at)?"past":"upcoming";
 const begin=Date.parse(d+"T"+s+":00+03:00");
 const finish=Date.parse(d+"T"+e+":00+03:00")+(e<=s?DAY:0);
 return at<begin?"upcoming":at<finish?"live":"past";
};
// Home keeps an event visible for one full hour AFTER its actual end.
// Calendar statuses still switch to "past" at the precise end time.
const homeVisible=(event,at=Date.now())=>{
 const d=event?.date||"",s=event?.startTime||"",e=event?.endTime||"";
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return false;
 const validTime=/^([01]\d|2[0-3]):[0-5]\d$/;
 if(!validTime.test(s)||!validTime.test(e))return state(event,at)!=="past";
 const finish=Date.parse(d+"T"+e+":00+03:00")+(e<=s?DAY:0);
 return Number.isFinite(finish)&&at<finish+3600000;
};
const monthRange=(year,month)=>{
 const date=n=>new Date(Date.UTC(year,month-1,n)).toISOString().slice(0,10);
 const offset=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7;
 const cells=Math.ceil((offset+new Date(Date.UTC(year,month,0)).getUTCDate())/7)*7;
 return {year,month,start:date(1-offset),end:date(cells-offset),cells};
};
const visibleToday=()=>{const d=nowDate();return monthRange(+d.slice(0,4),+d.slice(5,7))};
const colors=Object.freeze({upcoming:"#b9ff51",live:"#f4c84b",past:"#fa6070"});
window.BaliEventLifecycle=Object.freeze({state,homeVisible,monthRange,visibleToday,nowDate,colors});
})();