import { createClient } from '@supabase/supabase-js';

const url = 'https://irvretckdtuihphhzwhg.supabase.co';
const key = 'sb_publishable_Bg7PORaENt6GBBM_Gai28A_FRt-FwdH';

const supabase = createClient(url, key);

async function testSignIn() {
  const email = 'test' + Date.now() + '@gmail.com';
  const password = 'Password123!';
  
  console.log("Registering user:", email);
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });
  
  if (signUpError) {
    console.error("Sign up error:", signUpError.message);
    return;
  }
  
  console.log("Sign up success. Session exists?", !!signUpData.session);
  
  console.log("Attempting to sign in with same credentials...");
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  
  if (signInError) {
    console.error("Sign in error:", signInError.message);
  } else {
    console.log("Sign in success!");
  }
}

testSignIn();
