exports.up = async (knex, Promise) => {
  await knex.schema.table("internal_transactions", function(table) {
    table.string("block_hash");
    table.index("block_hash");
    table.string("transaction_hash");
    table.index("transaction_hash");
    table.string("from_address");
    table.string("to_address");
    table.string("downloaded_by");
    table.timestamp("downloaded_at");
    table.string("locked_by");
    table.timestamp("locked_at");
    table.string("indexed_by");
    table.timestamp("indexed_at");
    table.integer("internal_transaction_index");
    table.index("internal_transaction_index");
    table.unique(["transaction_hash", "internal_transaction_index"]);
  });

  await knex.schema.table("transactions", function(table) {
    table.string("internal_transaction_status");
    table.index("internal_transaction_status");
  });
};

exports.down = async (knex, Promise) => {
  await knex.schema.table("internal_transactions", function(table) {
    table.dropColumn("block_hash");
    table.dropIndex("block_hash");
    table.dropColumn("transaction_hash");
    table.dropIndex("transaction_hash");
    table.dropColumn("from_address");
    table.dropColumn("to_address");
    table.dropColumn("downloaded_by");
    table.dropColumn("downloaded_at");
    table.dropColumn("locked_by");
    table.dropColumn("locked_at");
    table.dropColumn("indexed_by");
    table.dropColumn("indexed_at");
    table.dropColumn("internal_transaction_index");
    table.dropIndex("internal_transaction_index");
  });

  await knex.schema.table("transactions", function(table) {
    table.dropColumn("internal_transaction_status");
    table.dropIndex("internal_transaction_status");
  });
};
