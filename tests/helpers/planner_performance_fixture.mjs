// Deterministic GPU fixture used by the fidelity regression and performance probe.
export async function plannerPerformanceFixture() {
    const {S,view}=window.perfFixture;
    const frame=()=>new Promise(r=>requestAnimationFrame(r));
    for(let i=0;i<35;i++)await frame();
    const renderer=view.getRenderer();
    if(renderer.domElement.width < 300 || renderer.domElement.height < 300) throw new Error('Viewport is not visible at useful resolution');
    const wallGroups=()=>view.getDynGroup().children.find(o=>o.userData.layerRoot==='structure').children.filter(o=>o.userData.wall);
    const snapshot=()=>wallGroups().map(group=>{
      const parts=[]; group.updateWorldMatrix(true,true);
      group.traverse(o=>{if(o.isMesh)parts.push({matrix:o.matrixWorld.toArray(),position:Array.from(o.geometry.attributes.position.array),normal:Array.from(o.geometry.attributes.normal.array),
        color:o.material.color?.getHex(),opacity:o.material.opacity,cast:o.castShadow,receive:o.receiveShadow});});
      return parts;
    });
    // Finish initial texture/scene setup before comparing a user edit.
    for(let warm=0;warm<3;warm++){view.rebuild3D();view.applyEnv();for(let i=0;i<40;i++)await frame();}
    const originals=wallGroups();
    let oldMaterialDisposals=0;
    originals.forEach(group=>group.traverse(object=>object.material?.addEventListener('dispose',()=>oldMaterialDisposals++)));
    S.nodes[0].x-=10; view.rebuild3D();view.applyEnv();
    const incremental=snapshot(), retained=wallGroups().filter(o=>originals.includes(o)).length;
    const bounds=view.getSelectionBox3D();
    const precise=await import('/vendor/three/three.core.js');
    const reference=new precise.Box3();
    view.getDynGroup().traverse(o=>{if(o.userData.wall===S.sel.ref){o.updateWorldMatrix(true,true);reference.expandByObject(o,true);}});
    reference.expandByScalar(2);
    const boundsEqual=JSON.stringify(bounds)===JSON.stringify(reference);
    // Compare settled main-renderer pixels, including the production post graph.
    const pixels=async()=>{for(let i=0;i<40;i++){await view.snapshot3D();await frame();}await view.__perfCapture();return view.__perfCapture();};
    const imageA=await pixels();
    const cameraA={world:view.getMainCamera().matrixWorld.toArray(),projection:view.getMainCamera().projectionMatrix.toArray()};
    renderer.render(view.getMainScene(),view.getMainCamera());
    const directA=renderer.domElement.toDataURL('image/png');
    const repeatedA=await view.__perfCapture();
    const materialsReleased=oldMaterialDisposals;
    S.walls=S.walls.map(w=>({...w}));S.sel={kind:'wall',ref:S.walls[0]};
    view.rebuild3D();
    const full=snapshot();
    const imageB=await pixels();
    const cameraB={world:view.getMainCamera().matrixWorld.toArray(),projection:view.getMainCamera().projectionMatrix.toArray()};
    renderer.render(view.getMainScene(),view.getMainCamera());
    const directB=renderer.domElement.toDataURL('image/png');
    const decode=async src=>{const image=new Image();image.src=src;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,image.width,image.height).data;};
    const a=await decode(imageA),b=await decode(imageB);let different=0,max=0,total=0;
    for(let i=0;i<a.length;i++){let d=Math.abs(a[i]-b[i]);if(d)different++;max=Math.max(max,d);total+=d;}
    const diffCanvas=document.createElement('canvas');diffCanvas.width=renderer.domElement.width;diffCanvas.height=renderer.domElement.height;
    const diffContext=diffCanvas.getContext('2d'),diff=diffContext.createImageData(diffCanvas.width,diffCanvas.height);
    for(let i=0;i<a.length;i++)diff.data[i]=i%4===3?255:Math.min(255,Math.abs(a[i]-b[i])*12);
    diffContext.putImageData(diff,0,0);
    S.walls=S.walls.map(w=>({...w}));S.sel={kind:'wall',ref:S.walls[0]};view.rebuild3D();
    const imageC=await pixels(),c=await decode(imageC);let controlDifferent=0,controlMax=0,controlTotal=0;
    for(let i=0;i<b.length;i++){const d=Math.abs(b[i]-c[i]);if(d)controlDifferent++;controlMax=Math.max(controlMax,d);controlTotal+=d;}
    const rounds=[];
    for(let r=0;r<7;r++){
      S.nodes[0].x += r % 2 ? .25 : -.25;
      const start=performance.now();view.rebuild3D();const reuseMs=performance.now()-start;
      S.walls=S.walls.map(w=>({...w}));S.sel={kind:'wall',ref:S.walls[0]};
      const startFull=performance.now();view.rebuild3D();const fullMs=performance.now()-startFull;
      rounds.push({reuseMs,fullMs});await frame();
    }
    const invalidation=[];
    const verify=(name,mutate)=>{
      mutate();view.rebuild3D();const reused=JSON.stringify(snapshot());
      S.walls=S.walls.map(w=>({...w}));S.sel={kind:'wall',ref:S.walls[0]};view.rebuild3D();
      invalidation.push({name,equal:reused===JSON.stringify(snapshot())});
    };
    verify('height and adjoining wall profiles',()=>{S.walls[0].height+=30;});
    verify('layer thickness and joins',()=>{const w=S.walls[4];w.layers=S.wallTypes.find(t=>t.id===w.wallTypeId).layers.map(l=>({...l,thickness:l.thickness+2}));});
    verify('door opening fallback',()=>{S.openings.push({id:900,wall:S.walls[0].id,type:'door',s:100,width:80,height:210,sill:0});});
    verify('wall removal',()=>{S.walls.splice(7,1);});
    verify('wall paint',()=>{S.wallColor=0x9a8371;});
    return {backend:renderer.backend.isWebGPUBackend?'webgpu':'webgl2',retained,totalWalls:originals.length,
      geometryEqual:JSON.stringify(incremental)===JSON.stringify(full),boundsEqual,directEqual:directA===directB,captureStable:imageA===repeatedA,cameraA,cameraB,
      pixels:{different,max,mean:total/a.length,channels:a.length},controlPixels:{different:controlDifferent,max:controlMax,mean:controlTotal/b.length},rounds,
      imageA,imageB,imageDiff:diffCanvas.toDataURL(),invalidation,materialsReleased,agentInitiallyLoaded:!!document.getElementById('agent-dock')};
}
