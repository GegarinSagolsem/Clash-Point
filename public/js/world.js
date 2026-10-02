import * as THREE from 'three';
import { ARENA_RADIUS, OBSTACLES } from '/shared/rules.js';

const TAU = Math.PI * 2;
const mobile = () => innerWidth <= 600 || navigator.maxTouchPoints > 0;
const rng = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const color = (hex) => new THREE.Color(hex);
const srgb = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
const lerpColor = (a, b, t) => a.clone().lerp(b, THREE.MathUtils.clamp(t, 0, 1));

function surfaceColor(x, z) {
  const d = Math.hypot(x, z), cell = Math.floor(x / 1.4) * 7919 + Math.floor(z / 1.4) * 104729;
  const choices = [srgb(.40,.58,.24), srgb(.54,.70,.30), srgb(.32,.49,.21)];
  let c = choices[Math.floor(rng(cell) * choices.length)].clone();
  const meadow = Math.sin(x * .095 + Math.sin(z * .07)) * Math.sin(z * .082 - x * .035);
  c.lerp(srgb(meadow > .12 ? .62 : .26, meadow > .12 ? .70 : .45, meadow > .12 ? .30 : .20), Math.abs(meadow) * .34);
  const pathX = Math.sin((z + 16) * .14) * 2.1;
  const pathDist = Math.abs(x - pathX);
  const path = 1 - THREE.MathUtils.smoothstep(pathDist, 1.05, 2.0);
  const plaza = 1 - THREE.MathUtils.smoothstep(d, 5, 9);
  const dirt = srgb(.68,.56,.36), stone = srgb(.64,.61,.54);
  c.lerp(dirt, path * .92);
  c.lerp(dirt, (1 - THREE.MathUtils.smoothstep(d, 20.8, 23.7)) * .72);
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
  const material = new THREE.ShaderMaterial({ side:THREE.BackSide, depthWrite:false, fog:false,
    vertexShader:'varying float h; void main(){h=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying float h; void main(){vec3 horizon=vec3(0.863,0.827,0.741);vec3 mid=vec3(0.612,0.761,0.886);float k=smoothstep(-0.08,0.38,h);vec3 c=mix(horizon,mid,k);c=mix(c,vec3(0.247,0.471,0.753),smoothstep(0.38,0.88,h));gl_FragColor=vec4(c,1.0);}' });
  const sky = new THREE.Mesh(geometry, material); scene.add(sky);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d'),g=ctx.createRadialGradient(256,256,4,256,256,250);g.addColorStop(0,'rgba(255,244,211,0.95)');g.addColorStop(.18,'rgba(255,222,169,0.40)');g.addColorStop(1,'rgba(255,220,170,0)');ctx.fillStyle=g;ctx.fillRect(0,0,512,512);
  const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));halo.position.set(-90,115,82);halo.scale.set(62,62,1);scene.add(halo);
  return sky;
}

function makeClouds(scene) {
  const geometry = new THREE.SphereGeometry(205, 36, 18, 0, TAU, 0, Math.PI * .43);
  const material = new THREE.ShaderMaterial({ side:THREE.BackSide, transparent:true, depthWrite:false, uniforms:{time:{value:0}},
    vertexShader:'varying vec3 v; void main(){v=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying vec3 v;uniform float time;void main(){float n=sin(v.x*17.0+time*.015)*sin(v.z*19.0-time*.012)+sin(v.x*39.0+v.z*27.0+time*.01)*.25;float a=smoothstep(.48,.8,n)*.26;gl_FragColor=vec4(0.96,0.92,0.82,a);}' });
  const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);return mesh;
}

function addTrees(scene) {
  const count=mobile()?70:140, trunks=[], crowns=[];
  for(let i=0;i<count;i++){const a=TAU*i/count+ (rng(i+13)-.5)*.035,r=31+rng(i+41)*22,x=Math.cos(a)*r,z=Math.sin(a)*r,h=3.8+rng(i+7)*4.5,s=.8+rng(i+17)*.55;trunks.push({x,y:h*.28,z,sx:.3*s,sy:h*.6,sz:.3*s,ry:a});crowns.push({x,y:h*.75,z,sx:1.45*s,sy:h*.8,sz:1.45*s,ry:a,color:color(i%3?0x315c3a:0x416b43)});}
  scene.add(instanceMesh(new THREE.CylinderGeometry(1,1,1,5),new THREE.MeshStandardMaterial({color:0x765337,roughness:1}),trunks));
  scene.add(instanceMesh(new THREE.ConeGeometry(1,1,5),new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,flatShading:true}),crowns));
}

function addVegetation(scene) {
  const phone=mobile(), grassCount=phone?350:800, flowerCount=phone?260:500, grass=[], tuft=[], flowers=[];
  for(let i=0;i<grassCount+150;i++){
    const a=rng(i+78)*TAU,r=Math.sqrt(rng(i+39))*22.8,x=Math.cos(a)*r,z=Math.sin(a)*r,pathX=Math.sin((z+16)*.14)*2.1,d=Math.hypot(x,z);
    if(d<5.7||Math.abs(x-pathX)<1.6)continue;
    const entry={x,y:.02,z,ry:rng(i+91)*TAU,sx:.8+rng(i+52)*.65,sy:.75+rng(i+14)*.6,sz:.8+rng(i+19)*.65,color:color([0x58853f,0x72994d,0x86a955][i%3])};
    (i<grassCount?grass:tuft).push(entry);
  }
  const blade=new THREE.ConeGeometry(.065,.38,3);blade.translate(0,.19,0);
  const grassMaterial=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:false,roughness:1});
  grassMaterial.onBeforeCompile=shader=>{shader.uniforms.uWindTime={value:0};grassMaterial.userData.shader=shader;shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float uWindTime;');shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','transformed.x += sin(uWindTime + instanceMatrix[3].x*0.13 + instanceMatrix[3].z*0.09) * max(position.y,0.0) * 0.08;\n#include <project_vertex>');};
  grassMaterial.customProgramCacheKey=()=> 'wind-grass-v1';
  const blades=instanceMesh(blade,grassMaterial,grass);blades.instanceColor=blades.instanceColor||null;scene.add(blades);
  const tufts=instanceMesh(blade,new THREE.MeshStandardMaterial({color:0x55763a,roughness:1}),tuft);scene.add(tufts);
  for(let i=0;i<flowerCount;i++){
    const a=rng(i+181)*TAU,r=Math.sqrt(rng(i+173))*22.8,x=Math.cos(a)*r,z=Math.sin(a)*r,d=Math.hypot(x,z),pathX=Math.sin((z+16)*.14)*2.1;if(d<6||Math.abs(x-pathX)<1.8)continue;
    flowers.push({x,y:.02,z,ry:rng(i+197)*TAU,h:.15+rng(i+203)*.1,c:i%4});
  }
  const stems=flowers.map(f=>({x:f.x,y:f.y+f.h*.35,z:f.z,ry:f.ry,sx:.018,sy:f.h*.7,sz:.018}));
  scene.add(instanceMesh(new THREE.CylinderGeometry(1,1,1,4),new THREE.MeshStandardMaterial({color:0x59733b,roughness:1}),stems));
  const blossomColors=[0xe8c7bd,0xe8d8a6,0xc4cadc,0xdfb3aa];
  const petalGeometry=new THREE.OctahedronGeometry(.1,0);
  const petals=flowers.map(f=>({x:f.x,y:f.y+f.h*.78,z:f.z,ry:f.ry,sx:.5+rng(f.x*13+f.z)*.3,sy:.42,sz:.5+rng(f.z*19)*.3,color:color(blossomColors[f.c])}));
  scene.add(instanceMesh(petalGeometry,new THREE.MeshStandardMaterial({color:0xffffff,roughness:.8}),petals));
  const centres=flowers.map(f=>({x:f.x,y:f.y+f.h*.78,z:f.z,sx:.16,sy:.16,sz:.16}));
  scene.add(instanceMesh(new THREE.SphereGeometry(.1,5,4),new THREE.MeshStandardMaterial({color:0xf0c342,roughness:.7}),centres));
  let pollen=null;
  if(!phone){const motes=Array.from({length:250},(_,i)=>{const a=rng(i+301)*TAU,r=6+rng(i+307)*16;return{x:Math.cos(a)*r,y:1+rng(i+311)*6,z:Math.sin(a)*r,sx:.035,sy:.035,sz:.035};});pollen=instanceMesh(new THREE.SphereGeometry(1,4,3),new THREE.MeshBasicMaterial({color:0xffe8a0,transparent:true,opacity:.42,depthWrite:false}),motes);pollen.userData.base=motes;scene.add(pollen);}
  return {grassMaterial,pollen};
}

function addWallAndProps(scene) {
  const radius=ARENA_RADIUS-.28, blocks=168, wall=[], caps=[];
  for(let i=0;i<blocks;i++){const a=i/blocks*TAU,x=Math.cos(a)*radius,z=Math.sin(a)*radius;wall.push({x,y:.48,z,ry:a-Math.PI/2,sx:radius*TAU/blocks*1.05,sy:.82,sz:.62,color:color(i%5?0x88877e:0x9b988c)});caps.push({x,y:.96,z,ry:a-Math.PI/2,sx:radius*TAU/blocks*1.03,sy:.14,sz:.76,color:color(i%6?0x5e625e:0x74776d)});}
  scene.add(instanceMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}),wall,true));
  scene.add(instanceMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}),caps,true));
  const pillars=OBSTACLES.filter(o=>o.type==='pillar').map(o=>({x:o.x,y:o.height/2,z:o.z,sx:o.radius*2,sy:o.height,sz:o.radius*2}));
  const rocks=OBSTACLES.filter(o=>o.type==='rock').map(o=>({x:o.x,y:o.height/2,z:o.z,sx:o.radius*2,sy:o.height,sz:o.radius*2,ry:rng(o.x+o.z)*TAU}));
  scene.add(instanceMesh(new THREE.CylinderGeometry(1,1,1,7),new THREE.MeshStandardMaterial({color:0x8b8b80,flatShading:true,roughness:1}),pillars,true));
  const pillarCaps=OBSTACLES.filter(o=>o.type==='pillar').map(o=>({x:o.x,y:o.height+.08,z:o.z,sx:o.radius*2.35,sy:.16,sz:o.radius*2.35}));
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

export function createArena(scene, renderer, {phone=mobile()}={}) {
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;renderer.outputColorSpace=THREE.SRGBColorSpace;
  scene.background=new THREE.Color(0xdcd3bd);scene.fog=new THREE.Fog(0xdcd3bd,45,200);
  const sky=makeSky(scene);scene.add(new THREE.HemisphereLight(0xcfe0ff,0x7a6038,1.7));
  const sun=new THREE.DirectionalLight(0xffe2b8,2.8);sun.position.set(-90,156,86);sun.castShadow=true;sun.shadow.mapSize.set(phone?512:2048,phone?512:2048);sun.shadow.camera.left=-27;sun.shadow.camera.right=27;sun.shadow.camera.top=27;sun.shadow.camera.bottom=-27;sun.shadow.camera.near=1;sun.shadow.camera.far=280;sun.shadow.bias=-.00015;scene.add(sun);scene.add(sun.target);sun.target.position.set(0,0,0);
  scene.add(makeGround());scene.add(makeHills());const props=addWallAndProps(scene),vegetation=addVegetation(scene);addTrees(scene);addMountains(scene);const clouds=makeClouds(scene);
  return {sky,clouds,sun,renderer,phone,banners:props.banners,grassMaterial:vegetation.grassMaterial,pollen:vegetation.pollen};
}

export function animateArena(world, t, camera=null) {
  if(!world)return;const seconds=t/1000;
  if(world.clouds)world.clouds.material.uniforms.time.value=seconds;
  if(world.banners?.userData.shader)world.banners.userData.shader.uniforms.uBannerTime.value=seconds;
  if(world.grassMaterial?.userData.shader)world.grassMaterial.userData.shader.uniforms.uWindTime.value=seconds;
  if(world.pollen?.userData.base){const dummy=new THREE.Object3D();world.pollen.userData.base.forEach((p,i)=>{dummy.position.set(p.x,Math.max(.5,p.y+Math.sin(seconds*.7+i)*.22),p.z);const fade=camera?THREE.MathUtils.smoothstep(camera.position.distanceTo(dummy.position),1.5,6):1;dummy.scale.setScalar(.035*fade);dummy.updateMatrix();world.pollen.setMatrixAt(i,dummy.matrix);});world.pollen.instanceMatrix.needsUpdate=true;}
}

export function addFresnelRim(model, tint=0xffe4b5, strength=.35) {
  const hex=new THREE.Color(tint),rgb=`${hex.r.toFixed(4)},${hex.g.toFixed(4)},${hex.b.toFixed(4)}`;
  model.root.traverse(node=>{if(!node.isMesh||!node.material)return;const patch=material=>{const copy=material.clone();copy.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWarmNormal; varying vec3 vWarmView;').replace('#include <defaultnormal_vertex>','#include <defaultnormal_vertex>\nvWarmNormal=normalize(transformedNormal);').replace('#include <project_vertex>','#include <project_vertex>\nvWarmView=-mvPosition.xyz;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vWarmNormal; varying vec3 vWarmView;').replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>\nfloat warmRim=pow(1.0-max(dot(normalize(vWarmNormal),normalize(vWarmView)),0.0),2.5); totalEmissiveRadiance += vec3(${rgb}) * warmRim * ${strength.toFixed(3)};`);};copy.customProgramCacheKey=()=>`warm-rim-${rgb}-${strength}`;return copy;};node.material=Array.isArray(node.material)?node.material.map(patch):patch(node.material);});
}
