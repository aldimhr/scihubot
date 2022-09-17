require('dotenv').config();

const supabase = require('../config/supabase-init.js');
const errorHandler = require('./errorHandler.js');

exports.getUsers = async () => {
  let { data, error } = await supabase.from(process.env.SUPA_TABLE).select('*');

  if (error) errorHandler({ err: error, name: 'database.js getUsers()' });

  return { data, error };
};

exports.getUser = async (opt) => {
  let { data, error } = await supabase.from(process.env.SUPA_TABLE).select('*').match(opt);

  if (error) errorHandler({ err: error, name: 'database.js getUser()' });

  return { data, error };
};

exports.addUser = async ({ chat_id, username, first_name, permission = 'user' }) => {
  const { data, error } = await supabase.from(process.env.SUPA_TABLE).insert([
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
  let { data, error } = await supabase.from(process.env.SUPA_TABLE).select('*').match({ permission: 'admin' });

  if (error) errorHandler({ err: error, name: 'database.js getAdmin()' });

  return { data, error };
};
