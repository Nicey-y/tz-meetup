import { createClient } from '@supabase/supabase-js'

// These two values come from the .env.local file.
// The publishable key is safe to be public. Security is enforced by
// Row Level Security policies in the database.
var supabaseUrl = import.meta.env.VITE_SUPABASE_URL
var supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// "export" lets other files use this variable with "import"
export var supabase = createClient(supabaseUrl, supabasePublishableKey)
