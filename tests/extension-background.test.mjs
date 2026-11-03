import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const source=await readFile(new URL("../apps/extension/dist/background.js",import.meta.url),"utf8");
function worker({allowed=true,fail=false}={}) {
 let listener, created=0, closed=0;
 const result={username:"example_user",profiles:[{name:"Example",platform:"INSTAGRAM",avatarUrl:null}],contacts:[],fetchedAt:"2026-01-01"};
 const chrome={
  action:{onClicked:{addListener(){}}},
  runtime:{id:"test-extension",getURL:p=>"chrome-extension://test-extension/"+p,onMessage:{addListener(fn){listener=fn;}}},
  extension:{isAllowedIncognitoAccess:async()=>allowed},
  windows:{create:async options=>{assert.equal(options.incognito,true);assert.equal(options.focused,false);created++;return {id:7,tabs:[{id:9}]};},remove:async id=>{assert.equal(id,7);closed++;}},
  tabs:{get:async()=>({status:"complete"})},
  scripting:{executeScript:async options=>{
   assert.equal(options.world,"MAIN");assert.equal(options.target.tabId,9);assert.equal(options.args[0],"example_user");
   assert.match(options.func.toString(),/globalThis.require/);
   if(fail)throw new Error("test failure");
   return [{result}];
  }},
 };
 vm.runInNewContext(source,{chrome,Date,setTimeout,clearTimeout,console});
 return {lookup:()=>new Promise(resolve=>listener({type:"lookup",username:"example_user"},{id:"test-extension"},resolve)),counts:()=>({created,closed})};
}
test("worker returns results and closes only its query window",async()=>{
 const w=worker(),response=await w.lookup();
 assert.equal(response.ok,true);assert.equal(response.result.username,"example_user");
 assert.deepEqual(w.counts(),{created:1,closed:1});
});
test("injection failure still closes the query window",async()=>{
 const w=worker({fail:true}),response=await w.lookup();
 assert.equal(response.ok,false);
 assert.deepEqual(w.counts(),{created:1,closed:1});
});
test("incognito permission required before opening anything",async()=>{
 const w=worker({allowed:false}),response=await w.lookup();
 assert.equal(response.ok,false);
 assert.deepEqual(w.counts(),{created:0,closed:0});
});
