// Shared 50 ms lookahead processor for the protected 0–120 Hz low branch.
const SOFT_KNEE_DB = 6;

function softLimiterReductionDb(levelDb, ceilingDb) {
  const overDb = levelDb - ceilingDb;
  const halfKneeDb = SOFT_KNEE_DB / 2;
  if (overDb <= -halfKneeDb) return 0;
  if (overDb >= halfKneeDb) return overDb;
  // EN: Infinity:1 limiter law with a quadratic 6 dB soft-knee transition.
  return ((overDb + halfKneeDb) ** 2) / (2 * SOFT_KNEE_DB);
}

class LowBandLookaheadProcessor extends AudioWorkletProcessor {
  constructor(){
    super();this.delaySamples=Math.max(1,Math.round(sampleRate*.05));this.ringLength=this.delaySamples;
    this.windowSamples=Math.max(1,Math.round(sampleRate*.4));this.delay=[new Float32Array(this.ringLength),new Float32Array(this.ringLength)];
    this.energy=new Float64Array(this.windowSamples);this.delayIndex=this.energyIndex=this.energySum=0;this.enabled=false;this.ceilingDb=-20;this.gain=this.targetGain=1;this.sampleCount=0;
    this.port.onmessage=({data})=>{if(data.type==="config"){this.enabled=Boolean(data.enabled);this.ceilingDb=Number.isFinite(data.ceilingDb)?data.ceilingDb:-20;}if(data.type==="reset")this.reset();};
  }
  reset(){this.delay.forEach(channel=>channel.fill(0));this.energy.fill(0);this.delayIndex=this.energyIndex=this.energySum=0;this.gain=this.targetGain=1;}
  process(inputs,outputs){
    const low=inputs[0],detector=inputs[1],output=outputs[0];
    if(!low?.length||!output?.length)return true;
    const lowChannels=Math.min(low.length,output.length,2),detectorChannels=detector?.length||0,frames=output[0].length;
    for(let frame=0;frame<frames;frame++){
      let sidechain=0;for(let ch=0;ch<detectorChannels;ch++)sidechain+=detector[ch][frame];sidechain/=Math.max(1,detectorChannels);
      const energy=sidechain*sidechain;this.energySum+=energy-this.energy[this.energyIndex];this.energy[this.energyIndex]=energy;this.energyIndex=(this.energyIndex+1)%this.windowSamples;
      const preDb=20*Math.log10(Math.max(Math.sqrt(this.energySum/this.windowSamples),1e-12));
      const reduction=this.enabled?softLimiterReductionDb(preDb,this.ceilingDb):0;this.targetGain=Math.pow(10,-reduction/20);
      const tc=this.targetGain<this.gain?.025:.25,alpha=1-Math.exp(-1/(sampleRate*tc));this.gain+=(this.targetGain-this.gain)*alpha;
      for(let ch=0;ch<lowChannels;ch++){const delayed=this.delay[ch][this.delayIndex];this.delay[ch][this.delayIndex]=low[ch][frame];output[ch][frame]=delayed*this.gain;}
      this.delayIndex=(this.delayIndex+1)%this.ringLength;this.sampleCount++;
      if(this.sampleCount%2048===0)this.port.postMessage({type:"meter",preDbfs:preDb,reductionDb:-20*Math.log10(Math.max(this.gain,1e-12)),delayMs:this.delaySamples/sampleRate*1000,ready:this.sampleCount>=this.delaySamples});
    }return true;
  }
}
registerProcessor("low-band-lookahead",LowBandLookaheadProcessor);
