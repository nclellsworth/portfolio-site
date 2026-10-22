import {db, requireUser, signedArtwork, missingSchema} from './client.js';

const $ = id => document.getElementById(id);
const node = (tag, text, className) => {
  const n=document.createElement(tag);
  if(text!==undefined)n.textContent=text;
  if(className)n.className=className;
  return n;
};
const opt=(value,text)=>{const n=node('option',text);n.value=value;return n;};
const instructor=!!$('admin-area');
let activeStudent=null, activeFolder='all', currentFolders=[], currentArt=[];
let sequence=0;

function tell(message,error=false){
  const msg=$('folder-message');if(!msg)return;
  msg.textContent=message;msg.style.color=error?'#9d3131':'var(--neuron)';
}
function currentStudent(){return $('student-select')?.value||null;}
function mount(){
  const target=instructor?$('admin-area'):$('portfolio')?.parentElement;
  if(!target)return;
  const wrapper=node('section',undefined,'folder-manager');
  if(instructor){wrapper.classList.add('portal-panel');}
  wrapper.id='folder-manager';
  wrapper.append(node('h3','Portfolio folders'));
  const desc=node('p','Create folders, sort uploaded artwork, or remove artwork you no longer want. Deleting a folder does not delete its images.','muted tiny');
  wrapper.append(desc);
  const form=node('form',undefined,'folder-tools');form.id='folder-form';
  const input=node('input');input.id='new-folder-name';input.placeholder='New folder name (e.g., Watercolors)';input.maxLength=80;input.required=true;input.setAttribute('aria-label','New folder name');
  const add=node('button','Create folder');add.type='submit';form.append(input,add);wrapper.append(form);
  const tabs=node('div',undefined,'folder-tabs');tabs.id='folder-tabs';tabs.setAttribute('aria-label','Artwork folders');wrapper.append(tabs);
  const actions=node('div',undefined,'folder-actions');actions.id='folder-actions';wrapper.append(actions);
  const message=node('p',undefined,'folder-message');message.id='folder-message';message.setAttribute('role','status');wrapper.append(message);
  const gallery=node('div',undefined,'folder-gallery');gallery.id='folder-gallery';wrapper.append(gallery);
  if(instructor){
    const artForm=$('art-form')?.closest('.portal-panel');
    if(artForm)artForm.insertAdjacentElement('afterend',wrapper);
    else target.prepend(wrapper);
  }else{
    $('portfolio').insertAdjacentElement('beforebegin',wrapper);
  }
  form.addEventListener('submit',createFolder);
  $('student-select').addEventListener('change',()=>{activeFolder='all';refresh();});
}
async function refresh(){
  const id=currentStudent();activeStudent=id;
  const stamp=++sequence;
  if(!id){$('folder-gallery').replaceChildren();$('folder-tabs').replaceChildren();return;}
  tell('');
  const [folderRes,artRes]=await Promise.all([
    db.from('art_folders').select('id,name').eq('student_id',id).order('created_at'),
    db.from('artworks').select('id,title,notes,storage_path,folder_id,uploaded_by').eq('student_id',id).eq('category','art').order('created_at',{ascending:false})
  ]);
  if(stamp!==sequence||id!==currentStudent())return;
  if(folderRes.error||artRes.error){
    $('portfolio')?.parentElement.classList.remove('folder-manager-ready');
    const missing=missingSchema(folderRes.error,'art_folders')
      || ['category','folder_id','uploaded_by'].some(column=>missingSchema(artRes.error,column));
    $('folder-manager').classList.toggle('hidden',missing);
    if(!missing)tell((folderRes.error||artRes.error).message,true);
    return;
  }
  $('folder-manager').classList.remove('hidden');
  if(!instructor)$('portfolio').parentElement.classList.add('folder-manager-ready');
  currentFolders=folderRes.data||[];currentArt=artRes.data||[];
  if(activeFolder!=='all'&&!currentFolders.some(f=>f.id===activeFolder))activeFolder='all';
  await render(stamp);
}
async function render(stamp){
  const tabs=$('folder-tabs'), gallery=$('folder-gallery'), actions=$('folder-actions');
  tabs.replaceChildren();gallery.replaceChildren();actions.replaceChildren();
  const choices=[{id:'all',name:'All artwork'}, {id:'unfiled',name:'Unfiled'}, ...currentFolders];
  for(const f of choices){
    const b=node('button',f.name);b.type='button';b.setAttribute('aria-pressed',String(activeFolder===f.id));
    b.onclick=()=>{activeFolder=f.id;render(sequence);};tabs.append(b);
  }
  const selected=currentFolders.find(f=>f.id===activeFolder);
  if(selected){
    const rename=node('button','Rename folder');rename.type='button';rename.onclick=()=>renameFolder(selected);
    const remove=node('button','Delete folder');remove.type='button';remove.onclick=()=>deleteFolder(selected);
    actions.append(rename,remove);
  }
  const art=currentArt.filter(a=>activeFolder==='all'||(activeFolder==='unfiled'?!a.folder_id:a.folder_id===activeFolder));
  if(!art.length){gallery.append(node('p','No artwork in this folder yet.','folder-empty'));return;}
  for(const a of art){
    if(stamp!==sequence)return;
    const tile=node('article',undefined,'folder-art');
    if(a.storage_path){
      try{
        const url=await signedArtwork(a.storage_path);
        if(stamp!==sequence)return;
        const img=node('img');img.src=url;img.alt=a.title;img.loading='lazy';tile.append(img);
      }catch{tile.append(node('p','Image unavailable','folder-art-note'));}
    }
    tile.append(node('span',a.title,'folder-art-title'));
    tile.append(node('div',a.uploaded_by==='student'?'Student upload':'Lesson artwork','folder-art-note'));
    if(a.notes)tile.append(node('p',a.notes,'folder-art-note'));
    const label=node('label','Folder');const select=node('select');select.setAttribute('aria-label',`Folder for ${a.title}`);
    select.append(opt('','Unfiled'),...currentFolders.map(f=>opt(f.id,f.name)));
    select.value=a.folder_id||'';
    select.onchange=async()=>{
      select.disabled=true;
      const {error}=await db.from('artworks').update({folder_id:select.value||null}).eq('id',a.id).eq('student_id',activeStudent);
      if(error){tell(error.message,true);select.value=a.folder_id||'';}else{a.folder_id=select.value||null;tell('Artwork moved.');if(activeFolder!=='all')render(sequence);}
      select.disabled=false;
    };
    const remove=node('button','Delete artwork','delete-art');remove.type='button';remove.onclick=()=>deleteArtwork(a);
    tile.append(label,select,remove);gallery.append(tile);
  }
}
async function createFolder(e){
  e.preventDefault();const id=currentStudent(),name=$('new-folder-name').value.trim();
  if(!id||!name)return;
  const {error}=await db.from('art_folders').insert({student_id:id,name});
  if(error)return tell(error.message,true);
  $('folder-form').reset();await refresh();tell('Folder created.');
}
async function renameFolder(folder){
  const proposed=prompt('New folder name:',folder.name);
  if(proposed===null)return;const name=proposed.trim();if(!name||name.length>80)return tell('Folder name must be 1–80 characters.',true);
  const {error}=await db.from('art_folders').update({name}).eq('id',folder.id).eq('student_id',activeStudent);
  if(error)return tell(error.message,true);
  await refresh();tell('Folder renamed.');
}
async function deleteFolder(folder){
  if(!confirm(`Delete folder “${folder.name}”? Its artwork will stay in All artwork and become Unfiled.`))return;
  const {error}=await db.from('art_folders').delete().eq('id',folder.id).eq('student_id',activeStudent);
  if(error)return tell(error.message,true);
  activeFolder='all';await refresh();tell('Folder deleted; artwork kept.');
}
async function deleteArtwork(art){
  if(!confirm(`Permanently delete “${art.title}” from the portfolio? This cannot be undone.`))return;
  const id=activeStudent;
  const {data,error}=await db.from('artworks').delete().eq('id',art.id).eq('student_id',id)
    .eq('category','art').select('id,student_id,title,notes,storage_path,folder_id,category,uploaded_by,created_at');
  if(error)return tell(error.message,true);
  if(!data?.length)return tell('Deletion was not authorized.',true);
  const storage=await db.storage.from('student-art').remove([art.storage_path]);
  if(storage.error){
    const restored=await db.from('artworks').insert(data[0]);
    await refresh();
    tell(restored.error?'The stored image could not be deleted and its listing could not be restored. Contact the instructor.':'The stored image could not be deleted. The listing was restored so you can try again.',true);
  }else{await refresh();tell('Artwork permanently deleted.');}
}

async function start(){
  const user=await requireUser();if(!user||!db)return;
  if(instructor){
    // Instructor page remains hidden until instructor.js grants access.
    const target=$('admin-area');if(!target)return;
    mount();
    const sel=$('student-select');
    let tries=0;
    const poll=setInterval(()=>{
      if(++tries>60){clearInterval(poll);return;}
      if(!target.classList.contains('hidden')&&sel.options.length){clearInterval(poll);refresh();}
    },150);
  }else{
    mount();
    const sel=$('student-select');
    let tries=0;
    const poll=setInterval(()=>{
      if(++tries>60){clearInterval(poll);return;}
      if(sel.options.length){clearInterval(poll);refresh();}
    },150);
  }
}
start().catch(e=>tell(e.message,true));
