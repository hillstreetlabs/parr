exports.up = async (knex, Promise) => {
  await knex.schema.createTable("blocks", function(table) {
    table.increments();
    table.string("status");
    table.index("status");
    table.jsonb("data");
    table.integer("number");
    table.index("number");
    table.string("hash");
    table.index("hash");
    table.unique("hash");
    table.string("locked_by");
    table.timestamp("locked_at");
    table.string("downloaded_by");
    table.timestamp("downloaded_at");
    table.string("indexed_by");
    table.timestamp("indexed_at");
    table.timestamps(true, true);
  });

  await knex.schema.createTable("transactions", function(table) {
    table.increments();
    table.string("status");
    table.jsonb("data");
    table.jsonb("receipt");
    table.string("hash");
    table.unique("hash");
    table.index("hash");
    table.string("block_hash");
    table.index("block_hash");
    table.string("locked_by");
    table.timestamp("locked_at");
    table.string("downloaded_by");
    table.timestamp("downloaded_at");
    table.string("indexed_by");
    table.timestamp("indexed_at");
    table.string("to_address");
    table.string("from_address");
    table.timestamps(true, true);
  });

  await knex.schema.createTable("logs", function(table) {
    table.increments();
    table.string("transaction_hash");
    table.index("transaction_hash");
    table.integer("log_index");
    table.index("log_index");
    table.string("status");
    table.jsonb("data");
    table.jsonb("decoded");
    table.unique(["transaction_hash", "log_index"]);
    table.string("indexed_by");
    table.timestamp("indexed_at");
    table.string("block_hash");
    table.index("block_hash");
    table.timestamps(true, true);
  });

  await knex.schema.createTable("internal_transactions", function(table) {
    table.increments();
    table.string("status");
    table.jsonb("data");
    table.integer("block_number");
    table.index("block_number");
    table.string("from_address");
    table.string("to_address");
    table.timestamps(true, true);
  });

  await knex.schema.createTable("addresses", function(table) {
    table.increments();
    table.string("address");
    table.index("address");
    table.unique("address");
    table.string("status");
    table.index("status");
    table.boolean("is_contract");
    table.boolean("is_erc20");
    table.boolean("is_erc721");
    table.jsonb("abi");
    table.string("locked_by");
    table.timestamp("locked_at");
    table.string("indexed_by");
    table.timestamp("indexed_at");
    table.timestamps(true, true);
  });
};

exports.down = async (knex, Promise) => {
  await knex.schema.dropTable("blocks");
  await knex.schema.dropTable("transactions");
  await knex.schema.dropTable("logs");
  await knex.schema.dropTable("internal_transactions");
  await knex.schema.dropTable("addresses");
};
