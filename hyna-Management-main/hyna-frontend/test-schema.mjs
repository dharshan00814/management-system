import { createClient } from '@supabase/supabase-js';

const url = 'https://irvretckdtuihphhzwhg.supabase.co';
const key = 'sb_publishable_Bg7PORaENt6GBBM_Gai28A_FRt-FwdH';

const supabase = createClient(url, key);

async function testSchema() {
  const { data, error } = await supabase.from('projects').select('*').limit(1);
  if (error) {
    console.error("Projects error:", error.message);
  } else {
    console.log("Projects schema:", data && data.length > 0 ? Object.keys(data[0]) : "No projects");
  }
}

testSchema();
