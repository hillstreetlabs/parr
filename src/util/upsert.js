export default (db, table, object, constraint) => {
  const insert = db(table).insert(object);
  const update = db.queryBuilder().update(object);
  return db
    .raw(`? ON CONFLICT ${constraint} DO ? returning *`, [insert, update])
    .get("rows")
    .get(0);
};
