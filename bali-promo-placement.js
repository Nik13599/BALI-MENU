/* Shared placement model for the promotion editor and the site builder.
 * Firestore already accepts {mode:"manual",x:int,y:int}. Named presets are
 * serialized in that established shape: no new Firebase rules needed.
 * Legacy modes left/center/right continue to mean their old bottom-row spots.
 */
export const PROMO_POSITION_PRESETS=Object.freeze({
  "top-left":Object.freeze({x:17,y:16}),
  "top-center":Object.freeze({x:50,y:16}),
  "top-right":Object.freeze({x:83,y:16}),
  "middle-left":Object.freeze({x:17,y:50}),
  "middle-center":Object.freeze({x:50,y:50}),
  "middle-right":Object.freeze({x:83,y:50}),
  "bottom-left":Object.freeze({x:17,y:82}),
  "bottom-center":Object.freeze({x:50,y:82}),
  "bottom-right":Object.freeze({x:83,y:82})
});
export const PROMO_POSITION_OPTIONS=Object.freeze([
  ["none","Скрыть кнопку"],
  ["top-left","Слева вверху"],
  ["top-center","По центру вверху"],
  ["top-right","Справа вверху"],
  ["middle-left","Слева по центру"],
  ["middle-center","По центру"],
  ["middle-right","Справа по центру"],
  ["bottom-left","Слева внизу"],
  ["bottom-center","По центру внизу"],
  ["bottom-right","Справа внизу"],
  ["manual","Произвольное положение (перетащить)"]
]);
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const numberOr=(value,fallback)=>{
  const n=Number(value);return Number.isFinite(n)?n:fallback;
};
export function promoEditorMode(stored){
  const mode=stored?.mode;
  if(mode==="none")return "none";
  if(mode==="left")return "bottom-left";
  if(mode==="center")return "bottom-center";
  if(mode==="right")return "bottom-right";
  if(mode==="manual"){
    const x=Math.round(numberOr(stored.x,50)),y=Math.round(numberOr(stored.y,82));
    const preset=Object.entries(PROMO_POSITION_PRESETS)
      .find(([,point])=>point.x===x&&point.y===y);
    return preset?.[0]||"manual";
  }
  return "bottom-center";
}
export function promoEditorXY(mode,x=50,y=82){
  const preset=PROMO_POSITION_PRESETS[mode];
  return preset
    ?{x:preset.x,y:preset.y}
    :{x:clamp(Math.round(numberOr(x,50)),5,95),
      y:clamp(Math.round(numberOr(y,82)),5,95)};
}
export function promoStorePlacement(mode,x=50,y=82){
  const coords=promoEditorXY(mode,x,y);
  // 'manual' keeps the exact numeric coordinates; 'none' hides hotspots too.
  return {mode:mode==="none"?"none":"manual",x:coords.x,y:coords.y};
}
