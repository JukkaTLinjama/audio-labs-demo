// Reusable procedural music source for Web Audio labs.
// The host application owns the AudioContext and UI.

import { BAR, STEP, TOTAL_BARS, MAIN_BARS, createScorePlan, createSeededRandom } from './bach-program.js?v=2.0.1';
import { applyPhrasing, getPerformedLoopDuration, getPerformedBarStarts } from './phrasing.js?v=2.0.1';
import { createInstruments, COMMITTED_MIX } from './instruments.js?v=2.0.1';

export { COMMITTED_MIX };
// EN: Engine-to-host reference established from committed offline renders; not a musical mix control.
export const COMMITTED_NOMINAL_OUTPUT_DB=26;

const LOOKAHEAD_MS = 100;
const AHEAD = 0.35;
const LOOP = getPerformedLoopDuration({ bar: BAR, totalBars: TOTAL_BARS });
const BAR_STARTS = getPerformedBarStarts({ bar: BAR, totalBars: TOTAL_BARS });
const db = value => Math.pow(10, value / 20);


const OFFLINE_SEEDS=[846,1729,2718,3141,5772,6283,7919,9265];
const dbEnergy=value=>10*Math.log10(Math.max(value,1e-12));
const median=values=>{const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;};
function applyBiquad(samples,coefficients){
  const {b0,b1,b2,a1,a2}=coefficients;
  const output=new Float32Array(samples.length);
  let x1=0,x2=0,y1=0,y2=0;
  for(let i=0;i<samples.length;i++){const x=samples[i],y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2;output[i]=y;x2=x1;x1=x;y2=y1;y1=y;}
  return output;
}
function rbjFilter(type,frequency,q,sampleRate){
  const omega=2*Math.PI*frequency/sampleRate,cos=Math.cos(omega),alpha=Math.sin(omega)/(2*q);
  let b0,b1,b2,a0=1+alpha,a1=-2*cos,a2=1-alpha;
  if(type==='highpass'){b0=(1+cos)/2;b1=-(1+cos);b2=(1+cos)/2;}
  else {b0=(1-cos)/2;b1=1-cos;b2=(1-cos)/2;}
  return{b0:b0/a0,b1:b1/a0,b2:b2/a0,a1:a1/a0,a2:a2/a0};
}
const K_SHELF={b0:1.53512485958697,b1:-2.69169618940638,b2:1.19839281085285,a1:-1.69065929318241,a2:.73248077421585};
const K_HIGHPASS={b0:1,b1:-2,b2:1,a1:-1.99004745483398,a2:.99007225036621};
function integratedLufs(channels,sampleRate){
  const weighted=channels.map(channel=>applyBiquad(applyBiquad(channel,K_SHELF),K_HIGHPASS));
  const block=Math.round(sampleRate*.4),hop=Math.round(sampleRate*.1),energies=[];
  for(let start=0;start+block<=weighted[0].length;start+=hop){let sum=0;for(const channel of weighted)for(let i=start;i<start+block;i++)sum+=channel[i]*channel[i];energies.push(sum/(block*weighted.length));}
  const absolute=energies.filter(energy=>dbEnergy(energy)-.691>=-70);
  if(!absolute.length)return -Infinity;
  const ungated=-.691+dbEnergy(absolute.reduce((sum,value)=>sum+value,0)/absolute.length);
  const relative=absolute.filter(energy=>-.691+dbEnergy(energy)>=ungated-10);
  return relative.length?-.691+dbEnergy(relative.reduce((sum,value)=>sum+value,0)/relative.length):-Infinity;
}
function analyseBuffer(buffer){
  const channels=Array.from({length:buffer.numberOfChannels},(_,index)=>buffer.getChannelData(index));
  let total=0,peak=0,peakFrame=0;
  for(const channel of channels)for(let frame=0;frame<channel.length;frame++){const sample=channel[frame];total+=sample*sample;if(Math.abs(sample)>peak){peak=Math.abs(sample);peakFrame=frame;}}
  const lowChannels=channels.map(channel=>applyBiquad(applyBiquad(channel,rbjFilter('highpass',20,.7,buffer.sampleRate)),rbjFilter('lowpass',120,.7,buffer.sampleRate)));
  let lowTotal=0;for(const channel of lowChannels)for(const sample of channel)lowTotal+=sample*sample;
  return{lufs:integratedLufs(channels,buffer.sampleRate),peakDbfs:20*Math.log10(Math.max(peak,1e-12)),peakTimeSec:peakFrame/buffer.sampleRate,rmsDbfs:dbEnergy(total/(buffer.length*channels.length)),lowBandRmsDbfs:dbEnergy(lowTotal/(buffer.length*lowChannels.length))};
}
// EN: Silent offline renders use committed defaults and fixed seeds, never browser-restored audition values.
export async function measureCommittedMix({seeds=OFFLINE_SEEDS,sampleRate=48000}={}){
  const Offline=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
  if(!Offline)throw new Error('OfflineAudioContext is not available in this browser.');
  const measurements=[];
  for(const seed of seeds){
    const context=new Offline(2,Math.ceil(LOOP*sampleRate),sampleRate);
    const rng=createSeededRandom(seed);
    const instruments=createInstruments(context,context.destination,{random:rng});
    instruments.setParams(COMMITTED_MIX);
    const events=applyPhrasing(createScorePlan(rng),{bar:BAR,totalBars:TOTAL_BARS,rng});
    events.forEach(event=>instruments.playEvent(event,event.start));
    measurements.push(analyseBuffer(await context.startRendering()));
  }
  const summary={};
  for(const key of ['lufs','peakDbfs','rmsDbfs','lowBandRmsDbfs']){
    const values=measurements.map(item=>item[key]);
    summary[key]={median:median(values),min:Math.min(...values),max:Math.max(...values)};
  }
  const worstPeak=measurements.reduce((worst,measurement,index)=>measurement.peakDbfs>worst.peakDbfs?{...measurement,variation:index+1,seed:seeds[index]}:worst,{peakDbfs:-Infinity});
  return{seeds:[...seeds],measurements,summary,worstPeak};
}


export function createProgramSource(ctx) {
  // Stable program-source reference level for host applications.
  // This sits after the musical mix, so it preserves stem balance.
  const nominalOutput = ctx.createGain();
  const output = ctx.createGain();
  nominalOutput.connect(output);
  nominalOutput.gain.value = db(COMMITTED_NOMINAL_OUTPUT_DB);

  // Parallel K-weighted metering tap; it never affects the audible output.
  const meterHp = ctx.createBiquadFilter();
  const meterShelf = ctx.createBiquadFilter();
  const meterAnalyser = ctx.createAnalyser();
  const outputAnalyser = ctx.createAnalyser();
  const lowHp = ctx.createBiquadFilter();
  const lowLp = ctx.createBiquadFilter();
  const lowAnalyser = ctx.createAnalyser();
  meterHp.type = 'highpass'; meterHp.frequency.value = 38; meterHp.Q.value = 0.5;
  meterShelf.type = 'highshelf'; meterShelf.frequency.value = 1500; meterShelf.gain.value = 4;
  meterAnalyser.fftSize = outputAnalyser.fftSize = lowAnalyser.fftSize = 2048;
  lowHp.type = 'highpass'; lowHp.frequency.value = 20; lowHp.Q.value = 0.7;
  lowLp.type = 'lowpass'; lowLp.frequency.value = 120; lowLp.Q.value = 0.7;
  output.connect(meterHp); meterHp.connect(meterShelf); meterShelf.connect(meterAnalyser);
  output.connect(outputAnalyser);
  output.connect(lowHp); lowHp.connect(lowLp); lowLp.connect(lowAnalyser);

  const instruments = createInstruments(ctx, nominalOutput);
  let running = false;
  let loopStart = 0;
  let timer = null;
  let paramRevision = 0;
  const plans = new Map();
  let stoppedEvents = null;

  function makePlan() {
    const score = createScorePlan();
    const events = applyPhrasing(score, { bar: BAR, totalBars: TOTAL_BARS });
    return { events, cursor: 0 };
  }

  function ensurePlan(loopIndex) {
    if (!plans.has(loopIndex)) plans.set(loopIndex, makePlan());
    return plans.get(loopIndex);
  }

  function scheduleWindow() {
    if (!running) return;
    const now = ctx.currentTime;
    const horizon = now + AHEAD;
    const lastLoop = Math.max(0, Math.floor((horizon - loopStart) / LOOP));

    for (let loopIndex = Math.max(0, lastLoop - 1); loopIndex <= lastLoop; loopIndex++) {
      const plan = ensurePlan(loopIndex);
      const base = loopStart + loopIndex * LOOP;
      while (plan.cursor < plan.events.length) {
        const event = plan.events[plan.cursor];
        const when = base + event.start;
        if (when > horizon) break;
        if (when >= now - 0.03) instruments.playEvent(event, when);
        plan.cursor++;
      }
    }

    const current = Math.max(0, Math.floor((now - loopStart) / LOOP));
    for (const key of plans.keys()) if (key < current - 1) plans.delete(key);
  }

  function currentLoopIndex() {
    return Math.max(0, Math.floor((ctx.currentTime - loopStart) / LOOP));
  }

  return {
    output,
    connect(node) { output.connect(node); return this; },
    disconnect() { output.disconnect(); },
    start(when = ctx.currentTime + 0.12, position = 0) {
      if (running) return;
      running = true;
      loopStart = when - Math.max(0, Math.min(LOOP - 0.001, position));
      plans.clear();
      // Reuse the stopped plan so auditioning from the roll keeps the same variation.
      if (stoppedEvents) plans.set(0, { events: stoppedEvents, cursor: 0 });
      ensurePlan(0);
      scheduleWindow();
      timer = setInterval(scheduleWindow, LOOKAHEAD_MS);
    },
    stop() {
      if (running) stoppedEvents = ensurePlan(currentLoopIndex()).events;
      running = false;
      if (timer) clearInterval(timer);
      timer = null;
      plans.clear();
    },
    // EN: Keep Stop → Start repeatable; a new randomized score is requested explicitly.
    queueNewVariation() {
      if (running) return false;
      stoppedEvents = null;
      plans.clear();
      return true;
    },
    setParam(name, value) {
      const ok = instruments.setParam(name, value);
      if (ok) paramRevision++;
      return ok;
    },
    setParams(next) { instruments.setParams(next); paramRevision++; },
    setLevels(next) { instruments.setParams(next); paramRevision++; },
    setNominalOutputDb(value) {
      if (!Number.isFinite(value)) return false;
      nominalOutput.gain.setTargetAtTime(db(value), ctx.currentTime, 0.02);
      return true;
    },
    getNominalOutputDb() { return 20 * Math.log10(Math.max(nominalOutput.gain.value, 1e-9)); },
    getKWeightedRmsDbfs() {
      const data = new Float32Array(meterAnalyser.fftSize);
      meterAnalyser.getFloatTimeDomainData(data);
      let sum = 0; for (const sample of data) sum += sample * sample;
      return 10 * Math.log10(Math.max(sum / data.length, 1e-12));
    },
    getLowBandRmsDbfs() {
      const data = new Float32Array(lowAnalyser.fftSize);
      lowAnalyser.getFloatTimeDomainData(data);
      let sum = 0; for (const sample of data) sum += sample * sample;
      return 10 * Math.log10(Math.max(sum / data.length, 1e-12));
    },
    getProgramPeakDbfs() {
      const data = new Float32Array(outputAnalyser.fftSize);
      outputAnalyser.getFloatTimeDomainData(data);
      let peak = 0; for (const sample of data) peak = Math.max(peak, Math.abs(sample));
      return 20 * Math.log10(Math.max(peak, 1e-12));
    },
    getLoopPosition() {
      if (!running) return 0;
      return ((ctx.currentTime - loopStart) % LOOP + LOOP) % LOOP;
    },
    seek(position) {
      if (!running || !Number.isFinite(position)) return false;
      const target = Math.max(0, Math.min(LOOP - 0.001, position));
      const loopIndex = currentLoopIndex();
      const plan = ensurePlan(loopIndex);
      plan.cursor = 0;
      loopStart = ctx.currentTime - loopIndex * LOOP - target;
      scheduleWindow();
      return true;
    },
    getLiveEvents() {
      const plan = ensurePlan(currentLoopIndex());
      return plan.events.map(event => instruments.resolveEvent(event));
    },
    getEventRevision() { return currentLoopIndex() * 100000 + paramRevision; },
    constants: { LOOP, BAR, STEP, TOTAL_BARS, MAIN_BARS, AHEAD, BAR_STARTS: BAR_STARTS.slice() }
  };
}
