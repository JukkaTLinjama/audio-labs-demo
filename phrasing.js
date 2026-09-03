// Performance phrasing for the procedural program.
// This layer never creates notes: it only shapes timing, timbre, space and density.

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*clamp(t,0,1);
const cadenceEase=p=>p+.12*Math.sin(2*Math.PI*p);

export function getPhrasingState(barIndex,phaseInBar=0){
  const p=clamp(phaseInBar,0,1);

  let trebleDb;
  if(barIndex<4) trebleDb=lerp(-21,-18,(barIndex+p)/4);
  else if(barIndex<13) trebleDb=lerp(-18,-12,(barIndex-4+p)/9);
  else if(barIndex<16) trebleDb=lerp(-12,-14,(barIndex-13+p)/3);
  else if(barIndex<19) trebleDb=lerp(-15,-23,(barIndex-16+p)/3);
  else trebleDb=lerp(-23,-27,p);

  let reverbMix;
  // Space begins open, comes close through the middle, then recedes into the cadence.
  if(barIndex<5) reverbMix=lerp(.50,.55,(barIndex+p)/5);
  else if(barIndex<12) reverbMix=lerp(.55,.30,(barIndex-5+p)/7);
  else if(barIndex<16) reverbMix=lerp(.30,.48,(barIndex-12+p)/4);
  else if(barIndex<19) reverbMix=lerp(.48,.82,(barIndex-16+p)/3);
  else reverbMix=lerp(.82,.90,p);

  // Keep bars 1–19 at the base tempo. Ritardando exists only in the cadence bar.
  const tempoScale=barIndex<19?1:1+.42*cadenceEase(p);

  const pedalDensity=barIndex<8?.55:barIndex<16?.48:barIndex<19?.38:.25;
  const ornamentDensity=barIndex<13?1:barIndex<19?.75:.35;
  return{trebleDb,reverbMix,tempoScale,pedalDensity,ornamentDensity};
}

function keepOptional(event,phrase,rng){
  if(event.optional==='pedalSecondary')return rng()<phrase.pedalDensity;
  if(event.optional==='pedalOrnament')return rng()<phrase.pedalDensity*.55;
  if(event.optional==='ornament')return rng()<phrase.ornamentDensity;
  return true;
}

// Integrate the linearly increasing cadence tempo scale.
// The cadence slows immediately, then eases slightly through the middle while preserving total duration.
function performedLocalTime(local,bar,barIndex){
  if(barIndex<19)return local;
  const p=clamp(local/bar,0,1);
  return bar*(p+.21*p*p+.42*.12*(1-Math.cos(2*Math.PI*p))/(2*Math.PI));
}

export function getPerformedBarStarts({bar,totalBars}){
  const starts=[0];
  for(let i=0;i<totalBars;i++){
    const duration=i<19?bar:performedLocalTime(bar,bar,i);
    starts.push(starts[i]+duration);
  }
  return starts;
}

export function applyPhrasing(events,{bar,totalBars,rng=Math.random}){
  const starts=getPerformedBarStarts({bar,totalBars});
  return events.flatMap(event=>{
    const sourceBar=Math.min(totalBars-1,Math.max(0,Math.floor(event.start/bar)));
    const sourceBarStart=sourceBar*bar;
    const local=event.start-sourceBarStart;
    const phase=clamp(local/bar,0,1);
    const phrase=getPhrasingState(sourceBar,phase);
    if(!keepOptional(event,phrase,rng))return[];
    const start=starts[sourceBar]+performedLocalTime(local,bar,sourceBar);
    const dur=event.dur*phrase.tempoScale;
    return[{...event,start,dur,phrase}];
  }).sort((a,b)=>a.start-b.start);
}

export function getPerformedLoopDuration({bar,totalBars}){
  const starts=getPerformedBarStarts({bar,totalBars});
  return starts[starts.length-1];
}
