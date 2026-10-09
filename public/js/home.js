import * as THREE from 'three';
import { loadFighter, playAnimation } from './models.js';
import { warmGameAssets } from './game.js';
import { addFresnelRim, animateArena, createArena, setArenaTimeOfDay, warmArenaAtmosphere } from './world.js';
import { preferences } from './preferences.js';

export class HomeArena {
  constructor(mount){
    this.mount=mount;this.active=false;this.running=true;this.models=[];this.last=performance.now();this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));this.renderer.setSize(innerWidth,innerHeight);this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;mount.append(this.renderer.domElement);
    this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(innerWidth<=600?78:43,innerWidth/innerHeight,.1,280);this.pageRandomTimeOfDay=Math.random()<.5?'day':'evening';this.world=createArena(this.scene,this.renderer,{timeOfDay:preferences.timeOfDay==='random'?this.pageRandomTimeOfDay:preferences.timeOfDay});this.arenaWarmup=warmArenaAtmosphere(this.world,this.scene,this.renderer,this.camera);
    this.resize=()=>{this.camera.aspect=innerWidth/innerHeight;this.camera.fov=innerWidth<=600?78:43;this.camera.far=280;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);};window.addEventListener('resize',this.resize);
    this.loop=this.loop.bind(this);this.ready=this.loadModels();
  }
  async loadModels(){
    const fighterPromise=Promise.all(['Knight','Barbarian','Rogue'].map(async kind=>[kind,await loadFighter(kind).catch(()=>null)]));
    await this.arenaWarmup;if(!this.running)return;
    const fighters=await fighterPromise;if(!this.running)return;
    for(const [kind,x,yaw] of [['Knight',-2.1,Math.PI/2],['Barbarian',2.1,-Math.PI/2]]){
      const model=fighters.find(([name])=>name===kind)?.[1];if(!model)continue;model.root.position.set(x,0,0);model.root.rotation.y=yaw;addFresnelRim(model);this.scene.add(model.root);playAnimation(model,'Idle');this.models.push({model,nextCheer:performance.now()+9000+Math.random()*9000,cheering:false});
    }
    if(this.active)this.schedule();
    await warmGameAssets(['Knight','Barbarian','Rogue']).catch(()=>{});
  }
  setActive(active){this.active=active;if(active)this.schedule();}
  setTimeOfDay(value){setArenaTimeOfDay(this.world,value==='random'?this.pageRandomTimeOfDay:value);}
  schedule(){if(this.active&&this.running&&!this.frame)this.frame=requestAnimationFrame(this.loop);}
  loop(t){this.frame=0;if(!this.active||!this.running)return;const dt=Math.min(.1,(t-this.last)/1000);this.last=t;const a=t*.000055,mobile=innerWidth<=600,targetX=mobile?0:-3,targetY=mobile?-4.5:1.2,radius=mobile?14:14,height=mobile?7:6.2;this.camera.position.set(targetX+Math.sin(a)*radius,height,targetY+Math.cos(a)*radius);this.camera.lookAt(targetX,targetY,0);for(const entry of this.models){const {model}=entry;model.mixer.update(dt);if(!entry.cheering&&t>=entry.nextCheer){entry.cheering=true;playAnimation(model,'Cheer',true);}if(entry.cheering&&!model.actions.Cheer?.isRunning()){entry.cheering=false;playAnimation(model,'Idle');entry.nextCheer=t+14000+Math.random()*14000;}}animateArena(this.world,t,this.camera);this.renderer.render(this.scene,this.camera);this.frame=requestAnimationFrame(this.loop);}
  destroy(){this.running=false;this.active=false;cancelAnimationFrame(this.frame);window.removeEventListener('resize',this.resize);this.renderer.dispose();this.mount.replaceChildren();}
}
