const defaults={sensitivity:1,fov:72,volume:1,musicVolume:.35,muted:false,timeOfDay:'day'};
let saved={};
try{saved=JSON.parse(localStorage.getItem('clash-point-settings')||'{}')||{};}catch{}
export const preferences={...defaults,...saved};
export function setPreferences(changes){
  Object.assign(preferences,changes);
  try{localStorage.setItem('clash-point-settings',JSON.stringify(preferences));}catch{}
  window.dispatchEvent(new Event('clash-settings-change'));
}
