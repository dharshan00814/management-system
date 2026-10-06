import { createClient } from '@supabase/supabase-js';

const url = 'https://irvretckdtuihphhzwhg.supabase.co';
const key = 'sb_publishable_Bg7PORaENt6GBBM_Gai28A_FRt-FwdH';

const supabase = createClient(url, key);

async function testConnection() {
  console.log("Testing connection...");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'test@example.com',
    password: 'password123'
  });
  
  if (error) {
    console.error("Login error:", error.message);
  } else {
    console.log("Login success data:", data);
  }
}

testConnection();
