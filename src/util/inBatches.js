const getRows = (query, batchSize, batchScrollId) => {
  return query
    .orderBy("id", "asc")
    .where("id", ">", batchScrollId)
    .limit(batchSize);
};

const runBatch = async (query, func, batchSize, batchScrollId) => {
  const rows = await getRows(query, batchSize, batchScrollId);
  if (rows.length > 0) {
    await func(rows);
    return runBatch(query, func, batchSize, rows[rows.length - 1].id);
  } else {
    return true;
  }
};

export default async (query, func, batchSize = 200) => {
  return runBatch(query, func, batchSize, 0);
};
