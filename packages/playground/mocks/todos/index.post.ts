import { defineMock } from 'vite-plugin-apitemkin';
import { todos } from './_data';

export default defineMock({
  default: todos.create(),
  error: { status: 500, body: { error: 'Server down' } },
});
