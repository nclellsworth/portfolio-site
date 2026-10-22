import {db, configured, $, status} from './client.js';

let invitationReady = false;
const form = $('set-password-form');
const save = $('save-password');

async function initialize() {
  if (!configured) return status('The student portal is not configured yet. Please contact Nicole.', true);
  const query = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.slice(1));
  const error = query.get('error_description') || fragment.get('error_description');
  if (error) return status(`This invitation could not be opened: ${error}. Please request a new invitation.`, true);

  const invitationLink = query.get('type') === 'invite' || fragment.get('type') === 'invite';
  if (!invitationLink) return status('Open the invitation link from your email to set your password.', true);

  if (query.get('token_hash')) {
    const {error: verifyError} = await db.auth.verifyOtp({token_hash:query.get('token_hash'), type:'invite'});
    if (verifyError) return status(`Invitation expired or invalid: ${verifyError.message}. Please request a new invitation.`, true);
  } else if (query.get('code')) {
    const {error: codeError} = await db.auth.exchangeCodeForSession(query.get('code'));
    if (codeError) return status(`Invitation expired or invalid: ${codeError.message}. Please request a new invitation.`, true);
  } else if (!fragment.get('access_token') || !fragment.get('refresh_token')) {
    return status('This invitation link is incomplete. Please request a new invitation.', true);
  }

  const {data:{user}, error: userError} = await db.auth.getUser();
  if (userError || !user) return status('This invitation could not be verified. Please request a new invitation.', true);
  invitationReady = true;
  form.classList.remove('hidden');
  status(`Invitation accepted for ${user.email || 'your account'}. Choose a password to finish setup.`);
  history.replaceState(null, '', location.pathname);
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!invitationReady) return;
  const password = $('password').value;
  if (password.length < 12) return status('Use at least 12 characters.', true);
  if (password !== $('confirm-password').value) return status('The passwords do not match.', true);
  save.disabled = true;
  status('Saving your password…');
  const {error} = await db.auth.updateUser({password});
  if (error) {save.disabled = false; return status(error.message, true);}
  invitationReady = false;
  form.classList.add('hidden');
  await db.auth.signOut();
  status('Your password is set. You can now sign in from the student login page.');
});

initialize().catch(error => status(error.message, true));
