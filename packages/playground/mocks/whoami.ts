import { defineMock } from 'vite-plugin-apitemkin';

export default defineMock(({ method, headers }) => ({
  method,
  ua: headers['user-agent'] ?? null,
}));
