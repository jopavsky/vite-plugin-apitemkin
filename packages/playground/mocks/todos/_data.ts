import { defineCollection } from 'vite-plugin-apitemkin';

export interface Todo {
  id: number;
  title: string;
  done: boolean;
}

export const todos = defineCollection<Todo>([
  { id: 1, title: 'Buy milk', done: false },
  { id: 2, title: 'Walk the dog', done: true },
  { id: 3, title: 'Write the mocks', done: false },
]);
