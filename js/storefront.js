import * as THREE from 'three';

// Lightweight facade; real art can replace this group without changing its site.
export function addStorefront(scene, pos, label, accent = '#59c7ce', width = 4) {
  const group = new THREE.Group(); group.name = label; group.position.copy(pos);
  const geo = new THREE.BoxGeometry(1,1,1);
  const wall = new THREE.MeshStandardMaterial({color:'#69727a',roughness:.85});
  const trim = new THREE.MeshStandardMaterial({color:accent,roughness:.6});
  const glass = new THREE.MeshStandardMaterial({color:'#213945',metalness:.35,roughness:.25});
  function part(mat,x,y,z,sx,sy,sz) {const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;group.add(m);}
  part(wall,0,1.5,0,width,3,3);
  part(glass,0,1.1,1.515,.9,2.2,.035);
  for (const side of [-1,1]) part(glass,side*width*.32,1.4,1.52,width*.25,1.3,.04);
  part(trim,0,2.65,1.8,width+.2,.14,.85);
  part(trim,.3,1.1,1.57,.035,.35,.04);
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=64;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#15212a';ctx.fillRect(0,0,512,64);ctx.fillStyle=accent;
  ctx.font='bold 34px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,256,34,490);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(width,.5),new THREE.MeshBasicMaterial({map:texture}));
  sign.position.set(0,2.94,1.52);group.add(sign);scene.add(group);return group;
}
