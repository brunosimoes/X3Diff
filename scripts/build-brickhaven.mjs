import { writeFileSync, mkdirSync } from 'node:fs';
import { Matrix4, Quaternion, Vector3 } from 'three';

// Authored, self-contained X3D toy town. Re-run to regenerate both revisions.
const f = n => Number(n.toFixed(4));
const colors = { sand: '.91 .77 .49', cream: '1 .91 .68', teal: '.02 .49 .52', navy: '.035 .10 .18', red: '.9 .12 .18', blue: '.06 .43 .83', yellow: '1 .66 .035', green: '.15 .53 .32', mint: '.33 .76 .57', pink: '.98 .34 .48', rail: '.31 .39 .43', white: '.94 .97 1' };
function create(revised) {
  let id = 0;
  const mat = (c, extra = '') => `<Appearance><Material diffuseColor="${colors[c] ?? c}" ${extra.includes('emissiveColor') ? '' : `emissiveColor="${(colors[c] ?? c).split(' ').map(v => f(Number(v)*.18)).join(' ')}"`} specularColor=".45 .45 .45" shininess=".45" ${extra}/></Appearance>`;
  const shape = (geo, c, extra = '', name = '') => `<Shape DEF="${name || `Part${++id}`}">${mat(c, extra)}${geo}</Shape>`;
  const at = (x,y,z,children,rotation='',name='') => `<Transform ${name ? `DEF="${name}"` : ''} translation="${f(x)} ${f(y)} ${f(z)}" ${rotation ? `rotation="${rotation}"` : ''}>${children}</Transform>`;
  const box = (x,y,z,sx,sy,sz,c,name='') => at(x,y,z,shape(`<Box size="${sx} ${sy} ${sz}"/>`,c,'',name));
  const cylinder = (x,y,z,r,h,c,rotation='',extra='') => at(x,y,z,shape(`<Cylinder radius="${r}" height="${h}"/>`,c,extra),rotation);
  const sphere = (x,y,z,r,c,extra='') => at(x,y,z,shape(`<Sphere radius="${r}"/>`,c,extra));
  const studs = (x,y,z,nx,nz,c,spacing=.48) => Array.from({length:nx*nz},(_,i)=>cylinder(x+(i%nx-(nx-1)/2)*spacing,y,z+(Math.floor(i/nx)-(nz-1)/2)*spacing,.15,.11,c)).join('');
  const brick = (x,y,z,sx,sy,sz,c,name='') => box(x,y,z,sx,sy,sz,c,name)+studs(x,y+sy/2+.055,z,Math.max(1,Math.floor(sx/.5)),Math.max(1,Math.floor(sz/.5)),c);
  const text = (x,y,z,word,size,c) => at(x,y,z,shape(`<Text string='"${word}"'><FontStyle family='"SANS"' style="BOLD" size="${size}" justify='"MIDDLE" "MIDDLE"'/></Text>`,c));
  const tree = (x,z,s=1) => at(x,.45,z,cylinder(0,.5,0,.14,1,'sand')+box(0,1.05,0,.95*s,.55,.95*s,'green')+box(0,1.55,0,.76*s,.48,.76*s,'mint')+brick(0,1.93,0,.5*s,.28,.5*s,'green'));
  const spin = (name,seconds,axis,content) => `<Transform DEF="${name}">${content}</Transform><TimeSensor DEF="${name}Clock" cycleInterval="${seconds}" loop="true"/><OrientationInterpolator DEF="${name}Turn" key="0 .25 .5 .75 1" keyValue="${[0,Math.PI/2,Math.PI,Math.PI*1.5,Math.PI*2].map(a=>`${axis} ${f(a)}`).join(' ')}"/><ROUTE fromNode="${name}Clock" fromField="fraction_changed" toNode="${name}Turn" toField="set_fraction"/><ROUTE fromNode="${name}Turn" fromField="value_changed" toNode="${name}" toField="set_rotation"/>`;
  let scene = '';
  scene += box(0,-.4,0,21,.6,18,'navy')+box(0,-.05,0,20.6,.18,17.6,'teal')+box(0,.15,0,20,.3,17,'mint');
  scene += box(0,.33,0,12,.16,9,'sand');
  // Exposed studs on the baseplate, with a clear circular rail corridor.
  for(let x=-9;x<=9;x+=1) for(let z=-7.5;z<=7.5;z+=1) {
    const radius=Math.hypot(x,z/0.8);
    if(radius>9 || (radius<6.2 && (Math.abs(x)>5.5||Math.abs(z)>4.2))) scene+=cylinder(x,.35,z,.16,.13,'mint');
  }
  let track='';
  for(let i=0;i<96;i++) {
    const angle=i*Math.PI*2/96, x=8*Math.cos(angle),z=8*Math.sin(angle),yaw=-angle;
    track+=at(x,.47,z,box(0,0,0,1.1,.14,.19,'navy'),`0 1 0 ${f(yaw)}`);
    for(const r of [7.68,8.32]) track+=at(r*Math.cos(angle),.59,r*Math.sin(angle),box(0,0,0,.07,.10,.57,'rail'),`0 1 0 ${f(yaw)}`);
  }
  let train='';
  for(let car=0;car<3;car++) {
    const angle=.2-car*.35;
    let parts=box(0,.85,0,2.35,.28,.98,'navy');
    for(const x of [-.78,.78]) for(const z of [-.53,.53]) parts+=cylinder(x,.73,z,.30,.14,'navy','1 0 0 1.5708')+cylinder(x,.73,z+(z>0?.085:-.085),.16,.03,'yellow','1 0 0 1.5708');
    if(car===0) {
      parts+=brick(-.63,1.52,0,.94,1.05,.91,'red','LocomotiveCab');
      parts+=cylinder(.35,1.37,0,.38,1.2,'red','0 0 1 1.5708');
      parts+=box(-.64,1.72,.47,.52,.42,.025,'blue')+box(-.64,1.72,-.47,.52,.42,.025,'blue');
      parts+=brick(-.63,2.10,0,1.15,.18,1.15,'yellow');
      parts+=cylinder(.65,1.94,0,.17,.55,'navy')+cylinder(.65,2.22,0,.23,.12,'navy');
      parts+=at(1.03,1.36,0,shape('<Sphere radius=".19"/>','cream','emissiveColor=".8 .55 .16"'));
      parts+=box(1.15,.94,0,.25,.28,1.13,'yellow');
    } else {
      const c=car===1?'teal':'blue';parts+=brick(0,1.39,0,2.15,.9,.92,c);
      for(const x of [-.7,0,.7]) for(const z of [-.47,.47]) parts+=box(x,1.55,z,.48,.42,.025,'cream');
      parts+=brick(0,1.99,0,2.35,.18,1.12,'cream');
    }
    train+=at(8*Math.cos(angle),0,8*Math.sin(angle),parts,`0 1 0 ${f(-angle-Math.PI/2)}`,`TrainCar${car}`);
  }
  scene+=`<Transform scale="1 1 .8">${track}${spin('Railway',revised?24:32,'0 -1 0',train)}</Transform>`;
  // Raised station with striped awning, inset windows, platform and a readable sign.
  let station=brick(0,.65,-3.1,5.2,.32,2.3,'cream');
  station+=brick(0,1.95,-3.6,4.5,2.3,1.65,revised?'teal':'red','StationWalls');
  for(const x of [-1.5,-.75,.75,1.5]) station+=box(x,2.12,-2.76,.48,.78,.05,'navy')+box(x,2.12,-2.71,.05,.8,.03,'cream');
  station+=box(0,1.55,-2.75,.56,1.4,.05,'navy');
  station+=brick(0,3.18,-3.6,4.9,.25,2.15,'navy');
  for(let x=-2.2;x<=2.2;x+=.4) station+=box(x,2.76,-2.35,.39,.14,1.1,Math.round((x+2.2)/.4)%2?'cream':'yellow');
  station+=box(0,3.57,-2.83,3.6,.55,.12,'cream')+text(0,3.58,-2.75,'BRICKHAVEN',.3,'navy');
  scene+=at(0,0,0,station,'','Station');
  const house=(x,z,c,height,name)=> {
    let b=brick(0,.60,0,2.5,.22,2.3,'cream')+brick(0,1.4+height/2,0,2.05,height,1.9,c,`${name}Facade`);
    for(const y of [1.55,2.5]) if(y<1.4+height) for(const dx of [-.52,.52]) b+=box(dx,y, .96,.55,.62,.04,'navy')+box(dx,y,.995,.035,.64,.03,'cream');
    b+=box(0,1.08,.96,.48,.85,.04,'navy');
    for(let tier=0;tier<3;tier++) b+=brick(0,1.4+height+.16+tier*.27,0,2.5-tier*.6,.24,2.35,'pink');
    return at(x,0,z,b,'',name);
  };
  scene+=house(-3.7,-.7,'yellow',1.65,'Bakery')+house(3.2,-2.7,'blue',2.25,'TownHouse');
  scene+=text(-3.7,1.15,.3,'CAFE',.27,'cream');
  // Town plaza paving, fountain with a translucent water disc, flower planters.
  for(let x=-2;x<=2;x++) for(let z=-1;z<=2;z++) scene+=box(x*.65,.47,z*.65,.59,.08,.59,(x+z)%2?'cream':'sand');
  scene+=cylinder(.8,.53,2.7,1.2,.25,'cream')+cylinder(.8,.69,2.7,1.05,.1,'blue','','transparency=".26"');
  scene+=cylinder(.8,.9,2.7,.2,.52,'cream')+sphere(.8,1.27,2.7,.4,'blue','transparency=".40"');
  // Windmill: animated sails and a glossy brick tower.
  let mill=brick(0,1.4,0,1.25,1.9,1.25,'cream')+brick(0,2.49,0,1.5,.25,1.5,'red');
  let blades=cylinder(0,0,0,.22,.25,'yellow','1 0 0 1.5708');
  for(let j=0;j<4;j++) blades+=at(0,0,0,box(0,.68,0,.23,1.45,.13,'cream')+brick(0,1.2,0,.5,.62,.17,'teal'),`0 0 1 ${f(j*Math.PI/2)}`);
  mill+=at(0,2.5,.83,spin('WindmillRotor',12,'0 0 1',blades));scene+=at(4.55,0,.4,mill,'','Windmill');
  for(const [x,z,s] of [[-5,-3,1],[-5,2,1.2],[-3,3.8,.9],[4,3.1,1.1],[5,-3.8,.8],[-8,-6,1],[8,5,1],[-8,5.9,.8],[7,-6,.9]]) scene+=tree(x,z,s);
  for(const [x,z] of [[-2.2,2.9],[2.7,2.9],[-2.2,-2]]) {
    scene+=brick(x,.64,z,.85,.3,.6,'cream');
    for(let j=0;j<3;j++) scene+=cylinder(x+(j-1)*.25,.98,z,.035,.45,'green')+sphere(x+(j-1)*.25,1.2,z,.14,j%2?'yellow':'pink');
  }
  // Lamp posts and brick figures make the scale legible.
  for(const [x,z] of [[-2.6,-2.1],[2.6,-2.1],[-2.8,1.8],[2.7,1.8]]) scene+=cylinder(x,1.15,z,.055,1.65,'navy')+box(x,2.0,z,.26,.32,.26,'cream')+sphere(x,2.17,z,.12,'yellow','emissiveColor=".5 .28 .02"');
  for(const [x,z,c] of [[-1,-1.7,'red'],[1.8,-1.8,'blue'],[-2.5,1,'teal'],[2,3.3,'yellow']]) {
    scene+=box(x-.10,.68,z,.15,.4,.20,'navy')+box(x+.10,.68,z,.15,.4,.20,'navy')+box(x,1.02,z,.40,.35,.23,c)+cylinder(x,1.33,z,.17,.23,'yellow')+cylinder(x,1.49,z,.20,.10,'navy');
  }
  // A hovering balloon uses an orientation loop; its basket and ropes travel together.
  let balloon=sphere(0,0,0,.83,'yellow')+sphere(0,.55,0,.60,'pink')+box(0,-1.38,0,.5,.35,.5,'sand');
  for(const x of [-.2,.2]) for(const z of [-.2,.2]) balloon+=cylinder(x,-.92,z,.025,.8,'cream');
  scene+=at(-5,5.5,-4.5,spin('Balloon',40,'0 1 0',balloon),'','BalloonDisplay');
  // Stable IDs keep the revision pair useful for the semantic comparison.
  scene+=at(5.3,.6,3.5,shape(`<Box size="${revised?'1.5 .6 .9':'1 .6 .9'}"/>`,'teal','','ParkBench'));
  scene+=at(-1.4,.62,3.7,revised?'':shape('<Box size=".55 .5 .55"/>','sand','','OldCrate'),'','Crate');
  scene+=at(-1.4,.75,3.7,revised?shape('<Cylinder radius=".32" height=".7"/>','red','','NewPostbox'):'','','Postbox');
  const eye=new Vector3(20,20,25),q=new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(eye,new Vector3(0,1,0),new Vector3(0,1,0)));
  const angle=2*Math.acos(q.w),den=Math.sqrt(1-q.w*q.w),axis=[q.x/den,q.y/den,q.z/den].map(f);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<X3D profile="Immersive" version="3.3"><head><meta name="title" content="Brickhaven ${revised?'revised':'original'}"/><meta name="creator" content="X3Diff authored showcase"/></head><Scene><WorldInfo title="Brickhaven · a miniature railway town"/><Background skyColor=".075 .12 .18"/><Viewpoint DEF="TownOverview" description="Town overview" position="20 20 25" orientation="${axis.join(' ')} ${f(angle)}" fieldOfView=".62"/>${scene}</Scene></X3D>\n`;
}
mkdirSync(new URL('../public/examples/brickhaven/',import.meta.url),{recursive:true});
for(const [name,revised] of [['before',false],['after',true]]) {
  const xml=create(revised);writeFileSync(new URL(`../public/examples/brickhaven/${name}.x3d`,import.meta.url),xml);console.log(`${name}: ${xml.length} bytes`);
}

