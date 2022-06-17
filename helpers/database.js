const supabase = require('../supabase');

const getUsers = async () => {
  let { data, error } = await supabase.from('scihub_user').select('*');

  return { data, error };
};

const getUser = async (opt) => {
  let { data, error } = await supabase.from('scihub_user').select('*').match(opt);

  return { data, error };
};

const addUser = async ({ chat_id, username, first_name, permission = 'user' }) => {
  const { data, error } = await supabase.from('scihub_user').insert([
    {
      chat_id: chat_id.toString(),
      username: username ? username.toString() : undefined,
      first_name: first_name ? first_name.toString() : undefined,
      permission,
    },
  ]);

  return { data, error };
};

const getAdmin = async () => {
  let { data, error } = await supabase
    .from('scihub_user')
    .select('*')
    .match({ permission: 'admin' });

  return { data, error };
};

module.exports = { getAdmin, getUsers, getUser, addUser };
