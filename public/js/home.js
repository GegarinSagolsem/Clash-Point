import * as THREE from 'three';
import { loadFighter, playAnimation } from './models.js';
import { addFresnelRim, animateArena, createArena } from './world.js';

export class HomeArena {
  constructor(mount){
    this.mount=mount;this.active=false;this.running=true;this.models=[];this.last=performance.now();this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));this.renderer.setSize(innerWidth,innerHeight);this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;mount.append(this.renderer.domElement);
    this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(innerWidth<=600?78:43,innerWidth/innerHeight,.1,280);this.world=createArena(this.scene,this.renderer);
    this.resize=()=>{this.camera.aspect=innerWidth/innerHeight;this.camera.fov=innerWidth<=600?78:43;this.camera.far=280;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);};window.addEventListener('resize',this.resize);
    this.loop=this.loop.bind(this);this.loadModels();
  }
  async loadModels(){
    for(const [kind,x,yaw] of [['Knight',-2.1,Math.PI/2],['Barbarian',2.1,-Math.PI/2]]){
      try{const model=await loadFighter(kind);if(!this.running)return;model.root.position.set(x,0,0);model.root.rotation.y=yaw;addFresnelRim(model);this.scene.add(model.root);this.makePreview(model,kind);playAnimation(model,'Idle');this.models.push({model,nextCheer:performance.now()+9000+Math.random()*9000,cheering:false});}
      catch{}
    }
    try{const rogue=await loadFighter('Rogue');if(this.running)this.makePreview(rogue,'Rogue');}catch{}
    if(this.active)this.schedule();
  }
  makePreview(model,kind){
    const root=model.root,wasInScene=root.parent===this.scene,oldPos=root.position.clone(),oldRot=root.rotation.clone(),vis=this.scene.children.map(o=>[o,o.visible]),target=new THREE.WebGLRenderTarget(160,192),tempCam=new THREE.PerspectiveCamera(34,160/192,.1,20),px=new Uint8Array(160*192*4);
    try{
      if(!wasInScene)this.scene.add(root);this.scene.children.forEach(o=>o.visible=o===root||o.isLight);root.position.set(0,0,0);root.rotation.set(0,0,0);tempCam.position.set(2.5,1.35,3.6);tempCam.lookAt(0,.9,0);this.renderer.setRenderTarget(target);this.renderer.render(this.scene,tempCam);this.renderer.readRenderTargetPixels(target,0,0,160,192,px);
      const c=document.createElement('canvas');c.width=160;c.height=192;const cx=c.getContext('2d');if(!cx)return;const im=cx.createImageData(160,192);for(let y=0;y<192;y++)im.data.set(px.subarray((191-y)*640,(192-y)*640),y*640);cx.putImageData(im,0,0);document.querySelectorAll(`[data-fighter-preview="${kind}"]`).forEach(img=>img.src=c.toDataURL());
    }catch{}
    finally{this.renderer.setRenderTarget(null);target.dispose();root.position.copy(oldPos);root.rotation.copy(oldRot);vis.forEach(([o,v])=>o.visible=v);if(!wasInScene)this.scene.remove(root);}
  }
  setActive(active){this.active=active;if(active)this.schedule();}
  schedule(){if(this.active&&this.running&&!this.frame)this.frame=requestAnimationFrame(this.loop);}
  loop(t){this.frame=0;if(!this.active||!this.running)return;const dt=Math.min(.1,(t-this.last)/1000);this.last=t;const a=t*.000055,mobile=innerWidth<=600,targetX=mobile?0:-3,targetY=mobile?-4.5:1.2,radius=mobile?14:14,height=mobile?7:6.2;this.camera.position.set(targetX+Math.sin(a)*radius,height,targetY+Math.cos(a)*radius);this.camera.lookAt(targetX,targetY,0);for(const entry of this.models){const {model}=entry;model.mixer.update(dt);if(!entry.cheering&&t>=entry.nextCheer){entry.cheering=true;playAnimation(model,'Cheer',true);}if(entry.cheering&&!model.actions.Cheer?.isRunning()){entry.cheering=false;playAnimation(model,'Idle');entry.nextCheer=t+14000+Math.random()*14000;}}animateArena(this.world,t,this.camera);this.renderer.render(this.scene,this.camera);this.frame=requestAnimationFrame(this.loop);}
  destroy(){this.running=false;this.active=false;cancelAnimationFrame(this.frame);window.removeEventListener('resize',this.resize);this.renderer.dispose();this.mount.replaceChildren();}
}
