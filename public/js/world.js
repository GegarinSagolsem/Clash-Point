import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARENA_RADIUS, OBSTACLES } from '/shared/rules.js';

const TAU = Math.PI * 2;
const mobile = () => innerWidth <= 600 || navigator.maxTouchPoints > 0;
const rng = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const color = (hex) => new THREE.Color(hex);
const srgb = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
const lerpColor = (a, b, t) => a.clone().lerp(b, THREE.MathUtils.clamp(t, 0, 1));

function surfaceColor(x, z) {
  const d = Math.hypot(x, z), cell = Math.floor(x / 1.4) * 7919 + Math.floor(z / 1.4) * 104729;
  const choices = [srgb(.32,.53,.21), srgb(.42,.64,.26), srgb(.25,.46,.18)];
  let c = choices[Math.floor(rng(cell) * choices.length)].clone();
  const meadow = Math.sin(x * .095 + Math.sin(z * .07)) * Math.sin(z * .082 - x * .035);
  c.lerp(srgb(meadow > .12 ? .62 : .26, meadow > .12 ? .70 : .45, meadow > .12 ? .30 : .20), Math.abs(meadow) * .34);
  const pathX = Math.sin((z + 16) * .14) * 2.1;
  const pathDist = Math.abs(x - pathX);
  const path = 1 - THREE.MathUtils.smoothstep(pathDist, .42, .78);
  const plaza = 1 - THREE.MathUtils.smoothstep(d, 2.5, 4.5);
  const dirt = srgb(.63,.52,.35), stone = srgb(.59,.54,.43);
  c.lerp(dirt, path * .92);
  c.lerp(dirt, (1 - THREE.MathUtils.smoothstep(d, 16.5, 23.7)) * .50);
  c.lerp(stone, plaza);
  const jitter = (rng(cell + 23) - .5) * .045 + (rng(x * 37 + z * 59) - .5) * .018;
  c.offsetHSL(0, 0, jitter);
  return c;
}

function makeGround() {
  const rings = 54, segments = 160, positions = [], colors = [], indices = [];
  for (let r = 0; r <= rings; r++) {
    const radius = ARENA_RADIUS * r / rings;
    for (let i = 0; i <= segments; i++) {
      const a = i / segments * TAU, x = Math.cos(a) * radius, z = Math.sin(a) * radius;
      positions.push(x, 0, z);
      const c = surfaceColor(x, z); colors.push(c.r, c.g, c.b);
      if (r < rings && i < segments) {
        const k = r * (segments + 1) + i, n = segments + 1;
        indices.push(k, k + 1, k + n, k + 1, k + n + 1, k + n);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true; ground.userData.worldSurface = true;
  return ground;
}

function makeHills() {
  const rings = 64, segments = 160, positions = [], colors = [], indices = [];
  for (let r = 0; r <= rings; r++) {
    const q = r / rings, radius = ARENA_RADIUS + 190 * q;
    for (let i = 0; i <= segments; i++) {
      const a = i / segments * TAU, wave = Math.sin(a * 5 + q * 8) * .75 + Math.sin(a * 11 - q * 13) * .35;
      const rise = THREE.MathUtils.smoothstep(q, 0, .17) * (1.2 + 2.1 * Math.sin(q * Math.PI * .7) + wave);
      positions.push(Math.cos(a) * radius, rise, Math.sin(a) * radius);
      const c = lerpColor(srgb(.32,.49,.21), srgb(.54,.63,.42), THREE.MathUtils.clamp(q * .65 + .2, 0, 1)); colors.push(c.r, c.g, c.b);
      if (r < rings && i < segments) { const k = r * (segments + 1) + i, n = segments + 1; indices.push(k,k+1,k+n,k+1,k+n+1,k+n); }
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors,3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors:true, roughness:1 })); mesh.receiveShadow = true; return mesh;
}

function instanceMesh(geometry, material, data, castShadow = false) {
  const mesh = new THREE.InstancedMesh(geometry, material, data.length), dummy = new THREE.Object3D();
  data.forEach((item, i) => { dummy.position.set(item.x,item.y,item.z); dummy.rotation.set(item.rx||0,item.ry||0,item.rz||0); dummy.scale.set(item.sx??1,item.sy??1,item.sz??1); dummy.updateMatrix(); mesh.setMatrixAt(i,dummy.matrix); if(item.color)mesh.setColorAt(i,item.color); });
  mesh.instanceMatrix.needsUpdate = true; if(mesh.instanceColor)mesh.instanceColor.needsUpdate = true; mesh.castShadow=castShadow&&!mobile(); mesh.receiveShadow=castShadow&&!mobile(); return mesh;
}

function makeSky(scene) {
  const geometry = new THREE.SphereGeometry(240, 48, 24);
  const material = new THREE.ShaderMaterial({ side:THREE.BackSide, depthWrite:false, fog:false,uniforms:{uHorizon:{value:new THREE.Vector3(.863,.827,.741)},uMid:{value:new THREE.Vector3(.612,.761,.886)},uZenith:{value:new THREE.Vector3(.247,.471,.753)}},
    vertexShader:'varying float h; void main(){h=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying float h;uniform vec3 uHorizon;uniform vec3 uMid;uniform vec3 uZenith;void main(){float k=smoothstep(-0.08,0.38,h);vec3 c=mix(uHorizon,uMid,k);c=mix(c,uZenith,smoothstep(0.38,0.88,h));gl_FragColor=vec4(c,1.0);}' });
  const sky = new THREE.Mesh(geometry, material); scene.add(sky);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d'),g=ctx.createRadialGradient(256,256,4,256,256,250);g.addColorStop(0,'rgba(255,244,211,0.95)');g.addColorStop(.18,'rgba(255,222,169,0.40)');g.addColorStop(1,'rgba(255,220,170,0)');ctx.fillStyle=g;ctx.fillRect(0,0,512,512);
  const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));halo.position.set(-90,115,82);halo.scale.set(62,62,1);scene.add(halo);sky.userData.halo=halo;
  return sky;
}

function makeClouds(scene) {
  const geometry = new THREE.SphereGeometry(205, 36, 18, 0, TAU, 0, Math.PI * .43);
  const material = new THREE.ShaderMaterial({ side:THREE.BackSide, transparent:true, depthWrite:false, uniforms:{time:{value:0},uTint:{value:new THREE.Vector3(.96,.92,.82)}},
    vertexShader:'varying vec3 v; void main(){v=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying vec3 v;uniform float time;uniform vec3 uTint;void main(){float n=sin(v.x*17.0+time*.015)*sin(v.z*19.0-time*.012)+sin(v.x*39.0+v.z*27.0+time*.01)*.25;float a=smoothstep(.48,.8,n)*.26;gl_FragColor=vec4(uTint,a);}' });
  const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);return mesh;
}

function makeAtmosphereParticles(scene, phone) {
  const petalCanvas=document.createElement('canvas');petalCanvas.width=petalCanvas.height=64;const petalContext=petalCanvas.getContext('2d');
  petalContext.save();petalContext.translate(32,32);petalContext.scale(.78,1);const petalShape=new Path2D();petalShape.moveTo(-27,0);petalShape.bezierCurveTo(-20,-4,-5,-14,13,-13);petalShape.quadraticCurveTo(23,-12,27,-6);petalShape.lineTo(20,0);petalShape.lineTo(27,6);petalShape.quadraticCurveTo(20,13,11,13);petalShape.bezierCurveTo(-6,14,-20,4,-27,0);petalShape.closePath();
  const petalGradient=petalContext.createLinearGradient(-27,0,27,0);petalGradient.addColorStop(0,'#ff9fb8');petalGradient.addColorStop(.58,'#ffd3e0');petalGradient.addColorStop(1,'#fff5f8');petalContext.fillStyle=petalGradient;petalContext.fill(petalShape);
  petalContext.save();petalContext.clip(petalShape);petalContext.globalAlpha=.34;petalContext.strokeStyle='#fffafd';petalContext.lineWidth=1.5;petalContext.beginPath();petalContext.moveTo(-23,0);petalContext.quadraticCurveTo(0,-1,22,0);petalContext.stroke();petalContext.restore();petalContext.restore();
  const petalTexture=new THREE.CanvasTexture(petalCanvas);petalTexture.colorSpace=THREE.SRGBColorSpace;
  const make=(kind,count,geometry,material)=>{
    const mesh=new THREE.InstancedMesh(geometry,material,count),particles=[],dummy=new THREE.Object3D();mesh.frustumCulled=false;
    for(let i=0;i<count;i++){
      const a=rng(i+1701)*TAU,r=1.5+rng(i+1733)*7.5,particle={x:Math.cos(a)*r,y:kind==='petal'?5.5+rng(i+1741):.2+rng(i+1753)*3.8,z:Math.sin(a)*r,vx:(rng(i+1777)-.5)*.2,vz:(rng(i+1789)-.5)*.2,rx:rng(i+1801)*TAU,ry:rng(i+1811)*TAU,rz:rng(i+1823)*TAU,spin:kind==='petal'?1.5+rng(i+1831)*2.5:(rng(i+1831)-.5)*1.4,swayPhase:rng(i+1837)*TAU,swaySpeed:kind==='petal'?TAU/(2+rng(i+1841)*2):0,swayWidth:kind==='petal'?.25+rng(i+1843)*.25:0,fallSpeed:kind==='petal'?.4+rng(i+1845)*.4:0,phase:rng(i+1847)*TAU};
      particles.push(particle);dummy.position.set(particle.x,particle.y,particle.z);dummy.rotation.set(particle.rx,particle.ry,particle.rz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      if(kind==='petal'){const c=new THREE.Color(0xffffff).lerp(new THREE.Color(0xffe4ec),rng(i+1859));mesh.setColorAt(i,c);}
      else mesh.setColorAt(i,new THREE.Color(0xffb050));
    }
    mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;scene.add(mesh);mesh.userData.particles=particles;return mesh;
  };
  const petals=make('petal',phone?60:160,new THREE.PlaneGeometry(.12,.10),new THREE.MeshBasicMaterial({map:petalTexture,color:0xffffff,alphaTest:.4,transparent:true,opacity:.88,side:THREE.DoubleSide,depthWrite:false}));
  const emberCanvas=document.createElement('canvas');emberCanvas.width=emberCanvas.height=128;const emberContext=emberCanvas.getContext('2d'),emberGlow=emberContext.createRadialGradient(64,64,0,64,64,64);emberGlow.addColorStop(0,'rgba(255,245,210,1)');emberGlow.addColorStop(.18,'rgba(255,190,95,.94)');emberGlow.addColorStop(.5,'rgba(255,106,32,.46)');emberGlow.addColorStop(1,'rgba(255,80,20,0)');emberContext.fillStyle=emberGlow;emberContext.fillRect(0,0,128,128);const emberTexture=new THREE.CanvasTexture(emberCanvas);emberTexture.colorSpace=THREE.SRGBColorSpace;
  const embers=make('ember',phone?50:140,new THREE.PlaneGeometry(.09,.09),new THREE.MeshBasicMaterial({map:emberTexture,color:0xffffff,transparent:true,opacity:.86,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
  return {petals,embers,dummy:new THREE.Object3D(),tempColor:new THREE.Color(),emberColors:[new THREE.Color(0xffb050),new THREE.Color(0xff6a20)]};
}

const atmospherePalette={
  day:{horizon:new THREE.Vector3(.863,.827,.741),mid:new THREE.Vector3(.612,.761,.886),zenith:new THREE.Vector3(.247,.471,.753),fog:new THREE.Color(0xdcd3bd),fogNear:45,fogFar:200,hemiSky:new THREE.Color(0xcfe0ff),hemiGround:new THREE.Color(0x7a6038),hemiIntensity:1.7,sunColor:new THREE.Color(0xffe2b8),sunIntensity:2.8,sunPos:new THREE.Vector3(-90,156,86),haloPos:new THREE.Vector3(-90,115,82),haloScale:62,haloColor:new THREE.Color(0xffffff),cloudTint:new THREE.Vector3(.96,.92,.82),exposure:1.1},
  evening:{horizon:new THREE.Vector3(.98,.62,.38),mid:new THREE.Vector3(.74,.47,.58),zenith:new THREE.Vector3(.18,.17,.38),fog:new THREE.Color(0xc28a70),fogNear:35,fogFar:170,hemiSky:new THREE.Color(0xffb38a),hemiGround:new THREE.Color(0x4a3a40),hemiIntensity:1.15,sunColor:new THREE.Color(0xffa060),sunIntensity:2.2,sunPos:new THREE.Vector3(-140,40,60),haloPos:new THREE.Vector3(-150,48,64),haloScale:90,haloColor:new THREE.Color(0xff963f),cloudTint:new THREE.Vector3(1,.70,.68),exposure:1}
};

function applyAtmosphere(world, blend=world.evening) {
  const q=THREE.MathUtils.clamp(blend,0,1),day=atmospherePalette.day,eve=atmospherePalette.evening,uniforms=world.sky.material.uniforms;
  uniforms.uHorizon.value.lerpVectors(day.horizon,eve.horizon,q);uniforms.uMid.value.lerpVectors(day.mid,eve.mid,q);uniforms.uZenith.value.lerpVectors(day.zenith,eve.zenith,q);
  world.scene.background.lerpColors(day.fog,eve.fog,q);world.scene.fog.color.lerpColors(day.fog,eve.fog,q);world.scene.fog.near=THREE.MathUtils.lerp(day.fogNear,eve.fogNear,q);world.scene.fog.far=THREE.MathUtils.lerp(day.fogFar,eve.fogFar,q);
  world.hemi.color.lerpColors(day.hemiSky,eve.hemiSky,q);world.hemi.groundColor.lerpColors(day.hemiGround,eve.hemiGround,q);world.hemi.intensity=THREE.MathUtils.lerp(day.hemiIntensity,eve.hemiIntensity,q);
  world.sun.color.lerpColors(day.sunColor,eve.sunColor,q);world.sun.intensity=THREE.MathUtils.lerp(day.sunIntensity,eve.sunIntensity,q);world.sun.position.lerpVectors(day.sunPos,eve.sunPos,q);
  const halo=world.sky.userData.halo;halo.position.lerpVectors(day.haloPos,eve.haloPos,q);const haloScale=THREE.MathUtils.lerp(day.haloScale,eve.haloScale,q);halo.scale.set(haloScale,haloScale,1);halo.material.color.lerpColors(day.haloColor,eve.haloColor,q);
  world.clouds.material.uniforms.uTint.value.lerpVectors(day.cloudTint,eve.cloudTint,q);world.renderer.toneMappingExposure=THREE.MathUtils.lerp(day.exposure,eve.exposure,q);
  if(world.pollen){world.pollen.material.opacity=.42*(1-q);world.pollen.visible=q<1;}world.petals.material.opacity=.88*(1-q);world.embers.material.opacity=.86*q;world.petals.visible=q<1;world.embers.visible=q>0;
  world.evening=q;
}

export function setArenaTimeOfDay(world, timeOfDay) { if(world)world.targetEvening=timeOfDay==='evening'?1:0; }

export async function warmArenaAtmosphere(world, scene, renderer, camera) {
  if(!world?.petals||!world?.embers)return;
  world.petals.visible=true;world.embers.visible=true;
  try{await renderer.compileAsync(scene,camera);renderer.render(scene,camera);}
  finally{applyAtmosphere(world,world.evening);}
}

function animateParticles(world, seconds, dt, camera) {
  if(!camera)return;
  const {petals,embers,dummy,tempColor,emberColors}=world,cam=camera.position,wind=.3;
  const placeNearCamera=(particle,kind)=>{const a=Math.random()*TAU,r=1.5+Math.random()*7.5;particle.x=cam.x+Math.cos(a)*r;particle.z=cam.z+Math.sin(a)*r;particle.y=kind==='petal'?5.5+Math.random():.2+Math.random()*3.8;};
  if(!world.particlesInitialized){for(const p of petals.userData.particles)placeNearCamera(p,'petal');for(const p of embers.userData.particles)placeNearCamera(p,'ember');world.particlesInitialized=true;}
  const update=(mesh,kind)=>{const parts=mesh.userData.particles;for(let i=0;i<parts.length;i++){const p=parts[i],dx=p.x-cam.x,dz=p.z-cam.z;if(dx*dx+dz*dz>14*14)placeNearCamera(p,kind);
      if(kind==='petal'){p.x+=(p.vx+wind+Math.sin(seconds*p.swaySpeed+p.swayPhase)*p.swayWidth/2)*dt;p.z+=(p.vz+Math.cos(seconds*.2+p.phase)*.035)*dt;p.y-=p.fallSpeed*dt;p.rx+=p.spin*dt;p.ry+=.65*dt;p.rz+=p.spin*.8*dt;if(p.y<=.3)placeNearCamera(p,kind);}
      else{p.x+=(p.vx+wind*.4)*dt;p.z+=(p.vz+Math.sin(seconds*.15+p.phase)*.025)*dt;p.y+=.58*dt;p.ry+=.4*dt;if(p.y>=4)placeNearCamera(p,kind);const flicker=.55+.45*(.5+.5*Math.sin(seconds*8+p.phase));tempColor.lerpColors(emberColors[1],emberColors[0],flicker);mesh.setColorAt(i,tempColor);}
      dummy.position.set(p.x,p.y,p.z);if(kind==='ember'){dummy.quaternion.copy(camera.quaternion);dummy.rotateZ(p.ry);dummy.scale.setScalar(.9+.2*(.5+.5*Math.sin(seconds*8+p.phase)));}else{dummy.rotation.set(p.rx,p.ry,p.rz);dummy.scale.setScalar(1);}dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    }mesh.instanceMatrix.needsUpdate=true;if(kind==='ember'&&mesh.instanceColor)mesh.instanceColor.needsUpdate=true;};
  update(petals,'petal');update(embers,'ember');
}

function addTrees(scene) {
  const count=mobile()?70:140, trunks=[], crowns=[];
  for(let i=0;i<count;i++){const a=TAU*i/count+ (rng(i+13)-.5)*.035,r=31+rng(i+41)*22,x=Math.cos(a)*r,z=Math.sin(a)*r,h=3.8+rng(i+7)*4.5,s=.8+rng(i+17)*.55;trunks.push({x,y:h*.28,z,sx:.3*s,sy:h*.6,sz:.3*s,ry:a});crowns.push({x,y:h*.75,z,sx:1.45*s,sy:h*.8,sz:1.45*s,ry:a,color:color(i%3?0x315c3a:0x416b43)});}
  scene.add(instanceMesh(new THREE.CylinderGeometry(1,1,1,5),new THREE.MeshStandardMaterial({color:0x765337,roughness:1}),trunks));
  scene.add(instanceMesh(new THREE.ConeGeometry(1,1,5),new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,flatShading:true}),crowns));
}

function addVegetation(scene) {
  const phone=mobile(),grassCount=phone?650:1800,flowerCount=phone?260:500,grass=[],tuft=[],flowers=[];
  const clearPatch=(x,z,flower=false)=>{const d=Math.hypot(x,z),pathX=Math.sin((z+16)*.14)*2.1;return d>(flower?4.7:4.4)&&Math.abs(x-pathX)>(flower?.9:.78)&&d<22.5;};
  for(let i=0;grass.length<grassCount||tuft.length<210;i++){
    const group=Math.floor(i/8),a=rng(group+78)*TAU,r=7+Math.sqrt(rng(group+39))*15.5,cx=Math.cos(a)*r,cz=Math.sin(a)*r;
    const x=cx+(rng(i+7001)-.5)*1.05,z=cz+(rng(i+9001)-.5)*1.05;if(!clearPatch(x,z))continue;
    const entry={x,y:.02,z,ry:rng(i+91)*TAU,sx:.58+rng(i+52)*.48,sy:.84+rng(i+14)*.33,sz:.58+rng(i+19)*.48,color:color([0x76a94c,0x8fbd5a,0xa2ca68][i%3])};
    if(grass.length<grassCount)grass.push(entry);else tuft.push(entry);
  }
  const blade=new THREE.ConeGeometry(.042,.30,3);blade.translate(0,.15,0);
  const bladeColors=[];for(let i=0;i<blade.attributes.position.count;i++){const y=blade.attributes.position.getY(i),q=THREE.MathUtils.clamp(y/.30,0,1),c=lerpColor(srgb(.46,.65,.30),srgb(.78,.90,.48),q*.72);bladeColors.push(c.r,c.g,c.b);}blade.setAttribute('color',new THREE.Float32BufferAttribute(bladeColors,3));
  const grassMaterial=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:1});
  grassMaterial.onBeforeCompile=shader=>{shader.uniforms.uWindTime={value:0};grassMaterial.userData.shader=shader;shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float uWindTime;');shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','transformed.x += sin(uWindTime + instanceMatrix[3].x*0.13 + instanceMatrix[3].z*0.09) * max(position.y,0.0) * 0.075;\n#include <project_vertex>');};
  grassMaterial.customProgramCacheKey=()=> 'wind-grass-v1';scene.add(instanceMesh(blade,grassMaterial,grass));
  scene.add(instanceMesh(blade,new THREE.MeshStandardMaterial({color:0x648448,roughness:1}),tuft));
  const flowerColors=[0xe99cb1,0xf1cf63,0xb5a0dc,0xf2ede1],flowerGeometries=[];
  for(let i=0,tries=0;flowers.length<flowerCount&&tries<flowerCount*12;tries++){
    const group=Math.floor(i/5),a=rng(group+181)*TAU,r=7+Math.sqrt(rng(group+173))*15.3,cx=Math.cos(a)*r,cz=Math.sin(a)*r,x=cx+(rng(i+12001)-.5)*.85,z=cz+(rng(i+14001)-.5)*.85;if(!clearPatch(x,z,true))continue;
    const h=.15+rng(i+203)*.1,ry=rng(i+197)*TAU,head=flowerColors[i%flowerColors.length],base=new THREE.Vector3(x,.02,z),rotation=new THREE.Matrix4().makeRotationY(ry);
    const parts=[[new THREE.CylinderGeometry(.018,.018,h*.72,4,1),new THREE.Vector3(0,h*.36,0),0x59733b],[new THREE.OctahedronGeometry(.2,0),new THREE.Vector3(0,h*.82,0),head],[new THREE.SphereGeometry(.045,5,4),new THREE.Vector3(0,h*.82,0),0xf0c342]];
    for(const [geo,offset,tint] of parts){geo.applyMatrix4(new THREE.Matrix4().makeTranslation(offset.x,offset.y,offset.z));geo.applyMatrix4(rotation);geo.applyMatrix4(new THREE.Matrix4().makeTranslation(base.x,base.y,base.z));const c=color(tint),arr=[];for(let v=0;v<geo.attributes.position.count;v++)arr.push(c.r,c.g,c.b);geo.setAttribute('color',new THREE.Float32BufferAttribute(arr,3));flowerGeometries.push(geo);}
    flowers.push({x,z});i++;
  }
  if(flowerGeometries.length){
    // Primitive geometries differ in whether they carry an index buffer. Merge
    // matching non-indexed copies so the grouped flowers remain a single draw.
    const mergeInputs=flowerGeometries.map(g=>g.toNonIndexed());
    const merged=mergeGeometries(mergeInputs,false);
    if(merged)scene.add(new THREE.Mesh(merged,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8})));
    for(const g of mergeInputs)g.dispose();for(const g of flowerGeometries)g.dispose();
  }
  let pollen=null;
  if(!phone){const motes=Array.from({length:250},(_,i)=>{const a=rng(i+301)*TAU,r=6+rng(i+307)*16;return{x:Math.cos(a)*r,y:1+rng(i+311)*6,z:Math.sin(a)*r,sx:.035,sy:.035,sz:.035};});pollen=instanceMesh(new THREE.SphereGeometry(1,4,3),new THREE.MeshBasicMaterial({color:0xffe8a0,transparent:true,opacity:.42,depthWrite:false}),motes);pollen.userData.base=motes;scene.add(pollen);}
  return {grassMaterial,pollen};
}

function addWallAndProps(scene) {
  const radius=ARENA_RADIUS+.2, blocks=168, wall=[], caps=[];
  for(let i=0;i<blocks;i++){const a=i/blocks*TAU,x=Math.cos(a)*radius,z=Math.sin(a)*radius;wall.push({x,y:.48,z,ry:a-Math.PI/2,sx:radius*TAU/blocks*1.05,sy:.82,sz:.2,color:color(i%5?0x88877e:0x9b988c)});caps.push({x,y:.96,z,ry:a-Math.PI/2,sx:radius*TAU/blocks*1.03,sy:.14,sz:.3,color:color(i%6?0x5e625e:0x74776d)});}
  scene.add(instanceMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}),wall,true));
  scene.add(instanceMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}),caps,true));
  const pillars=OBSTACLES.filter(o=>o.type==='pillar').map(o=>({x:o.x,y:o.height/2,z:o.z,sx:o.radius*.95,sy:o.height,sz:o.radius*.95}));
  const rocks=OBSTACLES.filter(o=>o.type==='rock').map(o=>({x:o.x,y:o.height/2,z:o.z,sx:o.radius*1.1,sy:o.height*.9,sz:o.radius*1.1,ry:rng(o.x+o.z)*TAU}));
  scene.add(instanceMesh(new THREE.CylinderGeometry(1,1,1,7),new THREE.MeshStandardMaterial({color:0x8b8b80,flatShading:true,roughness:1}),pillars,true));
  const pillarCaps=OBSTACLES.filter(o=>o.type==='pillar').map(o=>({x:o.x,y:o.height+.08,z:o.z,sx:o.radius*1.2,sy:.16,sz:o.radius*1.2}));
  scene.add(instanceMesh(new THREE.CylinderGeometry(1,1,1,7),new THREE.MeshStandardMaterial({color:0x555c56,flatShading:true,roughness:1}),pillarCaps,true));
  scene.add(instanceMesh(new THREE.DodecahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:0x77786f,flatShading:true,roughness:1}),rocks,true));
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;const ctx=shadowCanvas.getContext('2d'),g=ctx.createRadialGradient(64,64,5,64,64,62);g.addColorStop(0,'rgba(20,22,17,0.38)');g.addColorStop(1,'rgba(20,22,17,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);const shadowMat=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false});
  const decals=[...OBSTACLES.map(o=>({x:o.x,y:.015,z:o.z,sx:o.radius*4.5,sy:o.radius*4.5,rx:-Math.PI/2})),...Array.from({length:blocks},(_,i)=>{const a=i/blocks*TAU;return{x:Math.cos(a)*radius,y:.012,z:Math.sin(a)*radius,sx:1.5,sy:1.5,rx:-Math.PI/2};})];
  scene.add(instanceMesh(new THREE.PlaneGeometry(1,1),shadowMat,decals));
  const outsideRocks=Array.from({length:64},(_,i)=>{const a=rng(i+409)*TAU,r=27+rng(i+419)*60,s=.5+rng(i+421)*1.8;return{x:Math.cos(a)*r,y:.2+s*.25,z:Math.sin(a)*r,sx:s,sy:s*.7,sz:s,ry:rng(i+431)*TAU,color:color(i%2?0x77796f:0x89877c)};});
  scene.add(instanceMesh(new THREE.DodecahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:0xffffff,flatShading:true,roughness:1}),outsideRocks));
  // One instanced cloth mesh supplies both warm banners at opposite arena ends.
  const flagGeo=new THREE.PlaneGeometry(1.4,2.1,4,8);const flagMat=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,side:THREE.DoubleSide,roughness:1});
  const flagColors=[];for(let i=0;i<flagGeo.attributes.position.count;i++){const p=flagGeo.attributes.position;const t=(p.getX(i)+.7)/1.4;const c=t<.5?color(0xc97843):color(0xd99b54);flagColors.push(c.r,c.g,c.b);}flagGeo.setAttribute('color',new THREE.Float32BufferAttribute(flagColors,3));
  const bannerData=[{x:0,y:2.35,z:radius-.35,ry:0},{x:0,y:2.35,z:-radius+.35,ry:Math.PI}];
  const poles=bannerData.flatMap(b=>[-.78,.78].map(dx=>({x:b.x+dx,y:2.15,z:b.z,ry:b.ry,sx:.07,sy:2.5,sz:.07})));
  scene.add(instanceMesh(new THREE.CylinderGeometry(1,1,1,6),new THREE.MeshStandardMaterial({color:0x594835,roughness:1}),poles));
  const banners=instanceMesh(flagGeo,flagMat,bannerData);banners.material.onBeforeCompile=shader=>{shader.uniforms.uBannerTime={value:0};banners.userData.shader=shader;shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float uBannerTime;');shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.z += sin(uBannerTime + position.y*1.7 + instanceMatrix[3].z*.1)*position.x*position.x*.18;');};
  scene.add(banners);return {banners};
}

function addMountains(scene) {
  const p=[],c=[],idx=[],count=24;
  for(let i=0;i<count;i++){const a=i/count*TAU,r=187,h=25+rng(i+509)*24,w=13+rng(i+521)*13,cx=Math.cos(a)*r,cz=Math.sin(a)*r,base=p.length/3;const points=[[cx-w,2,cz],[cx,h,cz],[cx+w,2,cz],[cx,2,cz+w*.65],[cx,2,cz-w*.65]];for(const [x,y,z] of points){p.push(x,y,z);const snow=y>h*.68?color(0xe5e2d7):lerpColor(color(0x657c72),color(0xdcd3bd),.48);c.push(snow.r,snow.g,snow.b);}idx.push(base,base+1,base+2,base+2,base+1,base+3,base+1,base,base+4,base+4,base+1,base+2);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(c,3));geo.setIndex(idx);geo.computeVertexNormals();scene.add(new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1,side:THREE.DoubleSide})));
}

export function createArena(scene, renderer, {phone=mobile(),timeOfDay='day'}={}) {
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;renderer.outputColorSpace=THREE.SRGBColorSpace;
  scene.background=new THREE.Color(0xdcd3bd);scene.fog=new THREE.Fog(0xdcd3bd,45,200);
  const sky=makeSky(scene),hemi=new THREE.HemisphereLight(0xcfe0ff,0x7a6038,1.7);scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xffe2b8,2.8);sun.position.set(-90,156,86);sun.castShadow=true;sun.shadow.mapSize.set(phone?512:2048,phone?512:2048);sun.shadow.camera.left=-27;sun.shadow.camera.right=27;sun.shadow.camera.top=27;sun.shadow.camera.bottom=-27;sun.shadow.camera.near=1;sun.shadow.camera.far=280;sun.shadow.bias=-.00015;scene.add(sun);scene.add(sun.target);sun.target.position.set(0,0,0);
  scene.add(makeGround());scene.add(makeHills());const props=addWallAndProps(scene),vegetation=addVegetation(scene);addTrees(scene);addMountains(scene);const clouds=makeClouds(scene),particles=makeAtmosphereParticles(scene,phone);
  const world={scene,sky,clouds,sun,hemi,renderer,phone,banners:props.banners,grassMaterial:vegetation.grassMaterial,pollen:vegetation.pollen,...particles,targetEvening:timeOfDay==='evening'?1:0,evening:timeOfDay==='evening'?1:0,lastAtmosphereTime:0};applyAtmosphere(world,world.evening);return world;
}

export function animateArena(world, t, camera=null) {
  if(!world)return;const seconds=t/1000;
  const dt=world.lastAtmosphereTime?Math.min(.1,Math.max(0,(t-world.lastAtmosphereTime)/1000)):0;world.lastAtmosphereTime=t;
  if(dt&&Math.abs(world.targetEvening-world.evening)>.0001){const next=world.evening+Math.sign(world.targetEvening-world.evening)*Math.min(dt,Math.abs(world.targetEvening-world.evening));applyAtmosphere(world,next);}
  if(world.clouds)world.clouds.material.uniforms.time.value=seconds;
  if(world.banners?.userData.shader)world.banners.userData.shader.uniforms.uBannerTime.value=seconds;
  if(world.grassMaterial?.userData.shader)world.grassMaterial.userData.shader.uniforms.uWindTime.value=seconds;
  if(world.pollen?.userData.base){const dummy=new THREE.Object3D();world.pollen.userData.base.forEach((p,i)=>{dummy.position.set(p.x,Math.max(.5,p.y+Math.sin(seconds*.7+i)*.22),p.z);const fade=camera?THREE.MathUtils.smoothstep(camera.position.distanceTo(dummy.position),1.5,6):1;dummy.scale.setScalar(.035*fade);dummy.updateMatrix();world.pollen.setMatrixAt(i,dummy.matrix);});world.pollen.instanceMatrix.needsUpdate=true;}
  animateParticles(world,seconds,dt,camera);
}

const rimMaterials=new WeakMap();
export function addFresnelRim(model, tint=0xffe4b5, strength=.35) {
  const hex=new THREE.Color(tint),rgb=`${hex.r.toFixed(4)},${hex.g.toFixed(4)},${hex.b.toFixed(4)}`;
  model.root.traverse(node=>{if(!node.isMesh||!node.material)return;const patch=material=>{let variants=rimMaterials.get(material);if(!variants){variants=new Map();rimMaterials.set(material,variants);}const key=`${rgb}:${strength}`;if(variants.has(key))return variants.get(key);const copy=material.clone();copy.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWarmNormal; varying vec3 vWarmView;').replace('#include <defaultnormal_vertex>','#include <defaultnormal_vertex>\nvWarmNormal=normalize(transformedNormal);').replace('#include <project_vertex>','#include <project_vertex>\nvWarmView=-mvPosition.xyz;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vWarmNormal; varying vec3 vWarmView;').replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>\nfloat warmRim=pow(1.0-max(dot(normalize(vWarmNormal),normalize(vWarmView)),0.0),2.5); totalEmissiveRadiance += vec3(${rgb}) * warmRim * ${strength.toFixed(3)};`);};copy.customProgramCacheKey=()=>`warm-rim-${rgb}-${strength}`;variants.set(key,copy);return copy;};node.material=Array.isArray(node.material)?node.material.map(patch):patch(node.material);});
}
