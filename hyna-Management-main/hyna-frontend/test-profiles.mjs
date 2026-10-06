import { createClient } from '@supabase/supabase-js';

const url = 'https://irvretckdtuihphhzwhg.supabase.co';
const key = 'sb_publishable_Bg7PORaENt6GBBM_Gai28A_FRt-FwdH';

const supabase = createClient(url, key);

async function testFetchProfiles() {
  console.log("Fetching profiles...");
  const { data, error } = await supabase.from('profiles').select('*');
  
  if (error) {
    console.error("Error fetching profiles:", error.message);
  } else {
    console.log("Profiles found:", data?.length);
    console.log(data);
  }
}

testFetchProfiles();
