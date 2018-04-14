exports.up = async function(knex, Promise) {
  await knex.schema.createTable("queries", function(table) {
    table.increments();
    table.text("query");
    table.string("hash");
    table.index("hash");
    table.unique("hash");
    table.integer("use_count");
    table.index("use_count");
    table.string("api");
    table.timestamps(true, true);
  });
};

exports.down = async function(knex, Promise) {
  await knex.schema.dropTable("queries");
};
