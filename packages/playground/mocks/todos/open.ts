// Custom endpoint using direct access: GET /api/todos/open lists unfinished todos.
// The literal `open` beats `[id].ts`, so this never reaches todos.get().
import { defineMock } from 'vite-plugin-apitemkin';
import { todos } from './_data';

export default defineMock(() => {
  const open = todos.all().filter((t) => !t.done);
  return { items: open, total: open.length };
});
