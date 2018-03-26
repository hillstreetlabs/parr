require("dotenv").config();

module.exports = {
  development: {
    client: "postgresql",
    connection: process.env.POSTGRES_URL || {
      user: "parr",
      host: "127.0.0.1",
      port: "5432",
      database: "parr_development"
    },
    useNullAsDefault: true,
    migrations: {
      tableName: "knex_migrations",
      directory: "./src/migrations"
    }
  },

  production: {
    client: "postgresql",
    connection: process.env.POSTGRES_URL,
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: "knex_migrations",
      directory: "./src/migrations"
    }
  }
};
