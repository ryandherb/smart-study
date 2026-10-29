import { test, expect, spyOn, afterAll } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.STUDY_DATA_DIR = await mkdtemp(join(tmpdir(),'homework-test-'));
const { db } = await import('../src/db/db');
const { homework, homeworkSnapshot, homeworkTransport, homeworkSystem } = await import('../src/routes/homework');
const id=crypto.randomUUID(), set=crypto.randomUUID();
db.query('INSERT INTO sets (id,title,created_at) VALUES (?,?,?)').run(set,'Math',Date.now());
db.query("INSERT INTO sessions (id,set_id,mode,provider,created_at,updated_at) VALUES (?,?,'homework','chatgpt',?,?)").run(id,set,Date.now(),Date.now());
let response:any={text:'Consider the power rule',reference:{solution:'SECRET answer',steps:['First step','SECRET answer']}};
let calls=0;
const mock=spyOn(homeworkTransport,'run').mockImplementation(async(_s,_m,definition)=>{calls++;await definition.handler(response,{});});
afterAll(()=>{mock.mockRestore();db.query('DELETE FROM sets WHERE id=?').run(set);});
async function post(path:string,body:any){return homework.request('http://localhost/'+id+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
let problemId='';
test('creates problems, hides references, persists hints and reveals one step at a time',async()=>{
 const r=await post('/problems',{prompt:'integrate x dx'});problemId=(await r.json() as any).id;
 expect((await post('/action',{problemId,kind:'hint'})).status).toBe(200);
 expect(JSON.stringify(homeworkSnapshot(id))).not.toContain('SECRET');
 const count=calls;
 await post('/action',{problemId,kind:'next_step'});
 let p=homeworkSnapshot(id)!.problems[0];expect(p.stepIndex).toBe(1);expect(p.history.at(-1).text).toBe('First step');expect(JSON.stringify(p)).not.toContain('SECRET');
 await post('/action',{problemId,kind:'hint'});expect(homeworkSnapshot(id)!.problems[0].stepIndex).toBe(1);
 await post('/action',{problemId,kind:'next_step'});expect(homeworkSnapshot(id)!.problems[0].history.at(-1).text).toBe('SECRET answer');
 const n=homeworkSnapshot(id)!.problems[0].history.length;
 await post('/action',{problemId,kind:'next_step'});expect(homeworkSnapshot(id)!.problems[0].history.length).toBe(n);
 expect(calls).toBe(count+1);
 await post('/action',{problemId,kind:'reveal_solution'});expect(homeworkSnapshot(id)!.problems[0].history.at(-1).kind).toBe('reveal_solution');
});
test('editing requires reset and clears private and public progress',async()=>{
 expect((await post('/problems/'+problemId,{prompt:'new'})).status).toBe(400);
 expect((await post('/problems/'+problemId,{prompt:'differentiate x',reset:true})).status).toBe(200);
 const p=homeworkSnapshot(id)!.problems[0];expect(p.history).toEqual([]);expect(p.stepCount).toBeNull();expect(p.stepIndex).toBe(0);
});
test('grades final answers without exposing hidden reference and rejects empty answers',async()=>{
 expect((await post('/action',{problemId,kind:'check',answer:''})).status).toBe(400);
 response={text:'You may have missed a factor.',verdict:'incorrect',reference:{solution:'SECRET',steps:['a','SECRET']}};
 expect((await post('/action',{problemId,kind:'check',answer:'2'})).status).toBe(200);
 expect(homeworkSnapshot(id)!.problems[0].history.at(-1).verdict).toBe('incorrect');expect(JSON.stringify(homeworkSnapshot(id))).not.toContain('SECRET');
});
test('failed calls preserve progress and allow retry; cross-workspace IDs are rejected',async()=>{
 const before=JSON.stringify(homeworkSnapshot(id)!.problems);
 mock.mockImplementationOnce(async()=>{throw new Error('Unavailable');});
 expect((await post('/action',{problemId,kind:'hint'})).status).toBe(502);
 expect(JSON.stringify(homeworkSnapshot(id)!.problems)).toBe(before);expect(homeworkSnapshot(id)!.busy).toBe(false);
 expect((await post('/action',{problemId:'missing',kind:'hint'})).status).toBe(404);
 expect((await post('/action',{problemId,kind:'hint'})).status).toBe(200);
});
test('math prompt covers equivalence and uncertainty without fabricated diagnosis',()=>{
 for(const term of ['equivalence','domains','constants of integration','matrices','approximations','inconclusive','hypotheses','discrete','linear algebra'])expect(homeworkSystem).toContain(term);
});
test('overlapping actions are rejected and failed grading does not append an attempt',async()=>{
 let release!:()=>void;let entered!:()=>void;
 const started=new Promise<void>(resolve=>{entered=resolve;});
 mock.mockImplementationOnce(async()=>{entered();await new Promise<void>(resolve=>{release=resolve;});throw new Error('Cancelled');});
 const pending=post('/action',{problemId,kind:'hint'});await started;
 expect(homeworkSnapshot(id)!.busy).toBe(true);
 expect((await post('/action',{problemId,kind:'hint'})).status).toBe(409);
 release();expect((await pending).status).toBe(502);
 const n=homeworkSnapshot(id)!.problems[0].history.length;
 response={text:'No verdict'};
 expect((await post('/action',{problemId,kind:'check',answer:'1'})).status).toBe(502);
 expect(homeworkSnapshot(id)!.problems[0].history.length).toBe(n);
});
