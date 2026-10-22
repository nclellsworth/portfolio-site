import{db,$,status,option,el,dateLabel,requireUser,missingSchema}from'./client.js';
import{isUpcomingLesson}from'./lessons.js';
let students=[];
let lessonLoad=0;
$('logout').onclick=async()=>{await db?.auth.signOut();location.replace('student-login.html');};
async function init(){const user=await requireUser();if(!user)return;const {data,error}=await db.from('instructors').select('user_id').eq('user_id',user.id).maybeSingle();if(error||!data){status('Instructor access required. Your account has not been granted instructor privileges.',true);return;}$('admin-area').classList.remove('hidden');$('student-select').addEventListener('change',loadLessons);await refresh();}
async function refresh(){const selected=$('student-select').value;const {data,error}=await db.from('students').select('id,display_name,account_user_id').order('display_name');if(error)return status(error.message,true);students=data;$('student-select').replaceChildren(...students.map(s=>option(s.id,s.display_name)));if(students.some(s=>s.id===selected))$('student-select').value=selected;$('students-list').replaceChildren(...students.map(s=>el('li',`${s.display_name} · account ${s.account_user_id}`)));await loadLessons();}
function lessonMessage(message,isError=false){const node=$('lesson-message');node.textContent=message;node.classList.toggle('error',isError);}
async function loadLessons(){
  const sid=$('student-select').value;
  const version=++lessonLoad;
  const list=$('lesson-list');
  list.replaceChildren();
  lessonMessage('');
  if(!sid){list.append(el('li','Create a student profile first.','muted'));return;}
  let result=await db.from('lessons').select('id,starts_at,status,summary,visible_to_student')
    .eq('student_id',sid).order('starts_at',{ascending:false});
  const legacy=missingSchema(result.error,'visible_to_student');
  if(legacy)result=await db.from('lessons').select('id,starts_at,status,summary')
    .eq('student_id',sid).order('starts_at',{ascending:false});
  const {data,error}=result;
  if(version!==lessonLoad||sid!==$('student-select').value)return;
  if(error)return lessonMessage(error.message,true);
  if(legacy)lessonMessage('Hide and restore controls will be available after the lesson database update.');
  if(!data.length){list.append(el('li','No sessions recorded for this student.','muted'));return;}
  for(const lesson of data){
    const row=el('li');
    const details=el('div');
    const label=lesson.status==='cancelled'?'Cancelled':isUpcomingLesson(lesson)?'Upcoming':new Date(lesson.starts_at)>new Date()?'Completed':'Past';
    const date=el('div',`${dateLabel(lesson.starts_at)} · ${label}`,isUpcomingLesson(lesson)?'':'lesson-past-date');
    details.append(date,el('div',lesson.summary||'Art lesson','muted tiny'),
      el('div',legacy||lesson.visible_to_student?'Visible to student':'Hidden from student','muted tiny'));
    if(legacy){row.append(details);list.append(row);continue;}
    const button=el('button',lesson.visible_to_student?'Hide from student':'Restore to student','secondary');
    button.type='button';
    button.setAttribute('aria-label',`${button.textContent}: ${dateLabel(lesson.starts_at)}`);
    button.onclick=async()=>{
      button.disabled=true;
      const result=await db.from('lessons').update({visible_to_student:!lesson.visible_to_student})
        .eq('id',lesson.id).eq('student_id',sid).select('id');
      if(result.error||!result.data?.length){button.disabled=false;return lessonMessage(result.error?.message||'Session visibility could not be changed.',true);}
      await loadLessons();
      lessonMessage(lesson.visible_to_student?'Session hidden from the student page.':'Session restored to the student page.');
    };
    row.append(details,button);
    list.append(row);
  }
}
$('student-form').addEventListener('submit',async e=>{e.preventDefault();const {error}=await db.from('students').insert({account_user_id:$('account-id').value.trim(),display_name:$('new-name').value.trim()});status(error?error.message:'Student created.',!!error);if(!error){$('student-form').reset();await refresh();}});
$('lesson-form').addEventListener('submit',async e=>{e.preventDefault();const sid=$('student-select').value;if(!sid)return status('Create a student first.',true);const start=new Date($('start').value),end=new Date($('end').value);if(!(end>start))return status('End must be later than start.',true);const {error}=await db.from('lessons').insert({student_id:sid,starts_at:start.toISOString(),ends_at:end.toISOString(),status:$('lesson-status').value,summary:$('summary').value.trim()});status(error?error.message:'Lesson saved.',!!error);if(!error){$('lesson-form').reset();await loadLessons();}});
$('art-form').addEventListener('submit',async e=>{e.preventDefault();const sid=$('student-select').value;if(!sid)return status('Create a student first.',true);const file=$('art-file').files[0];if(!file)return;const types=['image/jpeg','image/png','image/webp'];if(!types.includes(file.type)||file.size>8*1024*1024)return status('Use a JPG, PNG or WebP no larger than 8 MB.',true);const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[file.type];const path=`${sid}/${crypto.randomUUID()}.${ext}`;status('Uploading…');const upload=await db.storage.from('student-art').upload(path,file,{contentType:file.type,upsert:false});if(upload.error)return status(upload.error.message,true);const {error}=await db.from('artworks').insert({student_id:sid,title:$('art-title').value.trim(),notes:$('art-notes').value.trim(),storage_path:path});if(error){await db.storage.from('student-art').remove([path]);return status(error.message,true);}status('Artwork saved.');$('art-form').reset();});
init().catch(e=>status(e.message,true));
