export function summarizeDay(
  tasks: { completed: boolean; estimatedMin: number | null }[],
  capacityMin: number,
) {
  const done = tasks.filter((task) => task.completed).length;
  const plannedMin = tasks.reduce((sum, task) => sum + (task.estimatedMin ?? 0), 0);
  return {
    done,
    total: tasks.length,
    progress: tasks.length ? (done / tasks.length) * 100 : 0,
    plannedMin,
    unestimated: tasks.filter((task) => task.estimatedMin === null).length,
    overloaded: plannedMin > capacityMin,
  };
}
