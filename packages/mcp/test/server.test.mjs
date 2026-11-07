import assert from 'node:assert/strict';
import { writeFile, mkdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { fixture } from './fixture.mjs';
import { MCP_NAME, MCP_VERSION } from '../src/version.mjs';

test('stdio preserves tools, sourceRef and visual content through HTTP', async (t) => {
  const f = await fixture(t);
  await f.page();
  const client = await f.client();
  assert.deepEqual(client.getServerVersion(), { name: MCP_NAME, version: MCP_VERSION });
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(({ name }) => name), [
    'canvas_code', 'canvas_erase', 'canvas_fill', 'canvas_undo', 'canvas_render',
    'canvas_manage', 'canvas_read', 'canvas_search', 'canvas_write',
  ]);
  const renderTool = tools.find(({name}) => name === 'canvas_render');
  assert.deepEqual(renderTool.inputSchema.properties.writeMode.enum, ['replace', 'patch']);
  assert.equal(renderTool.inputSchema.properties.writeMode.default, 'replace');
  const sourcePath = join(f.directory, 'source.txt');
  await writeFile(sourcePath, 'script output\nsecond line');
  for (const [name, input, resolved] of [
    ['canvas_write', { at: [4, 2], content: 'GPU' }, { at: [4, 2], content: 'GPU' }],
    ['canvas_write', { at: [4, 3], sourceRef: sourcePath }, { at: [4, 3], content: 'script output\nsecond line' }],
    ['canvas_render', { at: [4, 6], sourceRef: sourcePath, format: 'raw' }, { at: [4, 6], source: 'script output\nsecond line', format: 'raw' }],
    ['canvas_render', { at: [4, 6], sourceRef: sourcePath, format: 'ansi', writeMode: 'patch' }, { at: [4, 6], source: 'script output\nsecond line', format: 'ansi', writeMode: 'patch' }],
    ['canvas_render', { at: [4, 6], source: ' X ', writeMode: 'replace' }, { at: [4, 6], source: ' X ', writeMode: 'replace' }],
  ]) {
    const result = await client.callTool({ name, arguments: input });
    assert.equal(result.isError, false);
    assert.deepEqual(result.structuredContent, { ok: true, echoed: { name, input: resolved } });
  }
  assert.equal((await f.health()).activeRequests, 0);
  assert.equal((await f.health()).activeCallers, 0);
});

test('MCP reports page readiness errors without closing its transport', async (t) => {
  const f = await fixture(t);
  const client = await f.client();
  const unavailable = await client.callTool({ name: 'canvas_manage', arguments: { action: 'list' } });
  assert.equal(unavailable.isError, true);
  assert.match(unavailable.content[0].text, /page_unavailable/);
  await f.page({ reply: () => ({ ok: true, contentBlocks: [
    { type: 'note', text: 'visible note' }, { type: 'text', text: 'exact text' },
    { type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo=', width: 9, height: 20, scale: 1 },
  ] }) });
  const result = await client.callTool({ name: 'canvas_read', arguments: {} });
  assert.deepEqual(result.content, [
    { type: 'text', text: 'visible note' }, { type: 'text', text: 'exact text' },
    { type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo=' },
  ]);
  assert.equal(result.structuredContent.contentBlocks[2].width, 9);
});


test('stdio keeps model-facing Cell values equivalent to structured values', async t => {
  const f=await fixture(t);
  const cells=[{x:3,y:2,char:'▀',color:'#12ab34',bgColor:'#112233'}];
  const visible={exact:true,columns:['x','y','char','color','bgColor'],cells:[[3,2,'▀','#12ab34','#112233']]};
  await f.page({reply:()=>({cells,contentBlocks:[{type:'text',text:JSON.stringify(visible)}]})});
  const client=await f.client();
  const result=await client.callTool({name:'canvas_read',arguments:{representation:'cells',viewport:[3,2,1,1]}});
  const content=JSON.parse(result.content[0].text);
  const decoded=content.cells.map(row=>Object.fromEntries(content.columns.map((key,i)=>[key,row[i]])));
  assert.deepEqual(decoded,result.structuredContent.cells);
});


test('scriptRef resolves current file contents and rejects conflicting or invalid inputs', async t => {
  const f=await fixture(t); const page=await f.page(); const client=await f.client();
  const file=join(f.directory,'script.js');
  const contract=(await client.listTools()).tools.find(tool=>tool.name==='canvas_code');
  assert.ok(contract.inputSchema.properties.scriptRef);
  for(const script of ['return 1;','return 2;']){
    await writeFile(file,script);
    const result=await client.callTool({name:'canvas_code',arguments:{scriptRef:file,mode:'apply'}});
    assert.equal(result.isError,false);
    assert.deepEqual(result.structuredContent.echoed.input,{script,mode:'apply'});
  }
  const before=page.calls.length;
  for(const input of [{scriptRef:file,script:'return 3;'},{scriptRef:f.directory},{scriptRef:join(f.directory,'missing')}]){
    assert.equal((await client.callTool({name:'canvas_code',arguments:input})).isError,true);
  }
  await writeFile(file,'x'.repeat(32769));
  assert.equal((await client.callTool({name:'canvas_code',arguments:{scriptRef:file}})).isError,true);
  await writeFile(file,Buffer.from([0xff]));
  assert.equal((await client.callTool({name:'canvas_code',arguments:{scriptRef:file}})).isError,true);
  assert.equal(page.calls.length,before);
  assert.equal((await f.health()).activeRequests,0);
});

test('configured source roots reject outside files and symlink escapes for every file tool', async t => {
  // Empty roots are deny-all; add one canonical directory for the next fixture.
  const owner=await fixture(t,{sourceRoots:[]});
  const allowed=join(owner.directory,'allowed');await mkdir(allowed);
  const f=await fixture(t,{sourceRoots:[allowed]});await f.page();const client=await f.client();
  const inside=join(allowed,'script.js'),outside=join(owner.directory,'outside.js'),link=join(allowed,'escape.js');
  await writeFile(inside,'return 1;');await writeFile(outside,'not allowed');await symlink(outside,link);
  assert.equal((await client.callTool({name:'canvas_code',arguments:{scriptRef:inside}})).isError,false);
  for(const file of [outside,link])for(const [name,key] of [['canvas_code','scriptRef'],['canvas_write','sourceRef'],['canvas_render','sourceRef']]){
    const result=await client.callTool({name,arguments:{[key]:file,at:[0,0]}});
    assert.equal(result.isError,true);assert.match(result.content[0].text,/outside the configured source roots/);
  }
});

test('shared style contract declares fields instead of forcing schema guesses', async t=>{
  const f=await fixture(t);const client=await f.client();const {tools}=await client.listTools();
  for(const name of ['canvas_write','canvas_fill']){
    const style=tools.find(t=>t.name===name).inputSchema.properties.style;
    assert.equal(style.properties.color.type,'string');assert.equal(style.properties.bgColor.type,'string');
    assert.equal(style.properties.attrs.properties.bold.type,'boolean');
  }
});
