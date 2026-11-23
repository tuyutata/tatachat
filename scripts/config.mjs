// 声明塔塔聊天的工具版本、配置与唯一SDK自动化入口。

import {readFileSync} from 'node:fs';
export const manifest=Object.freeze({schema:1,product_id:'tatachat',configuration:{id:'tatachat',kind:'sdk',title:'塔塔聊天配置',items:[]}});
export const repository='tuyutata/tatachat';
export const tools=Object.freeze({node:'25.2.1',flutter:JSON.parse(readFileSync(new URL('../.fvmrc',import.meta.url))).flutter});
export function describeConfiguration(){return JSON.parse(JSON.stringify(manifest));}
export function describeAction({flow,platform,inputs={}}){
 if(flow==='release'&&platform==='sdk')return {repository,workflow:'sdk.yml',ref:'main',inputs};
 throw Error('塔塔聊天仅声明SDK塔塔自动化');
}

// BEGIN INLINE TESTS
if(process.env.NODE_TEST_CONTEXT&&process.argv[1]===import.meta.filename){
 const {test}=await import('node:test'),{default:assert}=await import('node:assert/strict');
 test('唯一SDK动作交付本组织仓库，不接纳App及桌面平台',()=>{
  assert.deepEqual(describeAction({flow:'release',platform:'sdk'}),{repository:'tuyutata/tatachat',workflow:'sdk.yml',ref:'main',inputs:{}});
  for(const platform of ['ios','android','web','macos','linux-arm'])assert.throws(()=>describeAction({flow:'release',platform}));
  assert.throws(()=>describeAction({flow:'publish',platform:'sdk'}));
 });
 test('配置返回独立公开声明',()=>{const value=describeConfiguration();value.configuration.items.push('fixture');assert.deepEqual(describeConfiguration().configuration.items,[]);});
}
// END INLINE TESTS
