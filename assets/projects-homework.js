import {db, el, requireUser} from './client.js';

const byId = id => document.getElementById(id);
const isInstructor = !!byId('admin-area');
const statusNode = byId('status');
const say = (s, bad=false) => { if(statusNode){statusNode.textContent=s;statusNode.classList.toggle('error',bad);} };
const btn = (label, handler, cls='secondary') => {
  const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=label;b.onclick=handler;return b;
};
const field = (name, val='', type='text') => {
  const wrap=el('label');wrap.textContent=name;
  const input=document.createElement(type==='textarea'?'textarea':'input');
  if(type!=='textarea')input.type=type;
  input.value=val;wrap.append(input);return {wrap,input};
};
const studentSelect=byId('student-select');
let currentId=null, generation=0;

async function updateDream(item) {
  const title=prompt('Dream project title:',item.title);
  if(title===null)return;
  if(!title.trim()||title.trim().length>160)return say('Title must be 1–160 characters.',true);
  const notes=prompt('Dream project notes:',item.notes||'');
  if(notes===null)return;
  if(notes.length>1000)return say('Notes must be 1000 characters or fewer.',true);
  const {error}=await db.from('dream_projects').update({title:title.trim(),notes}).eq('id',item.id).eq('student_id',currentId);
  if(error)return say(error.message,true);
  say('Dream project updated.');await renderDreams();
}
async function deleteDream(item) {
  if(!confirm(`Delete the dream project “${item.title}”?`))return;
  const {error}=await db.from('dream_projects').delete().eq('id',item.id).eq('student_id',currentId);
  if(error)return say(error.message,true);
  say('Dream project deleted.');await renderDreams();
}
function makeDreamRow(item) {
  const li=el('li',undefined,'studio-task');
  const line=el('div',undefined,'studio-task-head');
  const check=document.createElement('input');check.type='checkbox';check.checked=item.completed;
  const copy=el('div',undefined,'studio-task-copy');
  const heading=el('div',item.title,'studio-task-title');copy.append(heading);
  if(item.notes)copy.append(el('div',item.notes,'studio-task-desc'));
  line.append(check,copy);li.append(line);
  if(item.completed)li.classList.add('studio-task-done');
  check.onchange=async()=>{const {error}=await db.from('dream_projects').update({completed:check.checked}).eq('id',item.id).eq('student_id',currentId);if(error){check.checked=!check.checked;say(error.message,true);}else li.classList.toggle('studio-task-done',check.checked);};
  const acts=el('div',undefined,'studio-task-actions');
  acts.append(btn('Edit',()=>updateDream(item)),btn('Delete',()=>deleteDream(item)));
  li.append(acts);return li;
}
let dreamList=null;
async function renderDreams(){
  if(!currentId||!dreamList)return;
  const token=++generation;
  const {data,error}=await db.from('dream_projects').select('id,title,notes,completed').eq('student_id',currentId).order('created_at',{ascending:false});
  if(token!==generation)return;
  if(error)return say(error.message,true);
  dreamList.replaceChildren(...(data.length?data.map(makeDreamRow):[el('li','No dream projects yet.','studio-task')]));
}

async function renderHomework() {
  const list=byId('studio-homework-list');
  if(!list||!currentId)return;
  const sid=currentId;
  const {data,error}=await db.from('homework_items').select('id,title,details,due_date,completed').eq('student_id',sid).order('created_at',{ascending:false});
  if(sid!==currentId)return;
  if(error){list.replaceChildren(el('li',error.message,'studio-task-error'));return;}
  list.replaceChildren();
  if(!data.length){list.append(el('li','No homework assigned yet.','muted'));return;}
  for(const item of data){
    const li=el('li',undefined,'studio-task');if(item.completed)li.classList.add('studio-task-done');
    const head=el('div',undefined,'studio-task-head');
    const check=document.createElement('input');check.type='checkbox';check.checked=item.completed;
    const copy=el('div',undefined,'studio-task-copy');copy.append(el('div',item.title,'studio-task-title'));
    if(item.details)copy.append(el('div',item.details,'studio-task-desc'));
    if(item.due_date)copy.append(el('div','Due: '+item.due_date,'studio-task-help'));
    check.onchange=async()=>{
      const {error}=await db.rpc('set_homework_completed',{homework_id:item.id,new_completed:check.checked});
      if(error){check.checked=!check.checked;say(error.message,true);} else li.classList.toggle('studio-task-done',check.checked);
    };
    head.append(check,copy);li.append(head);
    if(isInstructor){
      const acts=el('div',undefined,'studio-task-actions');
      acts.append(btn('Edit',async()=>{
        const title=prompt('Homework title:',item.title);if(title===null)return;
        if(!title.trim()||title.length>200)return say('Title must be 1–200 characters.',true);
        const details=prompt('Homework instructions:',item.details||'');if(details===null)return;
        if(details.length>1500)return say('Instructions exceed 1500 characters.',true);
        const due=prompt('Due date (YYYY-MM-DD, or leave blank):',item.due_date||'');if(due===null)return;
        if(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))return say('Use YYYY-MM-DD.',true);
        const {error}=await db.from('homework_items').update({title:title.trim(),details,due_date:due||null}).eq('id',item.id).eq('student_id',currentId);
        if(error)return say(error.message,true);await renderHomework();
      }),btn('Delete',async()=>{
        if(!confirm(`Delete the homework “${item.title}”?`))return;
        const {error}=await db.from('homework_items').delete().eq('id',item.id).eq('student_id',currentId);
        if(error)return say(error.message,true);await renderHomework();
      }));li.append(acts);
    }
    list.append(li);
  }
}

function setupHomework(){
  const anchor=isInstructor?byId('admin-area'):byId('dashboard');
  const section=el('section',undefined,'portal-panel');section.id='studio-homework';
  section.append(el('h2','Homework'),el('p',isInstructor?'Assign a project or practice exercise to the selected student.':'Check off your homework as you complete it.','studio-task-help'));
  const list=el('ul',undefined,'studio-task-list');list.id='studio-homework-list';section.append(list);
  if(isInstructor){
    const form=el('form',undefined,'studio-task-form');
    const t=field('Homework title'),d=field('Instructions (optional)','', 'textarea'),date=field('Due date (optional)','', 'date');
    t.input.maxLength=200;t.input.required=true;d.input.maxLength=1500;
    const submit=document.createElement('button');submit.textContent='Assign homework +';submit.type='submit';
    form.append(t.wrap,d.wrap,date.wrap,submit);
    form.onsubmit=async event=>{
      event.preventDefault();if(!currentId)return say('Select a student first.',true);
      const {error}=await db.from('homework_items').insert({student_id:currentId,title:t.input.value.trim(),details:d.input.value.trim(),due_date:date.input.value||null});
      if(error)return say(error.message,true);
      form.reset();say('Homework assigned.');await renderHomework();
    };section.append(form);
  }
  if(isInstructor){
    const profiles=byId('student-select')?.closest('.portal-panel');
    profiles?.insertAdjacentElement('afterend',section);
  }else{
    const grid=anchor?.querySelector('.portal-grid');
    grid?.insertAdjacentElement('afterend',section);
  }
}

function setupInstructorDreams(){
  const section=el('section',undefined,'portal-panel');
  section.append(el('h2','Dream projects'),el('p','Edit students’ ideas or add new projects.','studio-task-help'));
  dreamList=el('ul',undefined,'studio-task-list');section.append(dreamList);
  const form=el('form',undefined,'studio-task-form');
  const title=field('New dream project'),notes=field('Notes (optional)','', 'textarea');
  title.input.required=true;title.input.maxLength=160;notes.input.maxLength=1000;
  const add=document.createElement('button');add.type='submit';add.textContent='Add dream project +';
  form.append(title.wrap,notes.wrap,add);
  form.onsubmit=async e=>{e.preventDefault();if(!currentId)return say('Select a student first.',true);
    const {error}=await db.from('dream_projects').insert({student_id:currentId,title:title.input.value.trim(),notes:notes.input.value.trim()});
    if(error)return say(error.message,true);form.reset();await renderDreams();
  };section.append(form);
  byId('studio-homework')?.insertAdjacentElement('afterend',section);
}
function setupStudentDreams(){
  // Keep the existing form and core student.js functionality, but replace its list
  // with an editable presentation after each profile refresh.
  dreamList=byId('dream-list');
  if(!dreamList)return;
  const observer=new MutationObserver(()=>{
    // student.js rebuilds its list on profile switches/new-project submissions.
    // Our own rows have studio-task classes; do not respond to our replacements.
    const first=dreamList.firstElementChild;
    if(first && !first.classList.contains('studio-task')){
      queueMicrotask(()=>renderDreams());
    }
  });
  observer.observe(dreamList,{childList:true});
  byId('dream-form')?.addEventListener('submit',()=>{
    setTimeout(()=>renderDreams(),350);
  });
}

async function initialize(){
  const user=await requireUser();if(!user)return;
  if(isInstructor){
    const {data,error}=await db.from('instructors').select('user_id').eq('user_id',user.id).maybeSingle();
    if(error||!data)return; // no instructor controls without confirmed instructor account
  }
  setupHomework();
  if(isInstructor)setupInstructorDreams();else setupStudentDreams();
  const changed=async()=>{
    currentId=studentSelect?.value||null;
    if(!currentId)return;
    await Promise.all([renderHomework(),renderDreams()]);
  };
  studentSelect?.addEventListener('change',changed);
  // Existing modules populate student-select asynchronously.
  for(let n=0;n<60&&!studentSelect?.value;n++) await new Promise(r=>setTimeout(r,100));
  await changed();
}
initialize().catch(e=>say(e.message,true));
