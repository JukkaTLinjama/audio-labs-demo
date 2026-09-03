// Shared rolling RMS band detector for calibration and Program A protection.
const floorDb=value=>20*Math.log10(Math.max(value,1e-12));
const percentile=(values,p)=>{
  if(!values.length)return -Infinity;
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))];
};

export class RollingBandMeter {
  constructor(ctx,{highpassHz=20,lowpassHz=120,stages=1}={}){
    this.ctx=ctx; this.input=ctx.createGain(); this.filters=[];
    let tail=this.input;
    for(let stage=0;stage<Math.max(1,Math.round(stages));stage++){
      const high=ctx.createBiquadFilter(),low=ctx.createBiquadFilter();
      high.type="highpass"; high.frequency.value=highpassHz; high.Q.value=.707;
      low.type="lowpass"; low.frequency.value=lowpassHz; low.Q.value=.707;
      tail.connect(high); high.connect(low); this.filters.push(high,low); tail=low;
    }
    // EN: This exact native-filter signal can feed an AudioWorklet sidechain.
    this.bandOutput=tail;
    this.tap=ctx.createScriptProcessor(1024,1,1);
    this.silent=ctx.createGain(); this.silent.gain.value=0;
    this.bandOutput.connect(this.tap); this.tap.connect(this.silent); this.silent.connect(ctx.destination);
    this.frames=[]; this.history=[];
    this.lastSnapshot={band400:-Infinity,band3:-Infinity,p95:-Infinity,max:-Infinity};
    this.tap.onaudioprocess=event=>{
      const data=event.inputBuffer.getChannelData(0);
      let sum=0; for(const sample of data)sum+=sample*sample;
      this.frames.push({sum,seconds:data.length/ctx.sampleRate}); this.trim(3);
      const snapshot=this.read(); this.history.push(snapshot.band400);
      if(this.history.length>300)this.history.shift(); this.lastSnapshot=snapshot;
    };
  }
  trim(seconds){let total=this.frames.reduce((sum,f)=>sum+f.seconds,0);while(this.frames.length>1&&total-this.frames[0].seconds>=seconds)total-=this.frames.shift().seconds;}
  rmsFor(seconds){let duration=0,sum=0;for(let i=this.frames.length-1;i>=0&&duration<seconds;i--){const f=this.frames[i],take=Math.min(f.seconds,seconds-duration);sum+=f.sum*(take/f.seconds);duration+=take;}return duration?Math.sqrt(sum/(duration*this.ctx.sampleRate)):0;}
  read(){const band400=floorDb(this.rmsFor(.4)),band3=floorDb(this.rmsFor(3)),valid=this.history.filter(Number.isFinite);return {band400,band3,p95:percentile(valid,.95),max:valid.length?Math.max(...valid):-Infinity};}
  snapshot(){return this.lastSnapshot;}
  reset(){this.frames=[];this.history=[];}
  dispose(){this.tap.disconnect();this.silent.disconnect();this.input.disconnect();this.filters.forEach(node=>node.disconnect());}
}
