import { mkdirSync, writeFileSync } from 'node:fs';
import { Matrix4, Quaternion, Vector3 } from 'three';

// Original, self-contained toy-brick industrial demonstrations. No external assets.
const palette = { navy: '.04 .10 .18', teal: '.02 .64 .65', mint: '.34 .76 .62', yellow: '1 .70 .07', red: '.95 .16 .25', blue: '.10 .43 .91', pink: '.96 .32 .54', white: '.91 .95 1', steel: '.40 .51 .62', dark: '.09 .17 .25' };
const n = v => Number(v.toFixed(5));
function kit() {
  let serial = 0;
  const shape = (geo, color, name = '', extra = '') => `<Shape DEF="${name || `Part${++serial}`}"><Appearance><Material diffuseColor="${palette[color]}" emissiveColor="${palette[color].split(' ').map(x => n(+x*.15)).join(' ')}" specularColor=".5 .5 .5" shininess=".55" ${extra}/></Appearance>${geo}</Shape>`;
  const at = (x,y,z,content,rot='',name='') => `<Transform translation="${x} ${y} ${z}" ${rot ? `rotation="${rot}"` : ''} ${name ? `DEF="${name}"` : ''}>${content}</Transform>`;
  const box = (x,y,z,w,h,d,c,name='') => at(x,y,z,shape(`<Box size="${w} ${h} ${d}"/>`,c,name));
  const cyl = (x,y,z,r,h,c,rot='',name='') => at(x,y,z,shape(`<Cylinder radius="${r}" height="${h}"/>`,c,name),rot);
  const ball = (x,y,z,r,c,name='') => at(x,y,z,shape(`<Sphere radius="${r}"/>`,c,name));
  const brick = (x,y,z,w,h,d,c,name='') => {
    let s=box(x,y,z,w,h,d,c,name);
    for(let i=0;i<Math.floor(w/.5);i++) for(let j=0;j<Math.floor(d/.5);j++) s+=cyl(n(x+(i-(Math.floor(w/.5)-1)/2)*.5),n(y+h/2+.06),n(z+(j-(Math.floor(d/.5)-1)/2)*.5),.14,.12,c);
    return s;
  };
  const text = (x,y,z,label,size=.32) => at(x,y,z,shape(`<Text string='"${label}"'><FontStyle family='"SANS"' style="BOLD" size="${size}" justify='"MIDDLE" "MIDDLE"'/></Text>`,'white'));
  const motion = (name,content,axis,angles,seconds) => `<Transform DEF="${name}">${content}</Transform><TimeSensor DEF="${name}Clock" cycleInterval="${seconds}" loop="true"/><OrientationInterpolator DEF="${name}Motion" key="${angles.map((_,i)=>n(i/(angles.length-1))).join(' ')}" keyValue="${angles.map(a=>`${axis} ${a}`).join(' ')}"/><ROUTE fromNode="${name}Clock" fromField="fraction_changed" toNode="${name}Motion" toField="set_fraction"/><ROUTE fromNode="${name}Motion" fromField="value_changed" toNode="${name}" toField="set_rotation"/>`;
  const floor = (w,d) => {
    let s=box(0,-.25,0,w,.4,d,'navy')+box(0,.01,0,w-.25,.12,d-.25,'mint');
    for(let x=-w/2+.6;x<w/2;x+=.6) for(const z of [-d/2+.6,d/2-.6]) s+=cyl(n(x),.12,n(z),.14,.10,'mint');
    for(let z=-d/2+1.2;z<d/2-.6;z+=.6) for(const x of [-w/2+.6,w/2-.6]) s+=cyl(n(x),.12,n(z),.14,.10,'mint');
    return s;
  };
  return {shape,at,box,cyl,ball,brick,text,motion,floor};
}
function document(title,content,eye,target=[0,1,0]) {
  const q=new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(new Vector3(...eye),new Vector3(...target),new Vector3(0,1,0)));
  const den=Math.sqrt(1-q.w*q.w),axis=[q.x/den,q.y/den,q.z/den].map(n);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<X3D profile="Immersive" version="3.3"><head><meta name="title" content="${title}"/><meta name="creator" content="X3Diff authored showcase"/></head><Scene><WorldInfo title="${title}"/><Background skyColor=".075 .12 .18"/><Viewpoint DEF="Overview" description="Overview" position="${eye.join(' ')}" orientation="${axis.join(' ')} ${n(2*Math.acos(q.w))}" centerOfRotation="${target.join(' ')}" fieldOfView=".62"/>${content}</Scene></X3D>\n`;
}
function factory(revised) {
  const {shape,at,box,cyl,ball,brick,text,motion,floor}=kit();
  let s=floor(21,14);
  // Open-sided production cell: a clear view of every station.
  s+=box(0,.15,0,18,.16,5,'dark');
  for(const z of [-2.65,2.65]) {
    s+=box(0,.2,z,18,.06,.13,'yellow');
    for(let x=-8.5;x<9;x+=.6) s+=box(n(x),.24,z+.24,.3,.04,.25,'navy');
  }
  s+=box(0,.6,0,18,.7,2.5,'navy');
  for(const z of [-1.4,1.4]) s+=brick(0,1.02,z,18,.24,.3,'teal');
  for(let i=0;i<29;i++) s+=at(n(-8.4+i*.6),1,0,motion(`Roller${i}`,cyl(0,0,0,.19,2.4,'steel','1 0 0 1.5708')+box(.09,0,1.21,.17,.06,.025,'yellow'),'0 0 1',[0,1.5708,3.14159,4.71239,6.28318],4));
  const car=(x,stage,c)=>{
    let p=brick(0,.22,0,3.2,.3,1.55,'dark');
    for(const dx of [-1,1]) for(const z of [-.85,.85]) p+=cyl(dx,.25,z,.38,.25,'navy','1 0 0 1.5708')+cyl(dx,.25,z+(z>0?.14:-.14),.19,.025,'white','1 0 0 1.5708');
    if(stage>0) {
      p+=brick(0,.65,0,3.15,.5,1.6,c)+box(-.15,1.07,0,1.5,.45,1.45,'blue');
      p+=brick(-.15,1.36,0,1.55,.14,1.55,c);
      for(const z of [-.74,.74]) p+=box(-.15,1.09,z,.06,.45,.035,c);
      for(const z of [-.55,.55]) p+=box(1.6,.65,z,.04,.23,.36,'white')+box(-1.6,.65,z,.04,.2,.28,'red');
    } else p+=box(.9,.54,0,.9,.38,.9,'steel')+box(-.6,.55,0,.8,.42,.95,'yellow');
    return at(x,1.18,0,p,'',`Car${stage}`);
  };
  s+=car(-5.8,0,'teal')+car(0,1,'yellow')+car(5.8,2,revised?'teal':'red');
  const robot=(x,z,name,color,period)=>{
    let gripper=box(0,.7,0,.3,1.4,.32,color)+ball(0,1.35,0,.26,'navy');
    for(const dx of [-.24,.24]) gripper+=box(dx,1.65,0,.14,.65,.25,'steel');
    const elbow=at(0,1.65,0,motion(`${name}Elbow`,gripper,'0 0 1',[-1.1,-1.7,-1.1],period));
    let arm=box(0,.8,0,.48,1.6,.48,color)+ball(0,1.65,0,.34,'navy')+elbow;
    arm=motion(`${name}Shoulder`,arm,'0 0 1',[.2,.65,.2],period);
    return at(x,0,z,brick(0,.35,0,1.7,.5,1.7,'navy')+cyl(0,.8,0,.55,.6,color)+at(0,1.15,0,arm),'0 1 0 -1.5708',name);
  };
  s+=robot(-5.4,-2.7,'ChassisRobot','yellow',6)+robot(.2,-2.7,'AssemblyRobot','pink',revised?4:6)+robot(5.6,-2.7,'InspectionRobot','teal',8);
  // Rear gantry and station labels, kept high so the robots remain visible.
  for(const x of [-9,9]) s+=brick(x,2.65,-4.4,.65,5.1,.65,'teal');
  s+=brick(0,5.25,-4.4,18.7,.65,.8,'teal')+text(0,5.27,-3.96,'FORGEWORKS',.52);
  for(const [x,label] of [[-5.8,'01 CHASSIS'],[0,'02 ASSEMBLY'],[5.8,'03 INSPECT']]) s+=box(x,4.3,-4.38,3.4,.62,.18,'navy')+text(x,4.3,-4.26,label,.3);
  // Parts rack, utility drums, safety bollards, quality-control console.
  for(const x of [-8,-6.7,-5.4]) {
    s+=brick(x,.38,4.6,1,.6,.9,'blue')+brick(x,1.05,4.6,1,.6,.9,'yellow');
  }
  for(const x of [7.2,8.4]) s+=cyl(x,.6,4.8,.45,1,'teal')+cyl(x,1.13,4.8,.47,.08,'white');
  for(const x of [-9,9]) for(const z of [-2,2]) s+=cyl(x,.7,z,.17,1.2,'yellow')+cyl(x,.9,z,.18,.16,'navy');
  s+=brick(3,.6,4.5,2,.9,1.2,'navy')+at(3,1.45,4.4,shape('<Box size="1.65 .85 .12"/>','teal','QualityScreen'))+text(3,1.46,4.48,'QUALITY',.24);
  // Friendly humanoid with joint spheres and an articulated waving arm.
  let h=box(-.28,.5,0,.35,.8,.4,'white')+box(.28,.5,0,.35,.8,.4,'white');
  for(const x of [-.28,.28]) h+=brick(x,.14,.12,.5,.2,.7,'navy')+ball(x,.86,0,.22,'navy');
  h+=brick(0,1.35,0,1.05,.82,.6,'white')+box(0,1.38,.32,.66,.42,.04,'teal')+cyl(0,1.92,0,.18,.22,'steel');
  h+=box(0,2.23,0,.8,.55,.62,'white')+box(0,2.24,.32,.67,.27,.035,'navy');
  for(const x of [-.19,.19]) h+=ball(x,2.25,.36,.075,'teal');
  h+=at(-.7,1.66,0,box(0,-.35,0,.28,.7,.3,'white')+ball(0,-.75,0,.18,'teal'),'0 0 1 -.2');
  h+=at(.69,1.66,0,motion('HumanoidWave',box(0,.35,0,.28,.7,.3,'white')+ball(0,.8,0,.20,'teal'),'0 0 1',[-.25,.45,-.25],3));
  s+=at(-.9,.15,4.6,h,'','Humanoid');
  // Stable empty slots make added/removed objects unambiguous.
  s+=at(-8,.7,-5.8,revised?'':shape('<Box size="1 .9 1"/>','red','LegacyBin'),'','LegacyBinSlot');
  s+=at(7,.7,-5.8,revised?shape('<Box size="1 .9 1"/>','mint','RecyclingBin'):'','','RecyclingBinSlot');
  return document(`Forgeworks ${revised?'revised':'original'}`,s,[22,21,27],[0,1.4,0]);
}
function fitlab(revised) {
  const {shape,at,box,cyl,ball,brick,text,motion,floor}=kit();
  let s=floor(12,10);
  s+=brick(0,.28,0,9,.35,6.5,'white')+box(0,.49,0,8.6,.1,6.1,'navy');
  // Exactly one matched primitive moves: its three Boolean regions are all nonempty.
  s+=at(revised?.85:-.65,2.1,0,shape('<Cylinder radius="1.7" height="3.0"/>','teal','MotorHousing'),`0 0 1 ${revised?-.28:.12}`,'HousingPlacement');
  for(const x of [-3.5,3.5]) s+=brick(x,.95,-1.9,1.05,.8,1.05,'yellow')+cyl(x,1.55,-1.9,.22,.5,'steel');
  s+=at(-3,1.3,1.5,revised?'':shape('<Box size="1.1 1.5 1.1"/>','red','OldSupport'),'','SupportSlot');
  s+=at(3,1.5,1.6,revised?shape('<Sphere radius=".8"/>','blue','NewSensor'):'','','SensorSlot');
  s+=cyl(3,.8,1.6,.15,.6,'steel');
  // Hybrid geometry: an indexed wedge is context, never mistaken for a Boolean operand.
  s+=at(-3.4,.55,-.1,shape('<IndexedFaceSet coordIndex="0 3 2 1 -1 0 1 4 -1 1 2 5 4 -1 2 3 5 -1 3 0 4 5 -1"><Coordinate point="-.6 0 -.6 .6 0 -.6 .6 0 .6 -.6 0 .6 0 .9 -.6 0 .9 .6"/></IndexedFaceSet>','pink','GuideWedge'));
  s+=box(0,3.4,-3.6,6.8,.75,.25,'teal')+text(0,3.4,-3.45,'FIT LAB',.5);
  for(const x of [-3,3]) s+=box(x,1.8,-3.6,.18,3,.18,'steel');
  for(let x=-4;x<=4;x++) s+=box(x,.57,2.8,.04,.035,.32,'yellow');
  s+=at(4.6,1.2,-3,motion('InspectionBeacon',box(0,.45,0,.08,.12,.65,'yellow')+cyl(0,0,0,.23,.8,'navy'),'0 1 0',[0,1.5708,3.14159,4.71239,6.28318],5));
  return document(`Fit Lab ${revised?'revised':'original'}`,s,[13,12,17],[0,1.1,0]);
}
for(const [name,create] of [['forgeworks',factory],['fitlab',fitlab]]) {
  mkdirSync(new URL(`../public/examples/${name}/`,import.meta.url),{recursive:true});
  for(const [side,revised] of [['before',false],['after',true]]) {
    const xml=create(revised);writeFileSync(new URL(`../public/examples/${name}/${side}.x3d`,import.meta.url),xml);console.log(`${name}/${side}: ${xml.length} bytes`);
  }
}
