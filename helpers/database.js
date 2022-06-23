require("dotenv").config();
const supabase = require("../supabase");

const getUsers = async () => {
  let { data, error } = await supabase.from(process.env.SUPA_TABLE).select("*");

  return { data, error };
};

const getUser = async (opt) => {
  let { data, error } = await supabase.from(process.env.SUPA_TABLE).select("*").match(opt);

  return { data, error };
};

const addUser = async ({ chat_id, username, first_name, permission = "user" }) => {
  const { data, error } = await supabase.from(process.env.SUPA_TABLE).insert([
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
    .from(process.env.SUPA_TABLE)
    .select("*")
    .match({ permission: "admin" });

  return { data, error };
};

module.exports = { getAdmin, getUsers, getUser, addUser };
