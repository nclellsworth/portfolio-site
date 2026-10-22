import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
export const configured = !SUPABASE_URL.includes('YOUR-PROJECT') && !SUPABASE_PUBLISHABLE_KEY.includes('REPLACE_ME');
export const db = configured ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}) : null;
export const $ = id => document.getElementById(id);
export function status(message, isError=false) { const el=$('status'); if(el){el.textContent=message;el.classList.toggle('error',isError);} }
export function option(value,label){const el=document.createElement('option');el.value=value;el.textContent=label;return el;}
export function el(tag,text,cls){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;}
export function dateLabel(value){return new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});}
export async function requireUser(){if(!configured){status('First configure assets/config.js with your Supabase URL and publishable key.',true);return null;}const {data:{user},error}=await db.auth.getUser();if(error||!user){location.replace('student-login.html');return null;}return user;}
export async function signedArtwork(path){if(!path)return null;const {data,error}=await db.storage.from('student-art').createSignedUrl(path,3600);if(error)throw error;return data.signedUrl;}
export function missingSchema(error, name){
  if(!error)return false;
  const message=String(error.message||'').toLowerCase();
  return message.includes(name.toLowerCase())
    && (['42703','42P01','PGRST204','PGRST205'].includes(error.code)
      || message.includes('does not exist') || message.includes('schema cache'));
}
