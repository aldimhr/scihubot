require('dotenv').config();
const supabase = require('../supabase');
const errorHandler = require('./errorHandler');

const getUsers = async () => {
  let { data, error } = await supabase.from(process.env.SUPA_TABLE).select('*');

  if (error) errorHandler({ err: error, name: 'helpers/database.js getUsers()' });

  return { data, error };
};

const getUser = async (opt) => {
  let { data, error } = await supabase.from(process.env.SUPA_TABLE).select('*').match(opt);

  if (error) errorHandler({ err: error, name: 'helpers/database.js getUser()' });

  return { data, error };
};

const addUser = async ({ chat_id, username, first_name, permission = 'user' }) => {
  const { data, error } = await supabase.from(process.env.SUPA_TABLE).insert([
    {
      chat_id: chat_id.toString(),
      username: username ? username.toString() : undefined,
      first_name: first_name ? first_name.toString() : undefined,
      permission,
    },
  ]);

  if (error) errorHandler({ err: error, name: 'helpers/database.js addUser()' });

  return { data, error };
};

const getAdmin = async () => {
  let { data, error } = await supabase
    .from(process.env.SUPA_TABLE)
    .select('*')
    .match({ permission: 'admin' });

  if (error) errorHandler({ err: error, name: 'helpers/database.js getAdmin()' });

  return { data, error };
};

module.exports = { getAdmin, getUsers, getUser, addUser };
