import {routeCorridor} from "./corridor_route.js";
import {generationPlan} from "./generation_layout.js";
import {reviewAccess} from "./access_review.js";
import {checkRoomFit,suggestRoomLayout,suggestRoomSize} from './layout_analysis.js';
function draft(snapshot){const layout=generationPlan(snapshot.size,snapshot.replace,snapshot.state,snapshot.seed,snapshot);if(snapshot.openings===false){layout.doors=[];layout.windows=[];}return {ok:true,layout};}
self.onmessage=event=>{
 const {id,snapshot,mode}=event.data;
 try{self.postMessage({id,result:mode==='corridor'?routeCorridor(snapshot):mode==='size'?suggestRoomSize(snapshot):mode==='draft'?draft(snapshot):mode==='review'?{ok:true,review:reviewAccess(snapshot)}:mode==='check'?{ok:true,issues:checkRoomFit(snapshot),review:snapshot.access?reviewAccess({scene:snapshot.scene,...snapshot.access}):null}:suggestRoomLayout(snapshot,mode)});}
 catch(error){self.postMessage({id,result:{ok:false,reason:'analysis-error',message:error.message}});}
};
