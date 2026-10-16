/**
 * Relative timestamp for comments — "just now", "5m ago",
 * "3h ago", "12d ago", then a locale date past 30 days.
 *
 * Unparseable timestamps fall back to the raw string: a NaN
 * date used to pass every comparison and render
 * "Invalid Date" via `toLocaleDateString`.
 */
const formatTime = (ts: string): string => {
  const time = new Date(ts).getTime();
  if (Number.isNaN(time)) return ts;

  const diff = Date.now() - time;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
};

export default formatTime;
