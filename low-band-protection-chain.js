import { RollingBandMeter } from "./rolling-band-meter.js";

const CROSSOVER_HZ=120;
const Q=Math.SQRT1_2;
const configure=(nodes,type)=>nodes.forEach(node=>{node.type=type;node.frequency.value=CROSSOVER_HZ;node.Q.value=Q;});

// Shared Program A low-band protection chain.
// EN: No fallback is created here: AudioWorklet load failure rejects construction.
export async function createLowBandProtectionChain(ctx,{onMeter}={}){
  await ctx.audioWorklet.addModule(new URL("./low-band-lookahead-worklet.js",import.meta.url));
  const input=ctx.createGain(),output=ctx.createGain();
  const detector=new RollingBandMeter(ctx,{highpassHz:20,lowpassHz:90,stages:2});
  const low=[ctx.createBiquadFilter(),ctx.createBiquadFilter()];
  const high=[ctx.createBiquadFilter(),ctx.createBiquadFilter()];
  configure(low,"lowpass");configure(high,"highpass");
  const highDelay=ctx.createDelay(.1);highDelay.delayTime.value=.05;
  const worklet=new AudioWorkletNode(ctx,"low-band-lookahead",{numberOfInputs:2,numberOfOutputs:1,outputChannelCount:[2]});
  const stats={available:true,ready:false,preDbfs:-Infinity,reductionDb:0,delayMs:50};
  worklet.port.onmessage=({data})=>{if(data.type==="meter"){Object.assign(stats,data);onMeter?.({...stats});}};
  input.connect(detector.input);
  input.connect(low[0]);low[0].connect(low[1]);low[1].connect(worklet,0,0);
  detector.bandOutput.connect(worklet,0,1);worklet.connect(output);
  input.connect(high[0]);high[0].connect(high[1]);high[1].connect(highDelay);highDelay.connect(output);
  return {
    input,output,detector,stats,
    setEnabled(enabled){worklet.port.postMessage({type:"config",enabled,ceilingDb:this.ceilingDb??-20});},
    setCeilingDb(ceilingDb){this.ceilingDb=ceilingDb;worklet.port.postMessage({type:"config",enabled:this.enabled??false,ceilingDb});},
    configure({enabled,ceilingDb}){this.enabled=Boolean(enabled);this.ceilingDb=ceilingDb;worklet.port.postMessage({type:"config",enabled:this.enabled,ceilingDb});},
    reset(){worklet.port.postMessage({type:"reset"});detector.reset();},
    dispose(){detector.dispose();[input,output,...low,...high,highDelay,worklet].forEach(node=>{try{node.disconnect();}catch{}});}
  };
}
