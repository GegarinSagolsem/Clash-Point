import * as THREE from 'three';
import { ARENA_RADIUS, OBSTACLES } from '/shared/rules.js';
import { loadFighter, playAnimation } from './models.js';

export class HomeArena {
  constructor(mount){
    this.mount=mount;this.active=false;this.running=true;this.models=[];this.last=performance.now();this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));this.renderer.setSize(innerWidth,innerHeight);this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.BasicShadowMap;mount.append(this.renderer.domElement);
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x83b9d8);this.scene.fog=new THREE.Fog(0x83b9d8,32,76);this.camera=new THREE.PerspectiveCamera(innerWidth<=600?58:43,innerWidth/innerHeight,.1,120);
    this.scene.add(new THREE.HemisphereLight(0xd9f2ff,0x526043,2));const sun=new THREE.DirectionalLight(0xfff3d6,2.1);sun.position.set(-10,24,10);this.scene.add(sun);
    const ground=new THREE.Mesh(new THREE.CircleGeometry(ARENA_RADIUS,64),new THREE.MeshStandardMaterial({color:0x72984d,roughness:1}));ground.rotation.x=-Math.PI/2;this.scene.add(ground);
    const wall=new THREE.Mesh(new THREE.TorusGeometry(ARENA_RADIUS-.25,.55,8,96),new THREE.MeshStandardMaterial({color:0x737b7b,roughness:.9}));wall.rotation.x=Math.PI/2;wall.position.y=.52;this.scene.add(wall);
    for(const o of OBSTACLES){const geometry=o.type==='pillar'?new THREE.CylinderGeometry(o.radius,o.radius,o.height,8):new THREE.DodecahedronGeometry(o.radius,0),mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:o.type==='pillar'?0x8b9291:0x77796f,flatShading:true}));mesh.position.set(o.x,o.height/2,o.z);this.scene.add(mesh);}
    this.resize=()=>{this.camera.aspect=innerWidth/innerHeight;this.camera.fov=innerWidth<=600?58:43;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);};window.addEventListener('resize',this.resize);
    this.loop=this.loop.bind(this);this.loadModels();
  }
  async loadModels(){
    for(const [kind,x,yaw] of [['Knight',-2.1,Math.PI/2],['Barbarian',2.1,-Math.PI/2]]){
      try{const model=await loadFighter(kind);if(!this.running)return;model.root.position.set(x,0,0);model.root.rotation.y=yaw;this.scene.add(model.root);playAnimation(model,'Idle');this.models.push({model,nextCheer:performance.now()+9000+Math.random()*9000,cheering:false});}
      catch{}
    }
    if(this.active)this.schedule();
  }
  setActive(active){this.active=active;if(active)this.schedule();}
  schedule(){if(this.active&&this.running&&!this.frame)this.frame=requestAnimationFrame(this.loop);}
  loop(t){this.frame=0;if(!this.active||!this.running)return;const dt=Math.min(.1,(t-this.last)/1000);this.last=t;const a=t*.000055,mobile=innerWidth<=600,targetX=mobile?0:-3,targetY=mobile?-1.4:1.2,radius=mobile?8.5:14,height=mobile?4.7:6.2;this.camera.position.set(targetX+Math.sin(a)*radius,height,targetY+Math.cos(a)*radius);this.camera.lookAt(targetX,targetY,0);for(const entry of this.models){const {model}=entry;model.mixer.update(dt);if(!entry.cheering&&t>=entry.nextCheer){entry.cheering=true;playAnimation(model,'Cheer',true);}if(entry.cheering&&!model.actions.Cheer?.isRunning()){entry.cheering=false;playAnimation(model,'Idle');entry.nextCheer=t+14000+Math.random()*14000;}}this.renderer.render(this.scene,this.camera);this.frame=requestAnimationFrame(this.loop);}
  destroy(){this.running=false;this.active=false;cancelAnimationFrame(this.frame);window.removeEventListener('resize',this.resize);this.renderer.dispose();this.mount.replaceChildren();}
}
