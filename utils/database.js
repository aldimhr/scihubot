require('dotenv').config();

const errorHandler = require('./errorHandler.js');

let supabase = null;

// Only init Supabase if credentials are provided
if (process.env.SUPA_URL && process.env.SUPA_KEY) {
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(process.env.SUPA_URL, process.env.SUPA_KEY);
}

const noDb = { data: [], error: null };

exports.getUsers = async () => {
  if (!supabase) return noDb;
  let { data, error } = await supabase.from(process.env.SUPA_TABLE || 'users').select('*');
  if (error) errorHandler({ err: error, name: 'database.js getUsers()' });
  return { data, error };
};

exports.getUser = async (opt) => {
  if (!supabase) return noDb;
  let { data, error } = await supabase.from(process.env.SUPA_TABLE || 'users').select('*').match(opt);
  if (error) errorHandler({ err: error, name: 'database.js getUser()' });
  return { data, error };
};

exports.addUser = async ({ chat_id, username, first_name, permission = 'user' }) => {
  if (!supabase) return noDb;
  const { data, error } = await supabase.from(process.env.SUPA_TABLE || 'users').insert([
    {
      chat_id: chat_id.toString(),
      username: username ? username.toString() : undefined,
      first_name: first_name ? first_name.toString() : undefined,
      permission,
    },
  ]);
  if (error) errorHandler({ err: error, name: 'database.js addUser()' });
  return { data, error };
};

exports.getAdmin = async () => {
  if (!supabase) return noDb;
  let { data, error } = await supabase.from(process.env.SUPA_TABLE || 'users').select('*').match({ permission: 'admin' });
  if (error) errorHandler({ err: error, name: 'database.js getAdmin()' });
  return { data, error };
};
