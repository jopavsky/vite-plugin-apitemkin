import { defineMock } from 'vite-plugin-apitemkin';

export default defineMock<{ received: unknown }>(({ body }) => ({
  received: body,
}));
