exports.up = async function(knex, Promise) {
  await knex.schema.table("transactions", function(table) {
    table.index("from_address");
    table.index("to_address");
  });
};

exports.down = async function(knex, Promise) {
  await knex.schema.table("transactions", function(table) {
    table.dropIndex("from_address");
    table.dropIndex("to_address");
  });
};
