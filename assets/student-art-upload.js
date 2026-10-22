// Student/parent uploads: add-on, does not replace your existing portal scripts.
import {db, requireUser, signedArtwork} from './client.js';

const byId = id => document.getElementById(id);
const node = (tag, text, className) => {const el=document.createElement(tag); if(text!==undefined)el.textContent=text; if(className)el.className=className; return el;};
const allowed = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
const MAX_BYTES = 8*1024*1024;

async function init(){
  if(!byId('dashboard') || !byId('portfolio') || !byId('student-select'))return; // student portal only
  const user=await requireUser(); if(!user)return;
  // If an older student-upload form exists, avoid installing a duplicate.
  if(byId('student-art-form'))return;
  const section=node('section',undefined,'student-art-upload');
  const heading=node('h3','Add artwork to my portfolio');
  const help=node('p','Upload a photo of artwork you made, at home or in a lesson. It will appear immediately in your portfolio.','muted tiny');
  const form=node('form'); form.id='student-art-form-addon';
  const titleLabel=node('label','Artwork title');titleLabel.htmlFor='studio-upload-title';
  const title=node('input');title.id='studio-upload-title';title.maxLength=160;title.required=true;title.placeholder='My watercolor landscape';
  const notesLabel=node('label','Description (optional)');notesLabel.htmlFor='studio-upload-notes';
  const notes=node('textarea');notes.id='studio-upload-notes';notes.maxLength=1000;notes.rows=2;
  const fileLabel=node('label','Photo of artwork');fileLabel.htmlFor='studio-upload-photo';
  const photo=node('input');photo.id='studio-upload-photo';photo.type='file';photo.accept='image/jpeg,image/png,image/webp';photo.required=true;
  const submit=node('button','Add to my portfolio +');submit.type='submit';
  const message=node('p',undefined,'muted tiny');message.setAttribute('role','status');
  form.append(titleLabel,title,notesLabel,notes,fileLabel,photo,submit,message);
  section.append(heading,help,form);
  byId('portfolio').insertAdjacentElement('afterend',section);
  form.addEventListener('submit', async event=>{
    event.preventDefault(); const studentId=byId('student-select').value;
    const image=photo.files?.[0], name=title.value.trim();
    if(!studentId||!image||!name)return;
    if(!allowed[image.type]||image.size>MAX_BYTES){message.textContent='Choose a JPG, PNG, or WebP image up to 8 MB.';return;}
    submit.disabled=true;message.textContent='Uploading artwork…';
    const path=`${studentId}/${crypto.randomUUID()}.${allowed[image.type]}`;
    try{
      const {error:storageError}=await db.storage.from('student-art').upload(path,image,{contentType:image.type,upsert:false});
      if(storageError)throw storageError;
      const {data:art,error:dbError}=await db.from('artworks').insert({student_id:studentId,title:name,notes:notes.value.trim(),storage_path:path,uploaded_by:'student'}).select('id,title,notes,storage_path,uploaded_by').single();
      if(dbError){await db.storage.from('student-art').remove([path]);throw dbError;}
      form.reset();message.textContent='Artwork uploaded!';
      // Show it right away. The existing folder manager refreshes when profile changes or page reloads.
      if(byId('student-select').value===studentId){
        const tile=node('article',undefined,'art-piece');
        const src=await signedArtwork(art.storage_path);
        const img=node('img');img.src=src;img.alt=art.title;img.loading='lazy';tile.append(img);
        tile.append(node('strong',art.title),node('div','Student upload','muted tiny'),node('p',art.notes||'','muted tiny'));
        const gallery=byId('portfolio');
        const empty=gallery.querySelector('p.muted');if(empty&&gallery.children.length===1)empty.remove();
        gallery.prepend(tile);
      }
    }catch(err){message.textContent=err.message||'Upload failed. Please try again.';}
    finally{submit.disabled=false;}
  });
}
init().catch(err=>{const area=byId('status');if(area)area.textContent=err.message;});
