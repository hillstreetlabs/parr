exports.up = async (knex, Promise) => {
  await knex.schema.createTable("blocks", function(table) {
    table.increments();
    table.string("status");
    table.index("status");
    table.jsonb("data");
    table.integer("number");
    table.unique("number");
    table.index("number");
    table.string("locked_by");
    table.timestamp("locked_at");
    table.string("downloaded_by");
    table.timestamp("downloaded_at");
    table.timestamps();
  });

  await knex.schema.createTable("transactions", function(table) {
    table.increments();
    table.string("status");
    table.jsonb("data");
    table.jsonb("receipt");
    table.string("hash");
    table.unique("hash");
    table.index("hash");
    table.string("locked_by");
    table.timestamp("locked_at");
    table.string("downloaded_by");
    table.timestamp("downloaded_at");
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
