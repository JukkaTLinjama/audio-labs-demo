// Bach BWV 846 composition data and musical variation rules.
// Keep note choices separate from phrasing, synthesis and Web Audio scheduling.

export const BAR=3.0;
export const STEP=BAR/16;
export const MAIN_BARS=19;
export const TOTAL_BARS=20;
export const SCORE_LOOP=BAR*TOTAL_BARS;

const NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const SEMI={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
export function midi(note){const m=/^([A-G])(#|b)?(\d)$/.exec(note);let s=SEMI[m[1]]+(m[2]==='#'?1:m[2]==='b'?-1:0);return(+m[3]+1)*12+s}
export function noteFromMidi(value){return NAMES[(value%12+12)%12]+(Math.floor(value/12)-1)}
export const transposeSemis=(note,semis)=>noteFromMidi(midi(note)+semis);
export const transposeOct=(note,octaves)=>transposeSemis(note,octaves*12);
const randomChoice=(values,rng=Math.random)=>values[Math.floor(rng()*values.length)];

// EN: Stable seeds make offline reference measurements reproducible across sessions.
export function createSeededRandom(seed){
  let state=seed>>>0;
  return()=>{
    state+=0x6D2B79F5;
    let value=state;
    value=Math.imul(value^(value>>>15),value|1);
    value^=value+Math.imul(value^(value>>>7),value|61);
    return((value^(value>>>14))>>>0)/4294967296;
  };
}

// Bars 1–19 of BWV 846, expanded into Bach's repeated 16th-note broken-chord pattern.
const CHORDS=[
['C4','E4','G4','C5','E5'],['C4','D4','A4','D5','F5'],['B3','D4','G4','D5','F5'],['C4','E4','G4','C5','E5'],
['C4','E4','A4','E5','A5'],['C4','D4','F#4','A4','D5'],['B3','D4','G4','D5','G5'],['B3','C4','E4','G4','C5'],
['A3','C4','E4','G4','C5'],['D3','A3','D4','F#4','C5'],['G3','B3','D4','G4','B4'],['G3','A#3','E4','G4','C#5'],
['F3','A3','D4','A4','D5'],['F3','G#3','D4','F4','B4'],['E3','G3','C4','G4','C5'],['E3','F3','A3','C4','F4'],
['D3','F3','A3','C4','F4'],['G2','D3','G3','B3','F4'],['C3','E3','G3','C4','E4']
];
const expandChord=([a,b,c,d,e])=>[a,b,c,d,e,c,d,e,a,b,c,d,e,c,d,e];
export const BARS=CHORDS.map(expandChord);

export const CADENCE={sourceBar:18,dropFirst:3,finalNote:'C3',finalDuration:BAR*.58};

export function createBarPlan(bar,barIndex,rng=Math.random){
  const barStart=barIndex*BAR,events=[];
  // Sparse treble pickup: a 16th-note triplet only on beat 1 or beat 3.
  const pickup=rng()<.22?{idx:randomChoice([0,8],rng),dir:rng()<.5?-1:1}:null;
  // EN: Remove the bright bar-end accent while keeping the Main Bell harmony continuous.
  const trebleTailOmit=rng()<.70?1:2;
  bar.forEach((note,i)=>{
    const baseDur=i===0?4*STEP:STEP*.9,start=barStart+i*STEP;
    // The first two bell notes occasionally ring as a light harmonic foundation.
    const bellDur=(i<2?randomChoice([2,3,4,5,6,8],rng)*STEP:baseDur)*1.4;
    // Do not let a sustained treble note mask the pickup that replaces it.
    const trebleDur=pickup&&i===pickup.idx?STEP*.6:baseDur*.78;
    const timingOffset=i===0?Math.random()*.008:(Math.random()*2-1)*.008;
    events.push({inst:'bell',note,start,dur:bellDur,timingOffset});
    if(i<bar.length-trebleTailOmit)events.push({inst:'treble',sourceNote:note,start,dur:trebleDur,timingOffset});
  });
  if(pickup){
    const {idx,dir}=pickup,start=barStart+idx*STEP,dt=STEP*2/3,dur=dt*.9;
    events.push(
      {inst:'ornTreble',sourceNote:bar[idx],ornamentOffset:0,start,dur,optional:'ornament'},
      {inst:'ornTreble',sourceNote:bar[idx],ornamentOffset:dir,start:start+dt,dur,optional:'ornament'},
      {inst:'ornTreble',sourceNote:bar[idx],ornamentOffset:0,start:start+2*dt,dur,optional:'ornament'}
    );
  }

  // Primary pedal is the stable harmonic anchor.
  const primary={inst:'bass',note:transposeOct(bar[0],-1),start:barStart,dur:BAR*.34};
  events.push(primary);

  // An occasional second pedal gives bass motion, only on beat 2 or beat 3.
  if(rng()<.18){
    const candidates=[...new Set(bar.slice(1,6))];
    events.push({inst:'bass2',note:transposeOct(randomChoice(candidates,rng),-1),start:barStart+randomChoice([4,12],rng)*STEP,dur:BAR*.28});
  }
  return events;
}

const SUB_RELEASE=.8;

export function createSubPlan(rng=Math.random){
  const events=[];
  // EN: A program always contains 2–5 sustained organ points, never in its first two bars.
  const targetCount=2+Math.floor(rng()*4);
  const usableBars=MAIN_BARS-2;
  for(let slot=0;slot<targetCount;slot++){
    const totalBars=rng()<.5?1.5:2;
    // EN: Each point stays inside its own segment, guaranteeing the requested 2–5 non-overlapping points.
    const segmentStart=2+slot*usableBars/targetCount;
    const segmentEnd=2+(slot+1)*usableBars/targetCount;
    const minStart=Math.ceil(segmentStart);
    const maxStart=Math.floor(segmentEnd-totalBars);
    const index=minStart+Math.floor(rng()*(Math.max(minStart,maxStart)-minStart+1));
    const start=index*BAR;
    // Duration excludes the envelope release, so audible duration is 1.5–2 bars.
    events.push({inst:'sub',note:transposeOct(BARS[index][0],-2),start,dur:Math.max(.1,totalBars*BAR-SUB_RELEASE),totalBars});
  }
  return events.map(({totalBars,...event})=>event);
}

export function createCadencePlan(rng=Math.random){
  const events=[],barStart=MAIN_BARS*BAR;
  // Reverse the first half of bar 19, drop the first three notes and omit the ending C;
  // the only final C is the sustained resolution below.
  const source=BARS[CADENCE.sourceBar].slice(0,8).reverse().slice(CADENCE.dropFirst).slice(0,-1);
  source.forEach((note,i)=>events.push(
    {inst:'outro',note,start:barStart+i*STEP,dur:STEP*.82},
    {inst:'treble',sourceNote:note,start:barStart+i*STEP,dur:STEP*.64}
  ));

  const finalStart=barStart+source.length*STEP,finalNote=CADENCE.finalNote,finalDur=CADENCE.finalDuration;
  events.push({inst:'outroFinal',note:finalNote,start:finalStart,dur:finalDur},{inst:'treble',sourceNote:finalNote,start:finalStart,dur:finalDur*.85});

  // Cadence pedal pickup is a clear triplet before a short resolving organ point.
  const pedal=transposeOct(finalNote,-1),dir=rng()<.5?-1:1,dt=BAR/12,shortDur=dt*.9;
  events.push(
    {inst:'ornBass',note:pedal,start:finalStart,dur:shortDur},
    {inst:'ornBass',note:transposeSemis(pedal,dir),start:finalStart+dt,dur:shortDur},
    {inst:'ornBass',note:pedal,start:finalStart+2*dt,dur:shortDur},
    // Start on cadence note 2; sustain plus release totals approximately half a bar.
    {inst:'sub',note:transposeOct(finalNote,-2),start:barStart+BAR/4,dur:BAR*.5}
  );
  return events;
}

export function createScorePlan(rng=Math.random){
  const subEvents=createSubPlan(rng);
  const overlapsSub=event=>subEvents.some(sub=>{
    const subEnd=sub.start+sub.dur+SUB_RELEASE;
    return event.start<subEnd&&event.start+event.dur>sub.start;
  });
  // Primary pedal continues under a sub point; only the extra secondary pedal is suppressed.
  const mainEvents=BARS.flatMap((bar,index)=>createBarPlan(bar,index,rng)).filter(event=>event.inst!=='bass2'||!overlapsSub(event));
  return [...mainEvents,...subEvents,...createCadencePlan(rng)].sort((a,b)=>a.start-b.start);
}
