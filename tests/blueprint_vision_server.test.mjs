import test from 'node:test';
import assert from 'node:assert/strict';
import{mkdtemp,mkdir,writeFile,rm}from'node:fs/promises';
import{tmpdir}from'node:os';
import{join,resolve,sep}from'node:path';
import{EventEmitter}from'node:events';
import{createBlueprintVision,readVisionReply,visionResponseSchema}from'../server/blueprint_vision.mjs';

const data={walls:[[20,20,380,20,8],[380,20,380,280,8],[380,280,20,280,8],[20,280,20,20,8]],rooms:[{label:'Kitchen',x:200,y:150}],furniture:[],doors:[],windows:[],dimensions:[]};
const payload={image:'data:image/png;base64,aGVsbG8=',width:400,height:300,widthCm:720};
async function fixture(t,reply={choices:[{finish_reason:'stop',message:{content:JSON.stringify(data)}}]}){
  const root=await mkdtemp(join(tmpdir(),'modelforge-vision-'));
  await mkdir(join(root,'.local','blueprint-vision'),{recursive:true});
  await writeFile(join(root,'.local','blueprint-vision','api-key'),'test-only-key');
  t.after(async()=>{assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));await rm(root,{recursive:true,force:true});});
  const calls=[];
  const run=createBlueprintVision({root,allowedOrigin:req=>req.headers.origin==='http://app.test',
    json:(res,status,value)=>{res.status=status;res.value=value;res.writableEnded=true;},readJsonBody:async req=>req.payload,
    fetchImpl:async(url,options)=>{calls.push({url,options});return url.endsWith('/health')?{ok:true}:{ok:true,json:async()=>typeof reply==='function'?reply(JSON.parse(options.body)):reply};}});
  const request=(method='POST',p=payload)=>Object.assign(new EventEmitter(),{method,headers:{origin:'http://app.test'},payload:p});
  const response=()=>Object.assign(new EventEmitter(),{destroyed:false,writableEnded:false});
  return{run,calls,request,response};
}

test('grammar-clipped evidence cannot classify a container or bias a later child',async t=>{
 const symbols=[{id:'F0',x:200,y:150,w:100,d:100},{id:'F1',parent:'F0',x:200,y:150,w:25,d:25}];
 const f=await fixture(t,sent=>{
  const props=sent.response_format.json_schema.schema.properties.furniture.properties||{};
  if(props.F0)return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({furniture:{F0:{evidence:'x'.repeat(240),type:'bed'}}})}}]};
  if(props.F1){assert.doesNotMatch(JSON.stringify(sent.messages),/x{120}/);return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({furniture:{F1:{evidence:'basin with a faucet',type:'sink'}}})}}]};}
  return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({...data,furniture:{}})}}]};
 }),res=f.response();
 await f.run(f.request('POST',{...payload,wallCandidates:data.walls,protectedWalls:[0,1,2,3],symbols,
  symbolBatches:[{ids:['F0','F1'],images:['data:image/jpeg;base64,aGVsbG8=','data:image/jpeg;base64,aGVsbG8=']}]}),res);
 assert.equal(res.status,200);assert.equal(res.value.reconstruction.walls.length,4);
 assert.deepEqual(res.value.reconstruction.items.map(i=>i.type),['sink']);
 assert.match(JSON.stringify(res.value),/descriptions reached the output limit/);
});

test('complete evidence longer than the old cap retains its classification and child context',async t=>{
 const evidence='A rectangular cabinet supports a shallow basin and an integrated faucet. '.repeat(3).trim();
 assert.ok(evidence.length>120&&evidence.length<240);
 const symbols=[{id:'F0',x:200,y:150,w:100,d:100},{id:'F1',parent:'F0',x:200,y:150,w:25,d:25}];
 const f=await fixture(t,sent=>{
  const props=sent.response_format.json_schema.schema.properties.furniture.properties||{};
  if(props.F0)return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({furniture:{F0:{evidence,type:'kitchen counter'}}})}}]};
  if(props.F1){assert.ok(JSON.stringify(sent.messages).includes(evidence));return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({furniture:{F1:{evidence:'basin with a faucet',type:'sink'}}})}}]};}
  return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({...data,furniture:{}})}}]};
 }),res=f.response();
 await f.run(f.request('POST',{...payload,wallCandidates:data.walls,protectedWalls:[0,1,2,3],symbols,
  symbolBatches:[{ids:['F0','F1'],images:['data:image/jpeg;base64,aGVsbG8=','data:image/jpeg;base64,aGVsbG8=']}]}),res);
 assert.equal(res.status,200);assert.deepEqual(res.value.reconstruction.items.map(i=>i.type),['base','sink']);
});
test('vision bridge stays on the fixed local host and keeps authentication out of the client result',async t=>{
  const f=await fixture(t),res=f.response();await f.run(f.request(),res);
  assert.equal(res.status,200);assert.equal(res.value.recognition.engine,'local-vision');
  assert.ok(f.calls.every(c=>c.url.startsWith('http://127.0.0.1:8078/')));
  const upstream=f.calls.find(c=>c.url.endsWith('/chat/completions'));
  assert.equal(upstream.options.headers.Authorization,'Bearer test-only-key');
  const sent=JSON.parse(upstream.options.body);assert.equal(sent.messages[1].content[1].image_url.url,payload.image);
  assert.doesNotMatch(JSON.stringify(res.value),/test-only-key/);
});
test('cross-origin and invalid image inputs cannot invoke inference',async t=>{
  const f=await fixture(t),req=f.request();req.headers.origin='https://unrelated.test';let res=f.response();await f.run(req,res);assert.equal(res.status,403);
  res=f.response();await f.run(f.request('POST',{...payload,image:'https://external.test/private.png'}),res);assert.equal(res.status,400);assert.equal(f.calls.length,0);
});
test('truncated and malformed model replies cannot become partial 3D projects',async t=>{
  const f=await fixture(t,{choices:[{finish_reason:'length',message:{content:'{"walls":['}}]}),res=f.response();await f.run(f.request(),res);
  assert.equal(res.status,422);assert.match(res.value.error,/output limit/);
});
test('streamed replies survive arbitrary chunk boundaries and require a complete final event',async()=>{
  const text='data: '+JSON.stringify({choices:[{delta:{content:'{"label":"חדר"}'},finish_reason:null}]})+'\n\n'
    +'data: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n';
  const bytes=new TextEncoder().encode(text);
  const response=new Response(new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=5)controller.enqueue(bytes.slice(i,i+5));controller.close();}}),{headers:{'Content-Type':'text/event-stream'}});
  const result=await readVisionReply(response);assert.equal(result.choices[0].message.content,'{"label":"חדר"}');
  await assert.rejects(()=>readVisionReply(new Response('data: {"choices":[]}\n\n',{headers:{'Content-Type':'text/event-stream'}})),/interrupted/);
});
test('pixel-measured openings and OCR readings survive missed model features',async t=>{
  const f=await fixture(t),res=f.response();
  await f.run(f.request('POST',{...payload,wallCandidates:data.walls,
    openingCandidates:[{type:'door',x:200,y:20,width:60},{type:'window',x:380,y:160,width:80}],
    ocr:{rooms:[{label:'Living',x:150,y:150}],dimensions:[{text:'720 cm',valueCm:720,x1:20,y1:290,x2:380,y2:290}]} }),res);
  assert.equal(res.status,200);assert.equal(res.value.reconstruction.openings.length,2);
  assert.equal(res.value.reconstruction.rooms[0].name,'Living');assert.equal(res.value.recognition.scale,'printed');
});
test('bounded model output omits work already grounded by OCR and pixel walls',()=>{
  const schema=visionResponseSchema(payload,true,{rooms:[{}],dimensions:[{}]});
  assert.equal(schema.additionalProperties,false);
  assert.deepEqual(schema.required,['ignoredWalls','doors','windows','furniture']);
  assert.equal(schema.properties.furniture.maxItems,100);
  const fallback=visionResponseSchema(payload,false,null);
  for(const name of ['walls','rooms','dimensions'])assert.ok(fallback.properties[name]);
});

test('model vetoes cannot erase protected exterior walls; structured output permits repeated types',async t=>{
  const f=await fixture(t,{choices:[{finish_reason:'stop',message:{content:JSON.stringify({...data,ignoredWalls:[0,1,2,3]})}}]}),res=f.response();
  await f.run(f.request('POST',{...payload,wallCandidates:data.walls,protectedWalls:[0,1,2,3],ocr:{textBoxes:[{privateDiagnostic:'not for prompt'}]}}),res);
  assert.equal(res.status,200);assert.equal(res.value.recognition.geometry,'raster');
  const sent=JSON.parse(f.calls.find(c=>c.url.endsWith('/chat/completions')).options.body);
  assert.equal(sent.temperature,0);assert.equal(sent.presence_penalty,0);assert.equal(sent.repeat_penalty,1);
  assert.doesNotMatch(JSON.stringify(sent.messages),/privateDiagnostic/);
});

test('ID classification fixes coordinates to measured symbols and permits abstention',async t=>{
 const symbols=[{id:'F0',x:100,y:100,w:50,d:80},{id:'F1',x:200,y:200,w:30,d:40}];
 const schema=visionResponseSchema({...payload,symbols},true,null);
 assert.deepEqual(schema.properties.furniture.required,['F0','F1']);
 assert.ok(schema.properties.furniture.properties.F0.properties.type.enum.includes('unknown'));
 const f=await fixture(t,{choices:[{finish_reason:'stop',message:{content:JSON.stringify({...data,furniture:{F0:{type:'bed',rot:90},F1:{type:'unknown',rot:0}}})}}]}),res=f.response();
 await f.run(f.request('POST',{...payload,symbols,symbolImage:'data:image/jpeg;base64,aGVsbG8='}),res);
 assert.equal(res.status,200);const items=res.value.reconstruction.items;assert.equal(items.length,1);
 assert.equal(items[0].w,160);assert.equal(items[0].d,100);assert.equal(items[0].rot,90);
});


test('crop classification stays isolated per ID and cannot use model coordinates',async t=>{
 const symbols=[{id:'F0',x:100,y:100,w:50,d:80},{id:'F1',x:200,y:150,w:30,d:40}];
 const f=await fixture(t,sent=>{
  const keys=Object.keys(sent.response_format.json_schema.schema.properties.furniture.properties||{});
  const result=keys.length?{furniture:{[keys[0]]:keys[0]==='F0'?'bed':'sink'}}:{...data,furniture:{}};
  return {choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]};
 }),res=f.response();
 await f.run(f.request('POST',{...payload,symbols,symbolImage:'data:image/jpeg;base64,aGVsbG8=',symbolBatches:[{ids:['F0','F1'],images:['data:image/jpeg;base64,aGVsbG8=','data:image/jpeg;base64,aGVsbG8=']}]}),res);
 assert.equal(res.status,200);assert.deepEqual(res.value.reconstruction.items.map(i=>i.type),['bed','sink']);
 const sent=f.calls.filter(c=>c.url.endsWith('/chat/completions')).map(c=>JSON.parse(c.options.body));
 assert.equal(sent.length,3);
 for(const call of sent.slice(1)){
  assert.equal(call.messages[1].content.filter(c=>c.type==='image_url').length,1);
  assert.equal(Object.keys(call.response_format.json_schema.schema.properties.furniture.properties).length,1);
 }
});

test('invalid crop coverage and nested geometry cannot invoke classification',async t=>{
 const f=await fixture(t),res=f.response();
 await f.run(f.request('POST',{...payload,symbols:[{id:'F0',x:100,y:100,w:20,d:20,core:{x:200,y:200,w:30,d:30}}],symbolImage:'data:image/jpeg;base64,aGVsbG8='}),res);
 assert.equal(res.status,422);assert.equal(f.calls.filter(c=>c.url.endsWith('/chat/completions')).length,0);
});

test('parents are classified before children even when crop batches arrive reversed',async t=>{
 const order=[],symbols=[{id:'F0',x:200,y:140,w:160,d:100},{id:'F1',parent:'F0',x:210,y:140,w:20,d:20}];
 const f=await fixture(t,sent=>{
  const keys=Object.keys(sent.response_format.json_schema.schema.properties.furniture.properties||{});
  if(!keys.length)return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({...data,furniture:{}})}}]};
  const id=keys[0];order.push(id);if(id==='F1')assert.match(JSON.stringify(sent.messages),/kitchen counter.*measured worktop/);
  return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({furniture:{[id]:{evidence:id==='F0'?'measured worktop':'basin and tap',type:id==='F0'?'base':'sink'}}})}}]};
 }),res=f.response();
 await f.run(f.request('POST',{...payload,symbols,symbolBatches:[{ids:['F1','F0'],images:['data:image/jpeg;base64,aGVsbG8=','data:image/jpeg;base64,aGVsbG8=']}]}),res);
 assert.equal(res.status,200);assert.deepEqual(order,['F0','F1']);
 assert.deepEqual(res.value.reconstruction.items.map(i=>i.type),['base','sink']);
});

test('a failed crop preserves measured geometry and later fixtures; one OCR reading cannot exclude types',async t=>{
 const symbols=[{id:'F0',x:100,y:100,w:50,d:80},{id:'F1',x:200,y:150,w:30,d:40}];
 const f=await fixture(t,sent=>{
  const props=sent.response_format.json_schema.schema.properties.furniture.properties||{};
  if(props.F0)throw new Error('crop decode failed');
  if(props.F1){assert.match(JSON.stringify(sent.messages),/Scale unknown/);return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({furniture:{F1:{evidence:'basin and tap',type:'washbasin'}}})}}]};}
  return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({...data,furniture:{}})}}]};
 }),res=f.response();
 await f.run(f.request('POST',{...payload,wallCandidates:data.walls,protectedWalls:[0,1,2,3],symbols,
  ocr:{dimensions:[{text:'misread',valueCm:140,x1:20,y1:290,x2:380,y2:290}]},
  symbolBatches:[{ids:['F0','F1'],images:['data:image/jpeg;base64,aGVsbG8=','data:image/jpeg;base64,aGVsbG8=']}]}),res);
 assert.equal(res.status,200);assert.ok(res.value.reconstruction.walls.length>=4);
 assert.deepEqual(res.value.reconstruction.items.map(i=>i.type),['sink']);
 assert.match(JSON.stringify(res.value),/geometry was preserved/);
});

