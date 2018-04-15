exports.up = async function(knex, Promise) {
  await knex.schema.table("addresses", function(table) {
    table.jsonb("data");
  });
};

exports.down = async function(knex, Promise) {
  await knex.schema.table("addresses", function(table) {
    table.dropColumn("data");
  });
};
