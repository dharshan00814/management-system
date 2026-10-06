import { createClient } from '@supabase/supabase-js';

const url = 'https://irvretckdtuihphhzwhg.supabase.co';
const key = 'sb_publishable_Bg7PORaENt6GBBM_Gai28A_FRt-FwdH';

const supabase = createClient(url, key);

async function testSignUp() {
  console.log("Testing sign up...");
  const { data, error } = await supabase.auth.signUp({
    email: 'test' + Date.now() + '@gmail.com',
    password: 'Password123!',
    options: {
      data: {
        name: 'Admin Test',
        role: 'admin'
      }
    }
  });
  
  if (error) {
    console.error("Sign up error:", error.message);
  } else {
    console.log("Sign up success!");
    console.log("Session exists?", !!data.session);
  }
}

testSignUp();
