/* Reuse unchanged order lines within one subscription. Each parent write that
 * changes lines also updates the order document in the same atomic operation. */
export function createOrderSnapshotReader(loadItems) {
  const cache = new Map();
  return async snapshot => {
    const ids = new Set(snapshot.docs.map(row => row.id));
    for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id);
    return Promise.all(snapshot.docs.map(row => {
      const data = row.data();
      const version = JSON.stringify(data);
      const previous = cache.get(row.id);
      if (previous?.version === version) return previous.result;
      const entry = {version};
      entry.result = Promise.resolve().then(() => loadItems(row)).then(items => ({
        id: row.id, ...data, items,
        total: items.reduce((sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 0), 0)
      })).catch(error => {
        if (cache.get(row.id) === entry) cache.delete(row.id);
        throw error;
      });
      cache.set(row.id, entry);
      return entry.result;
    }));
  };
}
