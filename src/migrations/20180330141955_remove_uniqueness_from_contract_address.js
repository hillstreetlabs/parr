
exports.up = function(knex, Promise) {
  return knex.schema.alterTable("contracts", function(table) {
    table.dropUnique("address", "contracts_address_unique");
  });
};

exports.down = function(knex, Promise) {
  return knex.schema.alterTable("contracts", function (table){
    table.unique("address");
  });
};
