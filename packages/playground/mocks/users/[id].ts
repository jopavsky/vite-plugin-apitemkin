import { defineMock } from 'vite-plugin-apitemkin';

interface User {
  id: number;
  name: string;
}

export default defineMock<User>(({ params }) => ({
  id: Number(params.id),
  name: 'Ada Lovelace #' + params.id,
}));
