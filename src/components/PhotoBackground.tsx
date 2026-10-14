import {useEffect,useRef,useState} from 'react';

// Two display layers keep decoded photo memory bounded as the collection grows.
export default function PhotoBackground({src}:{src:string}) {
 const [layers,setLayers]=useState(['','']);
 const [active,setActive]=useState(0);
 const [visible,setVisible]=useState([false,false]);
 const [shown,setShown]=useState(false);
 const [preparing,setPreparing]=useState<number|null>(null);
 const shownRef=useRef(false);
 const activeRef=useRef(0);
 useEffect(()=>{
  let cancelled=false,frame1=0,frame2=0;
  if(!src){shownRef.current=false;setShown(false);return;}
  const image=new Image();
  image.onload=async()=>{
   try{await image.decode();}catch{ /* onload still supplies the image */ }
   if(cancelled)return;
   const next=1-activeRef.current;
   setPreparing(next);
   setVisible(previous=>{const result=shownRef.current?previous.slice():[false,false];result[next]=false;return result;});
   setLayers(previous=>{const result=previous.slice();result[next]=src;return result;});
   frame1=requestAnimationFrame(()=>{frame2=requestAnimationFrame(()=>{if(!cancelled){activeRef.current=next;setActive(next);setPreparing(null);setVisible(previous=>{const result=previous.slice();result[next]=true;return result;});shownRef.current=true;setShown(true);}});});
  };
  image.src=src;
  return()=>{cancelled=true;image.onload=null;cancelAnimationFrame(frame1);cancelAnimationFrame(frame2);};
 },[src]);
 return <div className="tv-photo-layers" aria-hidden="true" style={{opacity:shown?1:0}}>{layers.map((url,index)=>url?<img key={index} src={url} alt="" className={`tv-photo${active===index?' active':''}${visible[index]?' visible':''}`} style={{zIndex:index===active?1:0,transition:preparing===index?'none':undefined}} onTransitionEnd={event=>{if(event.propertyName==='opacity'&&index===activeRef.current)setVisible(previous=>previous.map((value,i)=>i===index?value:false));}}/>:null)}</div>;
}
