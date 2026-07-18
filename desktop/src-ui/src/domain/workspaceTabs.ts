export function reorderById<T extends { id: string }>(
  items: T[],
  draggedId: string,
  targetId: string,
): T[] {
  const draggedIndex = items.findIndex((item) => item.id === draggedId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) return items;

  const reordered = [...items];
  const [draggedItem] = reordered.splice(draggedIndex, 1);
  reordered.splice(targetIndex, 0, draggedItem);
  return reordered;
}
