/**
 * Thanks to https://gist.github.com/plurch/118721c2216f77640232
 * Perform an "Upsert" using the "INSERT ... ON CONFLICT ... " syntax in PostgreSQL 9.5
 * @link http://www.postgresql.org/docs/9.5/static/sql-insert.html
 * @author https://github.com/plurch
 *
 * @param {string} tableName - The name of the database table
 * @param {string} conflictTarget - The column in the table which has a unique index constraint
 * @param {Object} itemData - a hash of properties to be inserted/updated into the row
 * @returns {Promise} - A Promise which resolves to the inserted/updated row

 * For jsonb fields, the itemData should look like { data: JSON.stringify(data) }
*/
export default function upsert(db, tableName, conflictTarget, itemData) {
  let exclusions = Object.keys(itemData)
    .filter(column => column !== conflictTarget)
    .map(column => db.raw("?? = EXCLUDED.??", [column, column]).toString())
    .join(",\n");

  let insertString = db(tableName)
    .insert(itemData)
    .toString();

  let conflictString = db
    .raw(
      ` ON CONFLICT (??) DO UPDATE SET ${exclusions} RETURNING *;`,
      conflictTarget
    )
    .toString();
  let query = (insertString + conflictString).replace(/\?/g, "\\?");

  return db
    .raw(query)
    .on("query", data => console.log("Knex: " + data.sql))
    .then(result => result.rows[0]);
}
