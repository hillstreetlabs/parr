exports.up = async (knex, Promise) => {
  await knex.schema.createTable("blocks", function(table) {
    table.increments();
    table.string("status");
    table.index("status");
    table.jsonb("data");
    table.integer("number");
    table.unique("number");
    table.index("number");
    table.timestamps();
  });

  await knex.schema.createTable("transactions", function(table) {
    table.increments();
    table.string("status");
    table.jsonb("data");
    table.string("hash");
    table.unique("hash");
    table.index("hash");
    table.timestamps();
  });

  await knex.schema.createTable("logs", function(table) {
    table.increments();
    table.string("status");
    table.jsonb("data");
    table.timestamps();
  });

  await knex.schema.createTable("internal_transactions", function(table) {
    table.increments();
    table.string("status");
    table.jsonb("data");
    table.timestamps();
  });

  await knex.schema.createTable("addresses", function(table) {
    table.increments();
    table.string("status");
    table.jsonb("data");
    table.timestamps();
  });
};

exports.down = async (knex, Promise) => {
  await knex.schema.dropTable("blocks");
  await knex.schema.dropTable("transactions");
  await knex.schema.dropTable("logs");
  await knex.schema.dropTable("internal_transactions");
  await knex.schema.dropTable("addresses");
};
