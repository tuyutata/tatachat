// 组装公民App消费的FluffyChat源码SDK，生成本地化入口并交付ZIP包。

import {execFileSync} from 'node:child_process';
import {cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tools} from './config.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
export const packageEntries=Object.freeze(['pubspec.yaml','pubspec.lock','l10n.yaml','lib','assets','LICENSE','LICENSES']);
export function artifactName(version){
 if(!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(version))throw Error('SDK交付版本无效');
 return 'tatachat-SDK-v'+version+'.zip';
}
const execute=(command,args,options={})=>execFileSync(command,args,{stdio:'inherit',...options});

export function packageSDK({source=root,output,version,flutter,run=execute}={}){
 const name=artifactName(version),directory=resolve(output),work=mkdtempSync(join(tmpdir(),'tatachat-sdk-'));
 try{
  const stage=join(work,'fluffychat');mkdirSync(stage);
  for(const name of packageEntries)cpSync(join(source,name),join(stage,name),{recursive:true,verbatimSymlinks:true});
  const lock=readFileSync(join(stage,'pubspec.lock'));
  // 严格消费上游原锁，官方生成器仅写本轮组包现场。
  run(flutter,['pub','get','--enforce-lockfile'],{cwd:stage});
  if(!readFileSync(join(stage,'pubspec.lock')).equals(lock))throw Error('SDK组包改变了上游原锁');
  run(flutter,['gen-l10n'],{cwd:stage});
  if(!existsSync(join(stage,'lib/l10n/l10n.dart')))throw Error('SDK缺少生成的本地化入口');
  // Pub临时状态不交付；所有公开源码、资源及上游声明从同一现场归档。
  const payload=join(work,'package');mkdirSync(payload);
  for(const name of packageEntries)cpSync(join(stage,name),join(payload,name),{recursive:true,verbatimSymlinks:true});
  mkdirSync(directory,{recursive:true});const archive=join(directory,name);
  if(existsSync(archive))throw Error('SDK交付包已存在，拒绝保留旧归档条目');
  run('/usr/bin/zip',['-q','-r','-y',archive,'.'],{cwd:payload});
  return archive;
 }finally{rmSync(work,{recursive:true,force:true});}
}

if(!process.env.NODE_TEST_CONTEXT&&process.argv[1]===import.meta.filename){
 if(process.argv.length!==3||process.argv[2]!=='sdk')throw Error('用法：node scripts/build.mjs sdk');
 const flutter=join(process.env.FLUTTER_ROOT??'', 'bin/flutter');
 if(!process.env.FLUTTER_ROOT)throw Error('缺少已准备的Flutter '+tools.flutter);
 console.log(packageSDK({output:process.env.ARTIFACT_DIR,version:process.env.RELEASE_VERSION,flutter}));
}

// BEGIN INLINE TESTS
if(process.env.NODE_TEST_CONTEXT&&process.argv[1]===import.meta.filename){
 const {test}=await import('node:test'),{default:assert}=await import('node:assert/strict');
 const {writeFileSync}=await import('node:fs');
 function fixture(t){const path=mkdtempSync(join(tmpdir(),'tatachat-test-'));t.after(()=>rmSync(path,{recursive:true,force:true}));
  const source=join(path,'source');mkdirSync(source);for(const dir of ['lib/l10n','assets','LICENSES','ios','android','web'])mkdirSync(join(source,dir),{recursive:true});
  for(const name of packageEntries.filter(n=>!['lib','assets','LICENSES'].includes(n)))writeFileSync(join(source,name),name+'\n');
  writeFileSync(join(source,'lib/chat.dart'),'// 原上游字节\n');writeFileSync(join(source,'assets/test.bin'),Buffer.from([0,255,10]));return {source,output:join(path,'output')};}
 test('真实ZIP仅交付SDK闭包和本地化生成件，原件不变',t=>{
  const value=fixture(t),calls=[];const run=(command,args,options)=>{
   calls.push(args);if(command==='fixture-flutter'){if(args[0]==='gen-l10n')writeFileSync(join(options.cwd,'lib/l10n/l10n.dart'),'// generated\n');return;}
   return execute(command,args,options);
  };
  const archive=packageSDK({...value,version:'1.2.3',flutter:'fixture-flutter',run});
  const names=execFileSync('/usr/bin/unzip',['-Z1',archive],{encoding:'utf8'}).trim().split('\n');
  assert.ok(names.includes('lib/l10n/l10n.dart'));assert.ok(names.includes('pubspec.lock'));assert.ok(names.includes('assets/test.bin'));
  assert.ok(names.every(name=>packageEntries.includes(name.split('/')[0])));
  assert.deepEqual(execFileSync('/usr/bin/unzip',['-p',archive,'assets/test.bin']),Buffer.from([0,255,10]));
  assert.equal(readFileSync(join(value.source,'lib/chat.dart'),'utf8'),'// 原上游字节\n');
  assert.equal(existsSync(join(value.source,'lib/l10n/l10n.dart')),false);
  assert.deepEqual(calls.slice(0,2),[['pub','get','--enforce-lockfile'],['gen-l10n']]);
 });
 test('官方工具真实失败原样传播，未生成交付包',t=>{const value=fixture(t);assert.throws(()=>packageSDK({...value,version:'1.0.0',flutter:'fixture',run(){throw Error('真实工具失败');}}),/真实工具失败/);assert.equal(existsSync(value.output),false);});
 test('拒绝锁漂移和缺失本地化，不交付半包',t=>{for(const drift of [true,false]){const value=fixture(t);assert.throws(()=>packageSDK({...value,version:'1.0.0',flutter:'fixture',run(_command,args,{cwd}){if(drift&&args[0]==='pub')writeFileSync(join(cwd,'pubspec.lock'),'changed');}}),drift?/上游原锁/:/本地化入口/);}});
 test('版本不能注入输出路径',()=>{for(const value of ['../x','1.0','v1.0.0','1.0.0/../../x','01.0.0'])assert.throws(()=>artifactName(value));});

 // 工作流交付与历史隔离回归直接执行本仓YAML中的实际脚本，仅使用合成GitHub接口。
 const {createRequire}=await import('node:module');
 const require=createRequire(import.meta.url),AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const id="tatachat",title="塔塔聊天",platform="sdk",label="SDK",file="sdk.yml",extension=".zip";
 const workflowText=readFileSync(new URL('../.github/workflows/'+file,import.meta.url),'utf8');
 const blocks=[...workflowText.matchAll(/^          script: \|\n((?: {12}.*\n|\n)+)/gmu)].map(match=>match[1].split('\n').map(line=>line.slice(12)).join('\n'));
 const [existing,delivery,retention]=blocks;
 const env={PRODUCT_ID:id,PRODUCT_TITLE:title,PRODUCT_PLATFORM:platform,PLATFORM_TITLE:label,WORKFLOW_FILE:file,EXTENSION:extension,RELEASE_VERSION:'1.0.4',GITHUB_RUN_ATTEMPT:'1'};
 const sha='a'.repeat(40),context={repo:{owner:'tuyutata',repo:id},sha,runId:40};
 const executeWorkflow=(code,github,extra={})=>new AsyncFunction('github','context','core','process','require',code)(github,context,{info(){}},{env:{...env,...extra}},require);
 const fail404=()=>{throw Object.assign(Error('Not Found'),{status:404});};
 function history(result='success'){
  const rows=[{id:10,run_number:1,conclusion:'success'},{id:20,run_number:2,conclusion:'failure'},{id:30,run_number:3,conclusion:'success'},
   {id:40,run_number:4,status:'in_progress'},{id:50,run_number:5,status:'in_progress'},
   {id:99,run_number:99,status:'completed',conclusion:'failure',path:'.github/workflows/foreign.yml'}]
   .map(row=>({status:'completed',path:'.github/workflows/'+file,head_branch:'main',head_sha:sha,event:'workflow_dispatch',...row}));
  const runs=new Map(rows.map(row=>[row.id,row])),releases=new Map(),tags=new Map(),deleted=[];
  for(const run of [10,30,40]){
   const asset=id+'-'+label+'-v1.0.'+(run/10)+extension;
   const tag_name=title+'·'+label+'·v1.0.'+(run/10);
   releases.set(run,{id:run,tag_name,draft:run===40&&result!=='success',prerelease:false,body:JSON.stringify({product_id:id,platform,source_sha:sha,run_id:run,asset}),assets:[{name:asset,state:'uploaded'}]});
   tags.set('tags/'+tag_name,{object:{type:'commit',sha}});
  }
  releases.set(99,{id:99,tag_name:'foreign',body:JSON.stringify({product_id:'foreign',platform,run_id:99}),assets:[]});
  const actions={
   listWorkflowRuns(){},async getWorkflowRun({run_id}){return {data:runs.get(run_id)??fail404()};},
   async deleteWorkflowRun({run_id}){deleted.push(['run',run_id]);runs.delete(run_id);}
  };
  const repos={listReleases(){},async getRelease({release_id}){return {data:releases.get(release_id)??fail404()};},async deleteRelease({release_id}){deleted.push(['release',release_id]);releases.delete(release_id);}};
  const git={async getRef({ref}){return {data:tags.get(ref)??fail404()};},async deleteRef({ref}){deleted.push(['tag',ref]);tags.delete(ref);}};
  const github={rest:{actions,repos,git},async paginate(method){return method===actions.listWorkflowRuns?[...runs.values()]:[...releases.values()];}};
  return {runs,releases,tags,deleted,github};
 }
 test(id+'：唯一平台及工作流脚本声明有效',()=>{
  assert.equal(blocks.length,3);assert.ok(workflowText.includes('  workflow_dispatch:'));
  assert.ok(workflowText.includes('  PRODUCT_PLATFORM: '+platform));assert.doesNotMatch(workflowText,/^  (push|pull_request):/mu);
  assert.doesNotMatch(workflowText,/dpkg\s+-i|systemctl\s+(?:start|restart|enable)|flutter\s+build/u);
  new AsyncFunction('github','context','core','process','require',delivery);new AsyncFunction('github','context','core','process','require',retention);
 });
 test(id+'：重跑成功Run复用正式包，缺包及错误Tag不伪装成功',async()=>{
  const outputs={};const run=github=>new AsyncFunction('github','context','core','process',existing)(github,context,{info(){},setOutput(key,value){outputs[key]=value;}},{env});
  await run({rest:{repos:{async getReleaseByTag(){return fail404();}}}});assert.equal(outputs.delivered,'false');
  const name=id+'-'+label+'-v1.0.4'+extension,release={draft:false,prerelease:false,body:JSON.stringify({product_id:id,platform,run_id:40,source_sha:sha}),assets:[{name,state:'uploaded',size:17}]};
  const github={rest:{repos:{async getReleaseByTag(){return {data:release};}},git:{async getRef(){return {data:{object:{type:'commit',sha}}};}}}};
  await run(github);assert.equal(outputs.delivered,'true');
  github.rest.git.getRef=async()=>({data:{object:{type:'commit',sha:'b'.repeat(40)}}});await assert.rejects(run(github),/Tag源码/);assert.equal(outputs.delivered,'false');
 });
 test(id+'：当前成功保留最新成功失败，实际删除旧Run与Release，活动及其他产品保留',async()=>{
  const state=history();await executeWorkflow(retention,state.github,{BUILD_RESULT:'success'});
  assert.deepEqual([...state.runs.keys()].sort((a,b)=>a-b),[20,40,50,99]);assert.deepEqual([...state.releases.keys()].sort((a,b)=>a-b),[40,99]);
  assert.deepEqual(state.deleted.filter(row=>row[0]==='run').map(row=>row[1]).sort((a,b)=>a-b),[10,30]);
 });
 test(id+'：当前失败保留原成功包，只清理本轮失败草稿和更旧终态',async()=>{
  const state=history('failure');await executeWorkflow(retention,state.github,{BUILD_RESULT:'failure'});
  assert.deepEqual([...state.runs.keys()].sort((a,b)=>a-b),[30,40,50,99]);assert.deepEqual([...state.releases.keys()].sort((a,b)=>a-b),[30,99]);
 });
 test(id+'：成功版缺失时先失败，不删除历史；Tag源码不符时拒绝删除',async()=>{
  const missing=history();missing.releases.delete(40);await assert.rejects(executeWorkflow(retention,missing.github,{BUILD_RESULT:'success'}),/完整正式版/);assert.deepEqual(missing.deleted,[]);
  const other=history();other.tags.set('tags/'+other.releases.get(10).tag_name,{object:{type:'commit',sha:'b'.repeat(40)}});
  await assert.rejects(executeWorkflow(retention,other.github,{BUILD_RESULT:'success'}),/Tag归属/);assert.deepEqual(other.deleted,[]);
 });
 test(id+'：初次失败且没有成功版时也保留当前失败及活动Run',async()=>{
  const state=history('failure');for(const value of [10,20,30]){state.runs.delete(value);state.releases.delete(value);}
  await executeWorkflow(retention,state.github,{BUILD_RESULT:'failure'});
  assert.deepEqual([...state.runs.keys()].sort((a,b)=>a-b),[40,50,99]);assert.deepEqual([...state.releases.keys()],[99]);
 });
 test(id+'：唯一真实包上传并从草稿交付，已有正式版拒绝覆盖',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'workflow-artifact-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const name=id+'-'+label+'-v1.0.4'+extension,bytes=Buffer.from('package-fixture');writeFileSync(join(dir,name),bytes);
  let release,uploaded;
  const repos={async getReleaseByTag(){return release?{data:release}:fail404();},async createRelease(value){release={...value,id:1,upload_url:'fixture-upload',assets:[]};return {data:release};},
   async uploadReleaseAsset(value){uploaded=value;release.assets.push({name:value.name,state:'uploaded',size:value.data.length});},async getRelease(){return {data:release};},
   async updateRelease(value){release={...release,...value,published_at:'2026-11-19T00:00:00Z'};return {data:release};}};
  const github={rest:{repos,git:{async getRef(){return fail404();}}}};
  await executeWorkflow(delivery,github,{ARTIFACT_DIR:dir});assert.equal(uploaded.name,name);assert.deepEqual(uploaded.data,bytes);assert.equal(release.draft,false);
  await assert.rejects(executeWorkflow(delivery,github,{ARTIFACT_DIR:dir}),/禁止覆盖/);
 });
}
// END INLINE TESTS
