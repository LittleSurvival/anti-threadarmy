import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { queryThreads } from "./page-query.js";

function environment(data, {userID = "0", status = 200} = {}) {
  const calls=[];
  const modules={
    RelayAPIConfigDefaults:{actorID:"0",customHeaders:{"X-IG-App-ID":"test-app"}},
    "CAAIGAccountSearchViewQuery.graphql":{params:{name:"CAAIGAccountSearchViewQuery",operationKind:"query",id:"fresh-doc"}},
    CurrentUserInitialData:{USER_ID:userID}, BDHeaderConfig:{ASBD_ID:"test-asbd"},
    getAsyncParams:()=>({lsd:"fresh-lsd",__s:"fresh-session",qpl_active_flow_ids:"test-flow"}),
  };
  const sandbox={
    location:{origin:"https://www.threads.com"},document:{cookie:"csrftoken=fresh-csrf"},
    require:name=>modules[name], crypto:{randomUUID:()=>"test-uuid"},URLSearchParams,AbortController,setTimeout,clearTimeout,
    fetch:async (url,options)=>{calls.push({url,options});return {ok:status===200,text:async()=>JSON.stringify(data)};},
  };
  const fn=vm.runInNewContext("("+queryThreads.toString()+")",sandbox);
  return {run:username=>fn(username),calls};
}
const success={data:{caa_ar_ig_account_search:{profiles:[{name:"Example",platform:"INSTAGRAM",profile_pic_url:"https://example.com/avatar.png"}],contact_points:[{type:"PHONE",contact_point:"******0000"},{type:"EMAIL",contact_point:"unmasked@example.com"}],cipher:"secret",cuid:"secret",error_content:null,recaptcha_required:false}}};

test("fresh page fields, native browser cookies, and display-only result",async()=>{
 const env=environment(success), result=await env.run("example_user");
 assert.equal(result.username,"example_user");
 assert.equal(result.contacts.length,1);
 assert.equal(result.profiles[0].name,"Example");
 assert.equal(JSON.stringify(result).includes("secret"),false);
 const {url,options}=env.calls[0];
 assert.equal(url,"/api/graphql"); assert.equal(options.credentials,"same-origin");
 assert.equal(options.headers.cookie,undefined);
 assert.equal(options.headers["x-csrftoken"],"fresh-csrf");
 assert.equal(options.body.get("doc_id"),"fresh-doc");
 assert.equal(options.body.get("lsd"),"fresh-lsd");
 assert.equal(JSON.parse(options.body.get("variables")).params.search_query,"example_user");
 assert.equal(env.calls.length,1);
});
test("signed-in context stops before POST",async()=>{
 const env=environment(success,{userID:"123"});
 await assert.rejects(env.run("example_user"),/已登入/);assert.equal(env.calls.length,0);
});
test("invalid username stops before POST",async()=>{
 const env=environment(success);
 await assert.rejects(env.run("invalid/id"),/有效/);assert.equal(env.calls.length,0);
 await assert.rejects(env.run(undefined),/有效/);assert.equal(env.calls.length,0);
});
test("GraphQL refusal is not reported as missing account",async()=>{
 await assert.rejects(environment({error:1357054}).run("example_user"),/拒絕/);
});
test("business errors are not successful profiles",async()=>{
 await assert.rejects(environment({data:{caa_ar_ig_account_search:{error_content:{description:"failed"}}}}).run("example_user"),/無法完成/);
});
test("verification challenge stops with an explicit error",async()=>{
 await assert.rejects(environment({data:{caa_ar_ig_account_search:{recaptcha_required:true}}}).run("example_user"),/要求驗證/);
});
test("empty profiles do not claim account absence",async()=>{
 await assert.rejects(environment({data:{caa_ar_ig_account_search:{profiles:[]}}}).run("example_user"),/沒有取得/);
});
test("HTTP errors are surfaced",async()=>{
 await assert.rejects(environment({}, {status:429}).run("example_user"),/暫時無法回應/);
});
