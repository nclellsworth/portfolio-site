import {db, requireUser, signedArtwork, missingSchema} from './client.js';

const $ = id => document.getElementById(id);
const make = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const allowed = {'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp'};
const instructorPage = !!$('admin-area');
let generation = 0;

function message(text, error = false) {
  $('inspo-message').textContent = text;
  $('inspo-message').classList.toggle('error', error);
}

function selectedStudent() { return $('student-select')?.value || null; }

function mount() {
  const section = make('section', undefined, 'portal-panel');
  section.id = 'student-inspo';
  section.append(make('h2', 'Student inspo'));
  section.append(make('p', 'Images that inspire future projects. Students and instructors can add to this board.', 'muted'));
  const form = make('form');
  form.id = 'inspo-form';
  for (const [id, caption, tag, limit] of [
    ['inspo-title', 'Image title', 'input', 160],
    ['inspo-notes', 'Notes (optional)', 'textarea', 1500],
    ['inspo-file', 'Image (JPG, PNG, WebP; up to 8 MB)', 'input', 0]
  ]) {
    const label = make('label', caption);
    label.htmlFor = id;
    const input = make(tag);
    input.id = id;
    if (id === 'inspo-file') {input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp'; input.required = true;}
    else {input.maxLength = limit; if (id === 'inspo-title') input.required = true;}
    form.append(label, input);
  }
  const upload = make('button', 'Add inspo image');
  upload.type = 'submit';
  form.append(upload);
  section.append(form);
  const feedback = make('p', '', 'status');
  feedback.id = 'inspo-message';
  feedback.setAttribute('role', 'status');
  section.append(feedback);
  const gallery = make('div', undefined, 'art-grid');
  gallery.id = 'inspo-grid';
  section.append(gallery);
  if (instructorPage) $('admin-area').append(section);
  else $('portfolio').closest('.portal-panel').insertAdjacentElement('afterend', section);
  form.addEventListener('submit', uploadImage);
  $('student-select').addEventListener('change', show);
}

async function show() {
  const id = selectedStudent();
  const stamp = ++generation;
  const grid = $('inspo-grid');
  grid.replaceChildren();
  if (!id) return;
  const {data, error} = await db.from('artworks')
    .select('id,title,notes,storage_path,student_id,category,folder_id,uploaded_by,created_at')
    .eq('student_id', id).eq('category', 'inspo').order('created_at', {ascending:false});
  if (stamp !== generation) return;
  if (error) {
    const missing = ['category', 'folder_id', 'uploaded_by'].some(column => missingSchema(error, column));
    if (missing) { $('student-inspo').classList.add('hidden'); return; }
    return message(error.message, true);
  }
  $('student-inspo').classList.remove('hidden');
  for (const item of data) {
    const tile = make('article', undefined, 'art-piece');
    try {
      const image = make('img');
      image.src = await signedArtwork(item.storage_path);
      image.alt = item.title;
      image.loading = 'lazy';
      tile.append(image);
    } catch (_) {tile.append(make('p', 'Image unavailable', 'muted'));}
    tile.append(make('strong', item.title));
    if (item.notes) tile.append(make('p', item.notes, 'muted tiny'));
    const remove = make('button', 'Delete image', 'secondary');
    remove.type = 'button';
    remove.onclick = async () => {
      if (!confirm(`Permanently delete “${item.title}”?`)) return;
      remove.disabled = true;
      const deleted = await db.from('artworks').delete().eq('id', item.id)
        .eq('student_id', id).eq('category', 'inspo').select('id,title,notes,storage_path,student_id,category,folder_id,uploaded_by,created_at');
      if (deleted.error || !deleted.data?.length) {
        remove.disabled = false;
        return message(deleted.error?.message || 'Image could not be deleted.', true);
      }
      const storage = await db.storage.from('student-art').remove([item.storage_path]);
      if (storage.error) {
        const restored = await db.from('artworks').insert(deleted.data[0]);
        message(restored.error ? 'The image listing could not be restored. Contact the instructor.' : 'Could not remove the stored image. Please try again.', true);
      } else message('Inspiration image deleted.');
      await show();
    };
    tile.append(remove);
    if (stamp !== generation) return;
    grid.append(tile);
  }
  if (!data.length) grid.append(make('p', 'Add an image that inspires your next project.', 'muted'));
}

async function uploadImage(event) {
  event.preventDefault();
  const id = selectedStudent();
  const file = $('inspo-file').files[0];
  const title = $('inspo-title').value.trim();
  if (!id || !file || !title) return;
  if (!allowed[file.type] || file.size === 0 || file.size > 8 * 1024 * 1024)
    return message('Use a JPG, PNG or WebP image no larger than 8 MB.', true);
  const button = event.currentTarget.querySelector('button');
  button.disabled = true;
  message('Uploading image…');
  const path = `${id}/${crypto.randomUUID()}.${allowed[file.type]}`;
  try {
    const upload = await db.storage.from('student-art').upload(path, file, {contentType:file.type, upsert:false});
    if (upload.error) return message(upload.error.message, true);
    const {error} = await db.from('artworks').insert({student_id:id, title,
      notes:$('inspo-notes').value.trim(), storage_path:path, category:'inspo',
      uploaded_by:instructorPage ? 'instructor' : 'student'});
    if (error) {
      const cleaned = await db.storage.from('student-art').remove([path]);
      return message(cleaned.error ? `${error.message} The uploaded file may need cleanup by the instructor.` : error.message, true);
    }
    event.currentTarget.reset();
    message('Inspiration image added.');
    await show();
  } catch (error) {message(error.message, true);}
  finally {button.disabled = false;}
}

async function initialize() {
  const user = await requireUser();
  if (!user) return;
  if (instructorPage) {
    const {data} = await db.from('instructors').select('user_id').eq('user_id', user.id).maybeSingle();
    if (!data) return;
  }
  mount();
  for (let attempt = 0; attempt < 60 && !selectedStudent(); attempt++)
    await new Promise(resolve => setTimeout(resolve, 100));
  await show();
}

initialize().catch(error => {if ($('inspo-message')) message(error.message, true);});
