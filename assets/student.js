import {db,$,status,option,el,requireUser,signedArtwork,missingSchema} from './client.js';
import {CALENDLY_URL} from './config.js';
import {renderStudentLessons, isUpcomingLesson} from './lessons.js';
let studentId=null;
let lessonTimer=null;
let currentLessons=[];
async function fetchLessons(id){
  let result=await db.from('lessons').select('starts_at,ends_at,status,summary').eq('student_id',id).eq('visible_to_student',true).order('starts_at',{ascending:false});
  if(missingSchema(result.error,'visible_to_student'))result=await db.from('lessons').select('starts_at,ends_at,status,summary').eq('student_id',id).order('starts_at',{ascending:false});
  return result;
}
async function fetchArtwork(id){
  let result=await db.from('artworks').select('title,notes,storage_path,created_at').eq('student_id',id).eq('category','art').order('created_at',{ascending:false});
  if(missingSchema(result.error,'category'))result=await db.from('artworks').select('title,notes,storage_path,created_at').eq('student_id',id).order('created_at',{ascending:false});
  return result;
}
function refreshSessions(){
  renderStudentLessons(currentLessons, $('upcoming-session-list'), $('past-session-list'));
  clearTimeout(lessonTimer);
  const next=currentLessons.filter(item=>isUpcomingLesson(item)).map(item=>new Date(item.starts_at).getTime()).sort((a,b)=>a-b)[0];
  if(next)lessonTimer=setTimeout(refreshSessions,Math.min(Math.max(next-Date.now()+100,100),2147483647));
}
$('logout').onclick=async()=>{await db?.auth.signOut();location.replace('student-login.html');};
$('calendly-link').href=CALENDLY_URL;
if(!CALENDLY_URL.includes('YOUR-USERNAME')){const frame=document.createElement('iframe');frame.className='calendar-frame';frame.title='Book an art lesson using Calendly';frame.src=CALENDLY_URL;frame.loading='lazy';$('calendly-embed').append(frame);}else{$('calendly-link').classList.add('hidden');$('calendly-embed').textContent='Configure the Calendly event URL in assets/config.js to show scheduling.';}
async function load(){const user=await requireUser();if(!user)return;const {data:admin}=await db.from('instructors').select('user_id').eq('user_id',user.id).maybeSingle();if(admin)$('admin-link').classList.remove('hidden');const {data:profiles,error}=await db.from('students').select('id,display_name').order('display_name');if(error)return status(error.message,true);if(!profiles?.length)return status('No student profiles are assigned to this account yet. Please contact Nicole.');$('student-select').replaceChildren(...profiles.map(p=>option(p.id,p.display_name)));$('student-select').onchange=()=>show($('student-select').value);await show(profiles[0].id);}
async function show(id){studentId=id;$('dashboard').classList.remove('hidden');status('');const [dreams,lessons,art]=await Promise.all([db.from('dream_projects').select('id,title,notes,completed').eq('student_id',id).order('created_at',{ascending:false}),fetchLessons(id),fetchArtwork(id)]);if(studentId!==id)return;const err=[dreams.error,lessons.error,art.error].find(Boolean);if(err)return status(err.message,true);
$('dream-list').replaceChildren();for(const item of dreams.data){const li=el('li');const check=document.createElement('input');check.type='checkbox';check.checked=item.completed;check.style.width='auto';check.style.display='inline-block';check.style.marginRight='.6rem';const label=el('span',item.title);const note=el('div',item.notes||'','muted tiny');li.append(check,label,note);check.onchange=async()=>{const {error}=await db.from('dream_projects').update({completed:check.checked}).eq('id',item.id).eq('student_id',studentId);if(error){check.checked=!check.checked;status(error.message,true);}};$('dream-list').append(li);}if(!dreams.data.length)$('dream-list').append(el('li','Your idea list is waiting for its first project.','muted'));
currentLessons=lessons.data;refreshSessions();
$('portfolio').replaceChildren();for(const item of art.data){const tile=el('article',undefined,'art-piece');if(item.storage_path){try{const src=await signedArtwork(item.storage_path);const img=document.createElement('img');img.src=src;img.alt=item.title;img.loading='lazy';tile.append(img);}catch(e){tile.append(el('p','Artwork unavailable','muted'));}}tile.append(el('strong',item.title),el('p',item.notes||'','muted tiny'));$('portfolio').append(tile);}if(!art.data.length)$('portfolio').append(el('p','Your portfolio is ready for its first piece.','muted'));}
$('dream-form').addEventListener('submit',async e=>{e.preventDefault();if(!studentId)return;const title=$('dream-title').value.trim();if(!title)return;const {error}=await db.from('dream_projects').insert({student_id:studentId,title,notes:$('dream-notes').value.trim()});if(error)return status(error.message,true);$('dream-form').reset();await show(studentId);});
load().catch(e=>status(e.message,true));
